/**
 * Activity Subscription Validators
 * Joi schemas for /farmer/activity-subscriptions/* endpoints.
 */

const Joi = require('joi');

const ACTIVITY_CODES = [
  'CROP', 'DAIRY', 'FISHERY', 'HORTI',
  'POULTRY', 'GOATERY',
  'LABOUR_WAGE', 'SHOP_BUSINESS', 'REMITTANCE', 'OTHER',
];

const TIERS = ['SMALL', 'MEDIUM', 'LARGE'];
const STATUSES_EDITABLE = ['ACTIVE', 'PAUSED']; // DROPPED requires the drop endpoint
const HEALTH_STATUSES = ['GREEN', 'AMBER', 'RED', 'UNKNOWN'];

// ─── Bulk subscribe (onboarding wizard) ───────────────────────────────

const bulkSubscribeSchema = Joi.object({
  source: Joi.string().valid('FARMER_DECLARED', 'AGENT_VERIFIED').default('FARMER_DECLARED'),
  items: Joi.array()
    .items(
      Joi.object({
        activityCode: Joi.string().valid(...ACTIVITY_CODES).required(),
        tier: Joi.string().valid(...TIERS).optional(),
        priorityRank: Joi.number().integer().min(1).max(99).optional(),
        notes: Joi.string().trim().max(500).allow('', null).optional(),
      })
    )
    .min(1)
    .max(10)
    .required(),
});

// ─── Patch a single subscription ──────────────────────────────────────

const updateSubscriptionSchema = Joi.object({
  tier: Joi.string().valid(...TIERS).optional(),
  priorityRank: Joi.number().integer().min(1).max(99).optional(),
  status: Joi.string().valid(...STATUSES_EDITABLE).optional(),
  notes: Joi.string().trim().max(500).allow('', null).optional(),
  // Persona phase save-and-lock state — flipped by setup forms
  isSetupComplete: Joi.boolean().optional(),
}).min(1); // require at least one field

// ─── Drop a subscription ──────────────────────────────────────────────

const dropSubscriptionSchema = Joi.object({
  reason: Joi.string().trim().max(500).optional(),
});

// ─── Refresh health snapshot ──────────────────────────────────────────

const refreshHealthSchema = Joi.object({
  status: Joi.string().valid(...HEALTH_STATUSES).required(),
});

// ─── List query ───────────────────────────────────────────────────────

const listQuerySchema = Joi.object({
  status: Joi.string().valid('ACTIVE', 'PAUSED', 'DROPPED').optional(),
  includeDropped: Joi.boolean().optional(),
});

module.exports = {
  bulkSubscribeSchema,
  updateSubscriptionSchema,
  dropSubscriptionSchema,
  refreshHealthSchema,
  listQuerySchema,
  ACTIVITY_CODES,
  TIERS,
  HEALTH_STATUSES,
};
