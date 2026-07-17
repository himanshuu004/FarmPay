/**
 * AuditLogV2 Model
 * Enhanced audit logging with sensitivity levels and field-level tracking.
 */
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class AuditLogV2 extends Model {
    static associate(models) {
      AuditLogV2.hasMany(models.AuditTrail, { foreignKey: 'audit_log_id', as: 'trails' });
    }
  }
  AuditLogV2.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    audit_uuid: { type: DataTypes.STRING(36), allowNull: false, unique: true },
    entity_type: { type: DataTypes.STRING(100), allowNull: false },
    entity_id: { type: DataTypes.INTEGER, allowNull: true },
    action: { type: DataTypes.ENUM('create', 'read', 'update', 'delete', 'export', 'approve', 'reject'), allowNull: false },
    action_by: { type: DataTypes.INTEGER, allowNull: true },
    action_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    changed_fields: { type: DataTypes.JSON, allowNull: true },
    old_values: { type: DataTypes.JSON, allowNull: true },
    new_values: { type: DataTypes.JSON, allowNull: true },
    ip_address: { type: DataTypes.STRING(45), allowNull: true },
    user_agent: { type: DataTypes.TEXT, allowNull: true },
    sensitivity_level: { type: DataTypes.ENUM('1_public', '2_pii', '3_financial', '4_identity'), defaultValue: '1_public' },
    request_id: { type: DataTypes.STRING(36), allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'AuditLogV2', tableName: 'audit_logs_v2',
    timestamps: true, underscored: true,
    indexes: [
      { fields: ['entity_type', 'entity_id', 'action_at'], name: 'idx_audit_entity' },
      { fields: ['action_by', 'action_at'], name: 'idx_audit_actor' },
    ],
  });
  return AuditLogV2;
};
