/**
 * advisoryEngine — the deterministic dairy advisory generator. Reads the
 * livestock registers (animals, treatments, breeding, milk logs) and the CONFIG
 * rule packs, and emits advisories. Rules only — no model, no "diagnosis"
 * (CLAUDE.md #20, OUT-OF-SCOPE CV diagnosis). The farmer disposes; nothing acts.
 *
 * Categories: VACCINATION (FMD/HS/BQ), MASTITIS, HEAT_STRESS (THI), BREEDING, DRY_OFF.
 * Idempotent: advisories are keyed (farmer, animal_ref, pack_code, due_on) so a
 * nightly re-run updates OPEN items and never duplicates; farmer-disposed
 * (DONE/DISMISSED) items are left untouched.
 */
const crypto = require('crypto');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const HERD = 'HERD'; // sentinel animal_ref for herd-wide advisories (keeps the unique index working)

const dateOnly = (d) => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };
const daysBetween = (a, b) => Math.floor((new Date(a) - new Date(b)) / 86400000);
const matchesAny = (text, keywords) => {
  const t = String(text || '').toLowerCase();
  return (keywords || []).some((k) => t.includes(String(k).toLowerCase()));
};
const fill = (tpl, vars) => String(tpl).replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));

/** THI = (1.8T+32) − (0.55 − 0.0055·RH)·(1.8T − 26). Standard livestock heat-load index. */
const computeTHI = (tempC, rhPct) => {
  const T = Number(tempC), RH = Number(rhPct);
  return Math.round(((1.8 * T + 32) - (0.55 - 0.0055 * RH) * (1.8 * T - 26)) * 10) / 10;
};

const speciesMatch = (packSpecies, animalSpecies) =>
  packSpecies === 'ALL' || !animalSpecies || packSpecies === animalSpecies;

// ── Rule evaluators (each returns candidate advisories) ───────────────────────

const evalVaccination = (pack, { animals, treatments, asOf }) => {
  const r = pack.rules_json || {};
  const interval = Number(r.intervalDays || 180);
  const out = [];
  for (const a of animals) {
    if (!speciesMatch(pack.species, a.species)) continue;
    const vax = treatments
      .filter((t) => t.animal_id === a.animal_uuid && t.treatment_type === 'VACCINATION'
        && (!(r.diseaseKeywords && r.diseaseKeywords.length) || matchesAny(`${t.condition} ${t.notes}`, r.diseaseKeywords)))
      .sort((x, y) => new Date(y.treatment_date) - new Date(x.treatment_date));
    const last = vax[0];
    const dueOn = last ? addDays(last.treatment_date, interval) : asOf;
    if (daysBetween(asOf, dueOn) >= 0) {
      out.push({
        animalRef: a.animal_uuid, animalLabel: a.tag_number || a.name || a.animal_identification_number,
        packCode: pack.code, category: pack.category, severity: pack.default_severity,
        title: pack.title, body: fill(pack.body_template, { animal: a.tag_number || a.name || 'this animal' }),
        dueOn: dateOnly(dueOn),
        evidence: { lastVaccinatedOn: last ? last.treatment_date : null, intervalDays: interval },
      });
    }
  }
  return out;
};

const evalMastitis = (pack, { animals, treatments, milkByAnimalId, asOf }) => {
  const r = pack.rules_json || {};
  const followUpDays = Number(r.recentTreatmentDays || 30);
  const dropPct = Number(r.yieldDropPct || 0.30);
  const lookback = Number(r.lookbackDays || 7);
  const out = [];
  for (const a of animals) {
    if (!speciesMatch(pack.species, a.species)) continue;
    const label = a.tag_number || a.name || 'this animal';
    // (a) recent mastitis treatment → follow-up
    const recent = treatments
      .filter((t) => t.animal_id === a.animal_uuid && t.treatment_type === 'MASTITIS')
      .sort((x, y) => new Date(y.treatment_date) - new Date(x.treatment_date))[0];
    if (recent && daysBetween(asOf, recent.treatment_date) <= followUpDays) {
      out.push({
        animalRef: a.animal_uuid, animalLabel: label, packCode: pack.code, category: 'MASTITIS',
        severity: 'URGENT', title: pack.title,
        body: fill(pack.body_template, { animal: label }),
        dueOn: dateOnly(recent.treatment_date),
        evidence: { trigger: 'recent_treatment', treatedOn: recent.treatment_date },
      });
      continue;
    }
    // (b) sharp yield drop → screening advisory
    const logs = (milkByAnimalId[a.id] || [])
      .filter((l) => l.total_daily_milk != null)
      .sort((x, y) => new Date(y.production_date) - new Date(x.production_date));
    if (logs.length >= 3) {
      const latest = logs[0];
      const window = logs.slice(1, 1 + lookback);
      if (window.length >= 2) {
        const avg = window.reduce((s, l) => s + Number(l.total_daily_milk), 0) / window.length;
        if (avg > 0 && Number(latest.total_daily_milk) <= avg * (1 - dropPct)) {
          out.push({
            animalRef: a.animal_uuid, animalLabel: label, packCode: pack.code, category: 'MASTITIS',
            severity: 'ADVISE', title: pack.title,
            body: fill(pack.body_template, { animal: label }),
            dueOn: dateOnly(latest.production_date),
            evidence: { trigger: 'yield_drop', latest: Number(latest.total_daily_milk), baselineAvg: Math.round(avg * 100) / 100, dropPct },
          });
        }
      }
    }
  }
  return out;
};

const evalHeatStress = (pack, { weather, asOf }) => {
  if (!weather || weather.tempC == null || weather.rhPct == null) return [];
  const r = pack.rules_json || {};
  const thi = computeTHI(weather.tempC, weather.rhPct);
  const mild = Number(r.thiMild || 72), severe = Number(r.thiSevere || 80);
  if (thi < mild) return [];
  return [{
    animalRef: HERD, animalLabel: 'Whole herd', packCode: pack.code, category: 'HEAT_STRESS',
    severity: thi >= severe ? 'URGENT' : 'ADVISE', title: pack.title,
    body: fill(pack.body_template, { thi }),
    dueOn: dateOnly(asOf),
    evidence: { thi, tempC: weather.tempC, rhPct: weather.rhPct, thiMild: mild, thiSevere: severe },
  }];
};

const evalBreeding = (pack, { animals, breeding, asOf }) => {
  const r = pack.rules_json || {};
  const cycle = Number(r.cycleDays || 21);
  const rest = Number(r.postCalvingRestDays || 60);
  const out = [];
  for (const a of animals) {
    if (a.gender && a.gender !== 'FEMALE') continue;
    if (!speciesMatch(pack.species, a.species)) continue;
    const label = a.tag_number || a.name || 'this animal';
    const events = breeding
      .filter((b) => b.animal_id === a.animal_uuid)
      .sort((x, y) => new Date(y.ai_date) - new Date(x.ai_date));
    const last = events[0];
    if (!last) continue;
    // Post-calving: resume breeding after the rest period.
    if (last.actual_calving_date) {
      const dueOn = addDays(last.actual_calving_date, rest);
      if (daysBetween(asOf, dueOn) >= 0) {
        out.push({
          animalRef: a.animal_uuid, animalLabel: label, packCode: pack.code, category: 'BREEDING',
          severity: 'ADVISE', title: pack.title,
          body: fill(pack.body_template, { animal: label, window: `${rest} days after calving` }),
          dueOn: dateOnly(dueOn),
          evidence: { trigger: 'post_calving', calvedOn: last.actual_calving_date, restDays: rest },
        });
      }
      continue;
    }
    // Served but not confirmed pregnant (PENDING/NO) → observe for return to heat / re-inseminate.
    if (last.pregnancy_confirmed !== 'YES') {
      const dueOn = addDays(last.ai_date, cycle);
      if (daysBetween(asOf, dueOn) >= 0) {
        out.push({
          animalRef: a.animal_uuid, animalLabel: label, packCode: pack.code, category: 'BREEDING',
          severity: 'ADVISE', title: pack.title,
          body: fill(pack.body_template, { animal: label, window: `around ${dateOnly(dueOn)}` }),
          dueOn: dateOnly(dueOn),
          evidence: { trigger: 'heat_watch', aiOn: last.ai_date, cycleDays: cycle },
        });
      }
    }
  }
  return out;
};

const evalDryOff = (pack, { animals, breeding, asOf }) => {
  const r = pack.rules_json || {};
  const lead = Number(r.dryOffLeadDays || 60);
  const out = [];
  for (const a of animals) {
    if (a.gender && a.gender !== 'FEMALE') continue;
    if (!speciesMatch(pack.species, a.species)) continue;
    const label = a.tag_number || a.name || 'this animal';
    const last = breeding
      .filter((b) => b.animal_id === a.animal_uuid && b.pregnancy_confirmed === 'YES' && b.expected_calving_date && !b.actual_calving_date)
      .sort((x, y) => new Date(y.ai_date) - new Date(x.ai_date))[0];
    if (!last) continue;
    const dueOn = addDays(last.expected_calving_date, -lead);
    // In the dry-off window: from due date up to calving.
    if (daysBetween(asOf, dueOn) >= 0 && daysBetween(last.expected_calving_date, asOf) > 0) {
      out.push({
        animalRef: a.animal_uuid, animalLabel: label, packCode: pack.code, category: 'DRY_OFF',
        severity: 'ADVISE', title: pack.title,
        body: fill(pack.body_template, { animal: label, calving: last.expected_calving_date }),
        dueOn: dateOnly(dueOn),
        evidence: { expectedCalving: last.expected_calving_date, dryOffLeadDays: lead },
      });
    }
  }
  return out;
};

const EVALUATORS = {
  VACCINATION: evalVaccination, MASTITIS: evalMastitis, HEAT_STRESS: evalHeatStress,
  BREEDING: evalBreeding, DRY_OFF: evalDryOff,
};

/** Generate + persist advisories for one farmer. Returns a summary. */
const generateForFarmer = async (farmerId, { asOf = new Date(), weather = null } = {}) => {
  const { AdvisoryRulePack, AdvisoryItem, DairyAnimal, DairyTreatmentEvent, DairyBreedingEvent, DairyMilkProductionLog } = getDb();

  const packs = await AdvisoryRulePack.findAll({ where: { is_active: true } });
  const animals = await DairyAnimal.findAll({ where: { farmer_id: farmerId, is_active: true } });
  if (!animals.length) return { created: 0, updated: 0, candidates: 0, byCategory: {} };

  const [treatments, breeding] = await Promise.all([
    DairyTreatmentEvent.findAll({ where: { farmer_id: farmerId, is_active: true } }),
    DairyBreedingEvent.findAll({ where: { farmer_id: farmerId } }),
  ]);
  const animalIds = animals.map((a) => a.id);
  const logs = DairyMilkProductionLog ? await DairyMilkProductionLog.findAll({ where: { animal_id: animalIds, is_active: true } }) : [];
  const milkByAnimalId = {};
  for (const l of logs) { (milkByAnimalId[l.animal_id] = milkByAnimalId[l.animal_id] || []).push(l); }

  const ctx = { animals, treatments, breeding, milkByAnimalId, weather, asOf };
  const candidates = [];
  for (const pack of packs) {
    const evalFn = EVALUATORS[pack.category];
    if (evalFn) candidates.push(...evalFn(pack, ctx));
  }

  let created = 0, updated = 0;
  const byCategory = {};
  for (const c of candidates) {
    byCategory[c.category] = (byCategory[c.category] || 0) + 1;
    const key = { farmer_id: farmerId, animal_ref: c.animalRef, pack_code: c.packCode, due_on: c.dueOn };
    const existing = await AdvisoryItem.findOne({ where: key });
    if (!existing) {
      await AdvisoryItem.create({
        item_uuid: crypto.randomUUID(), ...key,
        animal_label: c.animalLabel, category: c.category, severity: c.severity,
        title: c.title, body: c.body, evidence_json: c.evidence,
        status: 'OPEN', generated_at: asOf,
      });
      created += 1;
    } else if (existing.status === 'OPEN') {
      await existing.update({ severity: c.severity, title: c.title, body: c.body, animal_label: c.animalLabel, evidence_json: c.evidence, generated_at: asOf });
      updated += 1;
    }
  }
  return { created, updated, candidates: candidates.length, byCategory };
};

module.exports = { generateForFarmer, computeTHI, HERD };
