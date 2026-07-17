/**
 * marketSeed — DEFAULT milk-rate chart + indicative selling channels (CONFIG).
 * Idempotent (findOrCreate by scope / channel_ref). The ERP overwrites these in
 * live/filedrop mode; the seed is the honest fallback so the boards never blank.
 */
const crypto = require('crypto');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const seedMarketReference = async () => {
  const { MarketMilkRateChart, MarketChannel } = getDb();

  await MarketMilkRateChart.findOrCreate({
    where: { scope: 'DEFAULT' },
    defaults: {
      chart_uuid: crypto.randomUUID(), scope: 'DEFAULT', method: 'TWO_AXIS',
      rules_json: { perFatPoint: 4.5, perSnfPoint: 1.2, minRate: 18, maxRate: 90 },
      source: 'config', version: 'MILK_RATE_V1',
    },
  });

  const channels = [
    { channel_ref: 'SOCIETY', name: 'Your dairy society', channel_type: 'SOCIETY',
      method_json: { method: 'TWO_AXIS', perFatPoint: 4.5, perSnfPoint: 1.2, minRate: 18, maxRate: 90 },
      settlement_note: 'Cycle payment + passbook + 70% input credit + insurance path.' },
    { channel_ref: 'PRIVATE_TRADER', name: 'Local private trader', channel_type: 'PRIVATE',
      method_json: { method: 'FLAT', ratePerLitre: 38 },
      settlement_note: 'Cash on the spot; no passbook, credit or insurance benefit.' },
    { channel_ref: 'PRIVATE_DAIRY_CO', name: 'Private dairy company', channel_type: 'COMPANY',
      method_json: { method: 'TWO_AXIS', perFatPoint: 4.7, perSnfPoint: 1.1, minRate: 18, maxRate: 95 },
      settlement_note: 'Weekly settlement; quality-linked, but outside your society benefits.' },
  ];
  for (const c of channels) {
    await MarketChannel.findOrCreate({ where: { channel_ref: c.channel_ref }, defaults: { channel_uuid: crypto.randomUUID(), scope: 'DEFAULT', ...c } });
  }
};

module.exports = { seedMarketReference };
