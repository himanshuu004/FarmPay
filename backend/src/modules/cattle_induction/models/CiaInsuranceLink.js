/**
 * CiaInsuranceLink — links a CIA purchase to its KAVACH policy (transit or cattle)
 * (CIA-3). Records the policy no, sum insured, effective date and bank assignment.
 * The policy itself is issued via the KAVACH module (insurer + SLA = config, #8);
 * this is the CIA-side reconciliable link (policy ↔ animal ↔ loan).
 * Guardrail: a CATTLE policy's effective date can never precede arrival (no
 * backdated / post-purchase cover — Convention 32).
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CiaInsuranceLink extends Model {
    static associate(models) {
      if (models.CiaPurchase) CiaInsuranceLink.belongsTo(models.CiaPurchase, { foreignKey: 'purchase_id', as: 'purchase' });
      if (models.CiaApplication) CiaInsuranceLink.belongsTo(models.CiaApplication, { foreignKey: 'application_id', as: 'application' });
    }
  }
  CiaInsuranceLink.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    link_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    application_id: { type: DataTypes.INTEGER, allowNull: false },
    purchase_id: { type: DataTypes.INTEGER, allowNull: false },
    policy_type: { type: DataTypes.STRING(12), allowNull: false }, // TRANSIT | CATTLE
    policy_no: { type: DataTypes.STRING(60), allowNull: false },
    sum_insured: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    effective_date: { type: DataTypes.DATEONLY, allowNull: false },
    assigned_to_bank: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    insurer_ref: { type: DataTypes.STRING(40), allowNull: true },
    // Deep-reuse link to the KAVACH policy (CATTLE only) — the claim engine works
    // off this policy_uuid (CIA-4 claims). Null for transit / until wired.
    insurance_policy_uuid: { type: DataTypes.UUID, allowNull: true },
    insurance_policy_asset_id: { type: DataTypes.INTEGER, allowNull: true },
    status: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'ACTIVE' },
  }, {
    sequelize, modelName: 'CiaInsuranceLink', tableName: 'cia_insurance_links',
    timestamps: true, underscored: true,
    indexes: [
      { fields: ['application_id'] },
      { fields: ['purchase_id', 'policy_type'], unique: true, name: 'cia_ins_purchase_type_uniq' },
    ],
  });
  return CiaInsuranceLink;
};
