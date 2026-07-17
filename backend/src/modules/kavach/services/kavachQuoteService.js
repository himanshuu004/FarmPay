/**
 * KAVACH quote service — the DB-backed wrapper around the pure premium engine.
 * Resolves scheme parameters from the seeded plan (config #5), and the
 * household's already-insured cattle-units from active policies, then delegates
 * ALL arithmetic to premiumQuoteEngine (scheme math is never re-implemented #20).
 */
const { computeNlmPremium, NLM_DEFAULTS } = require('./premiumQuoteEngine');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const err = (msg, code, status = 400) => { const e = new Error(msg); e.statusCode = status; e.errorCode = code; return e; };

/** Cattle-units already insured by this farmer's active policies (for the cap). */
const existingCuForFarmer = async (farmerId) => {
  const { InsurancePolicy, PolicyAsset } = getDb();
  if (!farmerId || !InsurancePolicy || !PolicyAsset) return 0;
  const policies = await InsurancePolicy.findAll({ where: { farmer_id: farmerId, status: 'active' }, attributes: ['id'] });
  if (policies.length === 0) return 0;
  const assets = await PolicyAsset.findAll({ where: { policy_id: policies.map((p) => p.id), is_active: true } });
  const cuPer = NLM_DEFAULTS.cuPerAnimal;
  return assets.reduce((sum, a) => sum + (cuPer[String(a.species || '').toUpperCase()] != null ? cuPer[String(a.species).toUpperCase()] : 1), 0);
};

/** Build the engine scheme override from a plan row. */
const schemeFromPlan = (plan) => {
  const r = plan.rules_json || {};
  return {
    farmerSharePct: Number(plan.farmer_share_pct),
    ceilings: { ...NLM_DEFAULTS.ceilings, ...(r.ceilings || {}) },
    govtSplit: { ...NLM_DEFAULTS.govtSplit, ...(r.govtSplit || {}) },
    siFloorPerLitre: r.siFloorPerLitre || NLM_DEFAULTS.siFloorPerLitre,
    cuCapDefault: plan.cattle_unit_cap || NLM_DEFAULTS.cuCapDefault,
    waitingPeriodDays: plan.waiting_period_days || NLM_DEFAULTS.waitingPeriodDays,
  };
};

/**
 * @param {object} args { farmerId?, planCode, marketValue?, milkLitresPerDay?, animals?, existingCuUsed? }
 */
const quote = async ({ farmerId = null, planCode, marketValue, milkLitresPerDay, animals = 1, existingCuUsed } = {}) => {
  const { InsurancePlan } = getDb();
  const plan = await InsurancePlan.findOne({ where: { plan_code: planCode, is_active: true } });
  if (!plan) throw err(`Unknown plan ${planCode}`, 'KAVACH_PLAN_UNKNOWN', 404);

  const existingCu = existingCuUsed != null ? existingCuUsed : await existingCuForFarmer(farmerId);

  const result = computeNlmPremium({
    species: plan.species,
    marketValue, milkLitresPerDay, animals,
    termMonths: plan.term_months,
    region: plan.region,
    existingCuUsed: existingCu,
    scheme: schemeFromPlan(plan),
  });

  return { planCode: plan.plan_code, planName: plan.name, scheme: plan.scheme, ...result };
};

module.exports = { quote, existingCuForFarmer };
