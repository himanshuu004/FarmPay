/**
 * milkRateService — the milk-rate board + fat/SNF payment calculator.
 * Deterministic, config-driven (the chart is CONFIG, never code). Also pulls the
 * member's last ERP-realised rate from the co-op milk snapshot for a truth check.
 */
let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const err = (message, errorCode, statusCode = 400) => {
  const e = new Error(message); e.statusCode = statusCode; e.errorCode = errorCode; return e;
};

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Price 1 litre from quality using a rate spec.
 *   TWO_AXIS: perFatPoint × fat% + perSnfPoint × snf%, clamped to [minRate,maxRate]
 *   FLAT:     ratePerLitre
 */
const evaluateRate = (spec, { fatPct, snfPct }) => {
  const method = (spec && spec.method) || 'TWO_AXIS';
  if (method === 'FLAT') return r2(spec.ratePerLitre || 0);
  const perFat = Number(spec.perFatPoint || 0);
  const perSnf = Number(spec.perSnfPoint || 0);
  let rate = perFat * Number(fatPct || 0) + perSnf * Number(snfPct || 0);
  if (spec.minRate != null) rate = Math.max(rate, Number(spec.minRate));
  if (spec.maxRate != null) rate = Math.min(rate, Number(spec.maxRate));
  return r2(rate);
};

/** The active chart for a scope, falling back to DEFAULT then to a hard default. */
const getChart = async (scope = 'DEFAULT') => {
  const { MarketMilkRateChart } = getDb();
  let chart = await MarketMilkRateChart.findOne({ where: { scope, is_active: true } });
  if (!chart && scope !== 'DEFAULT') chart = await MarketMilkRateChart.findOne({ where: { scope: 'DEFAULT', is_active: true } });
  return chart;
};

/** Estimate the payment for a supply of `litres` at a given fat/SNF. */
const estimate = async ({ litres, fatPct, snfPct, scope = 'DEFAULT' }) => {
  const chart = await getChart(scope);
  const spec = chart ? { method: chart.method, ...chart.rules_json } : { method: 'TWO_AXIS', perFatPoint: 4.5, perSnfPoint: 1.2, minRate: 18, maxRate: 90 };
  const ratePerLitre = evaluateRate(spec, { fatPct, snfPct });
  const amount = r2(ratePerLitre * Number(litres || 0));
  return {
    scope: chart ? chart.scope : 'DEFAULT',
    method: spec.method || 'TWO_AXIS',
    litres: Number(litres || 0), fatPct: Number(fatPct || 0), snfPct: Number(snfPct || 0),
    ratePerLitre, amount, currency: chart ? chart.currency : 'INR',
    breakdown: spec.method === 'FLAT'
      ? { flat: ratePerLitre }
      : { fatComponent: r2(Number(spec.perFatPoint || 0) * Number(fatPct || 0)), snfComponent: r2(Number(spec.perSnfPoint || 0) * Number(snfPct || 0)) },
  };
};

/** The member's last ERP-realised rate (value ÷ litres) from the milk snapshot. */
const realisedForFarmer = async (farmerId) => {
  const { CoopMembership, CoopMilkSnapshot } = getDb();
  if (!CoopMembership || !CoopMilkSnapshot) return null;
  const membership = await CoopMembership.findOne({ where: { user_id: farmerId, link_status: 'LINKED' } });
  if (!membership) return null;
  const snap = await CoopMilkSnapshot.findOne({
    where: { farmer_ref: membership.farmer_ref }, order: [['period', 'DESC']],
  });
  if (!snap || Number(snap.litres) <= 0) return null;
  return {
    period: snap.period,
    litres: Number(snap.litres), value: Number(snap.value),
    avgFatPct: snap.avg_fat_pct != null ? Number(snap.avg_fat_pct) : null,
    avgSnfPct: snap.avg_snf_pct != null ? Number(snap.avg_snf_pct) : null,
    realisedRatePerLitre: r2(Number(snap.value) / Number(snap.litres)),
    asOf: snap.as_of_date,
  };
};

module.exports = { evaluateRate, getChart, estimate, realisedForFarmer, r2, err };
