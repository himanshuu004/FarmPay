/**
 * PremiumLedger — every premium money-event (§5.1): farmer share, subsidy
 * tranches (centre/state), financed-on-KCC, refund. Append-only in spirit;
 * status tracks the debit/settlement lifecycle.
 */
const { Model } = require('sequelize');

const ENTRY_TYPES = ['farmer_debit', 'subsidy_central', 'subsidy_state', 'financed_kcc', 'refund'];
const STATUSES = ['pending', 'confirmed', 'failed'];

module.exports = (sequelize, DataTypes) => {
  class PremiumLedger extends Model {
    static associate(models) {
      if (models.InsurancePolicy) PremiumLedger.belongsTo(models.InsurancePolicy, { foreignKey: 'policy_id', as: 'policy' });
    }
  }
  PremiumLedger.init({
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    policy_id: { type: DataTypes.INTEGER, allowNull: false },
    entry_type: { type: DataTypes.ENUM(...ENTRY_TYPES), allowNull: false },
    amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    status: { type: DataTypes.ENUM(...STATUSES), allowNull: false, defaultValue: 'pending' },
    reference: { type: DataTypes.STRING(120), allowNull: true }, // bank txn / PFMS ref
    occurred_at: { type: DataTypes.DATE, allowNull: false },
  }, {
    sequelize, modelName: 'PremiumLedger', tableName: 'premium_ledger',
    timestamps: true, underscored: true,
    indexes: [{ fields: ['policy_id'] }, { fields: ['entry_type'] }],
  });
  PremiumLedger.ENTRY_TYPES = ENTRY_TYPES;
  PremiumLedger.STATUSES = STATUSES;
  return PremiumLedger;
};
