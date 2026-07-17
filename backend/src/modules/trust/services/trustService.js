/**
 * TRUST — credit scoring (CLAUDE.md module map). The full engine is 5 pillars +
 * an insurance pillar + the co-op formality-evidence pillar, on a 1000-pt scale
 * with 4 bands and SHAP-style reason codes.
 *
 * Phase 2 implements the ONE pillar with live data via the wedge: CO-OP
 * FORMALITY EVIDENCE. A linked dairy-society member with a consistent milk
 * supply and outstanding payables is a formalised, bankable producer — this is
 * exactly the ¶16(4) receivables evidence that makes a KCC application
 * sanction-ready. The other pillars (production, financial discipline, asset
 * base, insurance) are declared here but land in later phases; the score is
 * normalised over the IMPLEMENTED pillar weights so it never over-claims.
 *
 * This is decision SUPPORT with reason codes, never an automated sanction
 * (CLAUDE.md #21). Statutory limit math stays in the engine (#20).
 */
const { round2 } = require('../../../shared/utils/moneyHelper');
const coopEligibility = require('../../coop/services/eligibilityService');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

// 4 bands over the 1000-pt scale.
const BANDS = [
  { code: 'STRONG', min: 800 },
  { code: 'ESTABLISHED', min: 600 },
  { code: 'EMERGING', min: 350 },
  { code: 'THIN', min: 0 },
];
const bandFor = (score) => BANDS.find((b) => score >= b.min).code;

// Pillar registry — weight is the pillar's share of the 1000-pt scale.
const PILLARS = [
  { key: 'COOP_FORMALITY', label: 'Co-op formality & receivables', weight: 1000, implemented: true },
  { key: 'PRODUCTION', label: 'Production history', weight: 0, implemented: false },
  { key: 'FINANCIAL_DISCIPLINE', label: 'Financial discipline', weight: 0, implemented: false },
  { key: 'ASSET_BASE', label: 'Asset base', weight: 0, implemented: false },
  { key: 'INSURANCE', label: 'Insurance coverage', weight: 0, implemented: false }, // Phase 3
];

/**
 * Co-op formality pillar → sub-score out of 1000 with SHAP-style reason codes.
 * Signals come straight from the wedge (membership link + milk mirror).
 */
const scoreCoopFormality = async (farmerId) => {
  const { CoopMembership } = getDb();
  const reasons = [];
  const membership = CoopMembership ? await CoopMembership.findOne({ where: { user_id: farmerId } }) : null;

  if (!membership || membership.link_status !== 'LINKED') {
    reasons.push({ code: 'COOP_NOT_LINKED', label: 'No linked dairy-society membership', points: 0, direction: 'neutral' });
    return { score: 0, reasons, linked: false, evidence: null };
  }

  const elig = await coopEligibility.computeEligibility(membership.farmer_ref, membership.society_ref || 'DEFAULT');

  let score = 0;
  // Membership formalisation.
  score += 200;
  reasons.push({ code: 'COOP_LINKED', label: 'Linked dairy-society member', points: 200, direction: 'positive' });

  // Supply history depth (up to 6 months → +300).
  const months = elig.monthsOfHistory || 0;
  const monthsPts = Math.min(months, 6) * 50;
  score += monthsPts;
  reasons.push({ code: 'COOP_HISTORY', label: `${months} month(s) of milk-supply history`, points: monthsPts, direction: monthsPts > 0 ? 'positive' : 'neutral' });

  // Supply consistency (0..1 → +300).
  const consistencyPts = Math.round((elig.supplyConsistency || 0) * 300);
  score += consistencyPts;
  reasons.push({ code: 'COOP_CONSISTENCY', label: `Supply consistency ${elig.supplyConsistency}`, points: consistencyPts, direction: consistencyPts >= 150 ? 'positive' : 'neutral' });

  // Live receivables evidence (¶16(4)) — outstanding payables present → +200.
  if (elig.outstandingPayables > 0) {
    score += 200;
    reasons.push({ code: 'COOP_RECEIVABLES', label: `Outstanding milk payables ₹${elig.outstandingPayables} (¶16(4) receivables evidence)`, points: 200, direction: 'positive' });
  } else {
    reasons.push({ code: 'COOP_NO_RECEIVABLES', label: 'No outstanding milk payables to evidence receivables', points: 0, direction: 'neutral' });
  }

  return {
    score: Math.min(score, 1000),
    reasons,
    linked: true,
    evidence: {
      farmerRef: membership.farmer_ref, society: membership.society_ref,
      outstandingPayables: elig.outstandingPayables, supplyConsistency: elig.supplyConsistency,
      monthsOfHistory: months,
    },
  };
};

/**
 * Compute the farmer's trust score (Phase 2: co-op formality pillar only).
 * @returns { score, band, pillars, reasonCodes, evidence }
 */
const computeScore = async (farmerId) => {
  const coop = await scoreCoopFormality(farmerId);

  const pillars = PILLARS.map((p) => {
    if (p.key === 'COOP_FORMALITY') return { ...p, score: coop.score, max: p.weight };
    return { ...p, score: null, max: p.weight, note: 'Pending — lands in a later phase' };
  });

  // Normalise over implemented weights (Phase 2: exactly the co-op pillar = 1000).
  const implementedWeight = PILLARS.filter((p) => p.implemented).reduce((s, p) => s + p.weight, 0);
  const score = implementedWeight > 0 ? Math.round((coop.score / implementedWeight) * 1000) : 0;

  return {
    score,
    band: bandFor(score),
    scale: 1000,
    pillars,
    reasonCodes: coop.reasons,
    evidence: coop.evidence,
    pillarsPending: PILLARS.filter((p) => !p.implemented).map((p) => p.key),
  };
};

module.exports = { computeScore, scoreCoopFormality, bandFor, BANDS, PILLARS };
