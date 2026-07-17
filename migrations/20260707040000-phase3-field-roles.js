'use strict';

/**
 * Phase-3 incremental migration — field-role tables (§5.1/§5.2): surveyor tasks,
 * vet honorarium ledger, grievance tickets (claims), and the POSP commission
 * ledger (kavach). All reference already-created tables; sync-in-order pattern.
 */
const MODELS = ['SurveyorTask', 'VetHonorariumLedger', 'GrievanceTicket', 'CommissionLedger'];

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
