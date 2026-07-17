/**
 * DocumentV2 Model
 * Enhanced document storage with encryption, versioning, and access control.
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class DocumentV2 extends Model {
    static associate(models) {
      DocumentV2.hasMany(models.DocumentTranslation, { foreignKey: 'document_id', as: 'translations' });
      DocumentV2.hasMany(models.DocumentAccessLog, { foreignKey: 'document_id', as: 'accessLogs' });
      DocumentV2.hasMany(models.DocumentApproval, { foreignKey: 'document_id', as: 'approvals' });
      DocumentV2.hasMany(models.DocumentVersion, { foreignKey: 'document_id', as: 'versions' });
    }
  }

  DocumentV2.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    document_uuid: { type: DataTypes.STRING(36), allowNull: false, unique: true },
    owner_id: { type: DataTypes.INTEGER, allowNull: false },
    document_type: {
      type: DataTypes.ENUM('kyc', 'loan_application', 'land_proof', 'bank_statement', 'other_evidence', 'receipt', 'agreement'),
      allowNull: false,
    },
    document_name: { type: DataTypes.STRING(255), allowNull: false },
    file_extension: { type: DataTypes.STRING(10), allowNull: true },
    file_size_bytes: { type: DataTypes.INTEGER, allowNull: true },
    mime_type: { type: DataTypes.STRING(50), allowNull: true },
    s3_key: { type: DataTypes.STRING(255), allowNull: true },
    s3_bucket: { type: DataTypes.STRING(100), allowNull: true },
    uploaded_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    uploaded_by: { type: DataTypes.INTEGER, allowNull: true },
    is_encrypted: { type: DataTypes.BOOLEAN, defaultValue: false },
    encryption_key_id: { type: DataTypes.STRING(100), allowNull: true },
    visibility: { type: DataTypes.ENUM('private', 'shared', 'public'), defaultValue: 'private' },
    expiry_date: { type: DataTypes.DATE, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'DocumentV2', tableName: 'documents_v2',
    timestamps: true, underscored: true,
    indexes: [{ fields: ['owner_id', 'created_at'] }],
  });

  return DocumentV2;
};
