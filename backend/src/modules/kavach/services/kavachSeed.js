/**
 * KAVACH reference seed — NLM livestock plans for Uttarakhand (Himalayan).
 * Plan carries the scheme parameters (config, never code #5); the premium engine
 * reads region ceilings + govt split from rules_json.
 */
const crypto = require('crypto');
const { NLM_DEFAULTS } = require('./premiumQuoteEngine');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

// Uttarakhand = Himalayan: ceilings 5.5/9/11.5, govt split 90:10.
const rulesForRegion = (region) => ({
  ceilings: { [region]: NLM_DEFAULTS.ceilings[region] },
  govtSplit: { [region]: NLM_DEFAULTS.govtSplit[region] },
  siFloorPerLitre: NLM_DEFAULTS.siFloorPerLitre,
});

const PLANS = [
  { plan_code: 'NLM-CATTLE-3YR-UK', name: 'Pashu Suraksha — Cattle (3yr)', species: 'CATTLE', term_months: 36 },
  { plan_code: 'NLM-BUFFALO-3YR-UK', name: 'Pashu Suraksha — Buffalo (3yr)', species: 'BUFFALO', term_months: 36 },
  { plan_code: 'NLM-GOAT-3YR-UK', name: 'Pashu Suraksha — Goat (3yr)', species: 'GOAT', term_months: 36, cattle_unit_cap: 10 },
];

const seedKavachReference = async ({ region = 'HIM' } = {}) => {
  const { InsurancePlan } = getDb();
  for (const p of PLANS) {
    await InsurancePlan.findOrCreate({
      where: { plan_code: p.plan_code },
      defaults: {
        plan_uuid: crypto.randomUUID(),
        scheme: 'NLM', region,
        farmer_share_pct: NLM_DEFAULTS.farmerSharePct, govt_share_pct: 100 - NLM_DEFAULTS.farmerSharePct,
        si_basis: 'market_value', waiting_period_days: NLM_DEFAULTS.waitingPeriodDays,
        cattle_unit_cap: p.cattle_unit_cap || NLM_DEFAULTS.cuCapDefault,
        rules_json: rulesForRegion(region),
        ...p,
      },
    });
  }
};

module.exports = { seedKavachReference, PLANS };
