/**
 * Compliance Validators
 * Joi schemas for consent, grievance, and withdrawal endpoints.
 */

const Joi = require('joi');

const CONSENT_TYPES = ['kyc', 'lending', 'data_processing', 'marketing', 'insurance'];
const GRIEVANCE_CATEGORIES = [
  'service_quality', 'fee_dispute', 'loan_denial',
  'disclosure_issue', 'repayment_issue', 'data_privacy', 'other',
];
const PRIORITY_LEVELS = ['low', 'medium', 'high', 'critical'];

const recordConsentSchema = Joi.object({
  consentType: Joi.string().valid(...CONSENT_TYPES).required(),
  version: Joi.string().required(),
});

const withdrawConsentSchema = Joi.object({
  consentType: Joi.string().valid(...CONSENT_TYPES).required(),
});

const fileGrievanceSchema = Joi.object({
  category: Joi.string().valid(...GRIEVANCE_CATEGORIES).required(),
  description: Joi.string().min(10).required(),
  priority: Joi.string().valid(...PRIORITY_LEVELS).optional(),
});

module.exports = {
  recordConsentSchema,
  withdrawConsentSchema,
  fileGrievanceSchema,
};
