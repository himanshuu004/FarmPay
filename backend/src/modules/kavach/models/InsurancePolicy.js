/**
 * InsurancePolicy — issued cover, SYSTEM OF RECORD for livestock (§5.1; CLAUDE.md
 * "System of record = this platform"). No NCIP/crop mirror fields (out of scope).
 *
 *   active → lapsed | expired | claimed | cancelled   (+ transfer on sale)
 *
 * premium_debit_confirmed guards the "debited but no policy" alarm. Premium is
 * paid THROUGH the KCC account with consent (¶32–33); policy assigned to bank.
 */
const { Model } = require('sequelize');

const STATES = ['active', 'lapsed', 'expired', 'claimed', 'cancelled'];

module.exports = (sequelize, DataTypes) => {
  class InsurancePolicy extends Model {
    static associate(models) {
      if (models.InsuranceProposal) InsurancePolicy.belongsTo(models.InsuranceProposal, { foreignKey: 'proposal_id', as: 'proposal' });
      if (models.InsurancePlan) InsurancePolicy.belongsTo(models.InsurancePlan, { foreignKey: 'plan_id', as: 'plan' });
      if (models.PolicyAsset) InsurancePolicy.hasMany(models.PolicyAsset, { foreignKey: 'policy_id', as: 'assets' });
      if (models.PremiumLedger) InsurancePolicy.hasMany(models.PremiumLedger, { foreignKey: 'policy_id', as: 'premiumLedger' });
      if (models.User) InsurancePolicy.belongsTo(models.User, { foreignKey: 'farmer_id', as: 'farmer' });
    }
  }
  InsurancePolicy.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    policy_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    proposal_id: { type: DataTypes.INTEGER, allowNull: true },
    farmer_id: { type: DataTypes.INTEGER, allowNull: false },
    plan_id: { type: DataTypes.INTEGER, allowNull: false },
    policy_number: { type: DataTypes.STRING(64), allowNull: true }, // insurer's number
    insurer_name: { type: DataTypes.STRING(150), allowNull: true },
    sum_insured: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    premium_total: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    premium_farmer: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    start_date: { type: DataTypes.DATEONLY, allowNull: true },
    end_date: { type: DataTypes.DATEONLY, allowNull: true },
    waiting_until: { type: DataTypes.DATEONLY, allowNull: true }, // start + 21-day waiting
    status: { type: DataTypes.ENUM(...STATES), allowNull: false, defaultValue: 'active' },
    policy_doc_url: { type: DataTypes.STRING(500), allowNull: true }, // vault object key
    premium_debit_confirmed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    financed_on_kcc: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, // ¶32–33
    kcc_facility_uuid: { type: DataTypes.STRING(36), allowNull: true }, // premium via KCC
    assigned_to_bank: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    transferred_from_policy_id: { type: DataTypes.INTEGER, allowNull: true }, // transfer on sale
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'InsurancePolicy', tableName: 'insurance_policies',
    timestamps: true, underscored: true,
    indexes: [{ fields: ['farmer_id'] }, { fields: ['status'] }, { fields: ['end_date'] }],
  });
  InsurancePolicy.STATES = STATES;
  return InsurancePolicy;
};
