/**
 * Joi schemas for the advisory feed.
 */
const Joi = require('joi');

const CATEGORIES = ['VACCINATION', 'MASTITIS', 'HEAT_STRESS', 'BREEDING', 'DRY_OFF'];

const feedQuery = Joi.object({
  status: Joi.string().valid('OPEN', 'DONE', 'DISMISSED', 'EXPIRED', 'ALL').optional(),
  category: Joi.string().valid(...CATEGORIES).optional(),
});

const generateSchema = Joi.object({
  // Optional weather for the heat-stress rule (no IMD feed in v1 → farmer/device supplied).
  tempC: Joi.number().min(-10).max(55).optional(),
  rhPct: Joi.number().min(0).max(100).optional(),
});

const itemUuidParam = Joi.object({ itemUuid: Joi.string().uuid().required() });

module.exports = { feedQuery, generateSchema, itemUuidParam };
