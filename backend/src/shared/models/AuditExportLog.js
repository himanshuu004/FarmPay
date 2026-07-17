const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class AuditExportLog extends Model {
    static associate() {}
  }
  AuditExportLog.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    exported_by: { type: DataTypes.INTEGER, allowNull: false },
    entity_type: { type: DataTypes.STRING(100), allowNull: true },
    filter_criteria: { type: DataTypes.JSON, allowNull: true },
    row_count: { type: DataTypes.INTEGER, allowNull: true },
    exported_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    s3_export_key: { type: DataTypes.STRING(255), allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'AuditExportLog', tableName: 'audit_export_logs',
    timestamps: true, underscored: true,
  });
  return AuditExportLog;
};
