/**
 * NotificationTemplate Model
 * Reusable notification templates with variable substitution and multi-channel support.
 */
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class NotificationTemplate extends Model {
    static associate(models) {
      NotificationTemplate.hasMany(models.NotificationTemplateTranslation, { foreignKey: 'template_id', as: 'translations' });
      NotificationTemplate.hasMany(models.NotificationV2, { foreignKey: 'template_id', as: 'notifications' });
    }
  }
  NotificationTemplate.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    template_code: { type: DataTypes.STRING(100), allowNull: false, unique: true, comment: 'e.g. OTP_SENT, LOAN_APPROVED, WEATHER_ALERT' },
    template_name: { type: DataTypes.STRING(255), allowNull: false },
    category: { type: DataTypes.STRING(50), allowNull: true, comment: 'auth, loan, weather, market, etc.' },
    subject_line: { type: DataTypes.STRING(255), allowNull: true },
    body_template: { type: DataTypes.TEXT, allowNull: false, comment: 'Supports {variable} substitution' },
    supported_channels: { type: DataTypes.STRING(50), defaultValue: 'in_app', comment: 'Comma-separated: sms,email,push,in_app' },
    priority: { type: DataTypes.ENUM('low', 'normal', 'high', 'urgent'), defaultValue: 'normal' },
    retry_count: { type: DataTypes.INTEGER, defaultValue: 3 },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'NotificationTemplate', tableName: 'notification_templates',
    timestamps: true, underscored: true,
  });
  return NotificationTemplate;
};
