/**
 * KCC origination workflow — the 11-state composite-KCC lifecycle (KccFacility).
 *
 *   DRAFT → SUBMITTED → UNDER_REVIEW → FORWARDED_TO_BANK → SANCTIONED
 *         → DISBURSED → ACTIVE → RENEWAL_DUE → RENEWED(→ACTIVE) → CLOSED
 *         (↘ REJECTED → DRAFT for resubmission)
 *
 * This service owns ONLY the state transitions and their side effects; the limit
 * arithmetic always lives in the engine (statutory math is never re-implemented,
 * CLAUDE.md #20). `originateFacility` (kccLimitService) creates the DRAFT; this
 * service walks it forward.
 *
 * Authorship (who may author a transition) mirrors the co-op app/erp split:
 *   FARMER  — the farmer-authored transitions: submit, opt-in renewal, and
 *             resubmit-after-reject (auto-renewal without opt-in is OUT OF SCOPE).
 *   BANK    — every post-submission hop (review, forward, sanction, disburse,
 *             activate, close). The v1 banker interface is the generated
 *             application/renewal PDF, so back-office records these statuses
 *             against that paper trail — there is no separate live-bank actor and
 *             no dedicated KCC ops role in the canonical set (CLAUDE.md Roles).
 *             Controllers map the JWT role BANKER → BANK.
 *   SYSTEM  — job-authored hops (renewal-due sweep, the RENEWED→ACTIVE advance).
 * Routes additionally roleCheck; the service is the last line of defence.
 */
const { emitDomainEvent } = require('../../../shared/services/domainEvents');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const err = (msg, code, status = 400) => { const e = new Error(msg); e.statusCode = status; e.errorCode = code; return e; };

// Legal transitions + the authority that may author each one.
const TRANSITIONS = {
  DRAFT:            { SUBMITTED: 'FARMER' },
  // Society/Milk-Union certification (ERP-authored) gates the bank (real workflow).
  SUBMITTED:        { SOCIETY_CERTIFIED: 'SOCIETY', REJECTED: 'SOCIETY' },
  SOCIETY_CERTIFIED:{ UNDER_REVIEW: 'BANK', REJECTED: 'BANK' },
  UNDER_REVIEW:     { FORWARDED_TO_BANK: 'BANK', REJECTED: 'BANK' },
  FORWARDED_TO_BANK:{ SANCTIONED: 'BANK', REJECTED: 'BANK' },
  SANCTIONED:       { DISBURSED: 'BANK' },
  DISBURSED:        { ACTIVE: 'BANK' },
  ACTIVE:           { RENEWAL_DUE: 'SYSTEM', CLOSED: 'BANK' },
  RENEWAL_DUE:      { RENEWED: 'FARMER', CLOSED: 'BANK' },
  RENEWED:          { ACTIVE: 'SYSTEM' },
  REJECTED:         { DRAFT: 'FARMER' },
  CLOSED:           {},
};

const findFacility = async (facilityUuid, transaction = null) => {
  const { KccFacility } = getDb();
  const facility = await KccFacility.findOne({ where: { facility_uuid: facilityUuid }, transaction });
  if (!facility) throw err('Facility not found', 'KCC_FACILITY_NOT_FOUND', 404);
  return facility;
};

const assertLegal = (facility, toStatus, actorRole) => {
  const allowed = TRANSITIONS[facility.status] || {};
  const authority = allowed[toStatus];
  if (!authority) throw err(`Illegal transition ${facility.status} → ${toStatus}`, 'KCC_ILLEGAL_TRANSITION');
  // SYSTEM transitions are job-authored; anyone with the right authority OR the
  // system scheduler may drive them. A caller supplying no role is treated as SYSTEM.
  if (actorRole && authority !== 'SYSTEM' && actorRole !== authority) {
    throw err(`${actorRole} may not author ${facility.status} → ${toStatus} (needs ${authority})`, 'KCC_TRANSITION_FORBIDDEN', 403);
  }
  return authority;
};

/** One-year annual-review anchor (¶28) as a DATEONLY string. */
const oneYearOn = (from = new Date()) => {
  const d = new Date(from);
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
};

/**
 * Generic guarded transition. Extra per-transition side effects (sanction stamp,
 * renewal recompute) are applied in the same transaction before the event.
 */
const transition = async (facilityUuid, toStatus, { actorRole = null, reason = null, patch = {} } = {}) => {
  const database = getDb();
  return database.sequelize.transaction(async (t) => {
    const facility = await findFacility(facilityUuid, t);
    assertLegal(facility, toStatus, actorRole);

    const update = { status: toStatus, ...patch };
    if (toStatus === 'SANCTIONED') {
      update.sanctioned_at = new Date();
      update.next_review_at = oneYearOn();
    }
    if (toStatus === 'CLOSED') update.is_active = false;
    if (toStatus === 'REJECTED') update.is_active = true; // resubmittable

    await facility.update(update, { transaction: t });

    await emitDomainEvent({
      eventType: `kcc.facility.${toStatus.toLowerCase()}`,
      aggregateType: 'KccFacility', aggregateId: facility.facility_uuid,
      farmerId: facility.farmer_id,
      payload: { from: facility.previous('status'), to: toStatus, actorRole, reason },
    }, { transaction: t });

    return facility;
  });
};

// ── Farmer-authored ────────────────────────────────────────────────
const submit = (facilityUuid) => transition(facilityUuid, 'SUBMITTED', { actorRole: 'FARMER' });
const resubmitDraft = (facilityUuid) => transition(facilityUuid, 'DRAFT', { actorRole: 'FARMER' });

// ── Society/Milk-Union certification (ERP-authored; the real workflow gate) ─
/**
 * SUBMITTED → SOCIETY_CERTIFIED. The DCS Secretary / Milk Union certifies (in the
 * Aanchal ERP) membership, cattle count, milk supply and DBT-to-account. A tie-up
 * arrangement (no intermediaries) unlocks the ₹3-lakh collateral-free limit (¶23)
 * — the facility's collateral-free flag is recomputed against that limit.
 */
const certify = async (facilityUuid, {
  membershipRef = null, milkUnionRef = null, cattleCount = null, milkSupply = true,
  dbt = true, bankAccountRef = null, tieup = true, certifiedBy = null, sourceMode = 'mock',
} = {}) => {
  const database = getDb();
  const { KccFacility, KccSocietyCertification, SchemeConfig } = database;
  return database.sequelize.transaction(async (t) => {
    const facility = await KccFacility.findOne({ where: { facility_uuid: facilityUuid }, transaction: t });
    if (!facility) throw err('Facility not found', 'KCC_FACILITY_NOT_FOUND', 404);
    assertLegal(facility, 'SOCIETY_CERTIFIED', 'SOCIETY');

    await KccSocietyCertification.create({
      certification_uuid: require('crypto').randomUUID(), facility_id: facility.id,
      membership_ref: membershipRef, milk_union_ref: milkUnionRef, member_certified: true,
      cattle_count_certified: cattleCount, milk_supply_certified: !!milkSupply,
      dbt_to_account_certified: !!dbt, bank_account_ref: bankAccountRef,
      tieup_agreement: !!tieup, certified_by: certifiedBy, certified_at: new Date(), source_mode: sourceMode,
    }, { transaction: t });

    // Tie-up (no intermediaries) → ₹3-lakh collateral-free limit; recompute the flag.
    const scheme = await SchemeConfig.findOne({ where: { code: facility.scheme_version }, transaction: t });
    const limit = tieup ? Number(scheme.collateral_free_tieup_limit) : Number(scheme.collateral_free_limit);
    await facility.update({
      status: 'SOCIETY_CERTIFIED',
      tieup_certified: !!tieup,
      collateral_free_limit_applied: limit,
      collateral_free: Number(facility.cmpl) <= limit,
    }, { transaction: t });

    await emitDomainEvent({
      eventType: 'kcc.facility.society_certified', aggregateType: 'KccFacility', aggregateId: facility.facility_uuid,
      farmerId: facility.farmer_id, payload: { membershipRef, tieup, collateralFreeLimit: limit, collateralFree: Number(facility.cmpl) <= limit },
    }, { transaction: t });
    return facility;
  });
};

// ── Bank-authored hops (v1: back-office against the generated pack) ─
const beginReview = (facilityUuid) => transition(facilityUuid, 'UNDER_REVIEW', { actorRole: 'BANK' });
const forwardToBank = (facilityUuid) => transition(facilityUuid, 'FORWARDED_TO_BANK', { actorRole: 'BANK' });
const activate = (facilityUuid) => transition(facilityUuid, 'ACTIVE', { actorRole: 'BANK' });
const close = (facilityUuid, reason = null) => transition(facilityUuid, 'CLOSED', { actorRole: 'BANK', reason });
const reject = (facilityUuid, reason = null) => transition(facilityUuid, 'REJECTED', { actorRole: 'BANK', reason });
const sanction = (facilityUuid) => transition(facilityUuid, 'SANCTIONED', { actorRole: 'BANK' });
const disburse = (facilityUuid) => transition(facilityUuid, 'DISBURSED', { actorRole: 'BANK' });

// ── Renewal (annual review, opt-in) ────────────────────────────────
/** SYSTEM: a due facility flips to RENEWAL_DUE (renewalSweepJob). */
const markRenewalDue = (facilityUuid) => transition(facilityUuid, 'RENEWAL_DUE', { actorRole: 'SYSTEM' });

/**
 * FARMER opt-in renewal: RENEWAL_DUE → RENEWED → ACTIVE in one transaction,
 * re-stamping the next annual review. Recompute of the limit schedule (the
 * renewal pack) is a separate concern handled by the renewal-pack generator.
 */
const renew = async (facilityUuid) => {
  const database = getDb();
  return database.sequelize.transaction(async (t) => {
    const facility = await findFacility(facilityUuid, t);
    assertLegal(facility, 'RENEWED', 'FARMER');
    await facility.update({ status: 'RENEWED' }, { transaction: t });
    await emitDomainEvent({
      eventType: 'kcc.facility.renewed', aggregateType: 'KccFacility', aggregateId: facility.facility_uuid,
      farmerId: facility.farmer_id, payload: { renewedAt: new Date().toISOString() },
    }, { transaction: t });
    // Auto-advance the transient RENEWED back to ACTIVE, re-anchoring the review.
    await facility.update({ status: 'ACTIVE', next_review_at: oneYearOn() }, { transaction: t });
    await emitDomainEvent({
      eventType: 'kcc.facility.active', aggregateType: 'KccFacility', aggregateId: facility.facility_uuid,
      farmerId: facility.farmer_id, payload: { from: 'RENEWED', to: 'ACTIVE', actorRole: 'SYSTEM' },
    }, { transaction: t });
    return facility;
  });
};

module.exports = {
  TRANSITIONS, transition,
  submit, resubmitDraft, certify, beginReview, forwardToBank, activate, close, reject,
  sanction, disburse, markRenewalDue, renew,
};
