/**
 * Activity Subscription Service
 *
 * Operational source-of-truth for which activities a farmer is engaged in.
 * Backs `/farmer/activity-subscriptions/*` and the new `/farmer/my-activities`
 * persona response.
 *
 * Lifecycle: ACTIVE → PAUSED ↔ ACTIVE → DROPPED (terminal but preserved).
 *
 * Persona derivation maps the *agri* activity codes (CROP/DAIRY/FISHERY/HORTI)
 * to the legacy single/double/triple/quad_income labels the farmer mobile app
 * already understands. Non-agri streams (LABOUR_WAGE, REMITTANCE, …) still
 * count toward total household income but don't move the persona band.
 */

const logger = require('../../../shared/utils/logger');

let db;
const getDb = () => {
  if (!db) db = require('../../../shared/models');
  return db;
};

// ─── Constants ──────────────────────────────────────────────────────

const AGRI_CODES = ['CROP', 'DAIRY', 'FISHERY', 'HORTI'];

/** Map activity_code → lowercase stream type used by the mobile app. */
const CODE_TO_STREAM = {
  CROP: 'crop',
  DAIRY: 'dairy',
  FISHERY: 'fisheries',
  HORTI: 'horticulture',
  POULTRY: 'poultry',
  GOATERY: 'goatery',
  LABOUR_WAGE: 'labour',
  SHOP_BUSINESS: 'business',
  REMITTANCE: 'remittance',
  OTHER: 'other',
};

// ─── Helpers ────────────────────────────────────────────────────────

/** Build the wire format for a single subscription row. */
const toWire = (row) => ({
  subscriptionId: row.subscription_uuid,
  activityCode: row.activity_code,
  streamType: CODE_TO_STREAM[row.activity_code] || row.activity_code.toLowerCase(),
  status: row.status,
  subscribedAt: row.subscribed_at,
  tier: row.auto_derived_tier,
  health: row.last_health_status,
  lastSnapshotAt: row.last_snapshot_at,
  priorityRank: row.priority_rank,
  droppedAt: row.dropped_at,
  droppedReason: row.dropped_reason,
  notes: row.notes,
  source: row.source,
  // Persona phase save-and-lock state
  setupComplete: !!row.setup_complete,
  setupCompletedAt: row.setup_completed_at,
});

/**
 * Persona classification — based on the count of distinct ACTIVE *agri*
 * activities (CROP / DAIRY / FISHERY / HORTI). Matches the existing
 * single/double/triple/quad_income labels the farmer mobile app uses.
 */
const classifyPersona = (activeRows) => {
  const agri = new Set(
    activeRows
      .filter((r) => AGRI_CODES.includes(r.activity_code))
      .map((r) => r.activity_code)
  );
  const n = agri.size;
  if (n >= 4) return 'quad_income';
  if (n >= 3) return 'triple_income';
  if (n >= 2) return 'double_income';
  return 'single_income';
};

/** Throws a 404 if the subscription doesn't belong to this farmer. */
const findOwnedOrThrow = async (farmerId, subscriptionId) => {
  const { FarmerActivitySubscription } = getDb();
  const row = await FarmerActivitySubscription.findOne({
    where: { farmer_id: farmerId, subscription_uuid: subscriptionId },
  });
  if (!row) {
    const err = new Error('Subscription not found');
    err.statusCode = 404;
    err.errorCode = 'RES_001';
    throw err;
  }
  return row;
};

// ─── Public API ─────────────────────────────────────────────────────

/**
 * List a farmer's activity subscriptions.
 * @param {number} farmerId
 * @param {Object} [opts]
 * @param {string} [opts.status] - filter by status (ACTIVE/PAUSED/DROPPED).
 *                                 Default: all (ACTIVE+PAUSED, drop hidden).
 * @param {boolean} [opts.includeDropped=false]
 */
const listSubscriptions = async (farmerId, opts = {}) => {
  const { FarmerActivitySubscription } = getDb();
  const where = { farmer_id: farmerId };

  if (opts.status) {
    where.status = opts.status;
  } else if (!opts.includeDropped) {
    const { Op } = require('sequelize');
    where.status = { [Op.in]: ['ACTIVE', 'PAUSED'] };
  }

  const rows = await FarmerActivitySubscription.findAll({
    where,
    order: [
      ['priority_rank', 'ASC'],
      ['subscribed_at', 'ASC'],
    ],
  });

  return rows.map(toWire);
};

/**
 * Bulk subscribe — used by the onboarding wizard.
 * Idempotent: if a row exists for a (farmer, activity_code) pair, it's
 * reactivated instead of being duplicated.
 *
 * @param {number} farmerId
 * @param {Array<Object>} items - [{ activityCode, tier?, priorityRank?, notes? }]
 * @param {string} [source='FARMER_DECLARED']
 */
const bulkSubscribe = async (farmerId, items, source = 'FARMER_DECLARED') => {
  const { FarmerActivitySubscription, sequelize } = getDb();
  if (!Array.isArray(items) || items.length === 0) {
    const err = new Error('At least one activity is required');
    err.statusCode = 400;
    err.errorCode = 'VAL_001';
    throw err;
  }

  const results = [];
  await sequelize.transaction(async (t) => {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const code = item.activityCode;

      const [row, created] = await FarmerActivitySubscription.findOrCreate({
        where: { farmer_id: farmerId, activity_code: code },
        defaults: {
          farmer_id: farmerId,
          activity_code: code,
          status: 'ACTIVE',
          subscribed_at: new Date(),
          auto_derived_tier: item.tier || null,
          priority_rank: item.priorityRank || i + 1,
          notes: item.notes || null,
          source,
        },
        transaction: t,
      });

      // Re-activate / re-rank a stale row instead of duplicating
      if (!created) {
        row.status = 'ACTIVE';
        if (item.tier) row.auto_derived_tier = item.tier;
        if (item.priorityRank) row.priority_rank = item.priorityRank;
        if (item.notes) row.notes = item.notes;
        row.dropped_at = null;
        row.dropped_reason = null;
        await row.save({ transaction: t });
      }

      results.push(row);
    }
  });

  logger.info(`Subscribed farmer ${farmerId} to ${results.length} activities`);
  return results.map(toWire);
};

/**
 * Update a single subscription. Allowed fields: tier, priorityRank,
 * status (ACTIVE/PAUSED only — use drop() for DROPPED), notes.
 */
const updateSubscription = async (farmerId, subscriptionId, patch) => {
  const row = await findOwnedOrThrow(farmerId, subscriptionId);

  if (patch.tier !== undefined) row.auto_derived_tier = patch.tier;
  if (patch.priorityRank !== undefined) row.priority_rank = patch.priorityRank;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.status !== undefined) {
    if (!['ACTIVE', 'PAUSED'].includes(patch.status)) {
      const err = new Error('Use drop endpoint to set status to DROPPED');
      err.statusCode = 400;
      err.errorCode = 'VAL_002';
      throw err;
    }
    row.status = patch.status;
  }
  // Persona phase — frontend setup forms flip this to true on save
  if (patch.isSetupComplete !== undefined) {
    row.setup_complete = !!patch.isSetupComplete;
    row.setup_completed_at = patch.isSetupComplete ? new Date() : null;
  }

  await row.save();
  return toWire(row);
};

/**
 * Service-layer helper used by other modules (e.g. executionService for
 * CROP/HORTI on first cycle creation, dairy aggregate herd save, etc.)
 * to flip the setup_complete flag without going through the controller.
 *
 * Idempotent: a no-op if already setup_complete.
 */
const markActivitySetupComplete = async (farmerId, activityCode) => {
  const { FarmerActivitySubscription } = getDb();
  const row = await FarmerActivitySubscription.findOne({
    where: { farmer_id: farmerId, activity_code: activityCode, status: 'ACTIVE' },
  });
  if (!row) return null;
  if (row.setup_complete) return toWire(row);
  row.setup_complete = true;
  row.setup_completed_at = new Date();
  await row.save();
  logger.info(`Activity ${activityCode} setup_complete=true for farmer ${farmerId}`);
  return toWire(row);
};

/** Drop (terminal) a subscription with optional reason. Preserves history. */
const dropSubscription = async (farmerId, subscriptionId, reason) => {
  const row = await findOwnedOrThrow(farmerId, subscriptionId);
  await row.drop(reason);
  return toWire(row);
};

/**
 * Refresh the health snapshot — called by ROOTS / DICE jobs (or manual
 * agent visit). The activityCode form lets internal callers update by
 * (farmer, code) without knowing the subscription_uuid.
 */
const refreshHealth = async (farmerId, { subscriptionId, activityCode, status }) => {
  const { FarmerActivitySubscription } = getDb();
  let row;
  if (subscriptionId) {
    row = await findOwnedOrThrow(farmerId, subscriptionId);
  } else if (activityCode) {
    row = await FarmerActivitySubscription.findOne({
      where: { farmer_id: farmerId, activity_code: activityCode },
    });
    if (!row) {
      const err = new Error('No subscription for that activity');
      err.statusCode = 404;
      err.errorCode = 'RES_001';
      throw err;
    }
  } else {
    const err = new Error('subscriptionId or activityCode is required');
    err.statusCode = 400;
    err.errorCode = 'VAL_001';
    throw err;
  }

  await row.refreshHealth(status);
  return toWire(row);
};

/**
 * Persona-shaped response for the home / farm tabs. Replaces the legacy
 * income-stream-based `getMyActivities`. Falls back to legacy income streams
 * if the farmer has no subscriptions yet (so first-time users see something
 * before they finish the onboarding wizard).
 */
const getActivitiesWithPersona = async (farmerId) => {
  const { FarmerActivitySubscription, FarmerIncomeStream, FarmerProfileDetail } = getDb();

  const subs = await FarmerActivitySubscription.findAll({
    where: { farmer_id: farmerId, status: 'ACTIVE' },
    order: [['priority_rank', 'ASC']],
  });

  // Pull income streams for ₹ values (subscriptions don't store amounts).
  let streamsByCode = {};
  let totalAnnualIncome = 0;
  if (FarmerIncomeStream) {
    try {
      const incomeStreams = await FarmerIncomeStream.findAll({
        where: { farmer_id: farmerId, is_active: true },
      });
      for (const s of incomeStreams) {
        const t = (s.stream_type || '').toLowerCase();
        const amt = parseFloat(s.annual_income || 0);
        totalAnnualIncome += amt;
        // Match by stream type → activity code (best-effort)
        const matchCode = Object.keys(CODE_TO_STREAM).find(
          (k) => CODE_TO_STREAM[k] === t
        );
        if (matchCode) {
          streamsByCode[matchCode] = {
            annualIncome: amt,
            stability: s.income_stability_rating || 'moderate',
            description: s.income_source_description,
          };
        }
      }
    } catch (e) {
      logger.warn(`Income stream lookup failed for farmer ${farmerId}: ${e.message}`);
    }
  }

  // ── Fallback: no subscriptions yet — return legacy shape so the app
  // ── can still render before the onboarding wizard completes.
  if (subs.length === 0) {
    return {
      hasSubscriptions: false,
      activities: [],
      persona: 'single_income',
      streams: [],
      totalAnnualIncome: 0,
      familySize: null,
      earningMembers: null,
    };
  }

  const activities = subs.map((s) => CODE_TO_STREAM[s.activity_code] || s.activity_code.toLowerCase());
  const persona = classifyPersona(subs);

  const streams = subs.map((s) => {
    const code = s.activity_code;
    const income = streamsByCode[code] || {};
    return {
      type: CODE_TO_STREAM[code] || code.toLowerCase(),
      activityCode: code,
      annualIncome: income.annualIncome || 0,
      stability: income.stability || 'moderate',
      description: income.description || null,
      tier: s.auto_derived_tier,
      health: s.last_health_status,
      priorityRank: s.priority_rank,
    };
  });

  // Family details (best-effort)
  let familySize = null;
  try {
    if (FarmerProfileDetail) {
      const detail = await FarmerProfileDetail.findOne({ where: { farmer_id: farmerId } });
      if (detail) familySize = detail.family_members || null;
    }
  } catch (e) {
    /* ignore */
  }

  return {
    hasSubscriptions: true,
    activities,
    persona,
    streams,
    totalAnnualIncome,
    familySize,
    earningMembers: null,
  };
};

module.exports = {
  // CRUD
  listSubscriptions,
  bulkSubscribe,
  updateSubscription,
  dropSubscription,
  refreshHealth,
  // Persona phase save-and-lock helper
  markActivitySetupComplete,
  // Persona / dashboard
  getActivitiesWithPersona,
  classifyPersona,
  // Constants (handy for validators / tests)
  AGRI_CODES,
  CODE_TO_STREAM,
};
