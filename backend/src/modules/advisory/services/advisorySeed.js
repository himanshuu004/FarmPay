/**
 * advisorySeed — the dairy v1 rule packs (CONFIG). FMD/HS/BQ vaccination,
 * mastitis, heat stress (THI), breeding windows, dry-off. Idempotent (by code).
 * Intervals/thresholds live here as data, never in the engine (CLAUDE.md #5).
 * Wording is advisory only — never a CV/vet diagnosis.
 */
const crypto = require('crypto');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const PACKS = [
  { code: 'VAX_FMD', title: 'FMD vaccination due', species: 'ALL', category: 'VACCINATION', default_severity: 'ADVISE',
    rules_json: { diseaseKeywords: ['fmd', 'foot', 'mouth'], intervalDays: 180 },
    body_template: 'FMD vaccination for {animal} is due (recommended every 6 months). Book your VCI vet.' },
  { code: 'VAX_HS', title: 'HS vaccination due', species: 'ALL', category: 'VACCINATION', default_severity: 'ADVISE',
    rules_json: { diseaseKeywords: ['hs', 'haemorrhagic', 'septic'], intervalDays: 365, preMonsoon: true },
    body_template: 'Haemorrhagic Septicaemia (HS) vaccination for {animal} is due (annual, before monsoon).' },
  { code: 'VAX_BQ', title: 'BQ vaccination due', species: 'CATTLE', category: 'VACCINATION', default_severity: 'ADVISE',
    rules_json: { diseaseKeywords: ['bq', 'black', 'quarter'], intervalDays: 365, preMonsoon: true },
    body_template: 'Black Quarter (BQ) vaccination for {animal} is due (annual, before monsoon).' },
  { code: 'MASTITIS_WATCH', title: 'Mastitis — check the udder', species: 'ALL', category: 'MASTITIS', default_severity: 'ADVISE',
    rules_json: { recentTreatmentDays: 30, yieldDropPct: 0.30, lookbackDays: 7 },
    body_template: 'A sharp milk drop or recent treatment suggests udder trouble in {animal}. Do the strip-cup test and keep milking hygiene strict; call your vet if clots persist.' },
  { code: 'HEAT_STRESS', title: 'Heat stress risk today', species: 'ALL', category: 'HEAT_STRESS', default_severity: 'ADVISE',
    rules_json: { thiMild: 72, thiSevere: 80 },
    body_template: 'Heat-load index (THI {thi}) is high. Give shade, clean water, and cool the shed at midday; milk yield can fall in this weather.' },
  { code: 'BREEDING_WINDOW', title: 'Breeding window', species: 'ALL', category: 'BREEDING', default_severity: 'ADVISE',
    rules_json: { cycleDays: 21, postCalvingRestDays: 60 },
    body_template: 'Breeding action for {animal}: {window}. Watch for heat signs and plan AI.' },
  { code: 'DRY_OFF', title: 'Dry-off due', species: 'ALL', category: 'DRY_OFF', default_severity: 'ADVISE',
    rules_json: { dryOffLeadDays: 60 },
    body_template: 'Dry off {animal} now — about 2 months before the expected calving on {calving} — so the udder rests before the next lactation.' },
];

const seedAdvisoryReference = async () => {
  const { AdvisoryRulePack } = getDb();
  for (const p of PACKS) {
    await AdvisoryRulePack.findOrCreate({ where: { code: p.code }, defaults: { pack_uuid: crypto.randomUUID(), ...p } });
  }
};

module.exports = { seedAdvisoryReference, PACKS };
