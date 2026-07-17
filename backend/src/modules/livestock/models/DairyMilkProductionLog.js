/**
 * DairyMilkProductionLog Model
 * Daily milk production and sales per animal.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class DairyMilkProductionLog extends Model {
    static associate(models) {
      DairyMilkProductionLog.belongsTo(models.DairyAnimal, { foreignKey: 'animal_id', as: 'animal' });
    }
  }

  DairyMilkProductionLog.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      animal_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'dairy_animals', key: 'id' },
      },
      production_date: { type: DataTypes.DATEONLY, allowNull: false },
      morning_milk_liters: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      evening_milk_liters: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      total_daily_milk: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      milk_sold_liters: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      milk_price_per_liter: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      daily_income: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
      buyer_name: { type: DataTypes.STRING(100), allowNull: true },
      cooperative_id: { type: DataTypes.STRING(16), allowNull: true },
      gross_payout: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      deduction_feed_advance: { type: DataTypes.DECIMAL(10, 2), allowNull: true, defaultValue: 0 },
      deduction_insurance: { type: DataTypes.DECIMAL(10, 2), allowNull: true, defaultValue: 0 },
      deduction_loan_recovery: { type: DataTypes.DECIMAL(10, 2), allowNull: true, defaultValue: 0 },
      net_payout: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize, modelName: 'DairyMilkProductionLog', tableName: 'dairy_milk_production_logs',
      timestamps: true, underscored: true,
      indexes: [{ fields: ['animal_id'] }, { fields: ['production_date'] }],
    }
  );

  return DairyMilkProductionLog;
};
