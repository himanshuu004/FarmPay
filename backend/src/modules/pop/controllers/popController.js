/**
 * popController — HTTP layer for Package of Practices.
 *
 * Routes (mounted under /farmer/pop):
 *   GET  /:activityCode/template       → stages + touchpoints
 *   GET  /:activityCode/progress       → template joined with farmer state
 *   POST /:activityCode/touchpoints    → upsert a touchpoint entry
 *
 * All three accept an optional ?subtypeCode= query param (and body field on
 * POST). Omitting it means "baseline template / activity-level progress",
 * which is backwards-compatible with the pre-subtype callers (DAIRY,
 * FISHERY, and any old client still on the activity-only API).
 *
 * Resolves the internal farmer user id from the JWT the same way the
 * activity-subscription controller does, so the two modules share auth
 * semantics.
 */

const popService = require('../services/popService');
const { success } = require('../../../shared/utils/responseHelper');
const STATUS_CODES = require('../../../shared/constants/statusCodes');
const { User } = require('../../../shared/models');

const resolveUserId = async (req) => {
  const user = await User.findOne({
    where: { user_id: req.user.id, is_active: true },
  });
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    err.errorCode = 'RES_001';
    throw err;
  }
  return user.id;
};

/** GET /farmer/pop/:activityCode/template?subtypeCode=rice */
const getTemplate = async (req, res, next) => {
  try {
    const subtypeCode = (req.query.subtypeCode || '').toString();
    const data = await popService.getTemplate(req.params.activityCode, subtypeCode);
    return success(res, { message: 'PoP template retrieved', data });
  } catch (err) { next(err); }
};

/** GET /farmer/pop/:activityCode/progress?subtypeCode=rice */
const getProgress = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const subtypeCode = (req.query.subtypeCode || '').toString();
    const data = await popService.getProgress(
      farmerId,
      req.params.activityCode,
      subtypeCode
    );
    return success(res, { message: 'PoP progress retrieved', data });
  } catch (err) { next(err); }
};

/** POST /farmer/pop/:activityCode/touchpoints  body.subtypeCode optional */
const enterTouchpoint = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const row = await popService.enterTouchpoint({
      farmerId,
      activityCode: req.params.activityCode,
      ...req.body,
    });
    return success(res, {
      message: 'Touchpoint recorded',
      data: { item: row },
      statusCode: STATUS_CODES.CREATED,
    });
  } catch (err) { next(err); }
};

module.exports = {
  getTemplate,
  getProgress,
  enterTouchpoint,
};
