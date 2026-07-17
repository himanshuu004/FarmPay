/**
 * DairyExpenseSummary Model
 * Monthly expense breakdown per herd: feed, veterinary, labor, other.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class DairyExpenseSummary extends Model {
    static associate(models) {
      DairyExpenseSummary.belongsTo(models.DairyHerdRegister, { foreignKey: 'herd_id', as: 'herd' });
    }
  }

  DairyExpenseSummary.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      herd_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'dairy_herd_registers', key: 'id' },
      },
      expense_month: { type: DataTypes.INTEGER, allowNull: false },
      expense_year: { type: DataTypes.INTEGER, allowNull: false },
      feed_cost: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
      veterinary_cost: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
      labor_cost: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
      other_cost: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
      total_expense: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize, modelName: 'DairyExpenseSummary', tableName: 'dairy_expense_summaries',
      timestamps: true, underscored: true,
      indexes: [{ fields: ['herd_id'] }, { fields: ['expense_month', 'expense_year'] }],
    }
  );

  return DairyExpenseSummary;
};
