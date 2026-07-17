const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class DocumentAccessLog extends Model {
    static associate(models) {
      DocumentAccessLog.belongsTo(models.DocumentV2, { foreignKey: 'document_id', as: 'document' });
    }
  }
  DocumentAccessLog.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    document_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'documents_v2', key: 'id' } },
    accessed_by: { type: DataTypes.INTEGER, allowNull: false },
    access_type: { type: DataTypes.ENUM('view', 'download', 'print', 'export'), allowNull: false },
    accessed_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    ip_address: { type: DataTypes.STRING(45), allowNull: true },
    device_info: { type: DataTypes.TEXT, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'DocumentAccessLog', tableName: 'document_access_logs',
    timestamps: true, underscored: true,
    indexes: [{ fields: ['document_id', 'accessed_at'] }],
  });
  return DocumentAccessLog;
};
