'use strict';

/**
 * Phase-3 incremental migration — identity / muzzle biometrics (AI-1 shadow).
 * Provisions pgvector (idempotent) then syncs the four tables. The embedding is
 * stored as a pgvector literal in a TEXT column and compared via ::vector casts.
 */
const MODELS = ['AiModelRegistry', 'AnimalBiometric', 'ModelInferenceLog', 'BiometricReviewTask'];

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
    const db = require('../backend/src/shared/models');
    for (const name of MODELS) if (db[name]) await db[name].sync();
  },
  async down(queryInterface) {
    const db = require('../backend/src/shared/models');
    for (const name of [...MODELS].reverse()) if (db[name]) await queryInterface.dropTable(db[name].getTableName(), { cascade: true });
  },
};
