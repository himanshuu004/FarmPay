/**
 * Dairy Animal v2 Service
 * CRUD for per-animal records in the dairy financial logbook. Works on the
 * extended dairy_animals table (farmer_id, tag_number, lifecycle stage, exit
 * tracking, purchase cost, etc.). Pairs with dairyProfileService to keep
 * herd-size tier in sync.
 */

const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const logger = require('../../../shared/utils/logger');
const dairyProfileService = require('./dairyProfileService');

let db;
const getDb = () => {
  if (!db) db = require('../../../shared/models');
  return db;
};

const LEGACY_ANIMAL_TYPE_MAP = {
  CATTLE: 'cow',
  BUFFALO: 'buffalo',
  GOAT: 'goat',
  SHEEP: 'sheep',
  // PIG / POULTRY have no value in the legacy animal_type enum → left null.
};
// Lifecycle stages are dairy-specific; only cattle/buffalo get the default.
const DAIRY_SPECIES = new Set(['CATTLE', 'BUFFALO']);

// Matches DB enum on dairy_animals.current_lifecycle_stage
const VALID_LIFECYCLE = [
  'CALF', 'HEIFER', 'DRY', 'EARLY_LACTATION',
  'PEAK_LACTATION', 'LATE_LACTATION', 'PREGNANT', 'BREEDING',
];

const computeAgeMonths = (dob) => {
  if (!dob) return null;
  const d = new Date(dob);
  const now = new Date();
  return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
};

/**
 * Adds a new animal to a farmer's herd. No herd_register_id needed for v2
 * (we address animals by farmer_id + animal_uuid). Also creates a
 * PURCHASE_ANIMAL cost event when purchase_cost is provided.
 */
const addAnimal = async (farmerId, data) => {
  const { DairyAnimal, DairyCostEvent } = getDb();

  if (data.lifecycleStage && !VALID_LIFECYCLE.includes(data.lifecycleStage)) {
    const err = new Error('Invalid lifecycle stage');
    err.statusCode = 400;
    err.errorCode = 'VAL_001';
    throw err;
  }

  const animalUuid = uuidv4();
  const ageMonths = data.ageMonths || computeAgeMonths(data.dateOfBirth);

  const animal = await DairyAnimal.create({
    animal_uuid: animalUuid,
    farmer_id: farmerId,
    tag_number: data.tagNumber || null,
    name: data.name || null,
    species: data.species || 'CATTLE',
    breed_code: data.breedCode || null,
    breed: data.breedCode || null, // legacy mirror
    gender: data.gender || 'FEMALE',
    date_of_birth: data.dateOfBirth || null,
    age_months: ageMonths,
    age_years: ageMonths ? Math.floor(ageMonths / 12) : null, // legacy mirror
    purchase_date: data.purchaseDate || null,
    purchase_cost: data.purchaseCost || null,
    acquisition_date: data.purchaseDate || null, // legacy mirror
    acquisition_cost: data.purchaseCost || null, // legacy mirror
    purchase_source: data.purchaseSource || null,
    acquisition_mode: data.acquisitionMode || 'PURCHASED', // PURCHASED|BORN_ON_FARM|GIFTED
    current_lifecycle_stage: data.lifecycleStage || (DAIRY_SPECIES.has(data.species || 'CATTLE') ? 'HEIFER' : null),
    status: 'ACTIVE',
    primary_photo_url: data.primaryPhotoUrl || null,
    notes: data.notes || null,
    animal_type: LEGACY_ANIMAL_TYPE_MAP[data.species || 'CATTLE'] || null, // no legacy value → null (was wrongly 'cow')
  });

  // Auto-create purchase cost event
  if (data.purchaseCost && parseFloat(data.purchaseCost) > 0) {
    await DairyCostEvent.create({
      event_uuid: uuidv4(),
      farmer_id: farmerId,
      event_date: data.purchaseDate || new Date(),
      scope: 'ANIMAL',
      animal_id: animalUuid,
      category: 'PURCHASE_ANIMAL',
      quantity: 1,
      unit: 'animal',
      amount: data.purchaseCost,
      amount_formal: data.purchaseCostFormal || 0,
      amount_informal: data.purchaseCostInformal || 0,
      payment_mode: data.paymentMode || 'CASH',
      vendor_name: data.purchaseSource || null,
      source_table: 'dairy_animals',
      source_event_uuid: animalUuid,
      notes: `Auto-created on animal purchase (${data.tagNumber || animalUuid})`,
    });
  }

  await dairyProfileService.recomputeTier(farmerId);
  logger.info(`Animal ${animalUuid} added for farmer ${farmerId}`);
  return animal;
};

const listAnimals = async (farmerId, filters = {}) => {
  const { DairyAnimal } = getDb();
  const where = { farmer_id: farmerId, is_active: true };
  if (filters.status) where.status = filters.status;
  else where.status = 'ACTIVE';
  if (filters.lifecycleStage) where.current_lifecycle_stage = filters.lifecycleStage;

  return DairyAnimal.findAll({ where, order: [['created_at', 'DESC']] });
};

const getAnimal = async (farmerId, animalUuid) => {
  const { DairyAnimal } = getDb();
  const animal = await DairyAnimal.findOne({
    where: { animal_uuid: animalUuid, farmer_id: farmerId, is_active: true },
  });
  if (!animal) {
    const err = new Error('Animal not found');
    err.statusCode = 404;
    err.errorCode = 'RES_001';
    throw err;
  }
  return animal;
};

const updateAnimal = async (farmerId, animalUuid, data) => {
  const animal = await getAnimal(farmerId, animalUuid);
  const updatable = [
    'tag_number', 'name', 'breed_code', 'gender', 'date_of_birth', 'age_months',
    'current_lifecycle_stage', 'primary_photo_url', 'notes',
  ];
  const patch = {};
  updatable.forEach((k) => {
    const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (data[camel] !== undefined) patch[k] = data[camel];
  });
  await animal.update(patch);
  return animal;
};

/**
 * Marks an animal as exited (SOLD/DIED/CULLED/LOST). On SOLD with exit_value
 * > 0, auto-creates an ANIMAL_SALE revenue event.
 */
const exitAnimal = async (farmerId, animalUuid, data) => {
  const { DairyRevenueEvent } = getDb();
  const animal = await getAnimal(farmerId, animalUuid);

  const exitReason = data.exitReason;
  if (!['SOLD', 'DIED', 'CULLED'].includes(exitReason)) {
    const err = new Error('Invalid exit reason');
    err.statusCode = 400;
    err.errorCode = 'VAL_001';
    throw err;
  }

  await animal.update({
    status: exitReason,
    exit_date: data.exitDate || new Date(),
    exit_reason: exitReason,
    exit_value: data.exitValue || 0,
  });

  if (exitReason === 'SOLD' && data.exitValue && parseFloat(data.exitValue) > 0) {
    await DairyRevenueEvent.create({
      event_uuid: uuidv4(),
      farmer_id: farmerId,
      event_date: data.exitDate || new Date(),
      scope: 'ANIMAL',
      animal_id: animalUuid,
      category: 'ANIMAL_SALE',
      amount: data.exitValue,
      payer_name: data.buyerName || null,
      source_table: 'dairy_animals',
      source_event_uuid: animalUuid,
      notes: `Auto-created on animal sale (${animal.tag_number || animalUuid})`,
    });
  }

  await dairyProfileService.recomputeTier(farmerId);

  // Herd shrank → auto-revise the farmer's KCC (a sold animal drops out of the
  // limit). Lazy-required to avoid a circular import; never blocks the sale.
  try {
    await require('../../kcc/services/kccLimitService').recomputeForFarmer(farmerId, { reason: `ANIMAL_${exitReason}` });
  } catch (e) { logger.warn(`KCC recompute after animal exit failed: ${e.message}`); }

  logger.info(`Animal ${animalUuid} exited (${exitReason}) for farmer ${farmerId}`);
  return animal;
};

module.exports = { addAnimal, listAnimals, getAnimal, updateAnimal, exitAnimal };
