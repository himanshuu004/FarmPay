/**
 * priceIngestJob — refresh the market boards (§ market). In live/filedrop mode
 * the ERP overwrites the milk-rate chart + feed catalog; this job ensures the
 * config fallback exists so the boards never blank, and stamps freshness.
 * A plain function (like renewalSweepJob) so it's callable from a scheduler or a test.
 */
const logger = require('../shared/utils/logger');
const { seedMarketReference } = require('../modules/market/services/marketSeed');

let db;
const getDb = () => { if (!db) db = require('../shared/models'); return db; };

const runPriceIngestJob = async () => {
  // Idempotent: guarantees the DEFAULT chart + channels exist (config fallback).
  await seedMarketReference();
  const { MarketMilkRateChart, CoopInputItem } = getDb();
  const charts = await MarketMilkRateChart.count({ where: { is_active: true } });
  const feedItems = CoopInputItem ? await CoopInputItem.count({ where: { is_active: true } }) : 0;
  const summary = { charts, feedItems };
  logger.info(`priceIngestJob: ${JSON.stringify(summary)}`);
  return summary;
};

module.exports = { runPriceIngestJob };
