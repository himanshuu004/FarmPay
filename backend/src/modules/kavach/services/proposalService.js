/**
 * KAVACH enrolment — the NLM proposal → policy lifecycle (CLAUDE.md state
 * machine, authoritative over the doc's simpler list):
 *
 *   DRAFT → TAGGED → EXAMINED(VET) → VALUED → PAID → POLICY_ISSUED
 *           (↘ REJECTED at any stage)
 *
 * Authorities mirror the KCC pattern:
 *   FARMER — creates the draft, captures the 12-digit tag + 2 NLM photos.
 *   VET    — examines the animal and sets the joint valuation.
 *   OPS    — (INSURER_OPS back-office) confirms the premium debit (via KCC with
 *            consent, ¶32–33) and issues the policy. No live insurer system in v1.
 *
 * On POLICY_ISSUED the policy + per-animal assets + premium ledger are written in
 * one transaction, with a 21-day waiting period stamped. Statutory math stays in
 * the engine (#20); this service only orchestrates state + side effects.
 */
const crypto = require('crypto');
const { computeNlmPremium } = require('./premiumQuoteEngine');
const quoteService = require('./kavachQuoteService');
const { emitDomainEvent } = require('../../../shared/services/domainEvents');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const err = (msg, code, status = 400) => { const e = new Error(msg); e.statusCode = status; e.errorCode = code; return e; };

// Legal transitions + the authority that may author each.
const TRANSITIONS = {
  DRAFT: { TAGGED: 'FARMER', REJECTED: 'FARMER' },
  TAGGED: { EXAMINED: 'VET', REJECTED: 'VET' },
  EXAMINED: { VALUED: 'VET', REJECTED: 'VET' },
  VALUED: { PAID: 'OPS', REJECTED: 'OPS' },
  PAID: { POLICY_ISSUED: 'OPS' },
  POLICY_ISSUED: {},
  REJECTED: {},
};
const TAG_RE = /^\d{12}$/;

const find = async (proposalUuid, t = null) => {
  const { InsuranceProposal } = getDb();
  const p = await InsuranceProposal.findOne({ where: { proposal_uuid: proposalUuid }, transaction: t });
  if (!p) throw err('Proposal not found', 'KAVACH_PROPOSAL_NOT_FOUND', 404);
  return p;
};

const assertLegal = (proposal, toStatus, actorRole) => {
  const allowed = TRANSITIONS[proposal.status] || {};
  const authority = allowed[toStatus];
  if (!authority) throw err(`Illegal transition ${proposal.status} → ${toStatus}`, 'KAVACH_ILLEGAL_TRANSITION');
  if (actorRole && actorRole !== authority) {
    throw err(`${actorRole} may not author ${proposal.status} → ${toStatus} (needs ${authority})`, 'KAVACH_TRANSITION_FORBIDDEN', 403);
  }
};

const emit = (type, proposal, payload = {}, t) => emitDomainEvent({
  eventType: type, aggregateType: 'InsuranceProposal', aggregateId: proposal.proposal_uuid,
  farmerId: proposal.farmer_id, payload,
}, { transaction: t });

/** Create a DRAFT proposal from a quote. Rejects if it would breach the CU cap. */
const createProposal = async ({ farmerId, planCode, assetRefId = null, marketValue, milkLitresPerDay, channel = 'self', pospId = null, consentRecordId = null }) => {
  const { InsuranceProposal, InsurancePlan } = getDb();
  const plan = await InsurancePlan.findOne({ where: { plan_code: planCode, is_active: true } });
  if (!plan) throw err(`Unknown plan ${planCode}`, 'KAVACH_PLAN_UNKNOWN', 404);

  const q = await quoteService.quote({ farmerId, planCode, marketValue, milkLitresPerDay });
  if (!q.cu.ok) throw err(`Cattle-unit cap exceeded (${q.cu.total}/${q.cu.cap})`, 'KAVACH_CU_CAP_EXCEEDED');

  // Link the farmer's DPDP insurance consent (recorded via the app) so the later
  // premium-debit step (¶32–33) has it. The consent API returns a UUID; the
  // proposal FK is the integer id — resolve it here from the farmer's live consent.
  if (!consentRecordId) {
    const { ConsentRecord } = getDb();
    const c = ConsentRecord ? await ConsentRecord.findOne({
      where: { farmer_id: farmerId, consent_type: 'insurance', accepted: true, is_active: true },
      order: [['created_at', 'DESC']],
    }) : null;
    if (c) consentRecordId = c.id;
  }

  const proposal = await InsuranceProposal.create({
    proposal_uuid: crypto.randomUUID(), farmer_id: farmerId, plan_id: plan.id,
    asset_type: 'dairy_animal', asset_ref_id: assetRefId, species: plan.species,
    channel, posp_id: pospId, consent_record_id: consentRecordId,
    market_value: marketValue != null ? marketValue : null,
    sum_insured: q.sumInsured, premium_total: q.premiumTotal, premium_farmer: q.farmerShare,
    status: 'DRAFT',
  });
  await emit('kavach.proposal.created', proposal, { planCode, sumInsured: q.sumInsured, premiumFarmer: q.farmerShare });
  return proposal;
};

/** DRAFT → TAGGED. Farmer attaches the 12-digit NDDB tag + the 2 NLM photos. */
const tag = async (proposalUuid, { tagUid, ownerPhotoUrl, tagPhotoUrl }, { actorRole = 'FARMER' } = {}) => {
  const { PolicyAsset } = getDb();
  const proposal = await find(proposalUuid);
  assertLegal(proposal, 'TAGGED', actorRole);
  if (!TAG_RE.test(String(tagUid || ''))) throw err('Tag must be a 12-digit NDDB number', 'KAVACH_TAG_INVALID');
  if (!ownerPhotoUrl || !tagPhotoUrl) throw err('Both NLM photos (owner + tag) are required', 'KAVACH_PHOTOS_REQUIRED');

  // Tag must not already be on an active policy asset (identity dedupe).
  const clash = await PolicyAsset.findOne({ where: { tag_uid: tagUid, is_active: true } });
  if (clash) throw err('This tag is already insured', 'KAVACH_TAG_DUPLICATE', 409);

  await proposal.update({ status: 'TAGGED', tag_uid: tagUid, enrol_photo_owner_url: ownerPhotoUrl, enrol_photo_tag_url: tagPhotoUrl });
  await emit('kavach.proposal.tagged', proposal, { tagUid });
  return proposal;
};

/** TAGGED → EXAMINED. A VCI-registered vet examines the animal. */
const examine = async (proposalUuid, { vetUserId }, { actorRole = 'VET' } = {}) => {
  const proposal = await find(proposalUuid);
  assertLegal(proposal, 'EXAMINED', actorRole);
  await proposal.update({ status: 'EXAMINED', examined_by: vetUserId || null });
  await emit('kavach.proposal.examined', proposal, { vetUserId });
  // ₹50 enrolment-exam honorarium for the VO (best-effort; field ledger).
  if (vetUserId) {
    try { await require('../../claims/services/vetHonorariumService').accrue({ vetId: vetUserId, kind: 'ENROL_EXAM', amount: 50, proposalId: proposal.id }); } catch { /* ledger optional */ }
  }
  return proposal;
};

/** EXAMINED → VALUED. Joint valuation; re-prices the premium off the agreed SI. */
const value = async (proposalUuid, { sumInsured = null, milkLitresPerDay = null } = {}, { actorRole = 'VET' } = {}) => {
  const { InsurancePlan } = getDb();
  const proposal = await find(proposalUuid);
  assertLegal(proposal, 'VALUED', actorRole);

  let patch = { status: 'VALUED' };
  if (sumInsured != null || milkLitresPerDay != null) {
    const plan = await InsurancePlan.findByPk(proposal.plan_id);
    const q = computeNlmPremium({
      species: plan.species, marketValue: sumInsured != null ? sumInsured : Number(proposal.sum_insured),
      milkLitresPerDay, termMonths: plan.term_months, region: plan.region,
    });
    patch = { ...patch, market_value: sumInsured, sum_insured: q.sumInsured, premium_total: q.premiumTotal, premium_farmer: q.farmerShare };
  }
  await proposal.update(patch);
  await emit('kavach.proposal.valued', proposal, { sumInsured: Number(proposal.sum_insured) });
  return proposal;
};

/**
 * VALUED → PAID. OPS confirms the premium debit. Premium is paid THROUGH the KCC
 * account with consent (¶32–33) — so a DPDP consent record is required, and the
 * farmer-share entry is `financed_kcc` when routed via a facility.
 */
const confirmPayment = async (proposalUuid, { viaKcc = false, kccFacilityUuid = null, reference = null } = {}, { actorRole = 'OPS' } = {}) => {
  const { InsurancePlan } = getDb();
  const proposal = await find(proposalUuid);
  assertLegal(proposal, 'PAID', actorRole);
  if (!proposal.consent_record_id) throw err('Premium debit needs a recorded DPDP consent (¶32–33)', 'KAVACH_CONSENT_REQUIRED');

  const plan = await InsurancePlan.findByPk(proposal.plan_id);
  const q = computeNlmPremium({ species: plan.species, marketValue: Number(proposal.sum_insured), termMonths: plan.term_months, region: plan.region });

  const database = getDb();
  return database.sequelize.transaction(async (t) => {
    // Persist the via-KCC decision so issuance (a separate txn) can honour it.
    await proposal.update({ status: 'PAID', financed_on_kcc: !!viaKcc, kcc_facility_uuid: kccFacilityUuid, premium_reference: reference }, { transaction: t });
    await emit('kavach.proposal.paid', proposal, { premiumFarmer: q.farmerShare, viaKcc }, t);
    return proposal;
  });
};

/**
 * PAID → POLICY_ISSUED. Writes the policy + per-animal asset + premium ledger in
 * one transaction; stamps the 21-day waiting period. Returns { proposal, policy }.
 */
const issue = async (proposalUuid, { insurerName = null } = {}, { actorRole = 'OPS' } = {}) => {
  const database = getDb();
  const { InsuranceProposal, InsurancePlan, InsurancePolicy, PolicyAsset, PremiumLedger } = database;
  return database.sequelize.transaction(async (t) => {
    const proposal = await InsuranceProposal.findOne({ where: { proposal_uuid: proposalUuid }, transaction: t });
    if (!proposal) throw err('Proposal not found', 'KAVACH_PROPOSAL_NOT_FOUND', 404);
    assertLegal(proposal, 'POLICY_ISSUED', actorRole);

    const plan = await InsurancePlan.findByPk(proposal.plan_id, { transaction: t });
    const q = computeNlmPremium({ species: plan.species, marketValue: Number(proposal.sum_insured), termMonths: plan.term_months, region: plan.region });

    const start = new Date();
    const end = new Date(start); end.setMonth(end.getMonth() + plan.term_months);
    const waiting = new Date(start); waiting.setDate(waiting.getDate() + plan.waiting_period_days);
    const iso = (d) => d.toISOString().slice(0, 10);
    const financed = !!proposal.financed_on_kcc;

    const policy = await InsurancePolicy.create({
      policy_uuid: crypto.randomUUID(), proposal_id: proposal.id, farmer_id: proposal.farmer_id, plan_id: plan.id,
      insurer_name: insurerName, sum_insured: proposal.sum_insured, premium_total: proposal.premium_total, premium_farmer: proposal.premium_farmer,
      start_date: iso(start), end_date: iso(end), waiting_until: iso(waiting), status: 'active',
      premium_debit_confirmed: true, financed_on_kcc: financed, assigned_to_bank: financed,
      kcc_facility_uuid: proposal.kcc_facility_uuid,
    }, { transaction: t });

    await PolicyAsset.create({
      policy_id: policy.id, asset_type: 'dairy_animal', asset_ref_id: proposal.asset_ref_id,
      tag_uid: proposal.tag_uid, species: proposal.species, valuation: proposal.sum_insured,
      enrol_photo_owner_url: proposal.enrol_photo_owner_url, enrol_photo_tag_url: proposal.enrol_photo_tag_url,
    }, { transaction: t });

    // Premium money-events: farmer share + the two subsidy tranches.
    const now = new Date();
    await PremiumLedger.create({ policy_id: policy.id, entry_type: financed ? 'financed_kcc' : 'farmer_debit', amount: q.farmerShare, status: 'confirmed', occurred_at: now }, { transaction: t });
    await PremiumLedger.create({ policy_id: policy.id, entry_type: 'subsidy_central', amount: q.govtCentre, status: 'pending', occurred_at: now }, { transaction: t });
    await PremiumLedger.create({ policy_id: policy.id, entry_type: 'subsidy_state', amount: q.govtState, status: 'pending', occurred_at: now }, { transaction: t });

    await proposal.update({ status: 'POLICY_ISSUED' }, { transaction: t });
    await emitDomainEvent({
      eventType: 'kavach.policy.issued', aggregateType: 'InsurancePolicy', aggregateId: policy.policy_uuid,
      farmerId: proposal.farmer_id, payload: { proposalUuid, sumInsured: Number(policy.sum_insured), waitingUntil: policy.waiting_until },
    }, { transaction: t });

    // POSP enrolment commission → escrow with a T+15 payout. Rate is config (#5):
    // plan.rules_json.pospCommissionPct, defaulting to 5%.
    if (proposal.channel === 'posp' && proposal.posp_id) {
      const commission = require('./commissionService');
      const pct = (plan.rules_json && plan.rules_json.pospCommissionPct) || 5;
      await commission.accrue({ pospId: proposal.posp_id, policyId: policy.id, amount: Math.round(Number(proposal.premium_farmer) * (pct / 100) * 100) / 100 }, t);
    }

    return { proposal, policy };
  });
};

const reject = async (proposalUuid, reason = null, { actorRole = null } = {}) => {
  const proposal = await find(proposalUuid);
  assertLegal(proposal, 'REJECTED', actorRole);
  await proposal.update({ status: 'REJECTED', rejection_reason: reason });
  await emit('kavach.proposal.rejected', proposal, { reason });
  return proposal;
};

const listForFarmer = async (farmerId) => {
  const { InsuranceProposal } = getDb();
  return InsuranceProposal.findAll({ where: { farmer_id: farmerId }, order: [['created_at', 'DESC']] });
};

module.exports = { TRANSITIONS, createProposal, tag, examine, value, confirmPayment, issue, reject, listForFarmer, find };
