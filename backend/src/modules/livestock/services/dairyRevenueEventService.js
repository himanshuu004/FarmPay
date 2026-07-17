/**
 * Dairy Revenue Event Service
 * Logs manual revenue entries — milk sales (cooperative or direct), animal
 * sales, manure, insurance payouts, subsidies. Milk sales capture fat/snf/rate
 * for cooperative price reconciliation.
 */

const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const logger = require('../../../shared/utils/logger');

let db;
const getDb = () => {
  if (!db) db = require('../../../shared/models');
  return db;
};

const createRevenueEvent = async (farmerId, data) => {
  const { DairyRevenueEvent } = getDb();

  let amount = data.amount;
  // Derive amount from liters*rate if milk sale and amount not given
  if (amount == null && data.quantityLiters && data.ratePerLiter) {
    amount = parseFloat(data.quantityLiters) * parseFloat(data.ratePerLiter);
  }

  const event = await DairyRevenueEvent.create({
    event_uuid: uuidv4(),
    farmer_id: farmerId,
    event_date: data.eventDate || new Date(),
    scope: data.scope || 'HERD',
    animal_id: data.animalId || null,
    category: data.category,
    quantity_liters: data.quantityLiters || null,
    fat_pct: data.fatPct || null,
    snf_pct: data.snfPct || null,
    rate_per_liter: data.ratePerLiter || null,
    amount,
    payer_name: data.payerName || null,
    notes: data.notes || null,
    source_table: data.sourceTable || null,
    source_event_uuid: data.sourceEventUuid || null,
    is_estimated: !!data.isEstimated,
    is_correction: !!data.isCorrection,
    corrects_event_uuid: data.correctsEventUuid || null,
  });

  logger.info(`Revenue event ${event.event_uuid} created (${data.category}, ₹${amount})`);
  return event;
};

const listRevenueEvents = async (farmerId, filters = {}) => {
  const { DairyRevenueEvent } = getDb();
  const where = { farmer_id: farmerId };
  if (filters.category) where.category = filters.category;
  if (filters.scope) where.scope = filters.scope;
  if (filters.animalId) where.animal_id = filters.animalId;
  if (filters.startDate && filters.endDate) {
    where.event_date = { [Op.between]: [filters.startDate, filters.endDate] };
  }
  return DairyRevenueEvent.findAll({
    where,
    order: [['event_date', 'DESC'], ['id', 'DESC']],
    limit: filters.limit || 100,
  });
};

module.exports = { createRevenueEvent, listRevenueEvents };
