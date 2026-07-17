const Joi = require('joi');

const quoteSchema = Joi.object({
  planCode: Joi.string().max(50).required(),
  marketValue: Joi.number().positive().max(1e7).optional(),
  milkLitresPerDay: Joi.number().positive().max(100).optional(),
  animals: Joi.number().integer().min(1).max(100).default(1),
}).or('marketValue', 'milkLitresPerDay');

const createProposalSchema = Joi.object({
  planCode: Joi.string().max(50).required(),
  assetRefId: Joi.number().integer().positive().optional(),
  marketValue: Joi.number().positive().max(1e7).optional(),
  milkLitresPerDay: Joi.number().positive().max(100).optional(),
  channel: Joi.string().valid('self', 'posp', 'bank').default('self'),
  pospId: Joi.number().integer().positive().optional(),
  consentRecordId: Joi.number().integer().positive().optional(),
}).or('marketValue', 'milkLitresPerDay');

const tagSchema = Joi.object({
  tagUid: Joi.string().pattern(/^\d{12}$/).required().messages({ 'string.pattern.base': 'Tag must be a 12-digit NDDB number' }),
  ownerPhotoUrl: Joi.string().uri().max(500).required(),
  tagPhotoUrl: Joi.string().uri().max(500).required(),
});

const valueSchema = Joi.object({
  sumInsured: Joi.number().positive().max(1e7).optional(),
  milkLitresPerDay: Joi.number().positive().max(100).optional(),
});

const paySchema = Joi.object({
  viaKcc: Joi.boolean().default(false),
  kccFacilityUuid: Joi.string().uuid().optional(),
  reference: Joi.string().max(120).optional(),
});

const issueSchema = Joi.object({ insurerName: Joi.string().max(150).optional() });
const rejectSchema = Joi.object({ reason: Joi.string().max(255).optional() });

const proposalUuidParam = Joi.object({ proposalUuid: Joi.string().uuid().required() });
const policyUuidParam = Joi.object({ policyUuid: Joi.string().uuid().required() });
const journeyUuidParam = Joi.object({ journeyUuid: Joi.string().uuid().required() });
const commissionUuidParam = Joi.object({ commissionUuid: Joi.string().uuid().required() });
const commissionAdvanceSchema = Joi.object({
  toState: Joi.string().valid('escrow_held', 'qc_passed', 'released', 'paid', 'disputed').required(),
  reason: Joi.string().max(255).optional(),
});

module.exports = {
  quoteSchema, createProposalSchema, tagSchema, valueSchema, paySchema, issueSchema, rejectSchema,
  proposalUuidParam, policyUuidParam, journeyUuidParam, commissionUuidParam, commissionAdvanceSchema,
};
