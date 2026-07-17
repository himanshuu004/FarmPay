/**
 * LgdVillageTranslation Model
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class LgdVillageTranslation extends Model {
    static associate(models) {
      LgdVillageTranslation.belongsTo(models.LgdVillage, { foreignKey: 'lgd_village_id', as: 'village' });
    }
  }

  LgdVillageTranslation.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    lgd_village_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'lgd_villages', key: 'id' } },
    language_code: { type: DataTypes.STRING(10), allowNull: false },
    village_name_translated: { type: DataTypes.STRING(120), allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'LgdVillageTranslation', tableName: 'lgd_village_translations',
    timestamps: true, underscored: true,
    indexes: [{ unique: true, fields: ['lgd_village_id', 'language_code'], name: 'idx_village_lang_unique' }],
  });

  return LgdVillageTranslation;
};
