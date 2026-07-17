'use strict';

/**
 * CIA Tier-1 (correctness): persist the PRD Part 7.3 vet health/valuation fields on
 * cia_animals. They were accepted by the vet validator but had no column, so they
 * were silently dropped on submit. All nullable — additive, no backfill needed.
 * Guarded addColumn (cia_animals is created by the CIA-1 migration).
 */
const COLUMNS = (Sequelize) => ({
  test_milking: { type: Sequelize.DECIMAL(6, 2), allowNull: true },
  mastitis_screening: { type: Sequelize.STRING(24), allowNull: true },
  parity: { type: Sequelize.INTEGER, allowNull: true },
  lactation_number: { type: Sequelize.INTEGER, allowNull: true },
  last_calving_date: { type: Sequelize.DATEONLY, allowNull: true },
  expected_yield: { type: Sequelize.DECIMAL(6, 2), allowNull: true },
  horn_characteristics: { type: Sequelize.STRING(300), allowNull: true },
  dentition: { type: Sequelize.STRING(120), allowNull: true },
  vaccination_history: { type: Sequelize.JSONB, allowNull: true },
  deworming_history: { type: Sequelize.JSONB, allowNull: true },
  disease_history: { type: Sequelize.TEXT, allowNull: true },
  reproductive_history: { type: Sequelize.TEXT, allowNull: true },
  pregnancy_diagnosis: { type: Sequelize.STRING(24), allowNull: true },
});

module.exports = {
  async up(queryInterface, Sequelize) {
    const existing = await queryInterface.describeTable('cia_animals').catch(() => ({}));
    const cols = COLUMNS(Sequelize);
    for (const [name, spec] of Object.entries(cols)) {
      if (!existing[name]) await queryInterface.addColumn('cia_animals', name, spec);
    }
  },
  async down(queryInterface, Sequelize) {
    const existing = await queryInterface.describeTable('cia_animals').catch(() => ({}));
    for (const name of Object.keys(COLUMNS(Sequelize))) {
      if (existing[name]) await queryInterface.removeColumn('cia_animals', name);
    }
  },
};
