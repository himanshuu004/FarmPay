/**
 * Activity Subscription Controller
 *
 * HTTP layer for `/farmer/activity-subscriptions/*`. Resolves the internal
 * user id from the JWT and delegates to activitySubscriptionService.
 */

const subService = require('../services/activitySubscriptionService');
const { success } = require('../../../shared/utils/responseHelper');
const STATUS_CODES = require('../../../shared/constants/statusCodes');
const { User } = require('../../../shared/models');

const resolveUserId = async (req) => {
  const user = await User.findOne({ where: { user_id: req.user.id, is_active: true } });
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    err.errorCode = 'RES_001';
    throw err;
  }
  return user.id;
};

/** GET /farmer/activity-subscriptions */
const list = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const items = await subService.listSubscriptions(farmerId, {
      status: req.query.status,
      includeDropped: req.query.includeDropped === true || req.query.includeDropped === 'true',
    });
    return success(res, {
      message: 'Subscriptions retrieved',
      data: { items, count: items.length },
    });
  } catch (err) { next(err); }
};

/** POST /farmer/activity-subscriptions */
const bulkSubscribe = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const items = await subService.bulkSubscribe(farmerId, req.body.items, req.body.source);
    return success(res, {
      message: `Subscribed to ${items.length} activities`,
      data: { items, count: items.length },
      statusCode: STATUS_CODES.CREATED,
    });
  } catch (err) { next(err); }
};

/** PATCH /farmer/activity-subscriptions/:subscriptionId */
const update = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const item = await subService.updateSubscription(farmerId, req.params.subscriptionId, req.body);
    return success(res, { message: 'Subscription updated', data: { item } });
  } catch (err) { next(err); }
};

/** POST /farmer/activity-subscriptions/:subscriptionId/drop */
const drop = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const item = await subService.dropSubscription(farmerId, req.params.subscriptionId, req.body.reason);
    return success(res, { message: 'Subscription dropped', data: { item } });
  } catch (err) { next(err); }
};

/** POST /farmer/activity-subscriptions/:subscriptionId/health */
const refreshHealth = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const item = await subService.refreshHealth(farmerId, {
      subscriptionId: req.params.subscriptionId,
      status: req.body.status,
    });
    return success(res, { message: 'Health snapshot updated', data: { item } });
  } catch (err) { next(err); }
};

/**
 * GET /farmer/my-activities-v2
 *
 * Persona + streams response sourced from farmer_activity_subscriptions.
 * The legacy /farmer/my-activities still reads from FarmerIncomeStream
 * — once the mobile app fully migrates, that endpoint can be retired.
 */
const getActivitiesWithPersona = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const data = await subService.getActivitiesWithPersona(farmerId);
    return success(res, { message: 'Activities & persona retrieved', data });
  } catch (err) { next(err); }
};

module.exports = {
  list,
  bulkSubscribe,
  update,
  drop,
  refreshHealth,
  getActivitiesWithPersona,
};
