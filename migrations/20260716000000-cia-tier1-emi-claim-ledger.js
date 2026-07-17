'use strict';

/**
 * CIA Tier-1 (correctness): the EMI ledger carries `claim_adjusted` — insurance-claim
 * settlement proceeds applied to an installment. It is preserved across reconcile
 * sweeps so a settled claim durably reduces outstanding (and can close the loan).
 * Guarded addColumn (the table is created by the CIA-2 migration).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('cia_emi_ledger').catch(() => ({}));
    if (!cols.claim_adjusted) {
      await queryInterface.addColumn('cia_emi_ledger', 'claim_adjusted', {
        type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0,
      });
    }
  },
  async down(queryInterface) {
    const cols = await queryInterface.describeTable('cia_emi_ledger').catch(() => ({}));
    if (cols.claim_adjusted) await queryInterface.removeColumn('cia_emi_ledger', 'claim_adjusted');
  },
};
