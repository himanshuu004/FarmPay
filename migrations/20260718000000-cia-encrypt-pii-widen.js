'use strict';

/**
 * CIA Tier-3 (hardening): widen the CIA at-rest PII/financial columns so they can
 * hold AES-256-GCM ciphertext (iv:tag:cipher). Encryption itself is applied in the
 * models via getters/setters; this migration only changes the column widths for an
 * already-migrated DB. On a fresh migrate the CIA model syncs already create these
 * at the new width, so changeColumn is a no-op there.
 *
 * NO data backfill (greenfield — no plaintext rows exist). A populated DB would need
 * a one-time encrypt-in-place pass (read raw → encField → update) before/at rollout;
 * the model's decField tolerates legacy plaintext so reads never crash meanwhile.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('cia_sellers', 'bank_account', { type: Sequelize.STRING(255), allowNull: false });
    await queryInterface.changeColumn('cia_sellers', 'id_proof_ref', { type: Sequelize.STRING(512), allowNull: false });
    await queryInterface.changeColumn('cia_applications', 'loan_account', { type: Sequelize.STRING(255), allowNull: true });
    await queryInterface.changeColumn('cia_disbursements', 'loan_account', { type: Sequelize.STRING(255), allowNull: false });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('cia_sellers', 'bank_account', { type: Sequelize.STRING(34), allowNull: false });
    await queryInterface.changeColumn('cia_sellers', 'id_proof_ref', { type: Sequelize.STRING(200), allowNull: false });
    await queryInterface.changeColumn('cia_applications', 'loan_account', { type: Sequelize.STRING(34), allowNull: true });
    await queryInterface.changeColumn('cia_disbursements', 'loan_account', { type: Sequelize.STRING(34), allowNull: false });
  },
};
