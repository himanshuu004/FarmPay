const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class DocumentVersion extends Model {
    static associate(models) {
      DocumentVersion.belongsTo(models.DocumentV2, { foreignKey: 'document_id', as: 'document' });
    }
  }
  DocumentVersion.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    document_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'documents_v2', key: 'id' } },
    version_number: { type: DataTypes.INTEGER, allowNull: false },
    s3_key: { type: DataTypes.STRING(255), allowNull: false },
    created_by: { type: DataTypes.INTEGER, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'DocumentVersion', tableName: 'document_versions',
    timestamps: true, underscored: true,
    indexes: [{ unique: true, fields: ['document_id', 'version_number'], name: 'idx_doc_version_unique' }],
  });
  return DocumentVersion;
};
