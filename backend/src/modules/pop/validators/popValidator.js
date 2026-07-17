/**
 * PoP Validators — Joi schemas for /farmer/pop/* endpoints.
 */

const Joi = require('joi');

const ACTIVITY_CODES = [
  'CROP', 'DAIRY', 'FISHERY', 'HORTI', 'VEG',
  'POULTRY', 'GOATERY',
  'LABOUR_WAGE', 'SHOP_BUSINESS', 'REMITTANCE', 'OTHER',
];

const STATUSES = ['PENDING', 'CURRENT', 'DONE', 'SKIPPED'];
const TIMING = ['ON_TIME', 'DELAYED', 'EARLY'];
const INPUTS = ['AS_PER_POP', 'DEVIATION', 'NOT_RECORDED'];

// Path param: /:activityCode
const activityCodeParamSchema = Joi.object({
  activityCode: Joi.string().valid(...ACTIVITY_CODES).required(),
});

// Query: ?subtypeCode=rice (optional; '' baseline when omitted)
const subtypeQuerySchema = Joi.object({
  subtypeCode: Joi.string().trim().lowercase().max(32).allow('').optional(),
});

// Body: POST /:activityCode/touchpoints
const enterTouchpointSchema = Joi.object({
  subtypeCode: Joi.string().trim().lowercase().max(32).allow('').optional(),
  touchpointNumber: Joi.number().integer().min(1).required(),
  status: Joi.string().valid(...STATUSES).default('DONE'),
  score: Joi.number().integer().min(0).max(100).allow(null).optional(),
  taskCompleted: Joi.boolean().allow(null).optional(),
  timingStatus: Joi.string().valid(...TIMING).allow(null).optional(),
  inputsStatus: Joi.string().valid(...INPUTS).allow(null).optional(),
  actualCostInr: Joi.number().precision(2).min(0).allow(null).optional(),
  notes: Joi.string().trim().max(1000).allow('', null).optional(),
  dataEntered: Joi.object().allow(null).optional(),
});

module.exports = {
  activityCodeParamSchema,
  subtypeQuerySchema,
  enterTouchpointSchema,
  ACTIVITY_CODES,
};
