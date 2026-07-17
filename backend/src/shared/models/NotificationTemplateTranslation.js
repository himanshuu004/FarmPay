const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class NotificationTemplateTranslation extends Model {
    static associate(models) {
      NotificationTemplateTranslation.belongsTo(models.NotificationTemplate, { foreignKey: 'template_id', as: 'template' });
    }
  }
  NotificationTemplateTranslation.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    template_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'notification_templates', key: 'id' } },
    language_code: { type: DataTypes.STRING(10), allowNull: false },
    subject_translated: { type: DataTypes.STRING(255), allowNull: true },
    body_translated: { type: DataTypes.TEXT, allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'NotificationTemplateTranslation', tableName: 'notification_template_translations',
    timestamps: true, underscored: true,
    indexes: [{ unique: true, fields: ['template_id', 'language_code'], name: 'idx_notif_tmpl_lang_unique' }],
  });
  return NotificationTemplateTranslation;
};
