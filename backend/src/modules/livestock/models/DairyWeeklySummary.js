/**
 * DairyWeeklySummary Model
 * Bulk weekly entry mode for Large-tier farmers (>10 animals) who can't log
 * every event daily. Stores herd-level totals for the week; service layer
 * fans these out into aggregated DairyCostEvent / DairyRevenueEvent rows
 * marked is_estimated=true when finalized.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class DairyWeeklySummary extends Model {
    static associate(models) {
      DairyWeeklySummary.belongsTo(models.User, { foreignKey: 'farmer_id', as: 'farmer' });
    }
  }

  DairyWeeklySummary.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      summary_uuid: { type: DataTypes.STRING(36), allowNull: false, unique: true },
      farmer_id: { type: DataTypes.INTEGER, allowNull: false },
      week_start_date: { type: DataTypes.DATEONLY, allowNull: false },
      week_end_date: { type: DataTypes.DATEONLY, allowNull: false },

      total_feed_cost: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      total_fodder_cost: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      total_labor_cost: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      total_vet_cost: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      total_other_cost: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },

      total_milk_liters: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      total_milk_revenue: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      total_other_revenue: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },

      notes: { type: DataTypes.TEXT, allowNull: true },
      is_finalized: { type: DataTypes.BOOLEAN, defaultValue: false },
    },
    {
      sequelize,
      modelName: 'DairyWeeklySummary',
      tableName: 'dairy_weekly_summaries',
      timestamps: true,
      underscored: true,
    },
  );

  return DairyWeeklySummary;
};
