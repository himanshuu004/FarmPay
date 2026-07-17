/**
 * Dairy v2 Validators (financial logbook)
 * Joi schemas for the v2 dairy endpoints: profile, animals, events, breeding,
 * treatment, recurring, weekly summaries, P&L.
 */

const Joi = require('joi');

// ---------- Profile ----------
const upsertProfileSchema = Joi.object({
  herdTier: Joi.string().valid('SMALL', 'MEDIUM', 'LARGE').optional(),
  entryMode: Joi.string().valid('TRANSACTIONAL', 'WEEKLY_BULK', 'MONTHLY_BULK').optional(),
  expectedAnimalCount: Joi.number().integer().min(0).optional(),
  cooperativeName: Joi.string().max(120).allow('', null),
  cooperativeMemberId: Joi.string().max(50).allow('', null),
  defaultPaymentMode: Joi.string().valid('CASH', 'UPI', 'BANK', 'CREDIT', 'NONE').optional(),
  currency: Joi.string().length(3).optional(),
});

// ---------- Animals ----------
// Matches DB enum on dairy_animals.current_lifecycle_stage
const LIFECYCLE = [
  'CALF', 'HEIFER', 'DRY', 'EARLY_LACTATION',
  'PEAK_LACTATION', 'LATE_LACTATION', 'PREGNANT', 'BREEDING',
];

const addAnimalV2Schema = Joi.object({
  tagNumber: Joi.string().max(50).allow('', null),
  name: Joi.string().max(100).allow('', null),
  species: Joi.string().valid('CATTLE', 'BUFFALO', 'GOAT', 'SHEEP', 'PIG', 'POULTRY').default('CATTLE'),
  breedCode: Joi.string().max(50).allow('', null),
  gender: Joi.string().valid('MALE', 'FEMALE').default('FEMALE'),
  dateOfBirth: Joi.date().iso().allow(null),
  ageMonths: Joi.number().integer().min(0).allow(null),
  purchaseDate: Joi.date().iso().allow(null),
  purchaseCost: Joi.number().precision(2).min(0).allow(null),
  purchaseCostFormal: Joi.number().precision(2).min(0).allow(null),
  purchaseCostInformal: Joi.number().precision(2).min(0).allow(null),
  paymentMode: Joi.string().valid('CASH', 'UPI', 'BANK', 'CREDIT', 'NONE').allow(null),
  purchaseSource: Joi.string().max(120).allow('', null),
  acquisitionMode: Joi.string().valid('PURCHASED', 'BORN_ON_FARM', 'GIFTED').allow(null),
  lifecycleStage: Joi.string().valid(...LIFECYCLE).allow(null),
  primaryPhotoUrl: Joi.string().max(500).allow('', null),
  notes: Joi.string().allow('', null),
});

const updateAnimalSchema = Joi.object({
  tagNumber: Joi.string().max(50).allow('', null),
  name: Joi.string().max(100).allow('', null),
  breedCode: Joi.string().max(50).allow('', null),
  gender: Joi.string().valid('MALE', 'FEMALE'),
  dateOfBirth: Joi.date().iso().allow(null),
  ageMonths: Joi.number().integer().min(0).allow(null),
  currentLifecycleStage: Joi.string().valid(...LIFECYCLE),
  primaryPhotoUrl: Joi.string().max(500).allow('', null),
  notes: Joi.string().allow('', null),
}).min(1);

const exitAnimalSchema = Joi.object({
  exitReason: Joi.string().valid('SOLD', 'DIED', 'CULLED').required(),
  exitDate: Joi.date().iso().required(),
  exitValue: Joi.number().precision(2).min(0).allow(null),
  buyerName: Joi.string().max(120).allow('', null),
});

// ---------- Cost Events ----------
const COST_CATEGORIES = [
  'FEED', 'FODDER', 'MEDICINE', 'VET_TREATMENT', 'AI_BREEDING', 'NATURAL_SERVICE',
  'VACCINATION', 'LABOR', 'ELECTRICITY', 'WATER', 'HOUSING', 'EQUIPMENT',
  'TRANSPORT', 'INSURANCE', 'PURCHASE_ANIMAL', 'OTHER',
];

const createCostEventSchema = Joi.object({
  eventDate: Joi.date().iso().required(),
  scope: Joi.string().valid('HERD', 'ANIMAL').default('HERD'),
  animalId: Joi.string().uuid({ version: 'uuidv4' }).allow(null),
  category: Joi.string().valid(...COST_CATEGORIES).required(),
  quantity: Joi.number().precision(2).min(0).allow(null),
  unit: Joi.string().max(20).allow('', null),
  unitPrice: Joi.number().precision(2).min(0).allow(null),
  amount: Joi.number().precision(2).min(0).allow(null),
  amountFormal: Joi.number().precision(2).min(0).default(0),
  amountInformal: Joi.number().precision(2).min(0).default(0),
  paymentMode: Joi.string().valid('CASH', 'UPI', 'BANK', 'CREDIT', 'NONE').allow(null),
  vendorName: Joi.string().max(120).allow('', null),
  notes: Joi.string().allow('', null),
});

const confirmPendingEventSchema = Joi.object({
  amount: Joi.number().precision(2).min(0).optional(),
  amountFormal: Joi.number().precision(2).min(0).optional(),
  amountInformal: Joi.number().precision(2).min(0).optional(),
  notes: Joi.string().allow('', null),
});

// ---------- Revenue Events ----------
const REVENUE_CATEGORIES = [
  'MILK_SALE_COOP', 'MILK_SALE_DIRECT', 'ANIMAL_SALE', 'CALF_SALE',
  'MANURE_SALE', 'INSURANCE_PAYOUT', 'SUBSIDY', 'OTHER',
];

const createRevenueEventSchema = Joi.object({
  eventDate: Joi.date().iso().required(),
  scope: Joi.string().valid('HERD', 'ANIMAL').default('HERD'),
  animalId: Joi.string().uuid({ version: 'uuidv4' }).allow(null),
  category: Joi.string().valid(...REVENUE_CATEGORIES).required(),
  quantityLiters: Joi.number().precision(2).min(0).allow(null),
  fatPct: Joi.number().precision(2).min(0).max(20).allow(null),
  snfPct: Joi.number().precision(2).min(0).max(20).allow(null),
  ratePerLiter: Joi.number().precision(2).min(0).allow(null),
  amount: Joi.number().precision(2).min(0).allow(null),
  payerName: Joi.string().max(120).allow('', null),
  notes: Joi.string().allow('', null),
});

// ---------- Breeding ----------
const createBreedingEventSchema = Joi.object({
  animalId: Joi.string().uuid({ version: 'uuidv4' }).required(),
  serviceType: Joi.string().valid('AI', 'NATURAL_SERVICE').required(),
  aiAttemptNumber: Joi.number().integer().min(1).allow(null),
  aiDate: Joi.date().iso().required(),
  bullCode: Joi.string().max(50).allow('', null),
  breedUsed: Joi.string().max(50).allow('', null),
  serviceProvider: Joi.string().max(120).allow('', null),
  serviceProviderType: Joi.string().valid('GOVT_VET', 'PRIVATE_VET', 'COOP_INSEMINATOR', 'SELF').allow(null),
  bullOwnerName: Joi.string().max(120).allow('', null),
  bullOwnerType: Joi.string().valid('OWN', 'PEER', 'VILLAGE_BULL', 'BULL_STATION').allow(null),
  serviceCharge: Joi.number().precision(2).min(0).default(0),
  transportCost: Joi.number().precision(2).min(0).default(0),
  gratuityCost: Joi.number().precision(2).min(0).default(0),
  costFormal: Joi.number().precision(2).min(0).default(0),
  costInformal: Joi.number().precision(2).min(0).default(0),
  paymentMode: Joi.string().valid('CASH', 'UPI', 'BANK', 'CREDIT', 'NONE').allow(null),
  notes: Joi.string().allow('', null),
});

const updatePregnancySchema = Joi.object({
  checkDate: Joi.date().iso().required(),
  confirmed: Joi.string().valid('YES', 'NO').required(),
});

const recordCalvingSchema = Joi.object({
  calvingDate: Joi.date().iso().required(),
  outcome: Joi.string().valid('LIVE', 'STILLBORN', 'ABORTION', 'NA').required(),
  calfAnimalId: Joi.string().uuid({ version: 'uuidv4' }).allow(null),
  notes: Joi.string().allow('', null),
});

// ---------- Treatment ----------
const createTreatmentEventSchema = Joi.object({
  animalId: Joi.string().uuid({ version: 'uuidv4' }).allow(null),
  treatmentDate: Joi.date().iso().required(),
  condition: Joi.string().max(200).allow('', null),
  treatmentType: Joi.string().valid(
    'VACCINATION', 'DEWORMING', 'MASTITIS', 'FEVER', 'INJURY',
    'REPRODUCTIVE', 'NUTRITIONAL', 'OTHER',
  ).default('OTHER'),
  vetName: Joi.string().max(120).allow('', null),
  vetType: Joi.string().valid('GOVT', 'PRIVATE', 'PARAVET', 'SELF').allow(null),
  medicineCost: Joi.number().precision(2).min(0).default(0),
  vetFee: Joi.number().precision(2).min(0).default(0),
  otherCost: Joi.number().precision(2).min(0).default(0),
  costFormal: Joi.number().precision(2).min(0).default(0),
  costInformal: Joi.number().precision(2).min(0).default(0),
  paymentMode: Joi.string().valid('CASH', 'UPI', 'BANK', 'CREDIT', 'NONE').allow(null),
  outcome: Joi.string().valid('RECOVERED', 'IMPROVING', 'NO_CHANGE', 'WORSENED', 'DIED').allow(null),
  notes: Joi.string().allow('', null),
});

// ---------- Recurring templates ----------
const createTemplateSchema = Joi.object({
  templateName: Joi.string().max(120).required(),
  category: Joi.string().valid(...COST_CATEGORIES).required(),
  defaultAmount: Joi.number().precision(2).min(0).required(),
  defaultQuantity: Joi.number().precision(2).min(0).allow(null),
  defaultUnit: Joi.string().max(20).allow('', null),
  defaultVendor: Joi.string().max(120).allow('', null),
  defaultPaymentMode: Joi.string().valid('CASH', 'UPI', 'BANK', 'CREDIT', 'NONE').allow(null),
  frequency: Joi.string().valid('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY').required(),
  dayOfPeriod: Joi.number().integer().min(1).max(31).allow(null),
  nextDueDate: Joi.date().iso().required(),
});

// ---------- Weekly summary ----------
const upsertWeeklySummarySchema = Joi.object({
  weekStartDate: Joi.date().iso().required(),
  weekEndDate: Joi.date().iso().required(),
  totalFeedCost: Joi.number().precision(2).min(0).default(0),
  totalFodderCost: Joi.number().precision(2).min(0).default(0),
  totalLaborCost: Joi.number().precision(2).min(0).default(0),
  totalVetCost: Joi.number().precision(2).min(0).default(0),
  totalOtherCost: Joi.number().precision(2).min(0).default(0),
  totalMilkLiters: Joi.number().precision(2).min(0).default(0),
  totalMilkRevenue: Joi.number().precision(2).min(0).default(0),
  totalOtherRevenue: Joi.number().precision(2).min(0).default(0),
  notes: Joi.string().allow('', null),
});

// ---------- P&L query ----------
const pnlQuerySchema = Joi.object({
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().required(),
});

// ---------- Photo upload meta ----------
const photoMetaSchema = Joi.object({
  photoType: Joi.string().valid('PROFILE', 'HEALTH', 'TAG_VERIFICATION', 'OTHER').default('PROFILE'),
  caption: Joi.string().max(200).allow('', null),
  takenAt: Joi.date().iso().allow(null),
  isPrimary: Joi.boolean().default(false),
  uploadedVia: Joi.string().valid('CAMERA', 'GALLERY').default('CAMERA'),
});

module.exports = {
  upsertProfileSchema,
  addAnimalV2Schema,
  updateAnimalSchema,
  exitAnimalSchema,
  createCostEventSchema,
  confirmPendingEventSchema,
  createRevenueEventSchema,
  createBreedingEventSchema,
  updatePregnancySchema,
  recordCalvingSchema,
  createTreatmentEventSchema,
  createTemplateSchema,
  upsertWeeklySummarySchema,
  pnlQuerySchema,
  photoMetaSchema,
};
