/**
 * NotificationV2 Model
 * Individual notification records with delivery tracking.
 */
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class NotificationV2 extends Model {
    static associate(models) {
      NotificationV2.belongsTo(models.User, { foreignKey: 'recipient_user_id', as: 'recipient' });
      NotificationV2.belongsTo(models.NotificationTemplate, { foreignKey: 'template_id', as: 'template' });
    }
  }
  NotificationV2.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    notification_uuid: { type: DataTypes.STRING(36), allowNull: false, unique: true },
    recipient_user_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
    template_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'notification_templates', key: 'id' } },
    notification_type: { type: DataTypes.ENUM('alert', 'info', 'warning', 'success', 'reminder'), defaultValue: 'info' },
    channels_used: { type: DataTypes.STRING(50), defaultValue: 'in_app', comment: 'Comma-separated channels actually used' },
    template_variables: { type: DataTypes.JSON, allowNull: true, comment: 'Variables substituted into template' },
    sent_at: { type: DataTypes.DATE, allowNull: true },
    read_at: { type: DataTypes.DATE, allowNull: true },
    delivery_status: { type: DataTypes.ENUM('pending', 'sent', 'failed', 'bounced'), defaultValue: 'pending' },
    error_message: { type: DataTypes.TEXT, allowNull: true },
    request_id: { type: DataTypes.STRING(36), allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'NotificationV2', tableName: 'notifications_v2',
    timestamps: true, underscored: true,
    indexes: [
      { fields: ['recipient_user_id', 'created_at'], name: 'idx_notif_recipient' },
      { fields: ['delivery_status', 'sent_at'], name: 'idx_notif_delivery' },
    ],
  });
  return NotificationV2;
};
