/**
 * Location Controller
 * Handles HTTP requests for LGD geographic hierarchy.
 * All endpoints are public (no auth required).
 */

const locationService = require('../services/locationService');
const { success } = require('../../../shared/utils/responseHelper');

/** GET /location/states */
const getStates = async (req, res, next) => {
  try {
    const states = await locationService.getStates(req.language);
    return success(res, { message: 'States retrieved', data: states, meta: { total: states.length } });
  } catch (err) { next(err); }
};

/** GET /location/states/:stateId/districts */
const getDistricts = async (req, res, next) => {
  try {
    const districts = await locationService.getDistricts(parseInt(req.params.stateId, 10), req.language);
    return success(res, { message: 'Districts retrieved', data: districts, meta: { total: districts.length } });
  } catch (err) { next(err); }
};

/** GET /location/districts/:districtId/blocks */
const getBlocks = async (req, res, next) => {
  try {
    const blocks = await locationService.getBlocks(parseInt(req.params.districtId, 10), req.language);
    return success(res, { message: 'Blocks retrieved', data: blocks, meta: { total: blocks.length } });
  } catch (err) { next(err); }
};

/** GET /location/blocks/:blockId/villages */
const getVillages = async (req, res, next) => {
  try {
    const villages = await locationService.getVillages(parseInt(req.params.blockId, 10), req.language);
    return success(res, { message: 'Villages retrieved', data: villages, meta: { total: villages.length } });
  } catch (err) { next(err); }
};

/** GET /location/search?q=...&stateId=...&districtId=... */
const searchVillages = async (req, res, next) => {
  try {
    const results = await locationService.searchVillages({
      q: req.query.q,
      stateId: req.query.stateId ? parseInt(req.query.stateId, 10) : null,
      districtId: req.query.districtId ? parseInt(req.query.districtId, 10) : null,
      limit: req.query.limit,
    });
    return success(res, { message: 'Search results', data: results, meta: { total: results.length } });
  } catch (err) { next(err); }
};

/** GET /location/hierarchy/:stateId/:districtId/:blockId/:villageId */
const getHierarchy = async (req, res, next) => {
  try {
    const result = await locationService.getHierarchy({
      stateId: parseInt(req.params.stateId, 10),
      districtId: parseInt(req.params.districtId, 10),
      blockId: parseInt(req.params.blockId, 10),
      villageId: parseInt(req.params.villageId, 10),
    });
    return success(res, { message: 'Location hierarchy retrieved', data: result });
  } catch (err) { next(err); }
};

/**
 * Get panchayats for a block.
 */
const getPanchayats = async (req, res, next) => {
  try {
    const db = require('../../../shared/models');
    const language = req.headers['x-language'] || 'en';
    const include = language !== 'en'
      ? [{ model: db.LgdPanchayatTranslation, as: 'translations', where: { language_code: language }, required: false }]
      : [];
    const panchayats = await db.LgdPanchayat.findAll({
      where: { block_id: parseInt(req.params.blockId), is_active: true },
      include,
      order: [['panchayat_name', 'ASC']],
    });
    return success(res, { message: 'Panchayats retrieved', data: panchayats });
  } catch (err) { next(err); }
};

/**
 * Get PACS for a block.
 */
const getPacs = async (req, res, next) => {
  try {
    const db = require('../../../shared/models');
    const pacs = await db.PacsRegistry.findAll({
      where: { lgd_block_id: parseInt(req.params.blockId), is_active: true },
      order: [['pacs_name', 'ASC']],
    });
    return success(res, { message: 'PACS retrieved', data: pacs });
  } catch (err) { next(err); }
};

/**
 * Reverse geocode: find nearest village from GPS coordinates.
 * Uses Haversine formula to find closest village by lat/lng.
 */
const reverseGeocode = async (req, res, next) => {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng) return res.status(400).json({ success: false, message: 'lat and lng are required' });

    const db = require('../../../shared/models');
    const { sequelize } = db;

    // Find nearest village with coordinates using Haversine distance
    const [results] = await sequelize.query(`
      SELECT v.id, v.village_name, v.village_name_en, v.village_code,
             v.latitude, v.longitude,
             b.id as block_id, b.block_name,
             d.id as district_id, d.district_name,
             s.id as state_id, s.state_name,
             (6371 * acos(cos(radians(:lat)) * cos(radians(v.latitude))
              * cos(radians(v.longitude) - radians(:lng))
              + sin(radians(:lat)) * sin(radians(v.latitude)))) AS distance_km
      FROM lgd_villages v
      JOIN lgd_blocks b ON v.block_id = b.id
      JOIN lgd_districts d ON b.district_id = d.id
      JOIN lgd_states s ON d.state_id = s.id
      WHERE v.latitude IS NOT NULL AND v.longitude IS NOT NULL AND v.is_active = 1
      ORDER BY distance_km ASC
      LIMIT 1
    `, { replacements: { lat: parseFloat(lat), lng: parseFloat(lng) } });

    if (results.length === 0) {
      return res.status(404).json({ success: false, message: 'No villages found near coordinates' });
    }

    return success(res, { message: 'Reverse geocode result', data: results[0] });
  } catch (err) { next(err); }
};

module.exports = { getStates, getDistricts, getBlocks, getVillages, searchVillages, getHierarchy, getPanchayats, getPacs, reverseGeocode };
