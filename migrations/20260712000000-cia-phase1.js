'use strict';

/**
 * CIA-1 (MVP) migration — Cattle Induction Application tables.
 *
 * Follows the house contract: models are the authoritative definitions, so we
 * sync() each in FK dependency order (CREATE TABLE IF NOT EXISTS, idempotent)
 * rather than duplicating column DDL. No money-movement tables yet — subsidy,
 * disbursement, seller-payout and EMI tables land in the CIA-2 migration.
 *
 * PostGIS geography columns on verification/purchase/transport are added as
 * lat/lng decimals here; the geometry columns + GiST indexes for geo-fence are
 * layered in CIA-3 (matches how `location`/evidence GPS is handled).
 */
const CIA_MODELS = [
  'CiaSchemeConfig',       // config (no deps) — scheme params + doc checklist
  'CiaApplication',        // spine
  'CiaDocument',           // → application (checklist evidence)
  'CiaSelectionDecision',  // → application
  'CiaFieldVerification',  // → application
  'CiaBankBatch',          // parent of sanctions
  'CiaSanction',           // → batch, → application
  'CiaSeller',             // parent of purchases
  'CiaAnimal',             // parent of purchase
  'CiaPurchase',           // → application, animal, seller
  'CiaTransport',          // → purchase
];

module.exports = {
  async up() {
    const db = require('../backend/src/shared/models');
    for (const name of CIA_MODELS) {
      if (db[name]) await db[name].sync();
    }
  },

  async down(queryInterface) {
    const db = require('../backend/src/shared/models');
    for (const name of [...CIA_MODELS].reverse()) {
      if (db[name]) await queryInterface.dropTable(db[name].getTableName(), { cascade: true });
    }
  },
};
