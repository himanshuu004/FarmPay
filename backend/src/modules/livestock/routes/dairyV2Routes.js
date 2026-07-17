/**
 * Dairy v2 Routes — financial logbook
 * Mounted under /api/v1/roots/dairy/v2 by the dairy module index.
 *
 * @swagger
 * tags:
 *   name: ROOTS Dairy v2
 *   description: Dairy financial logbook (hybrid allocation, manual entry, tiered UX)
 */

const express = require('express');
const multer = require('multer');
const router = express.Router();

const c = require('../controllers/dairyV2Controller');
const validate = require('../../../middleware/validate');
const { authenticate } = require('../../../middleware/auth');
const v = require('../validators/dairyV2Validator');

// multer: memory storage — photoService handles disk write via sharp
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB cap
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image uploads allowed'));
  },
});

router.use(authenticate);

// --------- Profile ---------
/**
 * @swagger
 * /roots/dairy/v2/profile:
 *   post: { tags: [ROOTS Dairy v2], summary: Create/update dairy profile, security: [{ bearerAuth: [] }] }
 *   get:  { tags: [ROOTS Dairy v2], summary: Get dairy profile, security: [{ bearerAuth: [] }] }
 */
router.post('/profile', validate(v.upsertProfileSchema), c.upsertProfile);
router.get('/profile', c.getProfile);

// --------- Animals ---------
/**
 * @swagger
 * /roots/dairy/v2/animals:
 *   post: { tags: [ROOTS Dairy v2], summary: Add an animal, security: [{ bearerAuth: [] }] }
 *   get:  { tags: [ROOTS Dairy v2], summary: List animals, security: [{ bearerAuth: [] }] }
 */
router.post('/animals', validate(v.addAnimalV2Schema), c.addAnimal);
router.get('/animals', c.listAnimals);
router.get('/animals/:animalUuid', c.getAnimal);
router.patch('/animals/:animalUuid', validate(v.updateAnimalSchema), c.updateAnimal);
router.post('/animals/:animalUuid/exit', validate(v.exitAnimalSchema), c.exitAnimal);

// --------- Animal photos ---------
router.post(
  '/animals/:animalUuid/photos',
  upload.single('photo'),
  c.uploadAnimalPhoto,
);
router.get('/animals/:animalUuid/photos', c.listAnimalPhotos);
router.get('/animals/:animalUuid/photos/:photoUuid', c.getAnimalPhotoFile);

// --------- Cost events ---------
router.post('/cost-events', validate(v.createCostEventSchema), c.createCostEvent);
router.get('/cost-events', c.listCostEvents);
router.get('/cost-events/pending', c.listPendingEvents);
router.post(
  '/cost-events/:eventUuid/confirm',
  validate(v.confirmPendingEventSchema),
  c.confirmPendingEvent,
);

// --------- Revenue events ---------
router.post('/revenue-events', validate(v.createRevenueEventSchema), c.createRevenueEvent);
router.get('/revenue-events', c.listRevenueEvents);

// --------- Breeding ---------
router.post('/breeding', validate(v.createBreedingEventSchema), c.createBreedingEvent);
router.get('/breeding', c.listBreedingEvents);
router.post(
  '/breeding/:eventUuid/pregnancy',
  validate(v.updatePregnancySchema),
  c.updatePregnancy,
);
router.post(
  '/breeding/:eventUuid/calving',
  validate(v.recordCalvingSchema),
  c.recordCalving,
);

// --------- Treatment ---------
router.post('/treatment', validate(v.createTreatmentEventSchema), c.createTreatmentEvent);
router.get('/treatment', c.listTreatmentEvents);

// --------- Recurring templates ---------
router.post('/recurring', validate(v.createTemplateSchema), c.createTemplate);
router.get('/recurring', c.listTemplates);
router.delete('/recurring/:templateUuid', c.deleteTemplate);

// --------- Weekly summary (Large tier bulk entry) ---------
router.post('/weekly', validate(v.upsertWeeklySummarySchema), c.upsertWeeklySummary);
router.get('/weekly', c.listWeeklySummaries);
router.post('/weekly/:summaryUuid/finalize', c.finalizeWeek);

// --------- P&L (hybrid allocation engine) ---------
/**
 * @swagger
 * /roots/dairy/v2/pnl/herd:
 *   get:
 *     tags: [ROOTS Dairy v2]
 *     summary: Get herd-level P&L for a date range
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema: { type: string, format: date }
 */
router.get('/pnl/herd', validate(v.pnlQuerySchema, 'query'), c.getHerdPnl);
router.get('/pnl/per-animal', validate(v.pnlQuerySchema, 'query'), c.getPerAnimalPnl);

// --------- Persona phase: aggregate herd save-and-lock ---------
router.post('/herd/aggregate', c.saveAggregateHerd);
router.get('/herd/summary', c.getHerdSummary);

module.exports = router;
