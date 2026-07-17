/**
 * Farmer Validators
 * Joi schemas for farmer profile, onboarding, address, bank, and preference endpoints.
 */

const Joi = require('joi');

/** Indian mobile: 10 digits starting with 6-9 */
const mobilePattern = /^[6-9]\d{9}$/;

/** Aadhaar: exactly 12 digits */
const aadhaarPattern = /^\d{12}$/;

/** IFSC code: 4 letters, 0, then 6 alphanumeric */
const ifscPattern = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** GST: 15 alphanumeric */
const gstPattern = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$/;

/** Time window format: HH:MM */
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

// ─── Onboarding Steps ──────────────────────────────────────────────

const onboardingStep1Schema = Joi.object({
  firstName: Joi.string().trim().min(2).max(100).required(),
  lastName: Joi.string().trim().max(100).allow('', null),
  dateOfBirth: Joi.date().iso().max('now').required(),
  gender: Joi.string().valid('male', 'female', 'other').required(),
  fatherName: Joi.string().trim().max(120).allow('', null),
  motherName: Joi.string().trim().max(120).allow('', null),
  educationLevel: Joi.string().valid('illiterate', 'primary', 'secondary', 'higher_secondary', 'graduate', 'post_graduate').allow(null),
  maritalStatus: Joi.string().valid('single', 'married', 'divorced', 'widowed', 'prefer_not_to_say').allow(null),
});

const onboardingStep2Schema = Joi.object({
  mobile: Joi.string().pattern(mobilePattern).allow(null),
  email: Joi.string().email().max(120).allow('', null),
  aadhaarNumber: Joi.string().pattern(aadhaarPattern).allow(null)
    .messages({ 'string.pattern.base': 'Aadhaar must be exactly 12 digits' }),
});

const onboardingStep3Schema = Joi.object({
  lgdStateId: Joi.number().integer().positive().required(),
  lgdDistrictId: Joi.number().integer().positive().required(),
  lgdBlockId: Joi.number().integer().positive().allow(null),
  lgdVillageId: Joi.number().integer().positive().allow(null),
  streetAddress: Joi.string().trim().max(255).allow('', null),
  postalCode: Joi.string().trim().max(10).allow('', null),
  latitude: Joi.number().min(-90).max(90).allow(null),
  longitude: Joi.number().min(-180).max(180).allow(null),
});

const onboardingStep4Schema = Joi.object({
  accountHolderName: Joi.string().trim().min(2).max(120).required(),
  bankName: Joi.string().trim().min(2).max(100).required(),
  accountNumber: Joi.string().trim().min(8).max(18).required()
    .messages({ 'string.min': 'Account number must be at least 8 digits' }),
  ifscCode: Joi.string().trim().pattern(ifscPattern).required()
    .messages({ 'string.pattern.base': 'IFSC code must be 4 letters followed by 0 and 6 alphanumeric characters' }),
  accountType: Joi.string().valid('savings', 'current', 'other').default('savings'),
});

// ─── Profile ────────────────────────────────────────────────────────

const updateProfileSchema = Joi.object({
  fullName: Joi.string().trim().max(120),
  dateOfBirth: Joi.date().iso().max('now'),
  gender: Joi.string().valid('male', 'female', 'other'),
  fatherName: Joi.string().trim().max(120).allow('', null),
  motherName: Joi.string().trim().max(120).allow('', null),
  educationLevel: Joi.string().valid('illiterate', 'primary', 'secondary', 'higher_secondary', 'graduate', 'post_graduate'),
  maritalStatus: Joi.string().valid('single', 'married', 'divorced', 'widowed', 'prefer_not_to_say'),
  primaryCrop: Joi.string().trim().max(50).allow('', null),
  secondaryCrops: Joi.string().trim().max(500).allow('', null),
  yearsExperience: Joi.number().integer().min(0).max(100),
  totalFarmSizeHectares: Joi.number().precision(4).min(0),
  landOwnershipType: Joi.string().valid('owned', 'leased', 'shared', 'govt_allotted'),
  gstNumber: Joi.string().trim().pattern(gstPattern).allow('', null),
}).min(1).messages({ 'object.min': 'At least one field must be provided for update' });

// ─── Address ────────────────────────────────────────────────────────

const createAddressSchema = Joi.object({
  addressType: Joi.string().valid('permanent', 'current', 'farm').required(),
  lgdStateId: Joi.number().integer().positive().allow(null),
  lgdDistrictId: Joi.number().integer().positive().allow(null),
  lgdBlockId: Joi.number().integer().positive().allow(null),
  lgdVillageId: Joi.number().integer().positive().allow(null),
  streetAddress: Joi.string().trim().max(255).allow('', null),
  postalCode: Joi.string().trim().max(10).allow('', null),
  latitude: Joi.number().min(-90).max(90).allow(null),
  longitude: Joi.number().min(-180).max(180).allow(null),
  isPrimaryAddress: Joi.boolean().default(false),
});

// ─── Bank Account ───────────────────────────────────────────────────

const createBankAccountSchema = Joi.object({
  accountHolderName: Joi.string().trim().min(2).max(120).required(),
  bankName: Joi.string().trim().min(2).max(100).required(),
  accountNumber: Joi.string().trim().min(8).max(18).required(),
  ifscCode: Joi.string().trim().pattern(ifscPattern).required()
    .messages({ 'string.pattern.base': 'Invalid IFSC code format' }),
  accountType: Joi.string().valid('savings', 'current', 'other').default('savings'),
});

const updateBankAccountSchema = Joi.object({
  isPrimary: Joi.boolean().required(),
});

// ─── Preferences ────────────────────────────────────────────────────

const updatePreferencesSchema = Joi.object({
  preferredLanguage: Joi.string().trim().max(10),
  notificationFrequency: Joi.string().valid('real_time', 'daily', 'weekly', 'monthly', 'never'),
  prefersMobileApp: Joi.boolean(),
  prefersSms: Joi.boolean(),
  prefersCall: Joi.boolean(),
  prefersEmail: Joi.boolean(),
  preferredTimeWindowStart: Joi.string().pattern(timePattern).allow(null),
  preferredTimeWindowEnd: Joi.string().pattern(timePattern).allow(null),
}).min(1);

// ─── Agent ──────────────────────────────────────────────────────────

const assignFarmerSchema = Joi.object({
  farmerId: Joi.number().integer().positive().required(),
  reason: Joi.string().trim().max(255).allow('', null),
});

module.exports = {
  onboardingStep1Schema,
  onboardingStep2Schema,
  onboardingStep3Schema,
  onboardingStep4Schema,
  updateProfileSchema,
  createAddressSchema,
  createBankAccountSchema,
  updateBankAccountSchema,
  updatePreferencesSchema,
  assignFarmerSchema,
};
