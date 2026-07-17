/**
 * DairyProfitabilitySummary Model
 * Monthly profitability: income, expense, net profit, ROI.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class DairyProfitabilitySummary extends Model {
    static associate(models) {
      DairyProfitabilitySummary.belongsTo(models.DairyHerdRegister, { foreignKey: 'herd_id', as: 'herd' });
    }
  }

  DairyProfitabilitySummary.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      herd_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'dairy_herd_registers', key: 'id' },
      },
      summary_month: { type: DataTypes.INTEGER, allowNull: false },
      summary_year: { type: DataTypes.INTEGER, allowNull: false },
      total_income: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
      total_expense: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
      net_profit: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
      roi_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize, modelName: 'DairyProfitabilitySummary', tableName: 'dairy_profitability_summaries',
      timestamps: true, underscored: true,
      indexes: [{ fields: ['herd_id'] }, { fields: ['summary_month', 'summary_year'] }],
    }
  );

  return DairyProfitabilitySummary;
};
