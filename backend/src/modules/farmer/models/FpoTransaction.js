/**
 * FpoTransaction Model
 * FPO transactions: commodity pooling, input purchase, payouts, dividends.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class FpoTransaction extends Model {
    static associate(models) {
      FpoTransaction.belongsTo(models.FpoMembership, { foreignKey: 'fpo_membership_id', as: 'membership' });
      FpoTransaction.belongsTo(models.User, { foreignKey: 'farmer_id', as: 'farmer' });
    }
  }

  FpoTransaction.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      transaction_uuid: { type: DataTypes.STRING(36), allowNull: false, unique: true },
      fpo_membership_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'fpo_memberships', key: 'id' },
      },
      farmer_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      transaction_type: {
        type: DataTypes.ENUM('commodity_pooling', 'input_purchase', 'payout', 'share_dividend'),
        allowNull: false,
      },
      commodity: { type: DataTypes.STRING(50), allowNull: true },
      quantity: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      unit: { type: DataTypes.STRING(20), allowNull: true },
      price_per_unit: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      total_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      fpo_margin_pct: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      farmer_payout: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      transaction_date: { type: DataTypes.DATEONLY, allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize, modelName: 'FpoTransaction', tableName: 'fpo_transactions',
      timestamps: true, underscored: true,
      indexes: [
        { fields: ['transaction_uuid'], unique: true },
        { fields: ['farmer_id'] },
        { fields: ['fpo_membership_id'] },
        { fields: ['transaction_date'] },
      ],
    }
  );

  return FpoTransaction;
};
