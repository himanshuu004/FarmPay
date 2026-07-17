/**
 * CommissionLedger — POSP commission with an ESCROW state machine (§5.1, §7.5).
 * Fixes the broken POSP layer's late payment: a visible T+15 payout commitment.
 *
 *   accrued → escrow_held → qc_passed → released → paid   (↘ disputed)
 */
const { Model } = require('sequelize');

const STATES = ['accrued', 'escrow_held', 'qc_passed', 'released', 'paid', 'disputed'];

module.exports = (sequelize, DataTypes) => {
  class CommissionLedger extends Model {
    static associate(models) {
      if (models.InsurancePolicy) CommissionLedger.belongsTo(models.InsurancePolicy, { foreignKey: 'policy_id', as: 'policy' });
    }
  }
  CommissionLedger.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    commission_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    posp_id: { type: DataTypes.INTEGER, allowNull: false },
    policy_id: { type: DataTypes.INTEGER, allowNull: true }, // enrolment commission
    claim_id: { type: DataTypes.INTEGER, allowNull: true },  // claim-assist commission
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    state: { type: DataTypes.ENUM(...STATES), allowNull: false, defaultValue: 'accrued' },
    payout_due_date: { type: DataTypes.DATEONLY, allowNull: true }, // T+15 commitment
    released_at: { type: DataTypes.DATE, allowNull: true },
    paid_at: { type: DataTypes.DATE, allowNull: true },
    dispute_reason: { type: DataTypes.STRING(255), allowNull: true },
  }, {
    sequelize, modelName: 'CommissionLedger', tableName: 'commission_ledger',
    timestamps: true, underscored: true,
    indexes: [{ fields: ['posp_id'] }, { fields: ['state'] }, { fields: ['policy_id'] }],
  });
  CommissionLedger.STATES = STATES;
  return CommissionLedger;
};
