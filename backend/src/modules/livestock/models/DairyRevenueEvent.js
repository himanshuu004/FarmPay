/**
 * DairyRevenueEvent Model
 * Master revenue ledger for dairy operations. Captures milk sales (cooperative
 * or direct), animal sales, manure sales, insurance payouts and subsidies.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class DairyRevenueEvent extends Model {
    static associate(models) {
      DairyRevenueEvent.belongsTo(models.User, { foreignKey: 'farmer_id', as: 'farmer' });
    }
  }

  DairyRevenueEvent.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      event_uuid: { type: DataTypes.STRING(36), allowNull: false, unique: true },
      farmer_id: { type: DataTypes.INTEGER, allowNull: false },
      event_date: { type: DataTypes.DATEONLY, allowNull: false },
      scope: { type: DataTypes.ENUM('HERD', 'ANIMAL'), allowNull: false, defaultValue: 'HERD' },
      animal_id: { type: DataTypes.STRING(36), allowNull: true },
      category: {
        type: DataTypes.ENUM(
          'MILK_SALE_COOP', 'MILK_SALE_DIRECT', 'ANIMAL_SALE', 'CALF_SALE',
          'MANURE_SALE', 'INSURANCE_PAYOUT', 'SUBSIDY', 'OTHER',
        ),
        allowNull: false,
      },
      quantity_liters: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      fat_pct: { type: DataTypes.DECIMAL(4, 2), allowNull: true },
      snf_pct: { type: DataTypes.DECIMAL(4, 2), allowNull: true },
      rate_per_liter: { type: DataTypes.DECIMAL(8, 2), allowNull: true },
      amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      payer_name: { type: DataTypes.STRING(120), allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
      source_table: { type: DataTypes.STRING(50), allowNull: true },
      source_event_uuid: { type: DataTypes.STRING(36), allowNull: true },
      is_estimated: { type: DataTypes.BOOLEAN, defaultValue: false },
      is_correction: { type: DataTypes.BOOLEAN, defaultValue: false },
      corrects_event_uuid: { type: DataTypes.STRING(36), allowNull: true },
    },
    {
      sequelize,
      modelName: 'DairyRevenueEvent',
      tableName: 'dairy_revenue_events',
      timestamps: true,
      underscored: true,
    },
  );

  return DairyRevenueEvent;
};
