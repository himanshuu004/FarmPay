'use strict';

/**
 * CIA Tier-2 (Fix 8 follow-on): EMI moratorium + reversal columns.
 *   - cia_applications.moratorium_until — installments due on/before are shielded
 *     from ageing (PRD §7.5).
 *   - cia_emi_ledger.reversed_amount — bank reversal/refund netted against a deduction.
 * Guarded addColumn; both nullable/defaulted (no backfill).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const apps = await queryInterface.describeTable('cia_applications').catch(() => ({}));
    if (!apps.moratorium_until) await queryInterface.addColumn('cia_applications', 'moratorium_until', { type: Sequelize.DATEONLY, allowNull: true });
    const ledger = await queryInterface.describeTable('cia_emi_ledger').catch(() => ({}));
    if (!ledger.reversed_amount) await queryInterface.addColumn('cia_emi_ledger', 'reversed_amount', { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 });
  },
  async down(queryInterface) {
    const apps = await queryInterface.describeTable('cia_applications').catch(() => ({}));
    if (apps.moratorium_until) await queryInterface.removeColumn('cia_applications', 'moratorium_until');
    const ledger = await queryInterface.describeTable('cia_emi_ledger').catch(() => ({}));
    if (ledger.reversed_amount) await queryInterface.removeColumn('cia_emi_ledger', 'reversed_amount');
  },
};
