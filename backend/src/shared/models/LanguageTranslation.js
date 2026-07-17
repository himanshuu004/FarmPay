/**
 * LanguageTranslation Model
 * Polymorphic translation table for any translatable entity.
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class LanguageTranslation extends Model {
    static associate() {}
  }

  LanguageTranslation.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    translatable_type: { type: DataTypes.STRING(100), allowNull: false, comment: 'Entity type being translated' },
    translatable_id: { type: DataTypes.INTEGER, allowNull: false, comment: 'Entity ID' },
    language_code: { type: DataTypes.STRING(10), allowNull: false },
    key_name: { type: DataTypes.STRING(100), allowNull: false, comment: 'Field name being translated' },
    translated_value: { type: DataTypes.TEXT, allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'LanguageTranslation', tableName: 'language_translations',
    timestamps: true, underscored: true,
    indexes: [{ unique: true, fields: ['translatable_type', 'translatable_id', 'language_code', 'key_name'], name: 'idx_translation_unique' }],
  });

  return LanguageTranslation;
};
