/**
 * Auth Validators
 * Joi schemas for all auth API endpoints.
 *
 * MPIN policy: exactly 4 digits (standard Indian fintech pattern — UPI/PhonePe/BHIM).
 * Trivial PINs (0000, 1111, 1234) are rejected to prevent weak credentials.
 * Phone format: exactly 10 digits (Indian mobile without country code).
 */

const Joi = require('joi');

/** Indian mobile: exactly 10 digits starting with 6-9 */
const mobilePattern = /^[6-9]\d{9}$/;

/** MPIN: exactly 4 digits */
const mpinPattern = /^\d{4}$/;

/** Trivial MPINs to reject */
const TRIVIAL_MPINS = new Set([
  '0000', '1111', '2222', '3333', '4444',
  '5555', '6666', '7777', '8888', '9999',
  '1234', '4321', '0123', '9876',
]);

/** Joi custom validator: reject trivial MPINs */
const mpinField = Joi.string().pattern(mpinPattern).custom((value, helpers) => {
  if (TRIVIAL_MPINS.has(value)) {
    return helpers.error('any.invalid');
  }
  return value;
}).messages({
  'string.pattern.base': 'MPIN must be exactly 4 digits',
  'any.invalid': 'MPIN is too simple. Avoid patterns like 1234 or 0000',
});

/**
 * POST /auth/register
 * Registration no longer requires a password — only mobile + name.
 * After OTP verify, user sets an MPIN via /auth/set-mpin.
 */
const registerSchema = Joi.object({
  firstName: Joi.string().trim().min(2).max(100).required()
    .messages({ 'any.required': 'First name is required' }),
  lastName: Joi.string().trim().max(100).allow('', null),
  mobile: Joi.string().pattern(mobilePattern).required()
    .messages({
      'string.pattern.base': 'Mobile must be a valid 10-digit Indian number starting with 6-9',
      'any.required': 'Mobile number is required',
    }),
  email: Joi.string().email().max(120).allow('', null),
  dateOfBirth: Joi.date().iso().max('now').allow(null),
  gender: Joi.string().valid('male', 'female', 'other').allow(null),
  // Pilot-only staff self-registration (SHOW_DEV_OTP-gated server-side —
  // see authService.PILOT_SELF_REGISTERABLE_ROLES); silently ignored
  // (falls back to FARMER) when the pilot flag is off.
  role: Joi.string().valid('ROUTE_SUPERVISOR', 'VET').optional(),
});

/**
 * POST /auth/send-otp
 */
const sendOtpSchema = Joi.object({
  mobile: Joi.string().pattern(mobilePattern),
  email: Joi.string().email().max(120),
  purpose: Joi.string().valid('register', 'login', 'reset_mpin', 'update_contact').required()
    .messages({ 'any.required': 'OTP purpose is required' }),
}).or('mobile', 'email')
  .messages({ 'object.missing': 'Either mobile or email is required' });

/**
 * POST /auth/verify-otp
 */
const verifyOtpSchema = Joi.object({
  otpRequestId: Joi.string().uuid().required()
    .messages({ 'any.required': 'OTP request ID is required' }),
  otpCode: Joi.string().length(6).pattern(/^\d{6}$/).required()
    .messages({
      'string.length': 'OTP must be exactly 6 digits',
      'any.required': 'OTP code is required',
    }),
});

/**
 * POST /auth/set-mpin
 * Called after register→OTP verify (or forgot-mpin→OTP verify) to set/reset the MPIN.
 * The otpRequestId must be a recently-verified OTP for this mobile.
 */
const setMpinSchema = Joi.object({
  mobile: Joi.string().pattern(mobilePattern).required()
    .messages({
      'string.pattern.base': 'Mobile must be a valid 10-digit Indian number',
      'any.required': 'Mobile number is required',
    }),
  otpRequestId: Joi.string().uuid().required()
    .messages({ 'any.required': 'OTP request ID is required' }),
  mpin: mpinField.required()
    .messages({ 'any.required': 'MPIN is required' }),
});

/**
 * POST /auth/login
 * Mobile + MPIN. No more password.
 */
const loginSchema = Joi.object({
  mobile: Joi.string().pattern(mobilePattern).required()
    .messages({
      'string.pattern.base': 'Mobile must be a valid 10-digit Indian number',
      'any.required': 'Mobile number is required',
    }),
  mpin: mpinField.required()
    .messages({ 'any.required': 'MPIN is required' }),
  deviceInfo: Joi.string().max(255).allow('', null),
  deviceUuid: Joi.string().uuid().allow('', null),
});

/**
 * POST /auth/refresh-token
 */
const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required()
    .messages({ 'any.required': 'Refresh token is required' }),
});

/**
 * POST /auth/forgot-mpin
 * Request an OTP to reset a forgotten MPIN.
 */
const forgotMpinSchema = Joi.object({
  mobile: Joi.string().pattern(mobilePattern).required()
    .messages({
      'string.pattern.base': 'Mobile must be a valid 10-digit Indian number',
      'any.required': 'Mobile number is required',
    }),
});

/**
 * POST /auth/change-mpin (authenticated)
 * Logged-in user changes their MPIN. Requires old MPIN for confirmation.
 * No OTP — the bearer token already proves identity.
 */
const changeMpinSchema = Joi.object({
  currentMpin: Joi.string().pattern(mpinPattern).required()
    .messages({
      'string.pattern.base': 'Current MPIN must be exactly 4 digits',
      'any.required': 'Current MPIN is required',
    }),
  newMpin: mpinField.required()
    .messages({ 'any.required': 'New MPIN is required' }),
}).custom((value, helpers) => {
  if (value.currentMpin === value.newMpin) {
    return helpers.error('any.invalid');
  }
  return value;
}).messages({
  'any.invalid': 'New MPIN must be different from current MPIN',
});

module.exports = {
  registerSchema,
  sendOtpSchema,
  verifyOtpSchema,
  setMpinSchema,
  loginSchema,
  refreshTokenSchema,
  forgotMpinSchema,
  changeMpinSchema,
};
