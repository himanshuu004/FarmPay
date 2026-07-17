/**
 * Entity Mapping Service
 * Manages the unified codification hub (farmer_entity_mappings).
 * Auto-infers mappings from farmer's village/block address.
 */

const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const logger = require('../../../shared/utils/logger');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

/**
 * Add or update a single entity mapping for a farmer.
 */
const mapFarmerToEntity = async (farmerId, entityType, entityCode, source, options = {}) => {
  const { FarmerEntityMapping } = getDb();
  const { entityName, entityMetadata, confidenceScore, transaction } = options;

  const [mapping, created] = await FarmerEntityMapping.findOrCreate({
    where: { farmer_id: farmerId, entity_type: entityType, entity_code: entityCode, is_active: true },
    defaults: {
      mapping_uuid: uuidv4(),
      farmer_id: farmerId,
      entity_type: entityType,
      entity_code: entityCode,
      entity_name: entityName || null,
      entity_metadata: entityMetadata || null,
      source,
      confidence_score: confidenceScore || null,
      linked_at: new Date(),
    },
    transaction,
  });

  if (!created && (entityName || confidenceScore)) {
    await mapping.update({
      entity_name: entityName || mapping.entity_name,
      confidence_score: confidenceScore || mapping.confidence_score,
      entity_metadata: entityMetadata || mapping.entity_metadata,
    }, { transaction });
  }

  return mapping;
};

/**
 * Infer entity mappings from farmer's address (village/block/district).
 * Called at registration after farmer enters address.
 */
const inferMappingsFromGeo = async (farmerId, lgdBlockId, lgdDistrictId, transaction = null) => {
  const models = getDb();
  const results = [];

  try {
    // 1. Infer agro-climatic zone from block
    if (lgdBlockId && models.AgroClimaticZoneMapping) {
      const zoneMapping = await models.AgroClimaticZoneMapping.findOne({
        where: { lgd_block_id: lgdBlockId, is_active: true },
        include: [{ model: models.ClimateZone, as: 'climateZone', attributes: ['zone_code', 'zone_name'] }],
      });
      if (zoneMapping && zoneMapping.climateZone) {
        const m = await mapFarmerToEntity(farmerId, 'agro_climatic_zone', zoneMapping.climateZone.zone_code, 'geo_inferred', {
          entityName: zoneMapping.climateZone.zone_name,
          confidenceScore: 90,
          transaction,
        });
        results.push(m);
      }
    }

    // 2. Infer nearest PACS from block
    if (lgdBlockId && models.PacsRegistry) {
      const nearestPacs = await models.PacsRegistry.findOne({
        where: { lgd_block_id: lgdBlockId, is_active: true },
        order: [['total_members', 'DESC']],
      });
      if (nearestPacs) {
        const m = await mapFarmerToEntity(farmerId, 'pacs', nearestPacs.pacs_code, 'geo_inferred', {
          entityName: nearestPacs.pacs_name,
          confidenceScore: 70,
          entityMetadata: { affiliated_bank: nearestPacs.affiliated_bank_name },
          transaction,
        });
        results.push(m);
      }
    }

    // 3. Infer nearest mandi from district (if PULSE module data exists)
    if (lgdDistrictId && models.PulseMandi) {
      const nearestMandi = await models.PulseMandi.findOne({
        where: { lgd_district_id: lgdDistrictId, is_active: true },
        order: [['created_at', 'ASC']],
      });
      if (nearestMandi) {
        const m = await mapFarmerToEntity(farmerId, 'mandi', nearestMandi.mandi_code || String(nearestMandi.id), 'geo_inferred', {
          entityName: nearestMandi.mandi_name,
          confidenceScore: 60,
          transaction,
        });
        results.push(m);
      }
    }
  } catch (error) {
    logger.warn('Entity mapping inference partially failed', { farmerId, error: error.message });
  }

  return results;
};

/**
 * Get the complete codebook for a farmer — all active entity mappings.
 */
const getFarmerCodebook = async (farmerId) => {
  const { FarmerEntityMapping } = getDb();

  const mappings = await FarmerEntityMapping.findAll({
    where: { farmer_id: farmerId, is_active: true },
    order: [['entity_type', 'ASC']],
  });

  const codebook = {};
  for (const m of mappings) {
    if (!codebook[m.entity_type]) codebook[m.entity_type] = [];
    codebook[m.entity_type].push({
      code: m.entity_code,
      name: m.entity_name,
      source: m.source,
      confidence: m.confidence_score,
      verifiedAt: m.verified_at,
      metadata: m.entity_metadata,
    });
  }

  return codebook;
};

/**
 * Sync entity mappings from existing farmer data (bank accounts, FPO membership).
 */
const syncFromExistingData = async (farmerId, transaction = null) => {
  const { FarmerBankAccount, FpoMembership } = getDb();
  const results = [];

  // Sync bank branch from IFSC codes
  if (FarmerBankAccount) {
    const accounts = await FarmerBankAccount.findAll({
      where: { farmer_id: farmerId, is_active: true },
      attributes: ['ifsc_code', 'bank_name'],
    });
    for (const acc of accounts) {
      if (acc.ifsc_code) {
        const m = await mapFarmerToEntity(farmerId, 'bank_branch', acc.ifsc_code, 'bank_linked', {
          entityName: acc.bank_name,
          confidenceScore: 95,
          transaction,
        });
        results.push(m);
      }
    }
  }

  // Sync FPO from membership
  if (FpoMembership) {
    const memberships = await FpoMembership.findAll({
      where: { farmer_id: farmerId, is_active: true },
      attributes: ['fpo_registration_number', 'fpo_name'],
    });
    for (const mem of memberships) {
      if (mem.fpo_registration_number) {
        const m = await mapFarmerToEntity(farmerId, 'fpo', mem.fpo_registration_number, 'system', {
          entityName: mem.fpo_name,
          confidenceScore: 95,
          transaction,
        });
        results.push(m);
      }
    }
  }

  return results;
};

module.exports = {
  mapFarmerToEntity,
  inferMappingsFromGeo,
  getFarmerCodebook,
  syncFromExistingData,
};
