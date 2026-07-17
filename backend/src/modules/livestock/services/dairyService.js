/**
 * Dairy Service
 * Business logic for herd management, animal tracking, health, and production.
 */

const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const logger = require('../../../shared/utils/logger');

let db;
const getDb = () => {
  if (!db) db = require('../../../shared/models');
  return db;
};

/**
 * Creates a new dairy herd register for a farmer.
 */
const createHerd = async (farmerId, data) => {
  const { DairyHerdRegister } = getDb();

  const herd = await DairyHerdRegister.create({
    register_uuid: uuidv4(),
    farmer_id: farmerId,
    register_name: data.herdName,
  });

  logger.info(`Dairy herd ${herd.id} created for farmer ${farmerId}`);
  return { herdId: herd.id, herdUuid: herd.register_uuid };
};

/**
 * Adds an animal to a herd.
 */
const addAnimal = async (herdId, data) => {
  const { DairyHerdRegister, DairyAnimal } = getDb();

  const herd = await DairyHerdRegister.findOne({ where: { id: herdId, is_active: true } });
  if (!herd) {
    const err = new Error('Herd not found');
    err.statusCode = 404;
    err.errorCode = 'RES_001';
    throw err;
  }

  const animal = await DairyAnimal.create({
    animal_uuid: uuidv4(),
    herd_register_id: herdId,
    animal_type: data.animalType,
    breed: data.breed || null,
    animal_identification_number: data.identificationNumber || null,
    age_years: data.ageYears || null,
    acquisition_date: data.acquisitionDate || null,
    acquisition_cost: data.acquisitionCost || null,
    current_market_value: data.currentMarketValue || null,
  });

  logger.info(`Animal ${animal.id} added to herd ${herdId}`);
  return { animalId: animal.id, animalUuid: animal.animal_uuid };
};

/**
 * Records an animal health check.
 */
const addHealthRecord = async (animalId, data) => {
  const { DairyAnimal, DairyAnimalHealthRecord } = getDb();

  const animal = await DairyAnimal.findOne({ where: { id: animalId, is_active: true } });
  if (!animal) {
    const err = new Error('Animal not found');
    err.statusCode = 404;
    err.errorCode = 'RES_001';
    throw err;
  }

  const record = await DairyAnimalHealthRecord.create({
    animal_id: animalId,
    record_date: new Date(),
    weight_kg: data.weight || null,
    milk_production_liters: data.milkProduction || null,
    milk_quality: data.milkQuality || null,
    health_status: data.healthStatus || null,
    vaccinations_done: data.vaccinations || false,
    disease_detected: data.disease ? data.disease.detected : false,
    disease_name: data.disease ? data.disease.name : null,
    treatment_given: data.disease ? data.disease.treatment : null,
  });

  return { healthRecordId: record.id };
};

/**
 * Gets herd production summary for a given month/year.
 */
const getHerdProduction = async (herdId, month, year) => {
  const {
    DairyHerdRegister, DairyAnimal, DairyMilkProductionLog,
    DairyExpenseSummary, DairyIncomeSummary, DairyProfitabilitySummary,
  } = getDb();

  const herd = await DairyHerdRegister.findOne({ where: { id: herdId, is_active: true } });
  if (!herd) {
    const err = new Error('Herd not found');
    err.statusCode = 404;
    err.errorCode = 'RES_001';
    throw err;
  }

  // Get all animals in herd
  const animals = await DairyAnimal.findAll({
    where: { herd_register_id: herdId, is_active: true },
  });
  const animalIds = animals.map((a) => a.id);

  // Production logs for the month
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  const productionLogs = animalIds.length > 0
    ? await DairyMilkProductionLog.findAll({
        where: {
          animal_id: { [Op.in]: animalIds },
          production_date: { [Op.between]: [startDate, endDate] },
          is_active: true,
        },
      })
    : [];

  const totalMilkProduced = productionLogs.reduce(
    (sum, l) => sum + parseFloat(l.total_daily_milk || 0), 0
  );
  const totalMilkSold = productionLogs.reduce(
    (sum, l) => sum + parseFloat(l.milk_sold_liters || 0), 0
  );
  const totalIncome = productionLogs.reduce(
    (sum, l) => sum + parseFloat(l.daily_income || 0), 0
  );

  const daysInMonth = endDate.getDate();
  const dailyAverage = daysInMonth > 0 ? (totalMilkProduced / daysInMonth).toFixed(2) : 0;

  // Expense summary
  const expense = await DairyExpenseSummary.findOne({
    where: { herd_id: herdId, expense_month: month, expense_year: year, is_active: true },
  });

  // Profitability
  const profit = await DairyProfitabilitySummary.findOne({
    where: { herd_id: herdId, summary_month: month, summary_year: year, is_active: true },
  });

  return {
    totalMilkProduced: totalMilkProduced.toFixed(2),
    totalMilkSold: totalMilkSold.toFixed(2),
    income: totalIncome.toFixed(2),
    expenses: expense ? expense.total_expense : null,
    profit: profit ? profit.net_profit : null,
    dailyAverage,
    animalCount: animals.length,
  };
};

module.exports = {
  createHerd,
  addAnimal,
  addHealthRecord,
  getHerdProduction,
};
