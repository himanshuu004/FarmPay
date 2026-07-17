'use strict';

/**
 * v1 rate-board + advisory modules. Market: milk-rate chart + selling channels
 * (feed prices reuse coop_input_items — no new table). Advisory: config rule
 * packs + generated advisory items. Idempotent sync in FK-safe order.
 */
const MODELS = ['MarketMilkRateChart', 'MarketChannel', 'AdvisoryRulePack', 'AdvisoryItem'];

module.exports = {
  async up() {
    const db = require('../backend/src/shared/models');
    for (const name of MODELS) if (db[name]) await db[name].sync();
  },
  async down(queryInterface) {
    const db = require('../backend/src/shared/models');
    for (const name of [...MODELS].reverse()) if (db[name]) await queryInterface.dropTable(db[name].getTableName(), { cascade: true });
  },
};
