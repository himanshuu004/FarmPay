/**
 * Dairy Cost Event Service
 * Logs manual cost entries into the append-only dairy_cost_events ledger.
 * Supports HERD-scope (default for feed/fodder/labor/utilities) and
 * ANIMAL-scope (for direct vet/AI/purchase costs). Formal/informal split
 * captures the Indian rural reality of receipted vs cash/tip payments.
 */

const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const logger = require('../../../shared/utils/logger');

let db;
const getDb = () => {
  if (!db) db = require('../../../shared/models');
  return db;
};

const buildAmounts = (data) => {
  const formal = parseFloat(data.amountFormal || 0);
  const informal = parseFloat(data.amountInformal || 0);
  const total = data.amount != null ? parseFloat(data.amount) : formal + informal;
  return { formal, informal, total };
};

const createCostEvent = async (farmerId, data) => {
  const { DairyCostEvent } = getDb();

  const { formal, informal, total } = buildAmounts(data);

  const event = await DairyCostEvent.create({
    event_uuid: uuidv4(),
    farmer_id: farmerId,
    event_date: data.eventDate || new Date(),
    scope: data.scope || 'HERD',
    animal_id: data.animalId || null,
    category: data.category,
    quantity: data.quantity || null,
    unit: data.unit || null,
    unit_price: data.unitPrice || null,
    amount: total,
    amount_formal: formal,
    amount_informal: informal,
    payment_mode: data.paymentMode || null,
    vendor_name: data.vendorName || null,
    source_table: data.sourceTable || null,
    source_event_uuid: data.sourceEventUuid || null,
    is_recurring: !!data.isRecurring,
    is_pending: !!data.isPending,
    is_estimated: !!data.isEstimated,
    is_correction: !!data.isCorrection,
    corrects_event_uuid: data.correctsEventUuid || null,
    notes: data.notes || null,
  });

  logger.info(`Cost event ${event.event_uuid} created (${data.category}, ₹${total})`);
  return event;
};

/**
 * Confirms a pending cost event (generated from a recurring template).
 * Flips is_pending=false and optionally updates amount if the farmer edited it.
 */
const confirmPendingEvent = async (farmerId, eventUuid, patch = {}) => {
  const { DairyCostEvent } = getDb();
  const event = await DairyCostEvent.findOne({
    where: { event_uuid: eventUuid, farmer_id: farmerId, is_pending: true },
  });
  if (!event) {
    const err = new Error('Pending cost event not found');
    err.statusCode = 404;
    err.errorCode = 'RES_001';
    throw err;
  }
  const update = { is_pending: false };
  if (patch.amount != null) {
    const { formal, informal, total } = buildAmounts(patch);
    update.amount = total;
    update.amount_formal = formal;
    update.amount_informal = informal;
  }
  if (patch.notes !== undefined) update.notes = patch.notes;
  await event.update(update);
  return event;
};

const listCostEvents = async (farmerId, filters = {}) => {
  const { DairyCostEvent } = getDb();
  const where = { farmer_id: farmerId };
  if (filters.category) where.category = filters.category;
  if (filters.scope) where.scope = filters.scope;
  if (filters.animalId) where.animal_id = filters.animalId;
  if (filters.isPending != null) where.is_pending = filters.isPending;
  if (filters.startDate && filters.endDate) {
    where.event_date = { [Op.between]: [filters.startDate, filters.endDate] };
  }
  return DairyCostEvent.findAll({
    where,
    order: [['event_date', 'DESC'], ['id', 'DESC']],
    limit: filters.limit || 100,
  });
};

const listPendingEvents = async (farmerId) => {
  const { DairyCostEvent } = getDb();
  return DairyCostEvent.findAll({
    where: { farmer_id: farmerId, is_pending: true },
    order: [['event_date', 'ASC']],
  });
};

module.exports = {
  createCostEvent, confirmPendingEvent, listCostEvents, listPendingEvents,
};
