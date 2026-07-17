'use strict';

/**
 * Society-mediated dairy-KCC workflow — the DCS/Milk-Union certification table.
 * (The kcc_facilities SOCIETY_CERTIFIED status + tie-up columns come from the
 * model on a fresh sync-based migrate.) Idempotent sync.
 */
const MODELS = ['KccSocietyCertification'];

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
