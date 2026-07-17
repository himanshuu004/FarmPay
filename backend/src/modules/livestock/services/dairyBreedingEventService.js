/**
 * Dairy Breeding Event Service
 * Manages AI + natural service breeding records with attempt numbering,
 * formal/informal cost split, and pregnancy/calving chain. Every breeding
 * save also writes a matching cost event in dairy_cost_events so herd P&L
 * stays consistent.
 */

const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const logger = require('../../../shared/utils/logger');

let db;
const getDb = () => {
  if (!db) db = require('../../../shared/models');
  return db;
};

const computeCosts = (data) => {
  const formal = parseFloat(data.costFormal || 0);
  const informal = parseFloat(data.costInformal || 0);
  const service = parseFloat(data.serviceCharge || 0);
  const transport = parseFloat(data.transportCost || 0);
  const gratuity = parseFloat(data.gratuityCost || 0);
  const total = formal + informal || service + transport + gratuity;
  return { formal, informal, total, service, transport, gratuity };
};

const createBreedingEvent = async (farmerId, data) => {
  const { DairyBreedingEvent, DairyCostEvent, DairyAnimal } = getDb();

  // Validate animal belongs to farmer
  const animal = await DairyAnimal.findOne({
    where: { animal_uuid: data.animalId, farmer_id: farmerId, is_active: true },
  });
  if (!animal) {
    const err = new Error('Animal not found for this farmer');
    err.statusCode = 404;
    err.errorCode = 'RES_001';
    throw err;
  }

  // Auto-derive attempt number: count prior PENDING/NO attempts for this animal
  let attempt = data.aiAttemptNumber;
  if (attempt == null) {
    const priorCount = await DairyBreedingEvent.count({
      where: { animal_id: data.animalId, pregnancy_confirmed: { [Op.in]: ['PENDING', 'NO'] } },
    });
    attempt = priorCount + 1;
  }

  const costs = computeCosts(data);
  const eventUuid = uuidv4();

  const event = await DairyBreedingEvent.create({
    event_uuid: eventUuid,
    farmer_id: farmerId,
    animal_id: data.animalId,
    service_type: data.serviceType, // AI | NATURAL_SERVICE
    ai_attempt_number: attempt,
    ai_date: data.aiDate,
    bull_code: data.bullCode || null,
    breed_used: data.breedUsed || null,
    service_provider: data.serviceProvider || null,
    service_provider_type: data.serviceProviderType || null,
    bull_owner_name: data.bullOwnerName || null,
    bull_owner_type: data.bullOwnerType || null,
    service_charge: costs.service,
    transport_cost: costs.transport,
    gratuity_cost: costs.gratuity,
    cost_formal: costs.formal,
    cost_informal: costs.informal,
    cost_total: costs.total,
    notes: data.notes || null,
  });

  // Auto-create matching cost event
  if (costs.total > 0) {
    await DairyCostEvent.create({
      event_uuid: uuidv4(),
      farmer_id: farmerId,
      event_date: data.aiDate,
      scope: 'ANIMAL',
      animal_id: data.animalId,
      category: data.serviceType === 'AI' ? 'AI_BREEDING' : 'NATURAL_SERVICE',
      amount: costs.total,
      amount_formal: costs.formal,
      amount_informal: costs.informal,
      payment_mode: data.paymentMode || null,
      vendor_name: data.serviceProvider || data.bullOwnerName || null,
      source_table: 'dairy_breeding_events',
      source_event_uuid: eventUuid,
      notes: `${data.serviceType} attempt #${attempt} for ${animal.tag_number || data.animalId}`,
    });
  }

  logger.info(`Breeding event ${eventUuid} created (${data.serviceType}, attempt ${attempt})`);
  return event;
};

/**
 * Updates pregnancy status after the check-up visit. Sets expected calving
 * date (+280 days) when confirmed YES.
 */
const updatePregnancyStatus = async (farmerId, eventUuid, data) => {
  const { DairyBreedingEvent } = getDb();
  const event = await DairyBreedingEvent.findOne({
    where: { event_uuid: eventUuid, farmer_id: farmerId },
  });
  if (!event) {
    const err = new Error('Breeding event not found');
    err.statusCode = 404;
    err.errorCode = 'RES_001';
    throw err;
  }

  const update = {
    pregnancy_check_date: data.checkDate || new Date(),
    pregnancy_confirmed: data.confirmed, // YES | NO
  };
  if (data.confirmed === 'YES') {
    const aiDate = new Date(event.ai_date);
    aiDate.setDate(aiDate.getDate() + 280);
    update.expected_calving_date = aiDate;
  }
  await event.update(update);
  return event;
};

const recordCalving = async (farmerId, eventUuid, data) => {
  const { DairyBreedingEvent } = getDb();
  const event = await DairyBreedingEvent.findOne({
    where: { event_uuid: eventUuid, farmer_id: farmerId },
  });
  if (!event) {
    const err = new Error('Breeding event not found');
    err.statusCode = 404;
    err.errorCode = 'RES_001';
    throw err;
  }
  await event.update({
    actual_calving_date: data.calvingDate,
    calving_outcome: data.outcome, // LIVE | STILLBORN | ABORTION | NA
    calf_animal_id: data.calfAnimalId || null,
    notes: data.notes || event.notes,
  });
  return event;
};

const listBreedingEvents = async (farmerId, filters = {}) => {
  const { DairyBreedingEvent } = getDb();
  const where = { farmer_id: farmerId };
  if (filters.animalId) where.animal_id = filters.animalId;
  if (filters.pregnancyConfirmed) where.pregnancy_confirmed = filters.pregnancyConfirmed;
  return DairyBreedingEvent.findAll({
    where,
    order: [['ai_date', 'DESC']],
    limit: filters.limit || 100,
  });
};

module.exports = {
  createBreedingEvent, updatePregnancyStatus, recordCalving, listBreedingEvents,
};
