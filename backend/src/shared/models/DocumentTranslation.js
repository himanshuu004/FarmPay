const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class DocumentTranslation extends Model {
    static associate(models) {
      DocumentTranslation.belongsTo(models.DocumentV2, { foreignKey: 'document_id', as: 'document' });
    }
  }
  DocumentTranslation.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    document_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'documents_v2', key: 'id' } },
    language_code: { type: DataTypes.STRING(10), allowNull: false },
    document_name_translated: { type: DataTypes.STRING(255), allowNull: true },
    description_translated: { type: DataTypes.TEXT, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'DocumentTranslation', tableName: 'document_translations',
    timestamps: true, underscored: true,
    indexes: [{ unique: true, fields: ['document_id', 'language_code'], name: 'idx_doc_lang_unique' }],
  });
  return DocumentTranslation;
};
