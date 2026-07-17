/**
 * Agent Controller
 * Handles HTTP requests for field agent farmer assignment and listing.
 */

const agentService = require('../services/agentService');
const { success } = require('../../../shared/utils/responseHelper');
const STATUS_CODES = require('../../../shared/constants/statusCodes');
const { User } = require('../../../shared/models');

/**
 * Resolves the internal user ID from the JWT user_id (UUID).
 */
const resolveUserId = async (req) => {
  const user = await User.findOne({ where: { user_id: req.user.id, is_active: true } });
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404; err.errorCode = 'RES_001';
    throw err;
  }
  return user.id;
};

/** POST /agent/assign-farmer */
const assignFarmer = async (req, res, next) => {
  try {
    const agentUserId = await resolveUserId(req);
    const result = await agentService.assignFarmer(agentUserId, req.body);
    return success(res, { message: 'Farmer assigned successfully', data: { assignment: result }, statusCode: STATUS_CODES.CREATED });
  } catch (err) { next(err); }
};

/** GET /agent/assigned-farmers */
const getAssignedFarmers = async (req, res, next) => {
  try {
    const agentUserId = await resolveUserId(req);
    const result = await agentService.getAssignedFarmers(agentUserId, req.query);
    return success(res, { message: 'Assigned farmers retrieved', data: result.farmers, meta: result.meta });
  } catch (err) { next(err); }
};

module.exports = { assignFarmer, getAssignedFarmers };
