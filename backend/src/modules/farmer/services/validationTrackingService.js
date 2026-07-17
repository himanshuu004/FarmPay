/**
 * Validation Tracking Service
 * Records and queries 5-level validation for each farmer data target.
 * Computes composite confidence scores for trust score integration.
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('../../../shared/utils/logger');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

// Weights per target for overall confidence calculation
const TARGET_WEIGHTS = {
  aadhaar: 0.25,
  address_permanent: 0.20,
  bank_account: 0.20,
  name: 0.15,
  mobile: 0.10,
  farm_gps: 0.10,
};

// Points per level for per-target confidence
const LEVEL_POINTS = { 1: 5, 2: 15, 3: 20, 4: 25, 5: 35 };

/**
 * Record a validation event for a specific target at a specific level.
 * Upserts the record — creates if not exists, updates the level fields.
 */
const recordValidation = async (farmerId, target, level, data = {}, transaction = null) => {
  const { FarmerValidationRecord } = getDb();

  const [record, created] = await FarmerValidationRecord.findOrCreate({
    where: { farmer_id: farmerId, validation_target: target, is_active: true },
    defaults: {
      validation_uuid: uuidv4(),
      farmer_id: farmerId,
      validation_target: target,
    },
    transaction,
  });

  const updates = {};
  const now = new Date();

  switch (level) {
    case 1:
      updates.level_1_self_declared = true;
      updates.level_1_at = now;
      break;
    case 2:
      updates.level_2_app_validated = true;
      updates.level_2_at = now;
      updates.level_2_method = data.method || null;
      break;
    case 3:
      updates.level_3_geo_tagged = true;
      updates.level_3_at = now;
      updates.level_3_lat = data.lat || null;
      updates.level_3_lng = data.lng || null;
      updates.level_3_accuracy_m = data.accuracy || null;
      break;
    case 4:
      updates.level_4_field_officer = true;
      updates.level_4_at = now;
      updates.level_4_officer_id = data.officerId || null;
      updates.level_4_photo_url = data.photoUrl || null;
      updates.level_4_notes = data.notes || null;
      break;
    case 5:
      updates.level_5_dpi_confirmed = true;
      updates.level_5_at = now;
      updates.level_5_source = data.source || 'none';
      updates.level_5_reference_id = data.referenceId || null;
      break;
  }

  // Compute highest completed level
  const current = { ...record.dataValues, ...updates };
  let highestLevel = 0;
  if (current.level_5_dpi_confirmed) highestLevel = 5;
  else if (current.level_4_field_officer) highestLevel = 4;
  else if (current.level_3_geo_tagged) highestLevel = 3;
  else if (current.level_2_app_validated) highestLevel = 2;
  else if (current.level_1_self_declared) highestLevel = 1;

  updates.composite_validation_level = highestLevel;

  // Compute per-target confidence
  let confidence = 0;
  if (current.level_1_self_declared) confidence += LEVEL_POINTS[1];
  if (current.level_2_app_validated) confidence += LEVEL_POINTS[2];
  if (current.level_3_geo_tagged) confidence += LEVEL_POINTS[3];
  if (current.level_4_field_officer) confidence += LEVEL_POINTS[4];
  if (current.level_5_dpi_confirmed) confidence += LEVEL_POINTS[5];
  updates.composite_confidence = confidence;

  await record.update(updates, { transaction });
  return record;
};

/**
 * Get validation summary for a farmer — all targets with their current levels.
 */
const getValidationSummary = async (farmerId) => {
  const { FarmerValidationRecord } = getDb();

  const records = await FarmerValidationRecord.findAll({
    where: { farmer_id: farmerId, is_active: true },
    order: [['validation_target', 'ASC']],
  });

  const summary = {};
  for (const r of records) {
    summary[r.validation_target] = {
      level: r.composite_validation_level,
      confidence: parseFloat(r.composite_confidence) || 0,
      levels: {
        1: { done: r.level_1_self_declared, at: r.level_1_at },
        2: { done: r.level_2_app_validated, at: r.level_2_at, method: r.level_2_method },
        3: { done: r.level_3_geo_tagged, at: r.level_3_at },
        4: { done: r.level_4_field_officer, at: r.level_4_at },
        5: { done: r.level_5_dpi_confirmed, at: r.level_5_at, source: r.level_5_source },
      },
    };
  }

  return summary;
};

/**
 * Compute overall composite confidence across all targets.
 * Used by trust score integration.
 */
const computeCompositeConfidence = async (farmerId) => {
  const summary = await getValidationSummary(farmerId);

  let weightedSum = 0;
  let totalWeight = 0;

  for (const [target, weight] of Object.entries(TARGET_WEIGHTS)) {
    if (summary[target]) {
      weightedSum += summary[target].confidence * weight;
      totalWeight += weight;
    }
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
};

/**
 * Get validation gaps — targets that still need verification.
 */
const getValidationGaps = async (farmerId) => {
  const summary = await getValidationSummary(farmerId);
  const gaps = [];

  const criticalTargets = ['name', 'aadhaar', 'address_permanent', 'mobile', 'bank_account'];
  for (const target of criticalTargets) {
    if (!summary[target] || summary[target].level < 2) {
      gaps.push({
        target,
        currentLevel: summary[target]?.level || 0,
        nextAction: getNextAction(target, summary[target]?.level || 0),
      });
    }
  }

  return gaps;
};

const getNextAction = (target, currentLevel) => {
  if (currentLevel === 0) return 'Enter data (self-declare)';
  if (currentLevel === 1) return 'Validate via app (format check)';
  if (currentLevel === 2) return 'Add GPS location';
  if (currentLevel === 3) return 'Request SATHI field verification';
  if (currentLevel === 4) return 'Verify via DPI (AgriStack/Aadhaar)';
  return 'Fully verified';
};

module.exports = {
  recordValidation,
  getValidationSummary,
  computeCompositeConfidence,
  getValidationGaps,
  TARGET_WEIGHTS,
  LEVEL_POINTS,
};
