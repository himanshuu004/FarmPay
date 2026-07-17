const Joi = require('joi');

const embedding = Joi.array().items(Joi.number()).min(2).max(2048).required();

const enrolSchema = Joi.object({
  animalId: Joi.number().integer().positive().optional(),
  tagUid: Joi.string().pattern(/^\d{12}$/).optional(),
  embedding: embedding,
  quality: Joi.number().min(0).max(1).required(),
  consentRecordId: Joi.number().integer().positive().optional(),
});

const matchSchema = Joi.object({
  claimUuid: Joi.string().uuid().required(),
  embedding: embedding,
});

const resolveSchema = Joi.object({
  decision: Joi.string().valid('confirmed', 'rejected').required(),
  note: Joi.string().max(255).optional(),
});

const biometricUuidParam = Joi.object({ biometricUuid: Joi.string().uuid().required() });
const taskUuidParam = Joi.object({ taskUuid: Joi.string().uuid().required() });

module.exports = { enrolSchema, matchSchema, resolveSchema, biometricUuidParam, taskUuidParam };
