/**
 * Dairy Validators
 * Joi schemas for herd, animal, health, and production endpoints.
 */

const Joi = require('joi');

const createHerdSchema = Joi.object({
  herdName: Joi.string().trim().min(2).max(100).required(),
});

const addAnimalSchema = Joi.object({
  animalType: Joi.string().valid('cow', 'buffalo', 'goat', 'sheep').required(),
  breed: Joi.string().trim().max(100).allow('', null),
  identificationNumber: Joi.string().trim().max(50).allow('', null),
  ageYears: Joi.number().integer().min(0).allow(null),
  acquisitionDate: Joi.date().iso().allow(null),
  acquisitionCost: Joi.number().precision(2).min(0).allow(null),
  currentMarketValue: Joi.number().precision(2).min(0).allow(null),
});

const addHealthRecordSchema = Joi.object({
  weight: Joi.number().integer().min(0).allow(null),
  milkProduction: Joi.number().precision(2).min(0).allow(null),
  milkQuality: Joi.string().trim().max(50).allow('', null),
  healthStatus: Joi.string().trim().max(100).allow('', null),
  vaccinations: Joi.boolean().allow(null),
  disease: Joi.object({
    detected: Joi.boolean().required(),
    name: Joi.string().trim().max(100).allow('', null),
    treatment: Joi.string().trim().max(2000).allow('', null),
  }).allow(null),
});

const getProductionSchema = Joi.object({
  month: Joi.number().integer().min(1).max(12).required(),
  year: Joi.number().integer().min(2020).max(2100).required(),
});

module.exports = {
  createHerdSchema,
  addAnimalSchema,
  addHealthRecordSchema,
  getProductionSchema,
};
