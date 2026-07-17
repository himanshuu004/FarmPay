'use strict';

/**
 * Phase-3 incremental migration — KAVACH foundation tables (Pashu Suraksha
 * insurance core: plans, proposals, policies, policy assets, premium ledger).
 *
 * Same source-of-truth pattern as the Phase-1/2 migrations: models synced in
 * FK-dependency order (plan → proposal → policy → asset/ledger). sync() (no
 * force) is CREATE TABLE IF NOT EXISTS — idempotent; down() drops in reverse
 * with cascade.
 */

// Plan first, then proposal (→plan), policy (→proposal/plan), then dependents.
const KAVACH_MODELS = [
  'InsurancePlan',
  'InsuranceProposal',
  'InsurancePolicy',
  'PolicyAsset',
  'PremiumLedger',
];

module.exports = {
  async up() {
    const db = require('../backend/src/shared/models');
    for (const name of KAVACH_MODELS) {
      if (db[name]) await db[name].sync();
    }
  },

  async down(queryInterface) {
    const db = require('../backend/src/shared/models');
    for (const name of [...KAVACH_MODELS].reverse()) {
      if (db[name]) await queryInterface.dropTable(db[name].getTableName(), { cascade: true });
    }
  },
};
