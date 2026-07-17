/**
 * Activity Subtype Controller
 * GET  /farmer/activity-subtypes                 → all active subtypes + catalog
 * POST /farmer/activity-subtypes                 → upsert one activity's set
 */

const service = require('../services/activitySubtypeService');
const { ACTIVITY_SUBTYPE_CATALOG } = require('../constants/activitySubtypeCatalog');
const { success } = require('../../../shared/utils/responseHelper');
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

/** GET /farmer/activity-subtypes */
const list = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const subtypes = await service.listAll(farmerId);
    return success(res, {
      message: 'Subtypes retrieved',
      data: { subtypes, catalog: ACTIVITY_SUBTYPE_CATALOG },
    });
  } catch (err) { next(err); }
};

/** POST /farmer/activity-subtypes */
const upsert = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const { activityCode, subtypeCodes } = req.body;
    const result = await service.upsertSubtypes(farmerId, activityCode, subtypeCodes);
    return success(res, {
      message: 'Subtypes updated',
      data: { activityCode, subtypeCodes: result },
    });
  } catch (err) { next(err); }
};

module.exports = { list, upsert };
