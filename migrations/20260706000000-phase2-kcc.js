'use strict';

/**
 * Phase-2 incremental migration — the KCC tables (Limit Engine data model,
 * origination, LT drawdown, drawing power).
 *
 * Same approach as the Phase-1 migration: the models are the authoritative
 * definitions, synced in dependency order (reference/config tables first, then
 * the facility and its dependents). sync() (no force) is CREATE TABLE IF NOT
 * EXISTS — idempotent on a DB the baseline already materialised.
 */

// Reference/config first, then facility, then its dependents (FK order).
const KCC_MODELS = [
  'SchemeConfig',
  'ActivityCatalog',
  'SofRegistry',
  'KccFacility',
  'KccFacilityActivity',
  'KccLimitSchedule',
  'KccDrawdownRequest',
  'KccDrawingPowerSnap',
];

module.exports = {
  async up() {
    const db = require('../backend/src/shared/models');
    for (const name of KCC_MODELS) {
      if (db[name]) await db[name].sync();
    }
  },

  async down(queryInterface) {
    const db = require('../backend/src/shared/models');
    for (const name of [...KCC_MODELS].reverse()) {
      if (db[name]) await queryInterface.dropTable(db[name].getTableName(), { cascade: true });
    }
  },
};
