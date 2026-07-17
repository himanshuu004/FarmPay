/**
 * Dairy P&L Service — Hybrid Allocation Engine
 *
 * The core "value-first" service for the dairy logbook. Produces three views:
 *  1. Herd P&L        — cost totals, revenue totals, net for a date range
 *  2. Per-animal P&L  — allocates HERD-scoped costs to each animal using
 *                       share weights, then adds ANIMAL-scoped costs directly
 *  3. Category breakdown — cost per category for spotting outliers
 *
 * Allocation logic:
 *   - HERD costs are split across active animals during the period
 *   - FEED category uses milk-yield weighting when milk revenue by animal is
 *     available; otherwise equal split
 *   - All other HERD categories use equal split
 *   - ANIMAL costs flow directly to the named animal_id
 *   - Revenue with scope=ANIMAL flows directly; HERD revenue is split the
 *     same way as FEED (milk-yield weighted) if milk, equal otherwise
 */

const { Op } = require('sequelize');

let db;
const getDb = () => {
  if (!db) db = require('../../../shared/models');
  return db;
};

const sum = (arr, f = (x) => x) =>
  arr.reduce((acc, x) => acc + parseFloat(f(x) || 0), 0);

/**
 * Top-level herd P&L for a date range.
 */
const getHerdPnl = async (farmerId, startDate, endDate) => {
  const { DairyCostEvent, DairyRevenueEvent } = getDb();

  const costs = await DairyCostEvent.findAll({
    where: {
      farmer_id: farmerId,
      event_date: { [Op.between]: [startDate, endDate] },
      is_pending: false,
    },
  });
  const revenues = await DairyRevenueEvent.findAll({
    where: {
      farmer_id: farmerId,
      event_date: { [Op.between]: [startDate, endDate] },
    },
  });

  const totalCost = sum(costs, (c) => c.amount);
  const totalRevenue = sum(revenues, (r) => r.amount);
  const formalCost = sum(costs, (c) => c.amount_formal);
  const informalCost = sum(costs, (c) => c.amount_informal);

  // Category breakdown
  const byCategory = {};
  for (const c of costs) {
    const k = c.category;
    byCategory[k] = (byCategory[k] || 0) + parseFloat(c.amount || 0);
  }
  const revByCategory = {};
  for (const r of revenues) {
    const k = r.category;
    revByCategory[k] = (revByCategory[k] || 0) + parseFloat(r.amount || 0);
  }

  return {
    period: { startDate, endDate },
    totalCost: totalCost.toFixed(2),
    totalRevenue: totalRevenue.toFixed(2),
    netProfit: (totalRevenue - totalCost).toFixed(2),
    formalCost: formalCost.toFixed(2),
    informalCost: informalCost.toFixed(2),
    costByCategory: byCategory,
    revenueByCategory: revByCategory,
    eventCounts: { costs: costs.length, revenues: revenues.length },
  };
};

/**
 * Per-animal P&L with hybrid allocation. Returns an array of animals with
 * their allocated share of herd costs + direct costs + allocated/direct
 * revenue.
 */
const getPerAnimalPnl = async (farmerId, startDate, endDate) => {
  const {
    DairyAnimal, DairyCostEvent, DairyRevenueEvent,
  } = getDb();

  const animals = await DairyAnimal.findAll({
    where: {
      farmer_id: farmerId,
      status: 'ACTIVE',
      is_active: true,
    },
  });
  if (animals.length === 0) return [];

  const animalIds = animals.map((a) => a.animal_uuid);

  const costs = await DairyCostEvent.findAll({
    where: {
      farmer_id: farmerId,
      event_date: { [Op.between]: [startDate, endDate] },
      is_pending: false,
    },
  });
  const revenues = await DairyRevenueEvent.findAll({
    where: {
      farmer_id: farmerId,
      event_date: { [Op.between]: [startDate, endDate] },
    },
  });

  // Initialize per-animal buckets
  const pnl = {};
  for (const a of animals) {
    pnl[a.animal_uuid] = {
      animalUuid: a.animal_uuid,
      tagNumber: a.tag_number,
      name: a.name,
      lifecycleStage: a.current_lifecycle_stage,
      allocatedCost: 0,
      directCost: 0,
      allocatedRevenue: 0,
      directRevenue: 0,
    };
  }

  // Step 1: direct revenue by animal (for milk-yield weighting)
  const directMilkRevByAnimal = {};
  for (const r of revenues) {
    if (r.scope === 'ANIMAL' && r.animal_id && pnl[r.animal_id]) {
      const amt = parseFloat(r.amount || 0);
      pnl[r.animal_id].directRevenue += amt;
      if (r.category === 'MILK_SALE_COOP' || r.category === 'MILK_SALE_DIRECT') {
        directMilkRevByAnimal[r.animal_id] =
          (directMilkRevByAnimal[r.animal_id] || 0) + amt;
      }
    }
  }

  const totalMilkWeight = Object.values(directMilkRevByAnimal)
    .reduce((a, b) => a + b, 0);

  // Weight function: milk-yield for FEED/FODDER, equal for others
  const weightFor = (category, animalUuid) => {
    if ((category === 'FEED' || category === 'FODDER') && totalMilkWeight > 0) {
      const w = directMilkRevByAnimal[animalUuid] || 0;
      return w / totalMilkWeight;
    }
    return 1 / animals.length;
  };

  // Step 2: costs
  for (const c of costs) {
    const amt = parseFloat(c.amount || 0);
    if (c.scope === 'ANIMAL' && c.animal_id && pnl[c.animal_id]) {
      pnl[c.animal_id].directCost += amt;
    } else {
      // HERD scope → allocate
      for (const a of animals) {
        const w = weightFor(c.category, a.animal_uuid);
        pnl[a.animal_uuid].allocatedCost += amt * w;
      }
    }
  }

  // Step 3: HERD-scope revenue → allocate (milk-weighted if milk, else equal)
  for (const r of revenues) {
    if (r.scope !== 'ANIMAL' || !r.animal_id || !pnl[r.animal_id]) {
      const amt = parseFloat(r.amount || 0);
      const isMilk = r.category === 'MILK_SALE_COOP' || r.category === 'MILK_SALE_DIRECT';
      for (const a of animals) {
        let w;
        if (isMilk && totalMilkWeight > 0) {
          w = (directMilkRevByAnimal[a.animal_uuid] || 0) / totalMilkWeight;
        } else {
          w = 1 / animals.length;
        }
        pnl[a.animal_uuid].allocatedRevenue += amt * w;
      }
    }
  }

  return Object.values(pnl).map((p) => ({
    ...p,
    allocatedCost: p.allocatedCost.toFixed(2),
    directCost: p.directCost.toFixed(2),
    totalCost: (p.allocatedCost + p.directCost).toFixed(2),
    allocatedRevenue: p.allocatedRevenue.toFixed(2),
    directRevenue: p.directRevenue.toFixed(2),
    totalRevenue: (p.allocatedRevenue + p.directRevenue).toFixed(2),
    netProfit: (
      p.allocatedRevenue + p.directRevenue - p.allocatedCost - p.directCost
    ).toFixed(2),
  }));
};

module.exports = { getHerdPnl, getPerAnimalPnl };
