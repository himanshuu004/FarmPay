const Joi = require('joi');

const orderLine = Joi.object({
  sku: Joi.string().max(40).required(),
  quantity: Joi.number().integer().min(1).max(999).required(),
});

const createDraftSchema = Joi.object({
  lines: Joi.array().items(orderLine).min(1).max(50).required(),
});

const linkMembershipSchema = Joi.object({
  farmerRef: Joi.string().max(40).required(),
});

const orderUuidParam = Joi.object({
  orderUuid: Joi.string().uuid().required(),
});

module.exports = { createDraftSchema, linkMembershipSchema, orderUuidParam };
