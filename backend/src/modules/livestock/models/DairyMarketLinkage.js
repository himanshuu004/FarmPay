/**
 * DairyMarketLinkage Model
 * Buyer connections: cooperatives, private dealers, retail with pricing agreements.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class DairyMarketLinkage extends Model {
    static associate(models) {
      DairyMarketLinkage.belongsTo(models.DairyHerdRegister, { foreignKey: 'herd_id', as: 'herd' });
    }
  }

  DairyMarketLinkage.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      herd_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'dairy_herd_registers', key: 'id' },
      },
      buyer_name: { type: DataTypes.STRING(100), allowNull: true },
      buyer_type: {
        type: DataTypes.ENUM('dairy_cooperative', 'private_dealer', 'retail'), allowNull: true,
      },
      agreement_start_date: { type: DataTypes.DATEONLY, allowNull: true },
      agreement_end_date: { type: DataTypes.DATEONLY, allowNull: true },
      agreed_price_per_liter: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      daily_collection: { type: DataTypes.BOOLEAN, defaultValue: false },
      transport_cost_shared: { type: DataTypes.BOOLEAN, defaultValue: false },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize, modelName: 'DairyMarketLinkage', tableName: 'dairy_market_linkages',
      timestamps: true, underscored: true,
      indexes: [{ fields: ['herd_id'] }],
    }
  );

  return DairyMarketLinkage;
};
