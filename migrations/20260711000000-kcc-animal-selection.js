'use strict';

/**
 * `selected_animal_uuids` on kcc_facilities — lets a farmer raise a KCC against a
 * chosen subset of animals (not the whole herd). On a fresh DB the baseline sync
 * creates it from the model; `alter` adds it to an already-migrated table.
 */
module.exports = {
  async up() {
    const db = require('../backend/src/shared/models');
    if (db.KccFacility) await db.KccFacility.sync({ alter: true });
  },
  async down() { /* additive column — no destructive down */ },
};
