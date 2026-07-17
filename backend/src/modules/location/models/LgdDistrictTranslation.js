/**
 * LgdDistrictTranslation Model
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class LgdDistrictTranslation extends Model {
    static associate(models) {
      LgdDistrictTranslation.belongsTo(models.LgdDistrict, { foreignKey: 'lgd_district_id', as: 'district' });
    }
  }

  LgdDistrictTranslation.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    lgd_district_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'lgd_districts', key: 'id' } },
    language_code: { type: DataTypes.STRING(10), allowNull: false },
    district_name_translated: { type: DataTypes.STRING(120), allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'LgdDistrictTranslation', tableName: 'lgd_district_translations',
    timestamps: true, underscored: true,
    indexes: [{ unique: true, fields: ['lgd_district_id', 'language_code'], name: 'idx_district_lang_unique' }],
  });

  return LgdDistrictTranslation;
};
