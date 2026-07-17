/**
 * KCC reference-data seed (idempotent). Scheme configs, the full allied activity
 * catalog (incl. FISHERY from day 1), and SoF registry rows — seeded with the
 * exact RBI Annex-I schedules so a DB-backed computation reproduces the
 * illustrations. Reused by the seed script and tests.
 */
const crypto = require('crypto');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const SCHEMES = [
  { code: 'KCC_DIR_2026', applicable_from: '2027-01-01' },
  { code: 'KCC_MC_2018', applicable_from: '2018-10-13' },
];

// code, name, category, unit_type, insurance_scheme, register_source, kcc_ready, erp_module_phase
const CATALOG = [
  ['DAIRY', 'Dairy (cattle/buffalo)', 'ANIMAL_HUSBANDRY', 'ANIMAL', 'NLM', 'DairyAnimal', true, 2],
  ['GOATERY', 'Goatery', 'ANIMAL_HUSBANDRY', 'ANIMAL', 'NLM', 'DairyAnimal', true, 2],
  ['SHEEP', 'Sheep rearing', 'ANIMAL_HUSBANDRY', 'ANIMAL', 'NLM', 'DairyAnimal', true, 2],
  ['PIGGERY', 'Piggery', 'ANIMAL_HUSBANDRY', 'ANIMAL', 'NLM', 'DairyAnimal', true, 2],
  ['RABBIT', 'Rabbit rearing', 'ANIMAL_HUSBANDRY', 'ANIMAL', 'NLM', null, true, 4],
  ['CAMEL', 'Camel', 'ANIMAL_HUSBANDRY', 'ANIMAL', 'NLM', null, true, 4],
  ['YAK', 'Yak', 'ANIMAL_HUSBANDRY', 'ANIMAL', 'NLM', null, true, 4],
  ['MITHUN', 'Mithun', 'ANIMAL_HUSBANDRY', 'ANIMAL', 'NLM', null, true, 4],
  ['POULTRY', 'Poultry', 'ANIMAL_HUSBANDRY', 'BIRD', 'PRIVATE_STATE', null, true, 2],
  ['FISHERY', 'Fish/shrimp culture', 'FISHERIES_AQUACULTURE', 'ACRE', 'PMMSY', 'FisheryPond', true, 4],
  ['SERICULTURE', 'Sericulture', 'OTHER_ALLIED', 'ACRE', 'PRIVATE_STATE', null, true, 4],
  ['BEEKEEPING', 'Beekeeping', 'OTHER_ALLIED', 'HIVE', 'PRIVATE_STATE', null, true, 4],
  ['LAC', 'Lac culture', 'OTHER_ALLIED', 'TREE', 'PRIVATE_STATE', null, true, 4],
];

// activity, state, unit_type, sof_by_year, insurance_by_year — RBI Annex-I schedules.
const SOF = [
  ['DAIRY', 'UK', 'ANIMAL', [7000, 7500, 8000, 8600, 9500, 10200], [400, 450, 500, 550, 600, 650]],
  ['FISHERY', 'UK', 'ACRE', [200000, 208000, 220000, 235000, 250000, 260000], [4500, 4800, 5200, 5600, 6100, 6600]],
  ['GOATERY', 'UK', 'ANIMAL', [1000, 1100, 1200, 1300, 1400, 1500], [60, 66, 72, 78, 84, 90]],
];

const seedKccReference = async () => {
  const { SchemeConfig, ActivityCatalog, SofRegistry } = getDb();

  for (const s of SCHEMES) {
    await SchemeConfig.findOrCreate({ where: { code: s.code }, defaults: { code: s.code, applicable_from: s.applicable_from } });
  }
  for (const [code, name, category, unit_type, insurance_scheme, register_source, kcc_ready, erp_module_phase] of CATALOG) {
    await ActivityCatalog.findOrCreate({
      where: { code },
      defaults: { code, name, category, unit_type, insurance_scheme, register_source, kcc_ready, erp_module_phase },
    });
  }
  for (const [activity_code, state_code, unit_type, sof_by_year, insurance_by_year] of SOF) {
    await SofRegistry.findOrCreate({
      where: { activity_code, state_code, scheme_version: 'KCC_DIR_2026' },
      defaults: {
        sof_uuid: crypto.randomUUID(), activity_code, state_code, scheme_version: 'KCC_DIR_2026',
        unit_type, sof_by_year, insurance_by_year, notified_by: 'SLTC', effective_from: '2026-04-01',
      },
    });
  }
  return { schemes: SCHEMES.length, activities: CATALOG.length, sof: SOF.length };
};

module.exports = { seedKccReference };
