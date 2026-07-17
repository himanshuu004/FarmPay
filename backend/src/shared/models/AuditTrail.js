const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class AuditTrail extends Model {
    static associate(models) {
      AuditTrail.belongsTo(models.AuditLogV2, { foreignKey: 'audit_log_id', as: 'auditLog' });
    }
  }
  AuditTrail.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    audit_log_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'audit_logs_v2', key: 'id' } },
    change_sequence: { type: DataTypes.INTEGER, allowNull: false },
    field_name: { type: DataTypes.STRING(100), allowNull: false },
    old_value: { type: DataTypes.TEXT, allowNull: true },
    new_value: { type: DataTypes.TEXT, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'AuditTrail', tableName: 'audit_trails',
    timestamps: true, underscored: true,
  });
  return AuditTrail;
};
