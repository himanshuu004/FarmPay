/**
 * Dairy Routes
 * Herd management, animal tracking, health records, and production summaries.
 *
 * @swagger
 * tags:
 *   name: ROOTS Dairy
 *   description: Dairy herd and milk production management
 */

const express = require('express');
const router = express.Router();

const dairyController = require('../controllers/dairyController');
const validate = require('../../../middleware/validate');
const { authenticate } = require('../../../middleware/auth');
const roleCheck = require('../../../middleware/roleCheck');
const {
  createHerdSchema,
  addAnimalSchema,
  addHealthRecordSchema,
  getProductionSchema,
} = require('../validators/dairyValidator');

router.use(authenticate);
router.use(roleCheck('FARMER', 'AGENT', 'ADMIN'));

/**
 * @swagger
 * /roots/dairy/herd:
 *   post:
 *     tags: [ROOTS Dairy]
 *     summary: Create a new dairy herd register
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [herdName]
 *             properties:
 *               herdName:
 *                 type: string
 *                 example: "My Dairy Farm"
 *     responses:
 *       201: { description: Herd created }
 */
router.post('/herd', validate(createHerdSchema), dairyController.createHerd);

/**
 * @swagger
 * /roots/dairy/herd/{herdId}/animals:
 *   post:
 *     tags: [ROOTS Dairy]
 *     summary: Add an animal to a herd
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Animal added }
 */
router.post('/herd/:herdId/animals', validate(addAnimalSchema), dairyController.addAnimal);

/**
 * @swagger
 * /roots/dairy/animals/{animalId}/health:
 *   post:
 *     tags: [ROOTS Dairy]
 *     summary: Record animal health check
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Health record created }
 */
router.post('/animals/:animalId/health', validate(addHealthRecordSchema), dairyController.addHealthRecord);

/**
 * @swagger
 * /roots/dairy/herd/{herdId}/production:
 *   get:
 *     tags: [ROOTS Dairy]
 *     summary: Get monthly herd production summary
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: month
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: year
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Production summary with income/expense/profit }
 */
router.get('/herd/:herdId/production', validate(getProductionSchema, 'query'), dairyController.getHerdProduction);

module.exports = router;
