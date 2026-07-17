/**
 * DairyAnimalHealthRecord Model
 * Health records: weight, milk production, vaccinations, disease tracking.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class DairyAnimalHealthRecord extends Model {
    static associate(models) {
      DairyAnimalHealthRecord.belongsTo(models.DairyAnimal, { foreignKey: 'animal_id', as: 'animal' });
    }
  }

  DairyAnimalHealthRecord.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      animal_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'dairy_animals', key: 'id' },
      },
      record_date: { type: DataTypes.DATEONLY, allowNull: false },
      weight_kg: { type: DataTypes.INTEGER, allowNull: true },
      milk_production_liters: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      milk_quality: { type: DataTypes.STRING(50), allowNull: true },
      health_status: { type: DataTypes.STRING(100), allowNull: true },
      vaccinations_done: { type: DataTypes.BOOLEAN, defaultValue: false },
      disease_detected: { type: DataTypes.BOOLEAN, defaultValue: false },
      disease_name: { type: DataTypes.STRING(100), allowNull: true },
      treatment_given: { type: DataTypes.TEXT, allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize, modelName: 'DairyAnimalHealthRecord', tableName: 'dairy_animal_health_records',
      timestamps: true, underscored: true,
      indexes: [{ fields: ['animal_id'] }, { fields: ['record_date'] }],
    }
  );

  return DairyAnimalHealthRecord;
};
