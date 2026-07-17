/**
 * Codebook Controller
 * Manages the unified entity mapping hub for a farmer.
 */

const entityMappingService = require('../services/entityMappingService');
const { success, error } = require('../../../shared/utils/responseHelper');

const getCodebook = async (req, res) => {
  try {
    const codebook = await entityMappingService.getFarmerCodebook(req.user.id);
    return success(res, 'Farmer codebook retrieved', { codebook });
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const addEntityMapping = async (req, res) => {
  try {
    const { entityType, entityCode, source, entityName, entityMetadata, confidenceScore } = req.body;
    const mapping = await entityMappingService.mapFarmerToEntity(
      req.user.id, entityType, entityCode, source,
      { entityName, entityMetadata, confidenceScore }
    );
    return success(res, 'Entity mapping added', { mapping }, 201);
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const inferMappings = async (req, res) => {
  try {
    const db = require('../../../shared/models');
    const address = await db.FarmerAddress.findOne({
      where: { farmer_id: req.user.id, is_primary_address: true, is_active: true },
    });
    if (!address) {
      return error(res, 'No primary address found. Add address first.', 400);
    }
    const mappings = await entityMappingService.inferMappingsFromGeo(
      req.user.id, address.lgd_block_id, address.lgd_district_id
    );
    return success(res, `Inferred ${mappings.length} entity mappings`, { mappings });
  } catch (err) {
    return error(res, err.message, 500);
  }
};

module.exports = { getCodebook, addEntityMapping, inferMappings };
