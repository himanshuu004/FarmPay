'use strict';

/**
 * CIA Tier-2 (Fix 8 final): EMI restructuring + prepayment-carry columns.
 *   - cia_emi_schedules.schedule_version — bumped when a loan is restructured (PRD §7.5).
 *   - cia_emi_ledger.carried_amount — prepayment surplus carried in (config-gated).
 *   - cia_applications.restructured_at / restructure_ref — last restructure marker.
 * Guarded addColumn; all nullable/defaulted (no backfill).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const sched = await queryInterface.describeTable('cia_emi_schedules').catch(() => ({}));
    if (!sched.schedule_version) await queryInterface.addColumn('cia_emi_schedules', 'schedule_version', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 });
    const ledger = await queryInterface.describeTable('cia_emi_ledger').catch(() => ({}));
    if (!ledger.carried_amount) await queryInterface.addColumn('cia_emi_ledger', 'carried_amount', { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 });
    const apps = await queryInterface.describeTable('cia_applications').catch(() => ({}));
    if (!apps.restructured_at) await queryInterface.addColumn('cia_applications', 'restructured_at', { type: Sequelize.DATE, allowNull: true });
    if (!apps.restructure_ref) await queryInterface.addColumn('cia_applications', 'restructure_ref', { type: Sequelize.STRING(60), allowNull: true });
  },
  async down(queryInterface) {
    const sched = await queryInterface.describeTable('cia_emi_schedules').catch(() => ({}));
    if (sched.schedule_version) await queryInterface.removeColumn('cia_emi_schedules', 'schedule_version');
    const ledger = await queryInterface.describeTable('cia_emi_ledger').catch(() => ({}));
    if (ledger.carried_amount) await queryInterface.removeColumn('cia_emi_ledger', 'carried_amount');
    const apps = await queryInterface.describeTable('cia_applications').catch(() => ({}));
    if (apps.restructured_at) await queryInterface.removeColumn('cia_applications', 'restructured_at');
    if (apps.restructure_ref) await queryInterface.removeColumn('cia_applications', 'restructure_ref');
  },
};
