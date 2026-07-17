'use strict';

/**
 * Phase-1 incremental migration — the COOP wedge tables.
 *
 * The Phase-0 baseline materialises the model registry via sync(); this explicit
 * migration records the co-op tables as their own phase step (the baseline's
 * contract: every phase adds an explicit migration). The models are the
 * authoritative definitions, so we sync() each in dependency order rather than
 * duplicating column DDL. sync() (no force) is CREATE TABLE IF NOT EXISTS, so
 * this is idempotent on any DB whether or not the baseline already created them.
 */

// Parents before children (FK order). ErpSyncLog is a parent of CoopMilkSnapshot
// (source_sync_id) so it precedes it; CoopInputOrderItem depends on both
// CoopInputOrder and CoopInputItem.
const COOP_MODELS = [
  'CoopPolicy',
  'CoopMembership',
  'CoopInputItem',
  'ErpSyncLog',
  'CoopInputOrder',
  'CoopInputOrderItem',
  'CoopMilkSnapshot',
];

module.exports = {
  async up() {
    const db = require('../backend/src/shared/models');
    for (const name of COOP_MODELS) {
      if (db[name]) await db[name].sync();
    }
  },

  async down(queryInterface) {
    // Drop children before parents; cascade guards against any residual FK order.
    const db = require('../backend/src/shared/models');
    for (const name of [...COOP_MODELS].reverse()) {
      if (db[name]) await queryInterface.dropTable(db[name].getTableName(), { cascade: true });
    }
  },
};
