/**
 * Dairy Recurring Template Service
 * Lets farmers define "recurring costs I always have" (e.g. monthly labor,
 * weekly feed purchase). A daily cron job converts due templates into
 * pending DairyCostEvents — the farmer then just taps "Confirm" on the home
 * screen to finalize them. Key to avoiding data entry fatigue.
 */

const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const logger = require('../../../shared/utils/logger');

let db;
const getDb = () => {
  if (!db) db = require('../../../shared/models');
  return db;
};

const addDays = (date, n) => {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
};
const addMonths = (date, n) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
};

const nextDueFromFrequency = (fromDate, frequency) => {
  switch (frequency) {
    case 'DAILY': return addDays(fromDate, 1);
    case 'WEEKLY': return addDays(fromDate, 7);
    case 'MONTHLY': return addMonths(fromDate, 1);
    case 'QUARTERLY': return addMonths(fromDate, 3);
    default: return addDays(fromDate, 1);
  }
};

const createTemplate = async (farmerId, data) => {
  const { DairyRecurringTemplate } = getDb();
  const template = await DairyRecurringTemplate.create({
    template_uuid: uuidv4(),
    farmer_id: farmerId,
    template_name: data.templateName,
    category: data.category,
    default_amount: data.defaultAmount,
    default_quantity: data.defaultQuantity || null,
    default_unit: data.defaultUnit || null,
    default_vendor: data.defaultVendor || null,
    default_payment_mode: data.defaultPaymentMode || null,
    frequency: data.frequency,
    day_of_period: data.dayOfPeriod || null,
    next_due_date: data.nextDueDate || new Date(),
  });
  logger.info(`Recurring template ${template.template_uuid} created`);
  return template;
};

const listTemplates = async (farmerId) => {
  const { DairyRecurringTemplate } = getDb();
  return DairyRecurringTemplate.findAll({
    where: { farmer_id: farmerId, is_active: true },
    order: [['next_due_date', 'ASC']],
  });
};

const updateTemplate = async (farmerId, templateUuid, data) => {
  const { DairyRecurringTemplate } = getDb();
  const tpl = await DairyRecurringTemplate.findOne({
    where: { template_uuid: templateUuid, farmer_id: farmerId },
  });
  if (!tpl) {
    const err = new Error('Template not found');
    err.statusCode = 404;
    err.errorCode = 'RES_001';
    throw err;
  }
  await tpl.update(data);
  return tpl;
};

const deleteTemplate = async (farmerId, templateUuid) => {
  const { DairyRecurringTemplate } = getDb();
  const tpl = await DairyRecurringTemplate.findOne({
    where: { template_uuid: templateUuid, farmer_id: farmerId },
  });
  if (!tpl) return null;
  await tpl.update({ is_active: false });
  return tpl;
};

/**
 * Job runner — called by cron. Scans all active templates with
 * next_due_date <= today, inserts a pending cost event for each, and
 * advances the next_due_date.
 */
const generatePendingEventsForDueTemplates = async () => {
  const { DairyRecurringTemplate, DairyCostEvent } = getDb();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = await DairyRecurringTemplate.findAll({
    where: {
      is_active: true,
      next_due_date: { [Op.lte]: today },
    },
  });

  let created = 0;
  for (const tpl of due) {
    await DairyCostEvent.create({
      event_uuid: uuidv4(),
      farmer_id: tpl.farmer_id,
      event_date: tpl.next_due_date,
      scope: 'HERD',
      category: tpl.category,
      quantity: tpl.default_quantity,
      unit: tpl.default_unit,
      amount: tpl.default_amount,
      amount_formal: 0,
      amount_informal: 0,
      payment_mode: tpl.default_payment_mode,
      vendor_name: tpl.default_vendor,
      source_table: 'dairy_recurring_templates',
      source_event_uuid: tpl.template_uuid,
      is_recurring: true,
      is_pending: true,
      notes: `Auto-generated from recurring template: ${tpl.template_name}`,
    });
    const nextDue = nextDueFromFrequency(tpl.next_due_date, tpl.frequency);
    await tpl.update({ last_generated_date: tpl.next_due_date, next_due_date: nextDue });
    created += 1;
  }

  logger.info(`Recurring cron: generated ${created} pending cost events`);
  return { created };
};

module.exports = {
  createTemplate, listTemplates, updateTemplate, deleteTemplate,
  generatePendingEventsForDueTemplates,
};
