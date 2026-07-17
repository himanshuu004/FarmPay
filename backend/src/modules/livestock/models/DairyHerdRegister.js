/**
 * DairyHerdRegister Model
 * Top-level herd register linking a farmer to their dairy livestock.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class DairyHerdRegister extends Model {
    static associate(models) {
      DairyHerdRegister.belongsTo(models.User, { foreignKey: 'farmer_id', as: 'farmer' });
      DairyHerdRegister.hasMany(models.DairyAnimal, { foreignKey: 'herd_register_id', as: 'animals' });
      DairyHerdRegister.hasMany(models.DairyFeedUsageLog, { foreignKey: 'herd_id', as: 'feedLogs' });
      DairyHerdRegister.hasMany(models.DairyExpenseSummary, { foreignKey: 'herd_id', as: 'expenses' });
      DairyHerdRegister.hasMany(models.DairyIncomeSummary, { foreignKey: 'herd_id', as: 'incomes' });
      DairyHerdRegister.hasMany(models.DairyProfitabilitySummary, { foreignKey: 'herd_id', as: 'profitability' });
      DairyHerdRegister.hasMany(models.DairyQualityMetric, { foreignKey: 'herd_id', as: 'qualityMetrics' });
      DairyHerdRegister.hasMany(models.DairyMarketLinkage, { foreignKey: 'herd_id', as: 'marketLinkages' });
      DairyHerdRegister.hasMany(models.DairyInsuranceLinkage, { foreignKey: 'herd_id', as: 'insuranceLinkages' });
      DairyHerdRegister.hasMany(models.DairyLinkedLoanUtilization, { foreignKey: 'herd_id', as: 'loanUtilizations' });
    }
  }

  DairyHerdRegister.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      register_uuid: { type: DataTypes.STRING(36), allowNull: false, unique: true },
      farmer_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      register_name: { type: DataTypes.STRING(100), allowNull: false },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize, modelName: 'DairyHerdRegister', tableName: 'dairy_herd_registers',
      timestamps: true, underscored: true,
      indexes: [{ fields: ['register_uuid'], unique: true }, { fields: ['farmer_id'] }],
    }
  );

  return DairyHerdRegister;
};
