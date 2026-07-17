/**
 * Activity Subtype Validators
 * Joi schemas for /farmer/activity-subtypes endpoints.
 */

const Joi = require('joi');
const { SUPPORTED_ACTIVITY_CODES, getSubtypeCodes } = require('../constants/activitySubtypeCatalog');

/**
 * Custom validator: subtypeCodes must all belong to the given activityCode's
 * catalog entry. Joi can't express cross-field dependencies on list members
 * directly, so we do it in a .custom() block.
 */
const upsertSubtypesSchema = Joi.object({
  activityCode: Joi.string().valid(...SUPPORTED_ACTIVITY_CODES).required(),
  subtypeCodes: Joi.array()
    .items(Joi.string().trim().max(32))
    .min(1)
    .max(20)
    .required(),
}).custom((value, helpers) => {
  const valid = getSubtypeCodes(value.activityCode);
  const bad = value.subtypeCodes.filter((c) => !valid.includes(c));
  if (bad.length) {
    return helpers.error('any.invalid', {
      message: `Invalid subtype codes for ${value.activityCode}: ${bad.join(', ')}. Allowed: ${valid.join(', ')}`,
    });
  }
  return value;
}, 'subtype-catalog-check');

module.exports = {
  upsertSubtypesSchema,
};
