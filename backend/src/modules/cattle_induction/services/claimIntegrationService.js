/**
 * CIA claim integration (CIA-4) — thin bridge that REUSES the platform CLAIMS
 * engine. The CIA cattle policy is a real KAVACH InsurancePolicy (Slice Q
 * retrofit); a death/loss claim delegates to claimService.intimate, so the whole
 * machinery — 4-document checklist, 15-day settlement clock, 12% p.a. penal
 * interest, hash-chained claim_events, no-auto-denial — comes for free. On
 * settlement the CIA loan is adjusted (cia.claim.loan_adjusted).
 */
const { emitDomainEvent } = require('../../../shared/services/domainEvents');
const { resolveActor } = require('./context');
const claimService = require('../../claims/services/claimService');
const emiService = require('./emiService');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };
const err = (msg, code, status = 400) => { const e = new Error(msg); e.statusCode = status; e.errorCode = code; return e; };

/** Load the app (owner-scoped) + its CATTLE insurance link with a KAVACH policy. */
const loadCattlePolicy = async (appUuid, actor, { requireOwner = true } = {}) => {
  const { CiaApplication, CiaInsuranceLink, InsurancePolicy } = getDb();
  const app = await CiaApplication.findOne({ where: { application_uuid: appUuid } });
  if (!app) throw err('Application not found', 'CIA_APP_NOT_FOUND', 404);
  if (requireOwner && (!actor.farmerRef || app.farmer_ref !== actor.farmerRef)) throw err('Not your application', 'CIA_APP_FORBIDDEN', 403);
  const link = await CiaInsuranceLink.findOne({ where: { application_id: app.id, policy_type: 'CATTLE' } });
  if (!link || !link.insurance_policy_uuid) throw err('No cattle policy on file for this application', 'CIA_NO_CATTLE_POLICY', 409);
  const policy = await InsurancePolicy.findOne({ where: { policy_uuid: link.insurance_policy_uuid } });
  return { app, link, policy };
};

/** Farmer: report death/loss → intimate a claim on the cattle policy (reuse). */
const reportDeath = async (req) => {
  const actor = await resolveActor(req);
  if (!actor.appUserId) throw err('Unknown farmer', 'CIA_ACTOR_UNKNOWN', 401);
  const { app, link } = await loadCattlePolicy(req.params.appUuid, actor);
  const b = req.body || {};
  const claim = await claimService.intimate({
    farmerId: actor.appUserId, policyUuid: link.insurance_policy_uuid,
    peril: b.peril || null, deathDate: b.deathDate || null, sumClaimed: b.sumClaimed || null,
    policyAssetId: link.insurance_policy_asset_id,
  });
  await emitDomainEvent({
    eventType: 'cia.claim.intimated', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
    farmerId: actor.appUserId, payload: { claimUuid: claim.claim_uuid, policyUuid: link.insurance_policy_uuid },
  });
  return { applicationUuid: app.application_uuid, claimUuid: claim.claim_uuid, status: claim.status };
};

/** Farmer: claim status with the visible SLA clock + penal interest (from the engine). */
const claimStatus = async (req) => {
  const actor = await resolveActor(req);
  const { app, policy } = await loadCattlePolicy(req.params.appUuid, actor);
  const { ClaimCase } = getDb();
  const claim = await ClaimCase.findOne({ where: { policy_id: policy.id }, order: [['id', 'DESC']] });
  if (!claim) return { applicationUuid: app.application_uuid, claim: null };
  const detail = await claimService.getDetail(claim.claim_uuid);
  return {
    applicationUuid: app.application_uuid,
    claimUuid: claim.claim_uuid,
    status: claim.status,
    docChecklist: detail.checklist,               // the 4-document checklist
    settlementDeadlineAt: claim.stage_deadline_at,
    penalInterestAccrued: Number(claim.penal_interest_accrued),
    settledAmount: claim.settled_amount != null ? Number(claim.settled_amount) : null,
  };
};

/**
 * Finance/UCDF: on a SETTLED claim, apply the settlement proceeds to the CIA EMI
 * ledger (reducing outstanding) and, if that fully clears the loan, close it.
 * Idempotent (guarded by the prior cia.claim.loan_adjusted event). Reduces the
 * internal recovery ledger only — no fund movement, no auto-rejection.
 */
const recordLoanAdjustment = async (req) => {
  const actor = await resolveActor(req);
  const { app, policy } = await loadCattlePolicy(req.params.appUuid, actor, { requireOwner: false });
  const { ClaimCase, DomainEvent, sequelize } = getDb();
  const claim = await ClaimCase.findOne({ where: { policy_id: policy.id, status: 'SETTLED' }, order: [['id', 'DESC']] });
  if (!claim) throw err('No settled claim to adjust the loan against', 'CIA_NO_SETTLED_CLAIM', 409);
  const already = await DomainEvent.findOne({ where: { event_type: 'cia.claim.loan_adjusted', aggregate_id: app.application_uuid } });
  if (already) return { applicationUuid: app.application_uuid, alreadyAdjusted: true };

  const settled = Number(claim.settled_amount || 0);
  const penal = Number(claim.penal_interest_accrued || 0);
  const appliedToLoan = Math.round((settled + penal) * 100) / 100;

  let ledgerResult = { appliedToLedger: 0, outstandingAfter: 0, fullyCleared: false };
  let loanClosed = false;
  await sequelize.transaction(async (t) => {
    ledgerResult = await emiService.applyClaimProceeds({ app, amount: appliedToLoan, sourceRef: `claim:${claim.claim_uuid}` }, t);
    if (ledgerResult.fullyCleared) {
      loanClosed = await emiService.closeLoanIfCleared(app, { reason: 'claim_settlement', extraPayload: { claimUuid: claim.claim_uuid } }, t);
    }
    await emitDomainEvent({
      eventType: 'cia.claim.loan_adjusted', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
      farmerId: null, payload: { claimUuid: claim.claim_uuid, settledAmount: settled, penalInterest: penal, appliedToLoan, appliedToLedger: ledgerResult.appliedToLedger, outstandingAfter: ledgerResult.outstandingAfter, loanClosed, by: actor.appUserId },
    }, { transaction: t });
  });
  return { applicationUuid: app.application_uuid, settledAmount: settled, penalInterest: penal, appliedToLoan, appliedToLedger: ledgerResult.appliedToLedger, outstandingAfter: ledgerResult.outstandingAfter, loanClosed, adjusted: true };
};

module.exports = { reportDeath, claimStatus, recordLoanAdjustment };
