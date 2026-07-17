/**
 * Compliance Routes
 * Consent management, grievance handling, fee disclosure, and cooling-off checks.
 *
 * @swagger
 * tags:
 *   name: Compliance
 *   description: Regulatory compliance, consent management, and grievance redressal
 */

const express = require('express');
const router = express.Router();

const complianceController = require('../controllers/complianceController');
const validate = require('../../../middleware/validate');
const { authenticate } = require('../../../middleware/auth');
const {
  recordConsentSchema,
  withdrawConsentSchema,
  fileGrievanceSchema,
} = require('../validators/complianceValidator');

/**
 * @swagger
 * /compliance/fee-disclosure/{productId}:
 *   get:
 *     tags: [Compliance]
 *     summary: Get fee disclosure for a loan product (public)
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Fee schedule with processing fees and interest rates }
 */
// NOTE: fee-disclosure and cooling-off endpoints removed — they reference the
// out-of-scope LoanProduct / loan-application models (loan origination is not in
// this platform, CLAUDE.md OUT OF SCOPE). The in-scope compliance surface is DPDP
// consent + grievance.

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /compliance/consent:
 *   post:
 *     tags: [Compliance]
 *     summary: Record farmer consent
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [consentType, version]
 *             properties:
 *               consentType: { type: string, enum: [kyc, lending, data_processing, marketing, insurance] }
 *               version: { type: string }
 *     responses:
 *       201: { description: Consent recorded }
 */
router.post('/consent', validate(recordConsentSchema), complianceController.recordConsent);

/**
 * @swagger
 * /compliance/consent/{consentType}:
 *   delete:
 *     tags: [Compliance]
 *     summary: Withdraw consent by type
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: consentType
 *         required: true
 *         schema: { type: string, enum: [kyc, lending, data_processing, marketing, insurance] }
 *     responses:
 *       200: { description: Consent withdrawn }
 */
router.delete('/consent/:consentType', validate(withdrawConsentSchema, 'params'), complianceController.withdrawConsent);

/**
 * @swagger
 * /compliance/consent:
 *   get:
 *     tags: [Compliance]
 *     summary: Get consent status for all types
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Array of consent statuses by type }
 */
router.get('/consent', complianceController.getConsentStatus);

/**
 * @swagger
 * /compliance/grievance:
 *   post:
 *     tags: [Compliance]
 *     summary: File a new grievance
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category, description]
 *             properties:
 *               category: { type: string, enum: [service_quality, fee_dispute, loan_denial, disclosure_issue, repayment_issue, data_privacy, other] }
 *               description: { type: string, minLength: 10 }
 *               priority: { type: string, enum: [low, medium, high, critical] }
 *     responses:
 *       201: { description: Grievance filed }
 */
router.post('/grievance', validate(fileGrievanceSchema), complianceController.fileGrievance);

/**
 * @swagger
 * /compliance/grievance:
 *   get:
 *     tags: [Compliance]
 *     summary: List all grievances for authenticated farmer
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Array of grievances }
 */
router.get('/grievance', complianceController.listGrievances);

/**
 * @swagger
 * /compliance/grievance/{grievanceId}:
 *   get:
 *     tags: [Compliance]
 *     summary: Get grievance status by UUID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: grievanceId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Grievance details }
 */
router.get('/grievance/:grievanceId', complianceController.getGrievanceStatus);

/**
 * @swagger
 * /compliance/cooling-off/{applicationId}:
 *   get:
 *     tags: [Compliance]
 *     summary: Check cooling-off period for a loan application
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: applicationId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Cooling-off status with deadline and days remaining }
 */
module.exports = router;
