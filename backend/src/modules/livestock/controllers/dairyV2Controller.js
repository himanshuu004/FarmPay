/**
 * Dairy v2 Controller — financial logbook
 * Thin HTTP layer over the v2 service modules. Resolves the internal numeric
 * farmerId (users.id) from the JWT's business user_id and delegates.
 */

const fs = require('fs');
const { success } = require('../../../shared/utils/responseHelper');
const { User } = require('../../../shared/models');

const profileService = require('../services/dairyProfileService');
const animalService = require('../services/dairyAnimalV2Service');
const photoService = require('../services/dairyAnimalPhotoService');
const costService = require('../services/dairyCostEventService');
const revenueService = require('../services/dairyRevenueEventService');
const breedingService = require('../services/dairyBreedingEventService');
const treatmentService = require('../services/dairyTreatmentEventService');
const recurringService = require('../services/dairyRecurringService');
const weeklyService = require('../services/dairyWeeklySummaryService');
const pnlService = require('../services/dairyPnlService');
const aggregateService = require('../services/dairyAggregateService');

const resolveFarmerId = async (req) => {
  const user = await User.findOne({ where: { user_id: req.user.id, is_active: true } });
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    err.errorCode = 'RES_001';
    throw err;
  }
  return user.id;
};

// ---------- Persona phase: aggregate herd save-and-lock ----------
/**
 * POST /roots/dairy/v2/herd/aggregate
 * Body: { cows, buffaloes, mixed, avgDailyMilkLiters }
 * Creates N placeholder rows in dairy_animals and flips the farmer's
 * DAIRY activity subscription setup_complete = true.
 */
const saveAggregateHerd = async (req, res, next) => {
  try {
    const farmerId = await resolveFarmerId(req);
    const result = await aggregateService.saveAggregateHerd(farmerId, req.body || {});
    return success(res, { message: 'Dairy herd aggregate saved', data: result, statusCode: 201 });
  } catch (err) { next(err); }
};

/**
 * GET /roots/dairy/v2/herd/summary — edit-mode prefill for setup-dairy.tsx.
 */
const getHerdSummary = async (req, res, next) => {
  try {
    const farmerId = await resolveFarmerId(req);
    const result = await aggregateService.getHerdSummary(farmerId);
    return success(res, { message: 'Herd summary', data: result });
  } catch (err) { next(err); }
};

// ---------- Profile ----------
const upsertProfile = async (req, res, next) => {
  try {
    const farmerId = await resolveFarmerId(req);
    const profile = await profileService.upsertProfile(farmerId, req.body);
    return success(res, { message: 'Dairy profile saved', data: profile, statusCode: 201 });
  } catch (err) { next(err); }
};

const getProfile = async (req, res, next) => {
  try {
    const farmerId = await resolveFarmerId(req);
    const profile = await profileService.getProfile(farmerId);
    return success(res, { message: 'Dairy profile retrieved', data: profile });
  } catch (err) { next(err); }
};

// ---------- Animals ----------
const addAnimal = async (req, res, next) => {
  try {
    const farmerId = await resolveFarmerId(req);
    const animal = await animalService.addAnimal(farmerId, req.body);
    return success(res, { message: 'Animal added', data: animal, statusCode: 201 });
  } catch (err) { next(err); }
};

const listAnimals = async (req, res, next) => {
  try {
    const farmerId = await resolveFarmerId(req);
    const animals = await animalService.listAnimals(farmerId, req.query);
    return success(res, { message: 'Animals retrieved', data: animals });
  } catch (err) { next(err); }
};

const getAnimal = async (req, res, next) => {
  try {
    const farmerId = await resolveFarmerId(req);
    const animal = await animalService.getAnimal(farmerId, req.params.animalUuid);
    return success(res, { message: 'Animal retrieved', data: animal });
  } catch (err) { next(err); }
};

const updateAnimal = async (req, res, next) => {
  try {
    const farmerId = await resolveFarmerId(req);
    const animal = await animalService.updateAnimal(farmerId, req.params.animalUuid, req.body);
    return success(res, { message: 'Animal updated', data: animal });
  } catch (err) { next(err); }
};

const exitAnimal = async (req, res, next) => {
  try {
    const farmerId = await resolveFarmerId(req);
    const animal = await animalService.exitAnimal(farmerId, req.params.animalUuid, req.body);
    return success(res, { message: 'Animal exited', data: animal });
  } catch (err) { next(err); }
};

// ---------- Photos ----------
const uploadAnimalPhoto = async (req, res, next) => {
  try {
    const farmerId = await resolveFarmerId(req);
    if (!req.file) {
      const err = new Error('No photo file uploaded (field: photo)');
      err.statusCode = 400;
      err.errorCode = 'VAL_001';
      throw err;
    }
    // multer body fields are strings; coerce isPrimary
    const meta = {
      photoType: req.body.photoType,
      caption: req.body.caption,
      takenAt: req.body.takenAt,
      isPrimary: req.body.isPrimary === 'true' || req.body.isPrimary === true,
      uploadedVia: req.body.uploadedVia,
    };
    const photo = await photoService.uploadPhoto(farmerId, req.params.animalUuid, req.file, meta);
    return success(res, { message: 'Photo uploaded', data: photo, statusCode: 201 });
  } catch (err) { next(err); }
};

const listAnimalPhotos = async (req, res, next) => {
  try {
    const farmerId = await resolveFarmerId(req);
    const photos = await photoService.listPhotos(farmerId, req.params.animalUuid);
    return success(res, { message: 'Photos retrieved', data: photos });
  } catch (err) { next(err); }
};

const getAnimalPhotoFile = async (req, res, next) => {
  try {
    const farmerId = await resolveFarmerId(req);
    const filePath = await photoService.getPhotoFilePath(
      farmerId, req.params.animalUuid, req.params.photoUuid,
    );
    if (!fs.existsSync(filePath)) {
      const err = new Error('Photo file missing from disk');
      err.statusCode = 404;
      err.errorCode = 'RES_001';
      throw err;
    }
    res.type('image/jpeg');
    return fs.createReadStream(filePath).pipe(res);
  } catch (err) { next(err); }
};

// ---------- Cost events ----------
const createCostEvent = async (req, res, next) => {
  try {
    const farmerId = await resolveFarmerId(req);
    const event = await costService.createCostEvent(farmerId, req.body);
    return success(res, { message: 'Cost event logged', data: event, statusCode: 201 });
  } catch (err) { next(err); }
};

const listCostEvents = async (req, res, next) => {
  try {
    const farmerId = await resolveFarmerId(req);
    const events = await costService.listCostEvents(farmerId, req.query);
    return success(res, { message: 'Cost events retrieved', data: events });
  } catch (err) { next(err); }
};

const listPendingEvents = async (req, res, next) => {
  try {
    const farmerId = await resolveFarmerId(req);
    const events = await costService.listPendingEvents(farmerId);
    return success(res, { message: 'Pending events retrieved', data: events });
  } catch (err) { next(err); }
};

const confirmPendingEvent = async (req, res, next) => {
  try {
    const farmerId = await resolveFarmerId(req);
    const event = await costService.confirmPendingEvent(
      farmerId, req.params.eventUuid, req.body,
    );
    return success(res, { message: 'Pending event confirmed', data: event });
  } catch (err) { next(err); }
};

// ---------- Revenue events ----------
const createRevenueEvent = async (req, res, next) => {
  try {
    const farmerId = await resolveFarmerId(req);
    const event = await revenueService.createRevenueEvent(farmerId, req.body);
    return success(res, { message: 'Revenue event logged', data: event, statusCode: 201 });
  } catch (err) { next(err); }
};

const listRevenueEvents = async (req, res, next) => {
  try {
    const farmerId = await resolveFarmerId(req);
    const events = await revenueService.listRevenueEvents(farmerId, req.query);
    return success(res, { message: 'Revenue events retrieved', data: events });
  } catch (err) { next(err); }
};

// ---------- Breeding ----------
const createBreedingEvent = async (req, res, next) => {
  try {
    const farmerId = await resolveFarmerId(req);
    const event = await breedingService.createBreedingEvent(farmerId, req.body);
    return success(res, { message: 'Breeding event logged', data: event, statusCode: 201 });
  } catch (err) { next(err); }
};

const updatePregnancy = async (req, res, next) => {
  try {
    const farmerId = await resolveFarmerId(req);
    const event = await breedingService.updatePregnancyStatus(
      farmerId, req.params.eventUuid, req.body,
    );
    return success(res, { message: 'Pregnancy status updated', data: event });
  } catch (err) { next(err); }
};

const recordCalving = async (req, res, next) => {
  try {
    const farmerId = await resolveFarmerId(req);
    const event = await breedingService.recordCalving(
      farmerId, req.params.eventUuid, req.body,
    );
    return success(res, { message: 'Calving recorded', data: event });
  } catch (err) { next(err); }
};

const listBreedingEvents = async (req, res, next) => {
  try {
    const farmerId = await resolveFarmerId(req);
    const events = await breedingService.listBreedingEvents(farmerId, req.query);
    return success(res, { message: 'Breeding events retrieved', data: events });
  } catch (err) { next(err); }
};

// ---------- Treatment ----------
const createTreatmentEvent = async (req, res, next) => {
  try {
    const farmerId = await resolveFarmerId(req);
    const event = await treatmentService.createTreatmentEvent(farmerId, req.body);
    return success(res, { message: 'Treatment event logged', data: event, statusCode: 201 });
  } catch (err) { next(err); }
};

const listTreatmentEvents = async (req, res, next) => {
  try {
    const farmerId = await resolveFarmerId(req);
    const events = await treatmentService.listTreatmentEvents(farmerId, req.query);
    return success(res, { message: 'Treatment events retrieved', data: events });
  } catch (err) { next(err); }
};

// ---------- Recurring templates ----------
const createTemplate = async (req, res, next) => {
  try {
    const farmerId = await resolveFarmerId(req);
    const tpl = await recurringService.createTemplate(farmerId, req.body);
    return success(res, { message: 'Recurring template created', data: tpl, statusCode: 201 });
  } catch (err) { next(err); }
};

const listTemplates = async (req, res, next) => {
  try {
    const farmerId = await resolveFarmerId(req);
    const tpls = await recurringService.listTemplates(farmerId);
    return success(res, { message: 'Templates retrieved', data: tpls });
  } catch (err) { next(err); }
};

const deleteTemplate = async (req, res, next) => {
  try {
    const farmerId = await resolveFarmerId(req);
    await recurringService.deleteTemplate(farmerId, req.params.templateUuid);
    return success(res, { message: 'Template deactivated' });
  } catch (err) { next(err); }
};

// ---------- Weekly summary ----------
const upsertWeeklySummary = async (req, res, next) => {
  try {
    const farmerId = await resolveFarmerId(req);
    const s = await weeklyService.upsertWeeklySummary(farmerId, req.body);
    return success(res, { message: 'Weekly summary saved', data: s, statusCode: 201 });
  } catch (err) { next(err); }
};

const finalizeWeek = async (req, res, next) => {
  try {
    const farmerId = await resolveFarmerId(req);
    const s = await weeklyService.finalizeWeek(farmerId, req.params.summaryUuid);
    return success(res, { message: 'Weekly summary finalized', data: s });
  } catch (err) { next(err); }
};

const listWeeklySummaries = async (req, res, next) => {
  try {
    const farmerId = await resolveFarmerId(req);
    const list = await weeklyService.listWeeklySummaries(farmerId);
    return success(res, { message: 'Weekly summaries retrieved', data: list });
  } catch (err) { next(err); }
};

// ---------- P&L ----------
const getHerdPnl = async (req, res, next) => {
  try {
    const farmerId = await resolveFarmerId(req);
    const pnl = await pnlService.getHerdPnl(farmerId, req.query.startDate, req.query.endDate);
    return success(res, { message: 'Herd P&L computed', data: pnl });
  } catch (err) { next(err); }
};

const getPerAnimalPnl = async (req, res, next) => {
  try {
    const farmerId = await resolveFarmerId(req);
    const pnl = await pnlService.getPerAnimalPnl(
      farmerId, req.query.startDate, req.query.endDate,
    );
    return success(res, { message: 'Per-animal P&L computed', data: pnl });
  } catch (err) { next(err); }
};

module.exports = {
  upsertProfile, getProfile,
  addAnimal, listAnimals, getAnimal, updateAnimal, exitAnimal,
  uploadAnimalPhoto, listAnimalPhotos, getAnimalPhotoFile,
  createCostEvent, listCostEvents, listPendingEvents, confirmPendingEvent,
  createRevenueEvent, listRevenueEvents,
  createBreedingEvent, updatePregnancy, recordCalving, listBreedingEvents,
  createTreatmentEvent, listTreatmentEvents,
  createTemplate, listTemplates, deleteTemplate,
  upsertWeeklySummary, finalizeWeek, listWeeklySummaries,
  getHerdPnl, getPerAnimalPnl,
  saveAggregateHerd, getHerdSummary,
};
