/**
 * Mock Aanchal ERP client — deterministic milk + input data.
 */
const { FARMERS, SOCIETIES, PROFILES } = require('../_seed/seedData');

const MONTHS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'];

const getMilkSummary = async (farmerRef, months = 6) => {
  const p = PROFILES[farmerRef];
  if (!p) { const e = new Error('Farmer not found in ERP'); e.statusCode = 404; throw e; }
  const m = p.milk;
  const window = MONTHS.slice(-months);
  const monthly = window.map((month, i) => {
    // trend < 1 => supply declines toward the present (oldest=full, newest=trend)
    const factor = 1 - (1 - m.trend) * (i / Math.max(window.length - 1, 1));
    const litres = Math.round(m.litres * factor);
    return {
      month,
      litres,
      value: Math.round(litres * m.rate),
      avgFatPct: 4.1,
    };
  });
  const totalValue = monthly.reduce((s, x) => s + x.value, 0);
  const totalLitres = monthly.reduce((s, x) => s + x.litres, 0);
  return {
    farmerRef,
    months: window.length,
    totalLitres,
    totalValue,
    avgMonthlyValue: Math.round(totalValue / window.length),
    lastMonthValue: monthly[monthly.length - 1].value,
    supplyConsistency: m.consistency,
    monthly,
  };
};

const getOutstandingInputBalance = async (farmerRef) => {
  const p = PROFILES[farmerRef];
  return p ? p.milk.outstanding : 0;
};

const getFarmerMaster = async (farmerRef) => {
  const f = FARMERS[farmerRef];
  if (!f) return null;
  const society = SOCIETIES.find((s) => s.societyRef === f.societyRef) || null;
  return { ...f, society };
};

const getSocietyMembers = async (societyRef) =>
  Object.values(FARMERS).filter((f) => f.societyRef === societyRef);

const findByMobile = async (mobile) =>
  Object.values(FARMERS).find((f) => f.mobile === mobile) || null;

module.exports = {
  getMilkSummary, getOutstandingInputBalance, getFarmerMaster,
  getSocietyMembers, findByMobile,
};
