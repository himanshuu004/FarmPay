/**
 * Notification Model
 * Stores in-app and cross-channel notification records.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Notification extends Model {
    static associate(models) {
      // Associations can be defined here when User model is available
    }
  }

  Notification.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'user_id',
        comment: 'Target user for this notification',
      },
      title: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      body: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      type: {
        type: DataTypes.ENUM('info', 'warning', 'success', 'error', 'action_required'),
        defaultValue: 'info',
      },
      channel: {
        type: DataTypes.ENUM('in_app', 'email', 'sms', 'push'),
        defaultValue: 'in_app',
      },
      isRead: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'is_read',
      },
      readAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'read_at',
      },
      data: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Additional payload (deep-link URL, action data, etc.)',
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'expires_at',
      },
    },
    {
      sequelize,
      modelName: 'Notification',
      tableName: 'notifications',
      timestamps: true,
      indexes: [
        { fields: ['user_id', 'is_read'] },
        { fields: ['user_id', 'created_at'] },
        { fields: ['type'] },
      ],
    }
  );

  return Notification;
};
