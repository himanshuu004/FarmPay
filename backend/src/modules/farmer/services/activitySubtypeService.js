/**
 * Activity Subtype Service
 *
 * Per-farmer sub-type selections for CROP / HORTI / POULTRY / GOATERY.
 * Backs GET/POST /farmer/activity-subtypes on the mobile app's in-context
 * picker cards.
 *
 * Upsert semantics:
 *   - Incoming codes not in the catalog → rejected by validator before us
 *   - Codes in incoming but not currently active → insert or reactivate
 *   - Codes currently active but not in incoming → soft-delete (is_active=false)
 *   - Same set as before → effectively a no-op
 *
 * Auto-create subscription side-effect:
 *   If the farmer has no ACTIVE subscription for this activity_code when
 *   they save subtypes, we silently create one. This lets the farmer tap
 *   into a section and declare sub-types even if they skipped that activity
 *   during onboarding. The subscription is marked FARMER_DECLARED.
 */

const logger = require('../../../shared/utils/logger');
const { SUPPORTED_ACTIVITY_CODES, getSubtypeCodes } = require('../constants/activitySubtypeCatalog');

let db;
const getDb = () => {
  if (!db) db = require('../../../shared/models');
  return db;
};

/**
 * Ensure the farmer has an ACTIVE subscription for this activity. If they
 * don't, create one (priority_rank defaults to 99 since it wasn't ranked
 * during onboarding — the farmer can reorder later from the Farm tab).
 */
const ensureSubscription = async (farmerId, activityCode) => {
  const { FarmerActivitySubscription } = getDb();
  const existing = await FarmerActivitySubscription.findOne({
    where: { farmer_id: farmerId, activity_code: activityCode },
  });
  if (existing) {
    if (existing.status !== 'ACTIVE') {
      existing.status = 'ACTIVE';
      existing.dropped_at = null;
      existing.dropped_reason = null;
      await existing.save();
      logger.info(`Reactivated ${activityCode} subscription for farmer ${farmerId} via subtype save`);
    }
    return existing;
  }
  const created = await FarmerActivitySubscription.create({
    farmer_id: farmerId,
    activity_code: activityCode,
    status: 'ACTIVE',
    source: 'FARMER_DECLARED',
    priority_rank: 99,
  });
  logger.info(`Auto-created ${activityCode} subscription for farmer ${farmerId} via subtype save`);
  return created;
};

/**
 * Upsert the farmer's subtype selections for a single activity.
 * Returns the current active set after the upsert.
 */
const upsertSubtypes = async (farmerId, activityCode, incomingCodes) => {
  const { FarmerActivitySubtype, sequelize } = getDb();

  // Make sure parent subscription exists — auto-creates if missing.
  await ensureSubscription(farmerId, activityCode);

  const validCodes = getSubtypeCodes(activityCode);
  const cleaned = [...new Set(incomingCodes.filter((c) => validCodes.includes(c)))];
  if (cleaned.length === 0) {
    const err = new Error('At least one valid subtype is required');
    err.statusCode = 400;
    err.errorCode = 'VAL_001';
    throw err;
  }

  const tx = await sequelize.transaction();
  try {
    const existing = await FarmerActivitySubtype.findAll({
      where: { farmer_id: farmerId, activity_code: activityCode },
      transaction: tx,
    });

    const existingByCode = new Map(existing.map((r) => [r.subtypeCode, r]));
    const incomingSet = new Set(cleaned);

    // 1) Reactivate or insert
    for (const code of cleaned) {
      const row = existingByCode.get(code);
      if (row) {
        if (!row.isActive) {
          row.isActive = true;
          await row.save({ transaction: tx });
        }
      } else {
        await FarmerActivitySubtype.create(
          {
            farmerId,
            activityCode,
            subtypeCode: code,
            isActive: true,
          },
          { transaction: tx }
        );
      }
    }

    // 2) Soft-delete codes no longer selected
    for (const row of existing) {
      if (!incomingSet.has(row.subtypeCode) && row.isActive) {
        row.isActive = false;
        await row.save({ transaction: tx });
      }
    }

    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }

  return listActiveForActivity(farmerId, activityCode);
};

/** Returns the active subtype codes for a single activity. */
const listActiveForActivity = async (farmerId, activityCode) => {
  const { FarmerActivitySubtype } = getDb();
  const rows = await FarmerActivitySubtype.findAll({
    where: { farmer_id: farmerId, activity_code: activityCode, is_active: true },
    order: [['id', 'ASC']],
  });
  return rows.map((r) => r.subtypeCode);
};

/**
 * Returns all active subtypes for the farmer, keyed by activity code.
 * Shape: { CROP: ['rice', 'wheat'], HORTI: ['fruits'], ... }
 * Activities with no active subtypes are omitted (empty object if none).
 */
const listAll = async (farmerId) => {
  const { FarmerActivitySubtype } = getDb();
  const rows = await FarmerActivitySubtype.findAll({
    where: { farmer_id: farmerId, is_active: true },
    order: [['activity_code', 'ASC'], ['id', 'ASC']],
  });
  const out = {};
  for (const code of SUPPORTED_ACTIVITY_CODES) {
    const codes = rows.filter((r) => r.activityCode === code).map((r) => r.subtypeCode);
    if (codes.length) out[code] = codes;
  }
  return out;
};

module.exports = {
  upsertSubtypes,
  listActiveForActivity,
  listAll,
};
