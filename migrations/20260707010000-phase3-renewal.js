'use strict';

/**
 * Phase-3 incremental migration — the renewal engine table (§7.4).
 * renewal_journeys references insurance_policies (created by the phase3-kavach
 * migration), so it lands after. Same idempotent sync-in-order pattern.
 */
const MODELS = ['RenewalJourney'];

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
