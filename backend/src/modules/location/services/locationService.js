/**
 * Location Service
 * Business logic for LGD hierarchy lookups with Redis caching (24h TTL).
 */

const { Op } = require('sequelize');
const logger = require('../../../shared/utils/logger');
const { setWithTTL, getKey } = require('../../../config/redis');

const CACHE_TTL = 86400; // 24 hours in seconds

let db;
const getDb = () => {
  if (!db) db = require('../../../shared/models');
  return db;
};

/**
 * Returns the translated name for an entity based on language.
 * Falls back to the English name if no translation exists.
 * @param {Array} translations - Translation records
 * @param {string} language - Language code
 * @param {string} fallbackName - Default English name
 * @returns {string}
 */
const getTranslatedName = (translations, language, fallbackName) => {
  if (!translations || language === 'en') return fallbackName;
  const match = translations.find((t) => t.language_code === language && t.is_active);
  return match ? match.state_name_translated || match.district_name_translated || match.block_name_translated || match.village_name_translated : fallbackName;
};

/**
 * Gets all active states, with translation support and Redis caching.
 * @param {string} [language='en'] - Language code
 * @returns {Promise<Array>}
 */
const getStates = async (language = 'en') => {
  const cacheKey = `lgd:states:${language}`;

  // Try cache first
  const cached = await getKey(cacheKey);
  if (cached) return cached;

  const { LgdState, LgdStateTranslation } = getDb();

  const states = await LgdState.findAll({
    where: { is_active: true },
    include: language !== 'en' ? [{
      model: LgdStateTranslation, as: 'translations',
      where: { language_code: language, is_active: true },
      required: false,
    }] : [],
    order: [['state_name', 'ASC']],
  });

  const result = states.map((s) => ({
    stateId: s.id,
    stateCode: s.state_code,
    stateName: getTranslatedName(s.translations, language, s.state_name),
    stateNameEn: s.state_name_en || s.state_name,
    abbreviation: s.state_abbreviation,
    region: s.region,
    isUnionTerritory: s.is_union_territory,
    gstCode: s.gst_code,
  }));

  await setWithTTL(cacheKey, result, CACHE_TTL);
  return result;
};

/**
 * Gets all districts for a state.
 * @param {number} stateId
 * @param {string} [language='en']
 * @returns {Promise<Array>}
 */
const getDistricts = async (stateId, language = 'en') => {
  const cacheKey = `lgd:districts:${stateId}:${language}`;

  const cached = await getKey(cacheKey);
  if (cached) return cached;

  const { LgdDistrict, LgdDistrictTranslation } = getDb();

  const districts = await LgdDistrict.findAll({
    where: { state_id: stateId, is_active: true },
    include: language !== 'en' ? [{
      model: LgdDistrictTranslation, as: 'translations',
      where: { language_code: language, is_active: true },
      required: false,
    }] : [],
    order: [['district_name', 'ASC']],
  });

  const result = districts.map((d) => ({
    districtId: d.id,
    districtCode: d.district_code,
    districtName: getTranslatedName(d.translations, language, d.district_name),
    districtNameEn: d.district_name_en || d.district_name,
  }));

  await setWithTTL(cacheKey, result, CACHE_TTL);
  return result;
};

/**
 * Gets all blocks for a district.
 * @param {number} districtId
 * @param {string} [language='en']
 * @returns {Promise<Array>}
 */
const getBlocks = async (districtId, language = 'en') => {
  const cacheKey = `lgd:blocks:${districtId}:${language}`;

  const cached = await getKey(cacheKey);
  if (cached) return cached;

  const { LgdBlock, LgdBlockTranslation } = getDb();

  const blocks = await LgdBlock.findAll({
    where: { district_id: districtId, is_active: true },
    include: language !== 'en' ? [{
      model: LgdBlockTranslation, as: 'translations',
      where: { language_code: language, is_active: true },
      required: false,
    }] : [],
    order: [['block_name', 'ASC']],
  });

  const result = blocks.map((b) => ({
    blockId: b.id,
    blockCode: b.block_code,
    blockName: getTranslatedName(b.translations, language, b.block_name),
    blockNameEn: b.block_name_en || b.block_name,
  }));

  await setWithTTL(cacheKey, result, CACHE_TTL);
  return result;
};

/**
 * Gets all villages for a block.
 * @param {number} blockId
 * @param {string} [language='en']
 * @returns {Promise<Array>}
 */
const getVillages = async (blockId, language = 'en') => {
  const cacheKey = `lgd:villages:${blockId}:${language}`;

  const cached = await getKey(cacheKey);
  if (cached) return cached;

  const { LgdVillage, LgdVillageTranslation } = getDb();

  const villages = await LgdVillage.findAll({
    where: { block_id: blockId, is_active: true },
    include: language !== 'en' ? [{
      model: LgdVillageTranslation, as: 'translations',
      where: { language_code: language, is_active: true },
      required: false,
    }] : [],
    order: [['village_name', 'ASC']],
  });

  const result = villages.map((v) => ({
    villageId: v.id,
    villageCode: v.village_code,
    villageName: getTranslatedName(v.translations, language, v.village_name),
    villageNameEn: v.village_name_en || v.village_name,
    population: v.population,
    totalHouseholds: v.total_households,
    hasBankBranch: v.has_bank_branch,
  }));

  await setWithTTL(cacheKey, result, CACHE_TTL);
  return result;
};

/**
 * Searches villages by name with optional state/district filters.
 * Case-insensitive partial match.
 * @param {Object} params
 * @param {string} params.q - Search query
 * @param {number} [params.stateId] - Filter by state
 * @param {number} [params.districtId] - Filter by district
 * @param {number} [params.limit=20] - Max results
 * @returns {Promise<Array>}
 */
const searchVillages = async ({ q, stateId, districtId, limit = 20 }) => {
  if (!q || q.length < 2) {
    const err = new Error('Search query must be at least 2 characters');
    err.statusCode = 400; err.errorCode = 'VAL_001';
    throw err;
  }

  const { LgdVillage, LgdBlock, LgdDistrict, LgdState } = getDb();

  const where = {
    is_active: true,
    village_name: { [Op.like]: `%${q}%` },
  };

  const include = [{
    model: LgdBlock, as: 'block', attributes: ['block_name'],
    include: [{
      model: LgdDistrict, as: 'district', attributes: ['district_name'],
      where: districtId ? { id: districtId } : {},
      include: [{
        model: LgdState, as: 'state', attributes: ['state_name'],
        where: stateId ? { id: stateId } : {},
      }],
    }],
  }];

  const villages = await LgdVillage.findAll({
    where,
    include,
    limit: Math.min(parseInt(limit, 10) || 20, 50),
    order: [['village_name', 'ASC']],
  });

  return villages.map((v) => ({
    villageId: v.id,
    villageName: v.village_name,
    villageCode: v.village_code,
    blockName: v.block?.block_name,
    districtName: v.block?.district?.district_name,
    stateName: v.block?.district?.state?.state_name,
    population: v.population,
    hasBankBranch: v.has_bank_branch,
  }));
};

/**
 * Gets the full hierarchy chain for a specific location.
 * @param {Object} params - { stateId, districtId, blockId, villageId }
 * @returns {Promise<Object>} Full hierarchy with state, district, block, village
 */
const getHierarchy = async ({ stateId, districtId, blockId, villageId }) => {
  const { LgdState, LgdDistrict, LgdBlock, LgdVillage } = getDb();

  const [state, district, block, village] = await Promise.all([
    stateId ? LgdState.findByPk(stateId, { attributes: ['id', 'state_code', 'state_name'] }) : null,
    districtId ? LgdDistrict.findByPk(districtId, { attributes: ['id', 'district_code', 'district_name'] }) : null,
    blockId ? LgdBlock.findByPk(blockId, { attributes: ['id', 'block_code', 'block_name'] }) : null,
    villageId ? LgdVillage.findByPk(villageId, { attributes: ['id', 'village_code', 'village_name', 'population'] }) : null,
  ]);

  const chain = [
    state?.state_name,
    district?.district_name,
    block?.block_name,
    village?.village_name,
  ].filter(Boolean).join(' > ');

  return { state, district, block, village, hierarchyChain: chain };
};

module.exports = {
  getStates,
  getDistricts,
  getBlocks,
  getVillages,
  searchVillages,
  getHierarchy,
};
