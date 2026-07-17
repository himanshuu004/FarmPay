'use strict';

/**
 * Phase-0 baseline schema.
 *
 * Greenfield extraction: rather than hand-porting FarmerPay's 231 MySQL
 * migrations, Phase 0 lays down a single Postgres baseline generated from the
 * in-scope Sequelize model definitions (the allow-listed modules in
 * shared/models). This is the clean starting point; every subsequent phase
 * adds EXPLICIT incremental migrations on top of this baseline (never another
 * sync — this pattern is a one-time baseline only).
 *
 * up:   materialize all registered models as tables (+ enums, indexes, FKs).
 * down: drop them.
 *
 * Extensions (vector, postgis, pgcrypto, uuid-ossp) are provisioned by the
 * container init (backend/db/init/01-extensions.sql); we ensure them here too
 * so `db:migrate` works against any Postgres, not just the dev container.
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS postgis;');
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

    // The model registry owns the authoritative table definitions.
    const db = require('../backend/src/shared/models');
    await db.sequelize.sync();
  },

  async down(queryInterface) {
    const db = require('../backend/src/shared/models');
    await db.sequelize.drop();
    // Leave extensions in place — harmless and shared.
    await queryInterface.sequelize.query('SELECT 1;');
  },
};
