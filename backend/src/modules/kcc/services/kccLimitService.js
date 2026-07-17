/**
 * KCC limit service — the DB-backed wrapper around the pure Limit Engine.
 *
 * Resolves inputs from the platform (units LIVE from registers #6, SoF from the
 * registry, scheme params from config) and — for an origination — persists the
 * facility, its activities and the 6-year schedule. The arithmetic itself is
 * ALWAYS delegated to limitEngine (statutory math is never re-implemented).
 */
const crypto = require('crypto');
const { computeKccLimit } = require('./limitEngine');
const { emitDomainEvent } = require('../../../shared/services/domainEvents');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const err = (msg, code, status = 400) => { const e = new Error(msg); e.statusCode = status; e.errorCode = code; return e; };

/** Units LIVE from the relevant register (never a typed count). */
const { Op } = require('sequelize');

const resolveUnitsFromRegister = async (activity, farmerId, animalUuids = null) => {
  const database = getDb();
  if (activity.register_source === 'DairyAnimal' && database.DairyAnimal) {
    // Units are LIVE from the ERP-fed register: only animals still in the herd
    // (status ACTIVE) count. A SOLD/DIED/CULLED animal auto-drops from the limit.
    const where = { farmer_id: farmerId, is_active: true, status: 'ACTIVE' };
    // The farmer may raise a KCC against PARTICULAR animals (a subset), not all.
    if (Array.isArray(animalUuids) && animalUuids.length) where.animal_uuid = { [Op.in]: animalUuids };
    return database.DairyAnimal.count({ where });
  }
  return 0; // register not available (e.g. FISHERY pre-Phase-4) → caller must supply units
};

/**
 * Build the engine input for a set of requested activities.
 * @param {object} args { farmerId?, stateCode, schemeVersion, activities:[{code, units?}] }
 */
const buildEngineInput = async ({ farmerId = null, stateCode = 'UK', schemeVersion = 'KCC_DIR_2026', activities }) => {
  const { ActivityCatalog, SofRegistry, SchemeConfig } = getDb();
  if (!activities || activities.length === 0) throw err('At least one activity required', 'KCC_NO_ACTIVITY');

  const scheme = await SchemeConfig.findOne({ where: { code: schemeVersion, is_active: true } });
  if (!scheme) throw err(`Unknown scheme ${schemeVersion}`, 'KCC_SCHEME_UNKNOWN', 404);

  const built = [];
  const meta = [];
  for (const req of activities) {
    const cat = await ActivityCatalog.findOne({ where: { code: req.code, is_active: true } });
    if (!cat) throw err(`Unknown activity ${req.code}`, 'KCC_ACTIVITY_UNKNOWN', 404);
    if (!cat.kcc_ready) throw err(`${req.code} has no notified SoF — outside KCC (¶16(2))`, 'KCC_NOT_READY');

    const sof = await SofRegistry.findOne({ where: { activity_code: req.code, state_code: stateCode, scheme_version: schemeVersion, is_active: true } });
    if (!sof) throw err(`No SoF notified for ${req.code} in ${stateCode}`, 'KCC_SOF_MISSING', 404);

    // Units: explicit (calculator) OR live from register (optionally a chosen subset of animals).
    let units = req.units;
    if (units == null) units = await resolveUnitsFromRegister(cat, farmerId, req.animalUuids);
    if (!(units > 0)) throw err(`No eligible units for ${req.code}`, 'KCC_NO_UNITS');

    built.push({ code: req.code, units, sofByYear: sof.sof_by_year, insuranceByYear: sof.insurance_by_year || undefined });
    meta.push({ cat, sof, units });
  }

  const schemeOverride = {
    code: scheme.code,
    consumptionPct: Number(scheme.consumption_pct),
    maintenancePct: Number(scheme.maintenance_pct),
    escalationPct: Number(scheme.escalation_pct),
    tenureYears: scheme.tenure_years,
  };
  return { engineInput: { activities: built, scheme: schemeOverride }, scheme, meta };
};

/** Pure calculation (no persistence) — the KCC calculator surface. */
const calculate = async ({ farmerId = null, stateCode = 'UK', schemeVersion = 'KCC_DIR_2026', activities, investmentItems = [] }) => {
  const { engineInput } = await buildEngineInput({ farmerId, stateCode, schemeVersion, activities });
  return computeKccLimit({ ...engineInput, investmentItems });
};

/**
 * Origination: compute AND persist a DRAFT facility with its schedule.
 * Society-mediated dairy KCC requires the beneficiary to be a society member
 * FIRST (the real workflow) — enforced unless requireMembership is disabled
 * (multi-activity / non-society paths).
 */
const originateFacility = async ({ farmerId, stateCode = 'UK', schemeVersion = 'KCC_DIR_2026', activities, investmentItems = [], requireMembership = true, bankAccountRef = null, tieupRequested = false, kyc = null, repaymentConsent = null }) => {
  const database = getDb();
  const { KccFacility, KccFacilityActivity, KccLimitSchedule, SchemeConfig, CoopMembership } = database;

  // Society membership precondition (become a member before processing a dairy KCC).
  if (requireMembership && CoopMembership) {
    const member = await CoopMembership.findOne({ where: { user_id: farmerId, link_status: 'LINKED' } });
    if (!member) throw err('Join your dairy society before applying — the KCC is routed through the society.', 'KCC_SOCIETY_MEMBERSHIP_REQUIRED', 403);
  }

  // The KCC may be raised against a chosen subset of animals (feature: not the whole herd).
  const selectedAnimalUuids = (activities.find((a) => Array.isArray(a.animalUuids) && a.animalUuids.length) || {}).animalUuids || null;
  const { engineInput, meta } = await buildEngineInput({ farmerId, stateCode, schemeVersion, activities });
  const result = computeKccLimit({ ...engineInput, investmentItems });
  const scheme = await SchemeConfig.findOne({ where: { code: schemeVersion } });
  // At DRAFT the tie-up isn't certified yet → base ₹2L limit; the ₹3L tie-up
  // limit is applied at SOCIETY_CERTIFIED (kccOriginationService.certify).
  const baseLimit = Number(scheme.collateral_free_limit);
  const collateralFree = result.cmpl <= baseLimit;

  return database.sequelize.transaction(async (t) => {
    const facility = await KccFacility.create({
      facility_uuid: crypto.randomUUID(), farmer_id: farmerId, scheme_version: schemeVersion,
      state_code: stateCode, status: 'DRAFT',
      mpl_year1: result.mpl[0], mpl_final: result.mplFinal, investment_total: result.investmentTotal,
      cmpl: result.cmpl, st_sublimit: result.mplFinal, lt_sublimit: result.investmentTotal,
      collateral_free: collateralFree, collateral_free_limit_applied: baseLimit, computed_at: new Date(),
      bank_account_ref: bankAccountRef, tieup_requested: !!tieupRequested, kyc_ready: kyc, repayment_consent: repaymentConsent,
      selected_animal_uuids: selectedAnimalUuids,
    }, { transaction: t });

    for (let i = 0; i < meta.length; i++) {
      const m = meta[i];
      await KccFacilityActivity.create({
        facility_id: facility.id, activity_code: m.cat.code, units: m.units, unit_type: m.cat.unit_type,
        sof_registry_id: m.sof.id, sof_by_year_snapshot: m.sof.sof_by_year, insurance_by_year_snapshot: m.sof.insurance_by_year,
      }, { transaction: t });
    }
    for (const y of result.yearly) {
      await KccLimitSchedule.create({
        facility_id: facility.id, year_index: y.year, wc_total: y.wcTotal, mpl: y.mpl,
        drawing_limit: y.drawingLimit, breakdown: { wcActivities: y.wcActivities, consumption: y.consumption, maintenance: y.maintenance, insurance: y.insurance },
      }, { transaction: t });
    }
    await emitDomainEvent({
      eventType: 'kcc.facility.computed', aggregateType: 'KccFacility', aggregateId: facility.facility_uuid,
      farmerId, payload: { cmpl: result.cmpl, mplFinal: result.mplFinal, collateralFree },
    }, { transaction: t });

    return { facility, result };
  });
};

/**
 * Auto-revise a farmer's KCC when the herd changes (e.g. an animal is SOLD).
 * Recomputes from the CURRENT active animals in the facility's set (its chosen
 * subset, or the whole herd). Only APPLICATION-stage facilities are rewritten in
 * place — once the bank has sanctioned/disbursed, the sanctioned limit is the
 * bank's (revised at annual review); we only flag a revision-due event there.
 */
const REVISABLE = ['DRAFT', 'SUBMITTED', 'SOCIETY_CERTIFIED', 'UNDER_REVIEW', 'FORWARDED_TO_BANK'];

const recomputeForFarmer = async (farmerId, { reason = 'HERD_CHANGE' } = {}) => {
  const database = getDb();
  const { KccFacility, KccLimitSchedule, SchemeConfig } = database;
  const facility = await KccFacility.findOne({ where: { farmer_id: farmerId, is_active: true }, order: [['created_at', 'DESC']] });
  if (!facility || facility.status === 'CLOSED' || facility.status === 'REJECTED') return null;

  const animalUuids = Array.isArray(facility.selected_animal_uuids) && facility.selected_animal_uuids.length
    ? facility.selected_animal_uuids : undefined;
  let result = null;
  try {
    result = await calculate({ farmerId, stateCode: facility.state_code, schemeVersion: facility.scheme_version, activities: [{ code: 'DAIRY', animalUuids }] });
  } catch (e) { result = null; } // e.g. every animal sold → no eligible units

  // Post-sanction: never silently rewrite the bank's number — flag it for review.
  if (!REVISABLE.includes(facility.status)) {
    await emitDomainEvent({
      eventType: 'kcc.facility.revision_due', aggregateType: 'KccFacility', aggregateId: facility.facility_uuid,
      farmerId, payload: { reason, sanctionedCmpl: Number(facility.cmpl), revisedCmpl: result ? result.cmpl : null },
    });
    return { facility, revised: false, revisedCmpl: result ? result.cmpl : null };
  }
  if (!result) return { facility, revised: false, revisedCmpl: null }; // nothing eligible left; leave the draft as-is

  const scheme = await SchemeConfig.findOne({ where: { code: facility.scheme_version } });
  const limitCeiling = facility.collateral_free_limit_applied || Number(scheme.collateral_free_limit);
  return database.sequelize.transaction(async (t) => {
    await facility.update({
      mpl_year1: result.mpl[0], mpl_final: result.mplFinal, investment_total: result.investmentTotal,
      cmpl: result.cmpl, st_sublimit: result.mplFinal, lt_sublimit: result.investmentTotal,
      collateral_free: result.cmpl <= limitCeiling, computed_at: new Date(),
    }, { transaction: t });
    await KccLimitSchedule.destroy({ where: { facility_id: facility.id }, transaction: t });
    for (const y of result.yearly) {
      await KccLimitSchedule.create({
        facility_id: facility.id, year_index: y.year, wc_total: y.wcTotal, mpl: y.mpl, drawing_limit: y.drawingLimit,
        breakdown: { wcActivities: y.wcActivities, consumption: y.consumption, maintenance: y.maintenance, insurance: y.insurance },
      }, { transaction: t });
    }
    await emitDomainEvent({
      eventType: 'kcc.facility.recomputed', aggregateType: 'KccFacility', aggregateId: facility.facility_uuid,
      farmerId, payload: { cmpl: result.cmpl, reason },
    }, { transaction: t });
    return { facility, revised: true, cmpl: result.cmpl };
  });
};

module.exports = { calculate, originateFacility, buildEngineInput, resolveUnitsFromRegister, recomputeForFarmer };
