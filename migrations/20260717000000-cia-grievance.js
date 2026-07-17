'use strict';

/**
 * CIA grievance module (PRD Part 14B): the cia_grievances table. Model is
 * authoritative — sync() creates it (idempotent, matches the CIA phase-migration
 * pattern). Distinct from the claims-side grievance_tickets (own FKs to
 * cia_applications/cia_purchases, config-driven SLA, laddered escalation).
 */
const CIA_GRIEVANCE_MODELS = ['CiaGrievance'];

module.exports = {
  async up(queryInterface, Sequelize) {
    const db = require('../backend/src/shared/models');
    for (const name of CIA_GRIEVANCE_MODELS) if (db[name]) await db[name].sync();
  },
  async down(queryInterface) {
    const db = require('../backend/src/shared/models');
    for (const name of [...CIA_GRIEVANCE_MODELS].reverse()) if (db[name]) await queryInterface.dropTable(db[name].getTableName(), { cascade: true });
  },
};
