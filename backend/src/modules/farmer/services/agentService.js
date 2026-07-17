/**
 * Agent Service
 * Business logic for field agent farmer assignments and listing.
 */

const { Op } = require('sequelize');
const logger = require('../../../shared/utils/logger');
const { parsePagination, buildMeta } = require('../../../shared/utils/paginationHelper');

let db;
const getDb = () => {
  if (!db) db = require('../../../shared/models');
  return db;
};

/**
 * Assigns a farmer to the authenticated field agent.
 * @param {number} agentUserId - Agent's internal user ID
 * @param {Object} data - { farmerId, reason }
 * @returns {Promise<Object>} Assignment record
 */
const assignFarmer = async (agentUserId, data) => {
  const { FieldAgentProfile, FieldAgentFarmerAssignment, User, FarmerProfile } = getDb();

  // Verify agent profile exists
  const agentProfile = await FieldAgentProfile.findOne({
    where: { agent_user_id: agentUserId, is_active: true },
  });

  if (!agentProfile) {
    const err = new Error('Agent profile not found. Contact admin.');
    err.statusCode = 403; err.errorCode = 'AUTH_005';
    throw err;
  }

  // Verify farmer exists
  const farmer = await User.findOne({ where: { id: data.farmerId, is_active: true } });
  if (!farmer) {
    const err = new Error('Farmer not found');
    err.statusCode = 404; err.errorCode = 'RES_001';
    throw err;
  }

  // Check if already assigned to this agent
  const existing = await FieldAgentFarmerAssignment.findOne({
    where: {
      field_agent_profile_id: agentProfile.id,
      farmer_id: data.farmerId,
      is_active: true,
    },
  });

  if (existing) {
    const err = new Error('Farmer is already assigned to you');
    err.statusCode = 409; err.errorCode = 'RES_002';
    throw err;
  }

  // Get farmer's village from primary address
  const { FarmerAddress } = getDb();
  const primaryAddress = await FarmerAddress.findOne({
    where: { farmer_id: data.farmerId, is_primary_address: true, is_active: true },
  });

  const assignment = await FieldAgentFarmerAssignment.create({
    field_agent_profile_id: agentProfile.id,
    farmer_id: data.farmerId,
    lgd_village_id: primaryAddress?.lgd_village_id || null,
    assigned_at: new Date(),
    assigned_by: agentUserId,
  });

  logger.info(`Agent ${agentUserId} assigned farmer ${data.farmerId}`);
  return assignment;
};

/**
 * Gets paginated list of farmers assigned to the authenticated agent.
 * @param {number} agentUserId - Agent's internal user ID
 * @param {Object} query - Query params (page, limit)
 * @returns {Promise<Object>} { farmers, meta }
 */
const getAssignedFarmers = async (agentUserId, query) => {
  const { FieldAgentProfile, FieldAgentFarmerAssignment, User, FarmerProfile } = getDb();

  const agentProfile = await FieldAgentProfile.findOne({
    where: { agent_user_id: agentUserId, is_active: true },
  });

  if (!agentProfile) {
    const err = new Error('Agent profile not found');
    err.statusCode = 403; err.errorCode = 'AUTH_005';
    throw err;
  }

  const { page, limit, offset } = parsePagination(query);

  const { count, rows } = await FieldAgentFarmerAssignment.findAndCountAll({
    where: { field_agent_profile_id: agentProfile.id, is_active: true },
    include: [
      {
        model: User, as: 'farmer',
        attributes: ['id', 'user_id', 'first_name', 'last_name', 'mobile'],
      },
    ],
    limit,
    offset,
    order: [['assigned_at', 'DESC']],
  });

  const farmers = rows.map((r) => ({
    assignmentId: r.id,
    farmerId: r.farmer?.id,
    farmerUuid: r.farmer?.user_id,
    name: [r.farmer?.first_name, r.farmer?.last_name].filter(Boolean).join(' '),
    mobile: r.farmer?.mobile,
    villageId: r.lgd_village_id,
    assignedAt: r.assigned_at,
  }));

  return { farmers, meta: buildMeta(page, limit, count) };
};

module.exports = { assignFarmer, getAssignedFarmers };
