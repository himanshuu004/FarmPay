/**
 * Language Model
 * Supported languages on the platform.
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Language extends Model {
    static associate() {}
  }

  Language.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    language_code: { type: DataTypes.STRING(10), allowNull: false, unique: true },
    language_name: { type: DataTypes.STRING(50), allowNull: false },
    native_name: { type: DataTypes.STRING(50), allowNull: true },
    iso_639_1: { type: DataTypes.STRING(2), allowNull: true },
    is_supported: { type: DataTypes.BOOLEAN, defaultValue: true },
    is_rtl: { type: DataTypes.BOOLEAN, defaultValue: false },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'Language', tableName: 'languages',
    timestamps: true, underscored: true,
  });

  return Language;
};
