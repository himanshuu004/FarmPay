/**
 * Dairy Weekly Summary Service
 * Bulk entry path for Large-tier farmers (>10 animals) who can't log every
 * event daily. Farmer enters herd-level totals once per week; on finalize,
 * this service fans the totals into aggregated cost + revenue events
 * marked is_estimated=true so they're visible in P&L but flagged.
 */

const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const logger = require('../../../shared/utils/logger');

let db;
const getDb = () => {
  if (!db) db = require('../../../shared/models');
  return db;
};

const upsertWeeklySummary = async (farmerId, data) => {
  const { DairyWeeklySummary } = getDb();
  const existing = await DairyWeeklySummary.findOne({
    where: { farmer_id: farmerId, week_start_date: data.weekStartDate },
  });

  if (existing) {
    if (existing.is_finalized) {
      const err = new Error('Week already finalized — use correction flow');
      err.statusCode = 409;
      err.errorCode = 'RES_002';
      throw err;
    }
    await existing.update({
      week_end_date: data.weekEndDate,
      total_feed_cost: data.totalFeedCost || 0,
      total_fodder_cost: data.totalFodderCost || 0,
      total_labor_cost: data.totalLaborCost || 0,
      total_vet_cost: data.totalVetCost || 0,
      total_other_cost: data.totalOtherCost || 0,
      total_milk_liters: data.totalMilkLiters || 0,
      total_milk_revenue: data.totalMilkRevenue || 0,
      total_other_revenue: data.totalOtherRevenue || 0,
      notes: data.notes || null,
    });
    return existing;
  }

  const summary = await DairyWeeklySummary.create({
    summary_uuid: uuidv4(),
    farmer_id: farmerId,
    week_start_date: data.weekStartDate,
    week_end_date: data.weekEndDate,
    total_feed_cost: data.totalFeedCost || 0,
    total_fodder_cost: data.totalFodderCost || 0,
    total_labor_cost: data.totalLaborCost || 0,
    total_vet_cost: data.totalVetCost || 0,
    total_other_cost: data.totalOtherCost || 0,
    total_milk_liters: data.totalMilkLiters || 0,
    total_milk_revenue: data.totalMilkRevenue || 0,
    total_other_revenue: data.totalOtherRevenue || 0,
    notes: data.notes || null,
  });
  return summary;
};

/**
 * Finalize a week — fans the totals into aggregated cost/revenue events
 * (one per non-zero bucket) and locks the summary.
 */
const finalizeWeek = async (farmerId, summaryUuid) => {
  const { DairyWeeklySummary, DairyCostEvent, DairyRevenueEvent } = getDb();
  const summary = await DairyWeeklySummary.findOne({
    where: { summary_uuid: summaryUuid, farmer_id: farmerId },
  });
  if (!summary) {
    const err = new Error('Weekly summary not found');
    err.statusCode = 404;
    err.errorCode = 'RES_001';
    throw err;
  }
  if (summary.is_finalized) return summary;

  const eventDate = summary.week_end_date;
  const costBuckets = [
    ['FEED', 'total_feed_cost'],
    ['FODDER', 'total_fodder_cost'],
    ['LABOR', 'total_labor_cost'],
    ['VET_TREATMENT', 'total_vet_cost'],
    ['OTHER', 'total_other_cost'],
  ];

  for (const [category, field] of costBuckets) {
    const amount = parseFloat(summary[field] || 0);
    if (amount > 0) {
      await DairyCostEvent.create({
        event_uuid: uuidv4(),
        farmer_id: farmerId,
        event_date: eventDate,
        scope: 'HERD',
        category,
        amount,
        amount_formal: 0,
        amount_informal: 0,
        source_table: 'dairy_weekly_summaries',
        source_event_uuid: summary.summary_uuid,
        is_estimated: true,
        notes: `Weekly bulk entry (${summary.week_start_date} to ${summary.week_end_date})`,
      });
    }
  }

  if (parseFloat(summary.total_milk_revenue || 0) > 0) {
    await DairyRevenueEvent.create({
      event_uuid: uuidv4(),
      farmer_id: farmerId,
      event_date: eventDate,
      scope: 'HERD',
      category: 'MILK_SALE_DIRECT',
      quantity_liters: summary.total_milk_liters || 0,
      amount: summary.total_milk_revenue,
      source_table: 'dairy_weekly_summaries',
      source_event_uuid: summary.summary_uuid,
      is_estimated: true,
      notes: `Weekly milk sales bulk entry`,
    });
  }
  if (parseFloat(summary.total_other_revenue || 0) > 0) {
    await DairyRevenueEvent.create({
      event_uuid: uuidv4(),
      farmer_id: farmerId,
      event_date: eventDate,
      scope: 'HERD',
      category: 'OTHER',
      amount: summary.total_other_revenue,
      source_table: 'dairy_weekly_summaries',
      source_event_uuid: summary.summary_uuid,
      is_estimated: true,
      notes: `Weekly other revenue bulk entry`,
    });
  }

  await summary.update({ is_finalized: true });
  logger.info(`Weekly summary ${summaryUuid} finalized and fanned out`);
  return summary;
};

const listWeeklySummaries = async (farmerId, limit = 12) => {
  const { DairyWeeklySummary } = getDb();
  return DairyWeeklySummary.findAll({
    where: { farmer_id: farmerId },
    order: [['week_start_date', 'DESC']],
    limit,
  });
};

module.exports = { upsertWeeklySummary, finalizeWeek, listWeeklySummaries };
