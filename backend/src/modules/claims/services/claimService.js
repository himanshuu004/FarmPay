/**
 * Claim lifecycle (§5.2, §7.2; CLAUDE.md state machine).
 *
 *   INTIMATED → SURVEY_DONE(surveyor) → PM_DONE(vet) → DOCS_SUBMITTED(farmer)
 *             → UNDER_REVIEW(ops) → SETTLED | REJECTED (ops)
 *
 * Guarantees: 21-day waiting from issuance is enforced at intimation; the 4-doc
 * checklist gates DOCS_SUBMITTED (never ask beyond four); every transition
 * appends a hash-chained claim_event; and SETTLED/REJECTED are authored ONLY by
 * a human (INSURER_OPS) — nothing here auto-decides (#10).
 */
const crypto = require('crypto');
const claimEvents = require('./claimEventService');
const evidenceService = require('./evidenceService');
const slaClock = require('./slaClockService');
const { emitDomainEvent } = require('../../../shared/services/domainEvents');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const err = (msg, code, status = 400) => { const e = new Error(msg); e.statusCode = status; e.errorCode = code; return e; };

const TRANSITIONS = {
  INTIMATED: { SURVEY_DONE: 'SURVEYOR', REJECTED: 'INSURER_OPS' },
  SURVEY_DONE: { PM_DONE: 'VET', REJECTED: 'INSURER_OPS' },
  PM_DONE: { DOCS_SUBMITTED: 'FARMER', REJECTED: 'INSURER_OPS' },
  DOCS_SUBMITTED: { UNDER_REVIEW: 'INSURER_OPS', REJECTED: 'INSURER_OPS' },
  UNDER_REVIEW: { SETTLED: 'INSURER_OPS', REJECTED: 'INSURER_OPS' },
  SETTLED: {},
  REJECTED: {},
};
const HRS_72 = 72 * 3600000;
const TERMINAL = ['SETTLED', 'REJECTED'];

const find = async (claimUuid, t = null) => {
  const { ClaimCase } = getDb();
  const c = await ClaimCase.findOne({ where: { claim_uuid: claimUuid }, transaction: t });
  if (!c) throw err('Claim not found', 'CLAIMS_NOT_FOUND', 404);
  return c;
};

const assertLegal = (claim, toStatus, actorRole) => {
  const authority = (TRANSITIONS[claim.status] || {})[toStatus];
  if (!authority) throw err(`Illegal transition ${claim.status} → ${toStatus}`, 'CLAIMS_ILLEGAL_TRANSITION');
  if (actorRole && actorRole !== authority) throw err(`${actorRole} may not author ${claim.status} → ${toStatus} (needs ${authority})`, 'CLAIMS_TRANSITION_FORBIDDEN', 403);
};

/** Intimate a livestock-death claim. Enforces the 21-day waiting period. */
const intimate = async ({ farmerId, policyUuid, peril = null, deathDate = null, sumClaimed = null, policyAssetId = null }) => {
  const database = getDb();
  const { InsurancePolicy, ClaimCase } = database;
  const policy = await InsurancePolicy.findOne({ where: { policy_uuid: policyUuid } });
  if (!policy) throw err('Policy not found', 'KAVACH_POLICY_NOT_FOUND', 404);
  if (policy.farmer_id !== farmerId) throw err('Not your policy', 'KAVACH_POLICY_FORBIDDEN', 403);
  if (policy.status !== 'active') throw err(`Cannot claim on a ${policy.status} policy`, 'CLAIMS_POLICY_NOT_ACTIVE');

  const now = new Date();
  if (policy.waiting_until && now < new Date(policy.waiting_until)) {
    throw err(`Claims are not payable during the 21-day waiting period (until ${policy.waiting_until})`, 'CLAIMS_WITHIN_WAITING');
  }

  // One open claim per animal (per policy asset) — no duplicate/double-dip claims.
  const openWhere = { policy_id: policy.id, status: { [require('sequelize').Op.notIn]: TERMINAL } };
  if (policyAssetId != null) openWhere.policy_asset_id = policyAssetId;
  const existingOpen = await ClaimCase.findOne({ where: openWhere });
  if (existingOpen) throw err('An open claim already exists for this policy/animal', 'CLAIMS_DUPLICATE_OPEN', 409);

  const claimed = Math.min(Number(sumClaimed != null ? sumClaimed : policy.sum_insured), Number(policy.sum_insured));
  const fraud = {};
  if (deathDate && (now - new Date(deathDate)) > HRS_72) fraud.late_intimation = true; // §7.3 >72h

  return database.sequelize.transaction(async (t) => {
    const claim = await ClaimCase.create({
      claim_uuid: crypto.randomUUID(), policy_id: policy.id, farmer_id: farmerId, policy_asset_id: policyAssetId,
      claim_type: 'livestock_death', peril, death_date: deathDate, intimated_at: now,
      sum_claimed: claimed, status: 'INTIMATED', fraud_flags: Object.keys(fraud).length ? fraud : null,
    }, { transaction: t });
    await claimEvents.append(claim.id, { eventType: 'intimated', actorRole: 'farmer', actorId: farmerId, payload: { peril, deathDate, sumClaimed: claimed, lateIntimation: !!fraud.late_intimation } }, t);
    await emitDomainEvent({ eventType: 'claims.intimated', aggregateType: 'ClaimCase', aggregateId: claim.claim_uuid, farmerId, payload: { policyUuid, sumClaimed: claimed } }, { transaction: t });
    return claim;
  });
};

/** Generic guarded transition + hash-chained event, in one txn. */
const transition = async (claimUuid, toStatus, { actorRole, actorId = null, eventType, payload = {}, patch = {} } = {}) => {
  const database = getDb();
  return database.sequelize.transaction(async (t) => {
    const claim = await find(claimUuid, t);
    assertLegal(claim, toStatus, actorRole);
    await claim.update({ status: toStatus, ...patch }, { transaction: t });
    await claimEvents.append(claim.id, { eventType: eventType || `stage_${toStatus.toLowerCase()}`, actorRole: (actorRole || 'system').toLowerCase(), actorId, payload: { to: toStatus, ...payload } }, t);
    await emitDomainEvent({ eventType: `claims.${toStatus.toLowerCase()}`, aggregateType: 'ClaimCase', aggregateId: claim.claim_uuid, farmerId: claim.farmer_id, payload }, { transaction: t });
    return claim;
  });
};

const recordSurvey = (claimUuid, { surveyorId = null, report = {} } = {}) =>
  transition(claimUuid, 'SURVEY_DONE', { actorRole: 'SURVEYOR', actorId: surveyorId, eventType: 'survey_done', payload: { report } });

const recordPostmortem = (claimUuid, { vetId = null, report = {} } = {}) =>
  transition(claimUuid, 'PM_DONE', { actorRole: 'VET', actorId: vetId, eventType: 'pm_done', payload: { report, honorarium: 125 } });

/** PM_DONE → DOCS_SUBMITTED. Gated on the 4-doc checklist; starts the 15-day clock. */
const submitDocs = async (claimUuid, { ownerFarmerId = null } = {}) => {
  const claim = await find(claimUuid);
  if (ownerFarmerId != null && claim.farmer_id !== ownerFarmerId) throw err('Not your claim', 'CLAIMS_FORBIDDEN', 403);
  assertLegal(claim, 'DOCS_SUBMITTED', 'FARMER');
  const list = await evidenceService.checklist(claim.id);
  if (!list.complete) throw err(`Missing documents: ${list.missing.join(', ')}`, 'CLAIMS_DOCS_INCOMPLETE');

  const now = new Date();
  const deadline = slaClock.settlementDeadline(now);
  return transition(claimUuid, 'DOCS_SUBMITTED', {
    actorRole: 'FARMER', actorId: ownerFarmerId, eventType: 'docs_submitted',
    payload: { deadline, docs: list.present }, patch: { docs_complete_at: now, stage_deadline_at: deadline },
  });
};

const beginReview = (claimUuid) => transition(claimUuid, 'UNDER_REVIEW', { actorRole: 'INSURER_OPS', eventType: 'under_review' });

/** UNDER_REVIEW → SETTLED — HUMAN ONLY (INSURER_OPS). Never automated (#10). */
const settle = async (claimUuid, { amount, actorId = null } = {}) => {
  const claim = await find(claimUuid);
  const payout = Math.min(Number(amount != null ? amount : claim.sum_claimed), Number(claim.sum_claimed));
  const c = await transition(claimUuid, 'SETTLED', {
    actorRole: 'INSURER_OPS', actorId, eventType: 'settled',
    payload: { settledAmount: payout, penalInterest: Number(claim.penal_interest_accrued) },
    patch: { settled_amount: payout, settled_at: new Date() },
  });
  // Mark the policy claimed.
  const { InsurancePolicy } = getDb();
  const policy = await InsurancePolicy.findByPk(claim.policy_id);
  if (policy && policy.status === 'active') await policy.update({ status: 'claimed' });
  return c;
};

/** → REJECTED — HUMAN ONLY (INSURER_OPS), with a reason. Never automated (#10). */
const reject = (claimUuid, { reason = null, actorId = null } = {}) =>
  transition(claimUuid, 'REJECTED', { actorRole: 'INSURER_OPS', actorId, eventType: 'rejected', payload: { reason }, patch: { rejection_reason: reason } });

const getDetail = async (claimUuid) => {
  const { ClaimCase, ClaimEvent, EvidenceFile } = getDb();
  const claim = await ClaimCase.findOne({ where: { claim_uuid: claimUuid } });
  if (!claim) throw err('Claim not found', 'CLAIMS_NOT_FOUND', 404);
  const [events, evidence, checklist] = await Promise.all([
    ClaimEvent.findAll({ where: { claim_id: claim.id }, order: [['id', 'ASC']] }),
    EvidenceFile.findAll({ where: { claim_id: claim.id } }),
    evidenceService.checklist(claim.id),
  ]);
  return { claim, events, evidence, checklist };
};

const listForFarmer = async (farmerId) => {
  const { ClaimCase } = getDb();
  return ClaimCase.findAll({ where: { farmer_id: farmerId }, order: [['created_at', 'DESC']] });
};

module.exports = {
  TRANSITIONS, intimate, recordSurvey, recordPostmortem, submitDocs, beginReview, settle, reject,
  getDetail, listForFarmer, find,
};
