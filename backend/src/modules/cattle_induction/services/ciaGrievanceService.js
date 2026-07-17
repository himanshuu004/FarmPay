/**
 * CIA grievance service (CIA-1/2, PRD Part 14B). Farmers raise grievances; staff
 * (DCS/supervisor/DUSS/UCDF) work them through a state machine; ciaStageSla-style
 * ageing escalates breaches up an owner ladder. SLA days + first owner are config
 * (Convention 5: scheme rules_json.grievance) with a PRD-derived code fallback.
 *
 *   OPEN → ACKNOWLEDGED → IN_PROGRESS → RESOLVED | ESCALATED
 * Never closed without a recorded resolution; escalation only alerts (never resolves
 * or rejects — Convention 21). Every transition emits an append-only domain_event.
 */
const crypto = require('crypto');
const { Op } = require('sequelize');
const { emitDomainEvent } = require('../../../shared/services/domainEvents');
const { resolveActor } = require('./context');
const schemeConfigService = require('./schemeConfigService');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };
const err = (msg, code, status = 400) => { const e = new Error(msg); e.statusCode = status; e.errorCode = code; return e; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

const STATUS = { OPEN: 'OPEN', ACKNOWLEDGED: 'ACKNOWLEDGED', IN_PROGRESS: 'IN_PROGRESS', RESOLVED: 'RESOLVED', ESCALATED: 'ESCALATED' };
const TRANSITIONS = {
  OPEN: ['ACKNOWLEDGED', 'ESCALATED'],
  ACKNOWLEDGED: ['IN_PROGRESS', 'ESCALATED'],
  IN_PROGRESS: ['RESOLVED', 'ESCALATED'],
  ESCALATED: ['IN_PROGRESS', 'RESOLVED'],
  RESOLVED: [],
};

// PRD Part 14B categories → interim {days, first-owner}. Config in
// rules_json.grievance.<category> supersedes these (Convention 5).
const DEFAULT_SLA = {
  farmer_not_selected: { days: 7, owner: 'DCS_BOARD' },
  application_rejected: { days: 7, owner: 'DUSS_MAKER' },
  bank_delay: { days: 15, owner: 'BANK_REGIONAL' },
  subsidy_delay: { days: 7, owner: 'UCDF_FINANCE' },
  cattle_rejected: { days: 3, owner: 'ROUTE_SUPERVISOR' },
  seller_payment_delay: { days: 5, owner: 'BANK_MAKER' },
  emi_deduction_error: { days: 7, owner: 'UCDF_FINANCE' },
  other: { days: 15, owner: 'DCS_SECRETARY' },
};
const KNOWN_CATEGORIES = Object.keys(DEFAULT_SLA);
// Escalation ladder: each breach advances ownership one rung, capped at the top.
const LADDER = ['DCS_BOARD', 'ROUTE_SUPERVISOR', 'DUSS_MAKER', 'DISTRICT_OFFICER', 'UCDF_PM', 'BANK_REGIONAL'];

/** Resolve {days, owner} from config (pinned scheme → published scheme → code default). */
const resolveSla = async (category, app) => {
  let rules = null;
  if (app && app.scheme_version) {
    const row = await schemeConfigService.getByVersion(app.scheme_version).catch(() => null);
    rules = row && row.rules_json;
  }
  if (!rules) {
    const pub = await schemeConfigService.getPublishedScheme().catch(() => null);
    rules = pub && pub.rules;
  }
  const fromCfg = rules && rules.grievance && rules.grievance[category];
  const def = DEFAULT_SLA[category] || DEFAULT_SLA.other;
  return { days: (fromCfg && fromCfg.days) || def.days, owner: (fromCfg && fromCfg.owner) || def.owner };
};

/** Farmer: raise a grievance (optionally linked to an application/purchase). */
const raise = async (req) => {
  const actor = await resolveActor(req);
  if (!actor.farmerRef) throw err('Unknown farmer', 'CIA_ACTOR_UNKNOWN', 401);
  const { CiaGrievance, CiaApplication, CiaPurchase, sequelize } = getDb();
  const b = req.body || {};
  if (!KNOWN_CATEGORIES.includes(b.category)) throw err(`Unknown grievance category "${b.category}"`, 'CIA_GRIEVANCE_BAD_CATEGORY', 400);

  let app = null; let applicationId = null; let purchaseId = null;
  if (b.applicationUuid) {
    app = await CiaApplication.findOne({ where: { application_uuid: b.applicationUuid } });
    if (!app || app.farmer_ref !== actor.farmerRef) throw err('Not your application', 'CIA_APP_FORBIDDEN', 403);
    applicationId = app.id;
  }
  if (b.purchaseUuid) {
    const purchase = await CiaPurchase.findOne({ where: { purchase_uuid: b.purchaseUuid } });
    if (purchase) purchaseId = purchase.id;
  }
  const { days, owner } = await resolveSla(b.category, app);
  const now = new Date();

  return sequelize.transaction(async (t) => {
    const g = await CiaGrievance.create({
      grievance_uuid: crypto.randomUUID(), farmer_ref: actor.farmerRef, application_id: applicationId, purchase_id: purchaseId,
      category: b.category, channel: b.channel || 'app', priority: b.priority || 'med', description: b.description || null,
      status: STATUS.OPEN, current_owner_role: owner, escalation_level: 0, sla_days: days,
      filed_at: now, sla_due_at: addDays(now, days), raised_by_user_id: actor.appUserId,
    }, { transaction: t });
    await emitDomainEvent({
      eventType: 'cia.grievance.raised', aggregateType: 'CiaGrievance', aggregateId: g.grievance_uuid,
      farmerId: actor.appUserId, payload: { category: b.category, priority: g.priority, slaDays: days, owner },
    }, { transaction: t });
    return { grievanceUuid: g.grievance_uuid, status: g.status, category: g.category, currentOwnerRole: owner, slaDueAt: g.sla_due_at };
  });
};

/** Farmer: my grievances (own farmer_ref only). */
const listForFarmer = async (req) => {
  const actor = await resolveActor(req);
  if (!actor.farmerRef) throw err('Unknown farmer', 'CIA_ACTOR_UNKNOWN', 401);
  const { CiaGrievance } = getDb();
  const rows = await CiaGrievance.findAll({ where: { farmer_ref: actor.farmerRef }, order: [['filed_at', 'DESC']] });
  return rows.map(shape);
};

/** UCDF: the pendency queue (optionally by status), oldest-due first. */
const listQueue = async (req) => {
  const { CiaGrievance } = getDb();
  const where = {};
  const status = req.query && req.query.status;
  if (status) where.status = status;
  const rows = await CiaGrievance.findAll({ where, order: [['sla_due_at', 'ASC']] });
  return rows.map(shape);
};

/** Staff: advance a grievance. RESOLVED requires a recorded resolution note. */
const transition = async (req) => {
  const actor = await resolveActor(req);
  const { CiaGrievance, sequelize } = getDb();
  const g = await CiaGrievance.findOne({ where: { grievance_uuid: req.params.grievanceUuid } });
  if (!g) throw err('Grievance not found', 'CIA_GRIEVANCE_NOT_FOUND', 404);
  const to = req.body && req.body.toStatus;
  if (!(TRANSITIONS[g.status] || []).includes(to)) throw err(`Illegal grievance transition ${g.status} → ${to}`, 'CIA_GRIEVANCE_ILLEGAL', 409);
  if (to === STATUS.RESOLVED && !(req.body && req.body.note)) throw err('A resolution note is required to resolve', 'CIA_RESOLUTION_NOTE_REQUIRED', 400);

  return sequelize.transaction(async (t) => {
    const patch = { status: to, assigned_to_user_id: actor.appUserId };
    if (to === STATUS.RESOLVED) { patch.resolved_at = new Date(); patch.resolution_note = req.body.note; }
    await g.update(patch, { transaction: t });
    await emitDomainEvent({
      eventType: `cia.grievance.${to.toLowerCase()}`, aggregateType: 'CiaGrievance', aggregateId: g.grievance_uuid,
      farmerId: g.raised_by_user_id, payload: { by: actor.appUserId, note: (req.body && req.body.note) || null },
    }, { transaction: t });
    return { grievanceUuid: g.grievance_uuid, status: to };
  });
};

/** Escalate grievances past their SLA up the owner ladder (alert-only). */
const ageAndEscalate = async (asOf = new Date()) => {
  const { CiaGrievance, sequelize } = getDb();
  const overdue = await CiaGrievance.findAll({
    where: { status: { [Op.in]: [STATUS.OPEN, STATUS.ACKNOWLEDGED, STATUS.IN_PROGRESS, STATUS.ESCALATED] }, sla_due_at: { [Op.lt]: asOf } },
  });
  let escalated = 0;
  for (const g of overdue) {
    const atCap = g.escalation_level >= LADDER.length - 1;
    if (atCap && g.status === STATUS.ESCALATED) continue; // already at the top rung — no further escalation
    const nextLevel = Math.min(g.escalation_level + 1, LADDER.length - 1);
    const newOwner = LADDER[nextLevel];
    // eslint-disable-next-line no-await-in-loop
    await sequelize.transaction(async (t) => {
      await g.update({ status: STATUS.ESCALATED, escalation_level: nextLevel, current_owner_role: newOwner, sla_due_at: addDays(asOf, g.sla_days) }, { transaction: t });
      await emitDomainEvent({
        eventType: 'cia.grievance.escalated', aggregateType: 'CiaGrievance', aggregateId: g.grievance_uuid,
        farmerId: g.raised_by_user_id, payload: { reason: 'sla_breach', escalationLevel: nextLevel, owner: newOwner },
      }, { transaction: t });
    });
    escalated += 1;
  }
  return { escalated };
};

const shape = (g) => ({
  grievanceUuid: g.grievance_uuid, category: g.category, priority: g.priority, status: g.status,
  currentOwnerRole: g.current_owner_role, escalationLevel: g.escalation_level,
  filedAt: g.filed_at, slaDueAt: g.sla_due_at, resolvedAt: g.resolved_at, resolutionNote: g.resolution_note,
  applicationId: g.application_id, description: g.description,
});

module.exports = { raise, listForFarmer, listQueue, transition, ageAndEscalate, STATUS, DEFAULT_SLA, KNOWN_CATEGORIES };
