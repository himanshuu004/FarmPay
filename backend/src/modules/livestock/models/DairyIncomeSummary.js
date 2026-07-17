/**
 * DairyIncomeSummary Model
 * Monthly income breakdown per herd: milk, animal sales, manure.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class DairyIncomeSummary extends Model {
    static associate(models) {
      DairyIncomeSummary.belongsTo(models.DairyHerdRegister, { foreignKey: 'herd_id', as: 'herd' });
    }
  }

  DairyIncomeSummary.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      herd_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'dairy_herd_registers', key: 'id' },
      },
      income_month: { type: DataTypes.INTEGER, allowNull: false },
      income_year: { type: DataTypes.INTEGER, allowNull: false },
      milk_sold_liters: { type: DataTypes.INTEGER, allowNull: true },
      milk_income: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
      animal_sale_income: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
      manure_income: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
      total_income: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize, modelName: 'DairyIncomeSummary', tableName: 'dairy_income_summaries',
      timestamps: true, underscored: true,
      indexes: [{ fields: ['herd_id'] }, { fields: ['income_month', 'income_year'] }],
    }
  );

  return DairyIncomeSummary;
};
