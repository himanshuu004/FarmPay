/**
 * CIA selection service — DCS Secretary/Board (in-app; Convention 30 exception).
 * List interested members, record the board decision + resolution, return an
 * application to the farmer for document correction.
 *
 * SELECTED_BY_DCS‡ → APPLICATION_PENDING (resolution doc required); NOT_SELECTED
 * → APPLICATION_CLOSED (reason required, re-apply path). Every decision is
 * written with board-member attribution to the append-only outbox.
 *
 * NOTE (CIA-1 interim): staff → DCS assignment is not yet modelled, so reads are
 * role-gated and scoped by an explicit dcsRef when the caller supplies one
 * (req.user.dcsRef or ?dcsRef=). A staff-assignment model is a documented follow-up.
 */
const { emitDomainEvent } = require('../../../shared/services/domainEvents');
const { erp } = require('../../../integrations');
const { APP, guardTransition } = require('../constants/ciaStatus');
const { resolveActor } = require('./context');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };
const err = (msg, code, status = 400) => { const e = new Error(msg); e.statusCode = status; e.errorCode = code; return e; };

/** DCS inbox: applications awaiting review, own-DCS scoped when a scope is supplied. */
const listInterested = async (req) => {
  const { CiaApplication } = getDb();
  const scope = (req.user && req.user.dcsRef) || (req.query && req.query.dcsRef) || null;
  const where = { status: [APP.INTEREST_SUBMITTED, APP.PENDING_DCS_REVIEW] };
  if (scope) where.dcs_ref = scope;
  const rows = await CiaApplication.findAll({ where, order: [['id', 'ASC']] });

  // Best-effort member context (ERP milk); repayment-capacity band is a TRUST
  // enrichment deferred to a later phase.
  return Promise.all(rows.map(async (a) => {
    let milkAvgMonthlyValue = null;
    try { const m = await erp.getMilkSummary(a.farmer_ref, 6); milkAvgMonthlyValue = m.avgMonthlyValue; } catch (_e) { /* ERP degraded */ }
    return {
      applicationUuid: a.application_uuid, farmerRef: a.farmer_ref, dcsRef: a.dcs_ref,
      status: a.status, requestedCattleCount: a.requested_cattle_count,
      milkAvgMonthlyValue, repaymentCapacityBand: null,
    };
  }));
};

/** ‡ DCS_BOARD records the minuted decision. One decision per application. */
const recordSelection = async (req) => {
  const actor = await resolveActor(req);
  if (!actor.appUserId) throw err('Unknown board member', 'CIA_ACTOR_UNKNOWN', 401);
  const { CiaApplication, CiaSelectionDecision, sequelize } = getDb();
  const b = req.body || {};

  const app = await CiaApplication.findOne({ where: { application_uuid: req.params.appUuid } });
  if (!app) throw err('Application not found', 'CIA_APP_NOT_FOUND', 404);
  if (app.status !== APP.PENDING_DCS_REVIEW) throw err(`Cannot decide from ${app.status}`, 'CIA_APP_BAD_STATE', 409);

  const already = await CiaSelectionDecision.findOne({ where: { application_id: app.id } });
  if (already) throw err('A board decision already exists for this application', 'CIA_SELECTION_EXISTS', 409);

  const selected = b.decision === 'SELECTED';
  if (selected && !b.resolutionDocRef) throw err('Resolution document is required to select', 'CIA_RESOLUTION_REQUIRED', 400);
  if (!selected && !b.reason) throw err('Reason is required when not selecting', 'CIA_REASON_REQUIRED', 400);

  return sequelize.transaction(async (t) => {
    await CiaSelectionDecision.create({
      application_id: app.id,
      decision: selected ? 'SELECTED' : 'NOT_SELECTED',
      reason: selected ? null : b.reason,
      resolution_doc_ref: selected ? b.resolutionDocRef : null,
      decided_by_user_id: actor.appUserId,     // board-member attribution
      decided_at: new Date(),
    }, { transaction: t });

    if (selected) {
      guardTransition('application', app.status, APP.SELECTED_BY_DCS);
      await app.update({ status: APP.SELECTED_BY_DCS }, { transaction: t });
      guardTransition('application', APP.SELECTED_BY_DCS, APP.APPLICATION_PENDING);
      await app.update({ status: APP.APPLICATION_PENDING }, { transaction: t });
    } else {
      guardTransition('application', app.status, APP.NOT_SELECTED);
      await app.update({ status: APP.NOT_SELECTED, reject_reason: b.reason }, { transaction: t });
      guardTransition('application', APP.NOT_SELECTED, APP.APPLICATION_CLOSED);
      await app.update({ status: APP.APPLICATION_CLOSED }, { transaction: t });
    }

    await emitDomainEvent({
      eventType: 'cia.selection.recorded', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
      farmerId: null,
      payload: { decision: selected ? 'SELECTED' : 'NOT_SELECTED', decidedBy: actor.appUserId, status: app.status, reason: selected ? undefined : b.reason },
    }, { transaction: t });

    return { applicationUuid: app.application_uuid, decision: selected ? 'SELECTED' : 'NOT_SELECTED', status: app.status };
  });
};

/** Return an application to the farmer for document correction (reason required). */
const returnForCorrection = async (req) => {
  const actor = await resolveActor(req);
  const { CiaApplication, sequelize } = getDb();
  const b = req.body || {};
  const app = await CiaApplication.findOne({ where: { application_uuid: req.params.appUuid } });
  if (!app) throw err('Application not found', 'CIA_APP_NOT_FOUND', 404);
  if (app.status !== APP.APPLICATION_PENDING) throw err(`Cannot return from ${app.status}`, 'CIA_APP_BAD_STATE', 409);

  return sequelize.transaction(async (t) => {
    guardTransition('application', app.status, APP.DOCUMENTS_INCOMPLETE);
    await app.update({ status: APP.DOCUMENTS_INCOMPLETE, reject_reason: b.reason }, { transaction: t });
    await emitDomainEvent({
      eventType: 'cia.application.returned', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
      farmerId: null,
      payload: { by: actor.appUserId, reason: b.reason, status: APP.DOCUMENTS_INCOMPLETE },
    }, { transaction: t });
    return { applicationUuid: app.application_uuid, status: APP.DOCUMENTS_INCOMPLETE };
  });
};

module.exports = { listInterested, recordSelection, returnForCorrection };
