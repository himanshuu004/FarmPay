'use strict';

/**
 * CIA-3 (Advanced Verification) migration. Models are authoritative — sync() in
 * FK order (idempotent). CIA-3 mostly extends existing purchase/animal/seller
 * columns (already present) + adds the insurance link. The seller-payout table
 * lands with the payment gate (Slice R).
 */
const CIA3_MODELS = [
  'CiaInsuranceLink',   // → application, purchase
  'CiaSellerPayout',    // → application, purchase (payment-gate recommendation + payout)
];

module.exports = {
  async up() {
    const db = require('../backend/src/shared/models');
    for (const name of CIA3_MODELS) if (db[name]) await db[name].sync();
  },
  async down(queryInterface) {
    const db = require('../backend/src/shared/models');
    for (const name of [...CIA3_MODELS].reverse()) if (db[name]) await queryInterface.dropTable(db[name].getTableName(), { cascade: true });
  },
};
