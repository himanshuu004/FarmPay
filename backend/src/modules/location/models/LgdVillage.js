/**
 * LgdVillage Model
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class LgdVillage extends Model {
    static associate(models) {
      LgdVillage.belongsTo(models.LgdBlock, { foreignKey: 'block_id', as: 'block' });
      LgdVillage.hasMany(models.LgdVillageTranslation, { foreignKey: 'lgd_village_id', as: 'translations' });
    }
  }

  LgdVillage.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    village_code: { type: DataTypes.STRING(15), allowNull: false, unique: true },
    block_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'lgd_blocks', key: 'id' } },
    village_name: { type: DataTypes.STRING(100), allowNull: false },
    village_name_en: { type: DataTypes.STRING(100), allowNull: true },
    total_households: { type: DataTypes.INTEGER, allowNull: true },
    population: { type: DataTypes.INTEGER, allowNull: true },
    has_bank_branch: { type: DataTypes.BOOLEAN, defaultValue: false },
    has_primary_school: { type: DataTypes.BOOLEAN, defaultValue: false },
    has_secondary_school: { type: DataTypes.BOOLEAN, defaultValue: false },
    longitude: { type: DataTypes.DECIMAL(11, 8), allowNull: true },
    latitude: { type: DataTypes.DECIMAL(10, 8), allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'LgdVillage', tableName: 'lgd_villages',
    timestamps: true, underscored: true,
    indexes: [{ fields: ['block_id'] }],
  });

  return LgdVillage;
};
