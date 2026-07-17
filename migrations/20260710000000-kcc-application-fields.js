'use strict';

/**
 * Farmer-authored KCC-form fields on kcc_facilities (workflow steps 4–6):
 * DBT bank account, the milk-union tie-up request (→ ₹3L), the KYC checklist and
 * repayment-support consents. On a fresh DB the baseline sync already creates
 * these from the model; `alter` adds them to an already-migrated table (idempotent).
 */
module.exports = {
  async up() {
    const db = require('../backend/src/shared/models');
    if (db.KccFacility) await db.KccFacility.sync({ alter: true });
  },
  async down() { /* additive columns — no destructive down */ },
};
