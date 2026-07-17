/**
 * DairyFeedUsageLog Model
 * Feed consumption tracking per herd: type, quantity, cost.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class DairyFeedUsageLog extends Model {
    static associate(models) {
      DairyFeedUsageLog.belongsTo(models.DairyHerdRegister, { foreignKey: 'herd_id', as: 'herd' });
    }
  }

  DairyFeedUsageLog.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      herd_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'dairy_herd_registers', key: 'id' },
      },
      feed_date: { type: DataTypes.DATEONLY, allowNull: false },
      feed_type: { type: DataTypes.STRING(100), allowNull: true },
      feed_quantity_kg: { type: DataTypes.INTEGER, allowNull: true },
      feed_cost: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      is_concentrate: { type: DataTypes.BOOLEAN, defaultValue: false },
      is_fodder: { type: DataTypes.BOOLEAN, defaultValue: false },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize, modelName: 'DairyFeedUsageLog', tableName: 'dairy_feed_usage_logs',
      timestamps: true, underscored: true,
      indexes: [{ fields: ['herd_id'] }, { fields: ['feed_date'] }],
    }
  );

  return DairyFeedUsageLog;
};
