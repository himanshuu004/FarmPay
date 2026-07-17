/**
 * PoP Routes — mounted at /farmer/pop.
 *
 * All routes require authentication. Template reads are cheap and
 * cache-friendly; progress reads are per-farmer and live.
 */

const express = require('express');
const router = express.Router();

const popController = require('../controllers/popController');
const validate = require('../../../middleware/validate');
const { authenticate } = require('../../../middleware/auth');
const {
  activityCodeParamSchema,
  subtypeQuerySchema,
  enterTouchpointSchema,
} = require('../validators/popValidator');

router.use(authenticate);

/**
 * @swagger
 * /farmer/pop/{activityCode}/template:
 *   get:
 *     tags: [PoP]
 *     summary: Get stages + touchpoints for an activity
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: activityCode, required: true, schema: { type: string } }
 */
router.get(
  '/:activityCode/template',
  validate(activityCodeParamSchema, 'params'),
  validate(subtypeQuerySchema, 'query'),
  popController.getTemplate
);

/**
 * @swagger
 * /farmer/pop/{activityCode}/progress:
 *   get:
 *     tags: [PoP]
 *     summary: Get template joined with per-farmer progress
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/:activityCode/progress',
  validate(activityCodeParamSchema, 'params'),
  validate(subtypeQuerySchema, 'query'),
  popController.getProgress
);

/**
 * @swagger
 * /farmer/pop/{activityCode}/touchpoints:
 *   post:
 *     tags: [PoP]
 *     summary: Upsert a per-farmer touchpoint entry
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/:activityCode/touchpoints',
  validate(activityCodeParamSchema, 'params'),
  validate(enterTouchpointSchema),
  popController.enterTouchpoint
);

module.exports = router;
