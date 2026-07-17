/**
 * Location Routes
 * Public endpoints for India's LGD geographic hierarchy.
 * All endpoints are public — no authentication required.
 * Supports X-Language header for multi-language responses.
 *
 * @swagger
 * tags:
 *   name: Location
 *   description: India LGD geographic hierarchy (states, districts, blocks, villages)
 */

const express = require('express');
const router = express.Router();
const locationController = require('../controllers/locationController');

/**
 * @swagger
 * /location/states:
 *   get:
 *     tags: [Location]
 *     summary: Get all Indian states and union territories
 *     parameters:
 *       - in: header
 *         name: X-Language
 *         schema: { type: string, default: en }
 *         description: Language code for translated names (en, hi, bn, te, etc.)
 *     responses:
 *       200: { description: List of states }
 */
router.get('/states', locationController.getStates);

/**
 * @swagger
 * /location/states/{stateId}/districts:
 *   get:
 *     tags: [Location]
 *     summary: Get all districts in a state
 *     parameters:
 *       - in: path
 *         name: stateId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: List of districts }
 */
router.get('/states/:stateId/districts', locationController.getDistricts);

/**
 * @swagger
 * /location/districts/{districtId}/blocks:
 *   get:
 *     tags: [Location]
 *     summary: Get all blocks in a district
 *     parameters:
 *       - in: path
 *         name: districtId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: List of blocks }
 */
router.get('/districts/:districtId/blocks', locationController.getBlocks);

/**
 * @swagger
 * /location/blocks/{blockId}/villages:
 *   get:
 *     tags: [Location]
 *     summary: Get all villages in a block
 *     parameters:
 *       - in: path
 *         name: blockId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: List of villages }
 */
router.get('/blocks/:blockId/villages', locationController.getVillages);

/**
 * @swagger
 * /location/search:
 *   get:
 *     tags: [Location]
 *     summary: Search villages by name
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string }
 *         description: Search term (min 2 characters)
 *       - in: query
 *         name: stateId
 *         schema: { type: integer }
 *       - in: query
 *         name: districtId
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Search results with hierarchy }
 */
router.get('/search', locationController.searchVillages);

/**
 * @swagger
 * /location/hierarchy/{stateId}/{districtId}/{blockId}/{villageId}:
 *   get:
 *     tags: [Location]
 *     summary: Get full hierarchy chain for a location
 *     parameters:
 *       - in: path
 *         name: stateId
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: districtId
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: blockId
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: villageId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Full hierarchy with state, district, block, village }
 */
router.get('/hierarchy/:stateId/:districtId/:blockId/:villageId', locationController.getHierarchy);

// ── Panchayat & PACS Routes (Identity Architecture) ──

/**
 * @swagger
 * /location/blocks/{blockId}/panchayats:
 *   get:
 *     tags: [Location]
 *     summary: Get all gram panchayats in a block
 *     parameters:
 *       - in: path
 *         name: blockId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: List of panchayats }
 */
router.get('/blocks/:blockId/panchayats', locationController.getPanchayats);

/**
 * @swagger
 * /location/blocks/{blockId}/pacs:
 *   get:
 *     tags: [Location]
 *     summary: Get PACS (Primary Agricultural Credit Societies) in a block
 *     parameters:
 *       - in: path
 *         name: blockId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: List of PACS }
 */
router.get('/blocks/:blockId/pacs', locationController.getPacs);

/**
 * @swagger
 * /location/reverse-geocode:
 *   get:
 *     tags: [Location]
 *     summary: Reverse geocode GPS coordinates to LGD hierarchy
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema: { type: number }
 *       - in: query
 *         name: lng
 *         required: true
 *         schema: { type: number }
 *     responses:
 *       200: { description: Nearest village with full LGD hierarchy }
 */
router.get('/reverse-geocode', locationController.reverseGeocode);

module.exports = router;
