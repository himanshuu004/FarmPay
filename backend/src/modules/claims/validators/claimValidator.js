const Joi = require('joi');
const { ALL_EVIDENCE_KINDS } = require('../constants/claimDocs');

const intimateSchema = Joi.object({
  policyUuid: Joi.string().uuid().required(),
  peril: Joi.string().max(80).optional(),
  deathDate: Joi.date().iso().optional(),
  sumClaimed: Joi.number().positive().max(1e7).optional(),
  policyAssetId: Joi.number().integer().positive().optional(),
});

const evidenceSchema = Joi.object({
  kind: Joi.string().valid(...ALL_EVIDENCE_KINDS).required(),
  objectKey: Joi.string().max(500).required(),
  contentHash: Joi.string().pattern(/^[0-9a-f]{64}$/i).required(),
  gpsLat: Joi.number().min(-90).max(90).optional(),
  gpsLng: Joi.number().min(-180).max(180).optional(),
  capturedAt: Joi.date().iso().optional(),
  deviceMeta: Joi.object().optional(),
  uploadedOffline: Joi.boolean().default(false),
});

const reportSchema = Joi.object({ report: Joi.object().default({}) });
const settleSchema = Joi.object({ amount: Joi.number().positive().max(1e7).optional() });
const rejectSchema = Joi.object({ reason: Joi.string().max(255).required() });
const claimUuidParam = Joi.object({
  claimUuid: Joi.string().uuid().required(),
  contentHash: Joi.string().hex().length(64).optional(),
});
const taskUuidParam = Joi.object({ taskUuid: Joi.string().uuid().required() });

const grievanceSchema = Joi.object({
  category: Joi.string().max(60).required(),
  priority: Joi.string().valid('low', 'med', 'high').default('med'),
  channel: Joi.string().valid('app', 'voice', 'posp', 'bank').default('app'),
  policyId: Joi.number().integer().positive().optional(),
  claimId: Joi.number().integer().positive().optional(),
  description: Joi.string().max(500).optional(),
});
const grievanceTransitionSchema = Joi.object({
  toStatus: Joi.string().valid('ack', 'in_progress', 'resolved', 'escalated').required(),
  note: Joi.string().max(500).optional(),
});
const ticketUuidParam = Joi.object({ ticketUuid: Joi.string().uuid().required() });

module.exports = {
  intimateSchema, evidenceSchema, reportSchema, settleSchema, rejectSchema, claimUuidParam, taskUuidParam,
  grievanceSchema, grievanceTransitionSchema, ticketUuidParam,
};
