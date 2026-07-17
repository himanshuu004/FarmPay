/**
 * Dairy Treatment Event Service
 * Captures vet visits and treatments with three-way cost split (medicine,
 * vet fee, other) plus formal/informal split. Auto-writes a matching
 * dairy_cost_events row.
 */

const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const logger = require('../../../shared/utils/logger');

let db;
const getDb = () => {
  if (!db) db = require('../../../shared/models');
  return db;
};

const createTreatmentEvent = async (farmerId, data) => {
  const { DairyTreatmentEvent, DairyCostEvent } = getDb();

  const medicine = parseFloat(data.medicineCost || 0);
  const vetFee = parseFloat(data.vetFee || 0);
  const other = parseFloat(data.otherCost || 0);
  const formal = parseFloat(data.costFormal || 0);
  const informal = parseFloat(data.costInformal || 0);
  const total = formal + informal || medicine + vetFee + other;

  const eventUuid = uuidv4();
  const event = await DairyTreatmentEvent.create({
    event_uuid: eventUuid,
    farmer_id: farmerId,
    animal_id: data.animalId || null,
    treatment_date: data.treatmentDate,
    condition: data.condition || null,
    treatment_type: data.treatmentType || 'OTHER',
    vet_name: data.vetName || null,
    vet_type: data.vetType || null,
    medicine_cost: medicine,
    vet_fee: vetFee,
    other_cost: other,
    cost_formal: formal,
    cost_informal: informal,
    cost_total: total,
    outcome: data.outcome || null,
    notes: data.notes || null,
  });

  if (total > 0) {
    await DairyCostEvent.create({
      event_uuid: uuidv4(),
      farmer_id: farmerId,
      event_date: data.treatmentDate,
      scope: data.animalId ? 'ANIMAL' : 'HERD',
      animal_id: data.animalId || null,
      category: data.treatmentType === 'VACCINATION' ? 'VACCINATION' : 'VET_TREATMENT',
      amount: total,
      amount_formal: formal,
      amount_informal: informal,
      payment_mode: data.paymentMode || null,
      vendor_name: data.vetName || null,
      source_table: 'dairy_treatment_events',
      source_event_uuid: eventUuid,
      notes: data.condition || null,
    });
  }

  logger.info(`Treatment event ${eventUuid} created (${data.treatmentType}, ₹${total})`);
  return event;
};

const listTreatmentEvents = async (farmerId, filters = {}) => {
  const { DairyTreatmentEvent } = getDb();
  const where = { farmer_id: farmerId, is_active: true };
  if (filters.animalId) where.animal_id = filters.animalId;
  if (filters.treatmentType) where.treatment_type = filters.treatmentType;
  if (filters.startDate && filters.endDate) {
    where.treatment_date = { [Op.between]: [filters.startDate, filters.endDate] };
  }
  return DairyTreatmentEvent.findAll({
    where,
    order: [['treatment_date', 'DESC']],
    limit: filters.limit || 100,
  });
};

module.exports = { createTreatmentEvent, listTreatmentEvents };
