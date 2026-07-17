/**
 * Audit Log Model
 * Tracks all significant actions across the platform for compliance and debugging.
 * Records who did what, when, and on which resource.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AuditLog extends Model {
    static associate(models) {
      // Associations can be defined here when User model is available
    }
  }

  AuditLog.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'user_id',
        comment: 'ID of the user who performed the action',
      },
      action: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: 'Action performed (e.g. CREATE, UPDATE, DELETE, LOGIN)',
      },
      resourceType: {
        type: DataTypes.STRING(50),
        allowNull: false,
        field: 'resource_type',
        comment: 'Type of resource affected (e.g. farmer, transaction, document)',
      },
      resourceId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'resource_id',
        comment: 'ID of the affected resource',
      },
      previousData: {
        type: DataTypes.JSON,
        allowNull: true,
        field: 'previous_data',
        comment: 'Snapshot of data before the change',
      },
      newData: {
        type: DataTypes.JSON,
        allowNull: true,
        field: 'new_data',
        comment: 'Snapshot of data after the change',
      },
      ipAddress: {
        type: DataTypes.STRING(45),
        allowNull: true,
        field: 'ip_address',
      },
      userAgent: {
        type: DataTypes.STRING(500),
        allowNull: true,
        field: 'user_agent',
      },
      requestId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'request_id',
        comment: 'Correlating request ID for tracing',
      },
    },
    {
      sequelize,
      modelName: 'AuditLog',
      tableName: 'audit_logs',
      timestamps: true,
      updatedAt: false, // Audit logs are immutable
      indexes: [
        { fields: ['user_id'] },
        { fields: ['resource_type', 'resource_id'] },
        { fields: ['action'] },
        { fields: ['created_at'] },
      ],
    }
  );

  return AuditLog;
};
