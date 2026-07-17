const Joi = require('joi');

const activity = Joi.object({
  code: Joi.string().max(30).required(),
  units: Joi.number().positive().max(1e6).optional(),          // omitted → resolved LIVE from register
  animalUuids: Joi.array().items(Joi.string().max(64)).max(500).optional(), // raise KCC against a chosen subset of animals
});
const investmentItem = Joi.object({
  item: Joi.string().max(40).required(),
  amount: Joi.number().positive().max(1e9).required(),
});

const calculateSchema = Joi.object({
  activities: Joi.array().items(activity).min(1).max(10).required(),
  investmentItems: Joi.array().items(investmentItem).max(20).default([]),
  stateCode: Joi.string().max(3).default('UK'),
  schemeVersion: Joi.string().max(20).optional(),
});

// The KCC-form fields the farmer authors (workflow steps 4–6): DBT account, the
// tie-up request (→ ₹3L), the KYC checklist, and repayment-support consents.
const applySchema = calculateSchema.keys({
  bankAccountRef: Joi.string().max(64).optional(),
  tieupRequested: Joi.boolean().optional(),
  kyc: Joi.object({
    pan: Joi.boolean(), aadhaar: Joi.boolean(), land: Joi.boolean(), photo: Joi.boolean(),
  }).optional(),
  repaymentConsent: Joi.object({
    tripartite: Joi.boolean(), noCostService: Joi.boolean(),
  }).optional(),
});

const facilityUuidParam = Joi.object({ facilityUuid: Joi.string().uuid().required() });
const requestUuidParam = Joi.object({ requestUuid: Joi.string().uuid().required() });

const transitionSchema = Joi.object({
  toStatus: Joi.string().valid('UNDER_REVIEW', 'FORWARDED_TO_BANK', 'SANCTIONED', 'DISBURSED', 'ACTIVE', 'REJECTED', 'CLOSED', 'RENEWAL_DUE').required(),
  reason: Joi.string().max(255).optional(),
});

const createDrawdownSchema = Joi.object({
  item: Joi.string().valid('ANIMAL', 'SHED', 'EQUIPMENT').required(),
  description: Joi.string().max(200).required(),
  amount: Joi.number().positive().max(1e8).required(),
  quotationDocUrl: Joi.string().uri().max(400).optional(),
  sellerRef: Joi.string().max(80).optional(),
});

const rejectSchema = Joi.object({ reason: Joi.string().max(255).optional() });

const drawingPowerSchema = Joi.object({
  snapshotDate: Joi.date().iso().optional(),
  stocksValue: Joi.number().min(0).max(1e9).default(0),
  otherReceivables: Joi.number().min(0).max(1e9).default(0),
  cashFlowMonthly: Joi.number().min(0).max(1e9).default(0),
  milkReceivables: Joi.number().min(0).max(1e9).optional(), // omitted → pulled from co-op mirror
});

module.exports = {
  calculateSchema, applySchema, facilityUuidParam, requestUuidParam,
  transitionSchema, createDrawdownSchema, rejectSchema, drawingPowerSchema,
};
