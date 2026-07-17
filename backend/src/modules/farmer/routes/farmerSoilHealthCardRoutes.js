/**
 * Farmer Soil Health Card Routes
 *
 * @swagger
 * tags:
 *   name: Farmer SHC
 *   description: Per-farmer Soil Health Card capture and edit
 */

const express = require('express');
const router = express.Router();

const { authenticate } = require('../../../middleware/auth');
const { uploadImage } = require('../../../middleware/upload');
const controller = require('../controllers/farmerSoilHealthCardController');

router.use(authenticate);

/**
 * @swagger
 * /farmer/soil-health-card:
 *   post:
 *     tags: [Farmer SHC]
 *     summary: Upsert the farmer's soil health card (one per farmer)
 *     description: |
 *       Multipart form-data. Optional `photo` field (image), plus structured
 *       chemistry and GPS fields. Sets farmer_profiles.shc_status = captured.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: SHC saved }
 */
router.post('/soil-health-card', uploadImage, controller.upsert);

/**
 * @swagger
 * /farmer/soil-health-card/me:
 *   get:
 *     tags: [Farmer SHC]
 *     summary: Get the current farmer's soil health card
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: SHC or null }
 */
router.get('/soil-health-card/me', controller.getMine);

/**
 * @swagger
 * /farmer/soil-health-card/skip:
 *   post:
 *     tags: [Farmer SHC]
 *     summary: Mark SHC capture as skipped (onboarding "Skip for now")
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Skipped }
 */
router.post('/soil-health-card/skip', controller.skip);

module.exports = router;
