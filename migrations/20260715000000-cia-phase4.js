'use strict';

/**
 * CIA-4 (Full Lifecycle & Analytics) migration. Models are authoritative — sync()
 * in FK order (idempotent). Post-purchase monitoring first; claims reuse the
 * platform CLAIMS tables, and muzzle re-ID reuses `identity`.
 */
const CIA4_MODELS = [
  'CiaPostPurchaseInspection',   // → application, purchase
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const db = require('../backend/src/shared/models');
    for (const name of CIA4_MODELS) if (db[name]) await db[name].sync();
    // Deep-reuse columns added to the CIA-3 cia_insurance_links table (Slice U).
    const cols = await queryInterface.describeTable('cia_insurance_links').catch(() => ({}));
    if (!cols.insurance_policy_uuid) await queryInterface.addColumn('cia_insurance_links', 'insurance_policy_uuid', { type: Sequelize.UUID, allowNull: true });
    if (!cols.insurance_policy_asset_id) await queryInterface.addColumn('cia_insurance_links', 'insurance_policy_asset_id', { type: Sequelize.INTEGER, allowNull: true });
  },
  async down(queryInterface) {
    const db = require('../backend/src/shared/models');
    for (const name of [...CIA4_MODELS].reverse()) if (db[name]) await queryInterface.dropTable(db[name].getTableName(), { cascade: true });
  },
};
