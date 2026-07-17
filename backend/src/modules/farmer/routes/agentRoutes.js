/**
 * Agent Routes
 * Field agent endpoints for farmer assignment and listing.
 * All routes require authentication and AGENT role.
 *
 * @swagger
 * tags:
 *   name: Agent
 *   description: Field agent farmer management
 */

const express = require('express');
const router = express.Router();

const agentController = require('../controllers/agentController');
const validate = require('../../../middleware/validate');
const { authenticate } = require('../../../middleware/auth');
const roleCheck = require('../../../middleware/roleCheck');
const { assignFarmerSchema } = require('../validators/farmerValidator');

// All agent routes require authentication + AGENT or ADMIN role
router.use(authenticate);
router.use(roleCheck('AGENT', 'ADMIN', 'SYSTEM_OPERATOR'));

/**
 * @swagger
 * /agent/assign-farmer:
 *   post:
 *     tags: [Agent]
 *     summary: Assign a farmer to this agent
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [farmerId]
 *             properties:
 *               farmerId: { type: integer }
 *               reason: { type: string }
 *     responses:
 *       201: { description: Farmer assigned }
 *       403: { description: Agent profile not found }
 */
router.post('/assign-farmer', validate(assignFarmerSchema), agentController.assignFarmer);

/**
 * @swagger
 * /agent/assigned-farmers:
 *   get:
 *     tags: [Agent]
 *     summary: Get paginated list of assigned farmers
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: List of assigned farmers with pagination }
 */
router.get('/assigned-farmers', agentController.getAssignedFarmers);

module.exports = router;
