/**
 * Farmer Routes
 * Profile, onboarding, addresses, bank accounts, and preferences.
 * All routes require authentication.
 *
 * @swagger
 * tags:
 *   name: Farmer
 *   description: Farmer profile management and onboarding
 */

const express = require('express');
const router = express.Router();

const farmerController = require('../controllers/farmerController');
const subController = require('../controllers/activitySubscriptionController');
const subtypeController = require('../controllers/activitySubtypeController');
const loanLinkController = require('../controllers/loanLinkController');
const { upsertSubtypesSchema } = require('../validators/activitySubtypeValidator');
const validate = require('../../../middleware/validate');
const { authenticate } = require('../../../middleware/auth');
const roleCheck = require('../../../middleware/roleCheck');
const {
  onboardingStep1Schema,
  onboardingStep2Schema,
  onboardingStep3Schema,
  onboardingStep4Schema,
  updateProfileSchema,
  createAddressSchema,
  createBankAccountSchema,
  updateBankAccountSchema,
  updatePreferencesSchema,
} = require('../validators/farmerValidator');
const {
  bulkSubscribeSchema,
  updateSubscriptionSchema,
  dropSubscriptionSchema,
  refreshHealthSchema,
  listQuerySchema,
} = require('../validators/activitySubscriptionValidator');

// All farmer routes require authentication
router.use(authenticate);
router.use(roleCheck('FARMER', 'ADMIN'));

// ─── Onboarding ────────────────────────────────────────────────────

/**
 * @swagger
 * /farmer/onboarding/step1:
 *   post:
 *     tags: [Farmer]
 *     summary: "Onboarding Step 1: Personal information"
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, dateOfBirth, gender]
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               dateOfBirth: { type: string, format: date }
 *               gender: { type: string, enum: [male, female, other] }
 *               fatherName: { type: string }
 *               motherName: { type: string }
 *               educationLevel: { type: string }
 *               maritalStatus: { type: string }
 *     responses:
 *       201: { description: Personal info saved }
 */
router.post('/onboarding/step1', validate(onboardingStep1Schema), farmerController.onboardingStep1);

/**
 * @swagger
 * /farmer/onboarding/step2:
 *   post:
 *     tags: [Farmer]
 *     summary: "Onboarding Step 2: Contact & KYC"
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Contact and KYC saved }
 */
router.post('/onboarding/step2', validate(onboardingStep2Schema), farmerController.onboardingStep2);

/**
 * @swagger
 * /farmer/onboarding/step3:
 *   post:
 *     tags: [Farmer]
 *     summary: "Onboarding Step 3: Location"
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Location saved }
 */
router.post('/onboarding/step3', validate(onboardingStep3Schema), farmerController.onboardingStep3);

/**
 * @swagger
 * /farmer/onboarding/step4:
 *   post:
 *     tags: [Farmer]
 *     summary: "Onboarding Step 4: Bank account (completes onboarding)"
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Bank account saved, onboarding complete }
 */
router.post('/onboarding/step4', validate(onboardingStep4Schema), farmerController.onboardingStep4);

// ─── My Activities (Multi-Persona) ─────────────────────────────────

/**
 * @swagger
 * /farmer/my-activities:
 *   get:
 *     tags: [Farmer]
 *     summary: Get farmer income activities and persona classification
 *     description: Returns active income streams, persona type, and total income for dynamic farm tab rendering
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Farmer activities and persona
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 activities: { type: array, items: { type: string }, example: ["crop", "dairy"] }
 *                 persona: { type: string, example: "double_income" }
 *                 totalAnnualIncome: { type: number, example: 420000 }
 */
router.get('/my-activities', farmerController.getMyActivities);

// ─── Activity Subscriptions (canonical lifecycle table) ────────────

/**
 * @swagger
 * /farmer/activity-subscriptions:
 *   get:
 *     tags: [Farmer]
 *     summary: List farmer's activity subscriptions
 *     description: |
 *       Returns ACTIVE + PAUSED rows by default. Pass `includeDropped=true`
 *       or `status=DROPPED` to see history. Ordered by `priority_rank ASC`.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ACTIVE, PAUSED, DROPPED] }
 *       - in: query
 *         name: includeDropped
 *         schema: { type: boolean }
 *     responses:
 *       200: { description: Subscriptions list }
 *   post:
 *     tags: [Farmer]
 *     summary: Bulk subscribe (onboarding wizard)
 *     description: |
 *       Idempotent — existing rows for the same (farmer, activity_code)
 *       are reactivated, not duplicated. Used by the persona onboarding
 *       wizard right after first login.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [items]
 *             properties:
 *               source:
 *                 type: string
 *                 enum: [FARMER_DECLARED, AGENT_VERIFIED]
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [activityCode]
 *                   properties:
 *                     activityCode:
 *                       type: string
 *                       enum: [CROP, DAIRY, FISHERY, HORTI, POULTRY, GOATERY, LABOUR_WAGE, SHOP_BUSINESS, REMITTANCE, OTHER]
 *                     tier: { type: string, enum: [SMALL, MEDIUM, LARGE] }
 *                     priorityRank: { type: integer, minimum: 1, maximum: 99 }
 *                     notes: { type: string }
 *     responses:
 *       201: { description: Subscriptions created/reactivated }
 */
router.get(
  '/activity-subscriptions',
  validate(listQuerySchema, 'query'),
  subController.list
);
router.post(
  '/activity-subscriptions',
  validate(bulkSubscribeSchema),
  subController.bulkSubscribe
);

/**
 * @swagger
 * /farmer/activity-subscriptions/{subscriptionId}:
 *   patch:
 *     tags: [Farmer]
 *     summary: Update tier / priority / status / notes
 *     description: Use POST .../drop to terminate; this endpoint only
 *                  toggles between ACTIVE and PAUSED.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: subscriptionId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Updated }
 */
router.patch(
  '/activity-subscriptions/:subscriptionId',
  validate(updateSubscriptionSchema),
  subController.update
);

/**
 * @swagger
 * /farmer/activity-subscriptions/{subscriptionId}/drop:
 *   post:
 *     tags: [Farmer]
 *     summary: Drop a subscription (status → DROPPED)
 *     description: Preserves the row for history; TRUST/DICE care about exits.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: subscriptionId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Dropped }
 */
router.post(
  '/activity-subscriptions/:subscriptionId/drop',
  validate(dropSubscriptionSchema),
  subController.drop
);

/**
 * @swagger
 * /farmer/activity-subscriptions/{subscriptionId}/health:
 *   post:
 *     tags: [Farmer]
 *     summary: Refresh the health snapshot for a subscription
 *     description: Called by ROOTS / DICE jobs and agent visits.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: subscriptionId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [GREEN, AMBER, RED, UNKNOWN]
 *     responses:
 *       200: { description: Health updated }
 */
router.post(
  '/activity-subscriptions/:subscriptionId/health',
  validate(refreshHealthSchema),
  subController.refreshHealth
);

/**
 * @swagger
 * /farmer/activity-subtypes:
 *   get:
 *     tags: [Farmer]
 *     summary: List the farmer's active sub-type selections per activity
 *     description: |
 *       Returns active sub-type codes keyed by activity (CROP / HORTI /
 *       POULTRY / GOATERY) plus the shared catalog so the picker UI can
 *       render without a second round-trip. DAIRY / FISHERY are not
 *       present because their sub-dimension lives in their profile tables.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Active subtypes + catalog }
 *   post:
 *     tags: [Farmer]
 *     summary: Upsert the farmer's sub-type selections for a single activity
 *     description: |
 *       Bulk upsert semantics: incoming codes are activated, omitted codes
 *       are soft-deleted. If the farmer has no active subscription for this
 *       activity, one is auto-created. Requires at least 1 valid subtype.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [activityCode, subtypeCodes]
 *             properties:
 *               activityCode:
 *                 type: string
 *                 enum: [CROP, HORTI, POULTRY, GOATERY]
 *               subtypeCodes:
 *                 type: array
 *                 items: { type: string }
 *                 minItems: 1
 *     responses:
 *       200: { description: Subtypes updated }
 */
router.get('/activity-subtypes', subtypeController.list);
router.post('/activity-subtypes', validate(upsertSubtypesSchema), subtypeController.upsert);

/**
 * @swagger
 * /farmer/my-activities-v2:
 *   get:
 *     tags: [Farmer]
 *     summary: Persona + streams sourced from activity subscriptions
 *     description: |
 *       New canonical endpoint replacing /farmer/my-activities. Reads from
 *       farmer_activity_subscriptions and joins income amounts from
 *       FarmerIncomeStream. Returns `hasSubscriptions=false` for first-time
 *       users so the mobile app can route to the onboarding wizard.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Activities, persona, and income streams }
 */
router.get('/my-activities-v2', subController.getActivitiesWithPersona);

// ─── Bank loan linkage (May 2026 pilot — WS6.2) ─────────────────
// Two-step flow: (1) list unlinked bank_loan_accounts matching the
// farmer's mobile or aadhaar-last-4, (2) confirm the selected UUIDs
// to stamp linked_farmer_id. Used by field agents during onboarding
// and by farmers who discover an un-linked loan later.
router.post('/link-loan-account/candidates', loanLinkController.listCandidates);
router.post('/link-loan-account/confirm', loanLinkController.confirmLink);

// ─── Profile ────────────────────────────────────────────────────────

/**
 * @swagger
 * /farmer/profile:
 *   get:
 *     tags: [Farmer]
 *     summary: Get farmer profile with addresses, bank accounts, and preferences
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Full farmer profile }
 *   put:
 *     tags: [Farmer]
 *     summary: Update farmer profile fields
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Profile updated }
 */
router.get('/profile', farmerController.getProfile);
router.put('/profile', validate(updateProfileSchema), farmerController.updateProfile);

// ─── Addresses ──────────────────────────────────────────────────────

/**
 * @swagger
 * /farmer/addresses:
 *   get:
 *     tags: [Farmer]
 *     summary: Get all farmer addresses
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of addresses }
 *   post:
 *     tags: [Farmer]
 *     summary: Add a new address
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Address created }
 */
router.get('/addresses', farmerController.getAddresses);
router.post('/addresses', validate(createAddressSchema), farmerController.createAddress);

// ─── Bank Accounts ──────────────────────────────────────────────────

/**
 * @swagger
 * /farmer/bank-accounts:
 *   get:
 *     tags: [Farmer]
 *     summary: Get all bank accounts (masked account numbers)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of bank accounts }
 *   post:
 *     tags: [Farmer]
 *     summary: Add a new bank account
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Bank account added }
 */
router.get('/bank-accounts', farmerController.getBankAccounts);
router.post('/bank-accounts', validate(createBankAccountSchema), farmerController.createBankAccount);

/**
 * @swagger
 * /farmer/bank-accounts/{accountId}:
 *   put:
 *     tags: [Farmer]
 *     summary: Update bank account (e.g. set as primary)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Bank account updated }
 */
router.put('/bank-accounts/:accountId', validate(updateBankAccountSchema), farmerController.updateBankAccount);

// ─── Preferences ────────────────────────────────────────────────────

/**
 * @swagger
 * /farmer/preferences:
 *   get:
 *     tags: [Farmer]
 *     summary: Get activity and language preferences
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Preferences retrieved }
 *   put:
 *     tags: [Farmer]
 *     summary: Update activity preferences
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Preferences updated }
 */
router.get('/preferences', farmerController.getPreferences);
router.put('/preferences', validate(updatePreferencesSchema), farmerController.updatePreferences);

// ── Identity & Address Architecture Routes ──

// Borrowing Sources
const borrowingController = require('../controllers/borrowingSourceController');
const {
  addBorrowingSourceSchema,
  updateBorrowingSourceSchema,
} = require('../validators/borrowingSourceValidator');

router.get('/borrowing-sources', borrowingController.getBorrowingSources);
router.get('/borrowing-summary', borrowingController.getBorrowingSummary);
router.post('/borrowing-sources', validate(addBorrowingSourceSchema), borrowingController.addBorrowingSource);
router.put('/borrowing-sources/:id', validate(updateBorrowingSourceSchema), borrowingController.updateBorrowingSource);
router.delete('/borrowing-sources/:id', borrowingController.removeBorrowingSource);
router.get('/borrowing-sources/bank-accounts', borrowingController.getActiveBankAccounts);

// Entity Codebook (unified mapping hub)
const codebookController = require('../controllers/codebookController');
router.get('/codebook', codebookController.getCodebook);
router.post('/entity-mapping', codebookController.addEntityMapping);
router.post('/entity-mapping/infer', codebookController.inferMappings);

// Validation Summary
const validationController = require('../controllers/validationController');
router.get('/validation-summary', validationController.getValidationSummary);
router.get('/validation-gaps', validationController.getValidationGaps);

// Address History
router.get('/address-history/:addressId', farmerController.getAddressHistory);

module.exports = router;
