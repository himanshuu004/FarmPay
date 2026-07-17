/**
 * Co-op order eligibility — the 70% engine (blueprint §7; CLAUDE.md coop rules).
 *
 *   available_limit = max(0, 0.70 × outstanding_milk_payables − in-flight orders)
 *
 * CORRECTED from the discarded dairy_cooperative logic: the base is OUTSTANDING
 * PAYABLES owed to the member (not avgMilkValue × factor), and in-flight orders
 * (submitted but not yet adjusted against milk payables) are deducted so a
 * member can't stack orders past the limit. This is NOT auto-approval — it only
 * decides whether the app will let the member SUBMIT; the ERP approves.
 *
 * Co-op credit is never counted inside the KCC limit (CLAUDE.md #15).
 */
const { round2 } = require('../../../shared/utils/moneyHelper');
const { getPolicy } = require('./coopPolicyService');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

// Orders that are committed but not yet adjusted against milk payables.
const IN_FLIGHT_STATUSES = [
  'SUBMITTED', 'SECRETARY_APPROVED', 'SUPERVISOR_APPROVED', 'DUSS_PROCESSING', 'DISPATCHED',
];

/** Latest outstanding payables + a consistency proxy, from the passbook mirror. */
const readMirror = async (farmerRef) => {
  const { CoopMilkSnapshot } = getDb();
  const snaps = await CoopMilkSnapshot.findAll({
    where: { farmer_ref: farmerRef },
    order: [['period', 'DESC']],
    limit: 6,
  });
  if (snaps.length === 0) return { outstanding: 0, consistency: 0, asOf: null, months: 0 };
  const monthsSupplied = snaps.filter((s) => Number(s.litres) > 0).length;
  return {
    outstanding: Number(snaps[0].outstanding) || 0,
    consistency: round2(monthsSupplied / snaps.length),
    asOf: snaps[0].as_of_date,
    months: snaps.length,
  };
};

const sumInFlight = async (farmerRef) => {
  const { CoopInputOrder } = getDb();
  const total = await CoopInputOrder.sum('total_amount', {
    where: { farmer_ref: farmerRef, status: IN_FLIGHT_STATUSES },
  });
  return round2(total || 0);
};

/** Compute the member's current order-eligibility snapshot. */
const computeEligibility = async (farmerRef, societyRef = 'DEFAULT') => {
  const policy = await getPolicy(societyRef);
  const mirror = await readMirror(farmerRef);
  const inFlight = await sumInFlight(farmerRef);

  const grossLimit = round2(policy.order_limit_factor * mirror.outstanding);
  const availableLimit = Math.max(0, round2(grossLimit - inFlight));

  const reasons = [];
  let eligible = true;
  if (mirror.outstanding <= 0) {
    eligible = false;
    reasons.push('No outstanding milk payables to lend against');
  }
  if (mirror.months > 0 && mirror.consistency < policy.min_consistency) {
    eligible = false;
    reasons.push('Milk supply too irregular for credit-linked inputs');
  }

  return {
    farmerRef,
    outstandingPayables: round2(mirror.outstanding),
    orderLimitFactor: policy.order_limit_factor,
    grossLimit,
    inFlightOrders: inFlight,
    availableLimit,
    supplyConsistency: mirror.consistency,
    monthsOfHistory: mirror.months,
    asOf: mirror.asOf,           // honest freshness (filedrop = T-1)
    eligible,
    reasons,
  };
};

/**
 * Can this member SUBMIT an order of `orderTotal`? Pure decision-support for the
 * app's submit gate — the ERP still approves.
 */
const canSubmit = async (farmerRef, orderTotal, societyRef = 'DEFAULT') => {
  const snapshot = await computeEligibility(farmerRef, societyRef);
  if (!snapshot.eligible) {
    return { ok: false, reason: snapshot.reasons.join('; ') || 'Not eligible', snapshot };
  }
  if (orderTotal > snapshot.availableLimit) {
    return {
      ok: false,
      reason: `Order ₹${orderTotal} exceeds available limit ₹${snapshot.availableLimit}`,
      snapshot,
    };
  }
  return { ok: true, reason: 'Within available limit', snapshot };
};

module.exports = { computeEligibility, canSubmit, IN_FLIGHT_STATUSES };
