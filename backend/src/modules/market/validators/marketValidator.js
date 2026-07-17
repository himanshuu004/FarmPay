/**
 * Joi schemas for the market boards. Quality is bounded to sane dairy ranges.
 */
const Joi = require('joi');

const estimateSchema = Joi.object({
  litres: Joi.number().min(0).max(100000).required(),
  fatPct: Joi.number().min(0).max(15).required(),
  snfPct: Joi.number().min(0).max(15).required(),
  scope: Joi.string().max(40).optional(),
});

const advisorQuery = Joi.object({
  litres: Joi.number().min(0).max(100000).required(),
  fatPct: Joi.number().min(0).max(15).required(),
  snfPct: Joi.number().min(0).max(15).required(),
  scope: Joi.string().max(40).optional(),
});

const feedQuery = Joi.object({
  category: Joi.string().valid('FEED', 'MINERAL', 'FODDER_SEED', 'MEDICINE', 'EQUIPMENT').optional(),
});

module.exports = { estimateSchema, advisorQuery, feedQuery };
