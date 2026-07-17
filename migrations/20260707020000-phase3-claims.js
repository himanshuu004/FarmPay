'use strict';

/**
 * Phase-3 incremental migration — CLAIMS + SLA tables (§5.2).
 * claim_cases (→ insurance_policies), then claim_events + evidence_files
 * (→ claim_cases). Same idempotent sync-in-order pattern.
 */
const MODELS = ['ClaimCase', 'ClaimEvent', 'EvidenceFile'];

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
