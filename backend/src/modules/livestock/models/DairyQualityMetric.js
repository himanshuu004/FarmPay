/**
 * DairyQualityMetric Model
 * Milk quality testing: fat, protein, lactose, SNF, somatic cell count.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class DairyQualityMetric extends Model {
    static associate(models) {
      DairyQualityMetric.belongsTo(models.DairyHerdRegister, { foreignKey: 'herd_id', as: 'herd' });
    }
  }

  DairyQualityMetric.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      herd_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'dairy_herd_registers', key: 'id' },
      },
      test_date: { type: DataTypes.DATEONLY, allowNull: false },
      fat_percentage: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      protein_percentage: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      lactose_percentage: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      snf_percentage: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      somatic_cell_count: { type: DataTypes.INTEGER, allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize, modelName: 'DairyQualityMetric', tableName: 'dairy_quality_metrics',
      timestamps: true, underscored: true,
      indexes: [{ fields: ['herd_id'] }, { fields: ['test_date'] }],
    }
  );

  return DairyQualityMetric;
};
