/**
 * DairyInsuranceLinkage Model
 * Insurance products linked to herds: provider, premium, coverage.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class DairyInsuranceLinkage extends Model {
    static associate(models) {
      DairyInsuranceLinkage.belongsTo(models.DairyHerdRegister, { foreignKey: 'herd_id', as: 'herd' });
    }
  }

  DairyInsuranceLinkage.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      herd_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'dairy_herd_registers', key: 'id' },
      },
      insurance_product: { type: DataTypes.STRING(100), allowNull: true },
      insurance_provider: { type: DataTypes.STRING(100), allowNull: true },
      premium_paid: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
      coverage_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
      animals_covered: { type: DataTypes.INTEGER, allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize, modelName: 'DairyInsuranceLinkage', tableName: 'dairy_insurance_linkages',
      timestamps: true, underscored: true,
      indexes: [{ fields: ['herd_id'] }],
    }
  );

  return DairyInsuranceLinkage;
};
