/**
 * DairyBreedingRecord Model
 * Breeding history and offspring tracking per animal.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class DairyBreedingRecord extends Model {
    static associate(models) {
      DairyBreedingRecord.belongsTo(models.DairyAnimal, { foreignKey: 'animal_id', as: 'animal' });
    }
  }

  DairyBreedingRecord.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      animal_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'dairy_animals', key: 'id' },
      },
      breeding_date: { type: DataTypes.DATEONLY, allowNull: true },
      male_partner_type: { type: DataTypes.STRING(50), allowNull: true },
      offspring_count: { type: DataTypes.INTEGER, allowNull: true },
      offspring_born_date: { type: DataTypes.DATEONLY, allowNull: true },
      offspring_survival_rate: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize, modelName: 'DairyBreedingRecord', tableName: 'dairy_breeding_records',
      timestamps: true, underscored: true,
      indexes: [{ fields: ['animal_id'] }],
    }
  );

  return DairyBreedingRecord;
};
