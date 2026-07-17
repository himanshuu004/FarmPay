/**
 * FarmerActivityPreference Model
 * Communication and notification preferences per farmer.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class FarmerActivityPreference extends Model {
    static associate(models) {
      FarmerActivityPreference.belongsTo(models.User, { foreignKey: 'farmer_id', as: 'user' });
    }
  }

  FarmerActivityPreference.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      farmer_id: {
        type: DataTypes.INTEGER, allowNull: false, unique: true,
        references: { model: 'users', key: 'id' },
      },
      prefers_mobile_app: { type: DataTypes.BOOLEAN, defaultValue: true },
      prefers_sms: { type: DataTypes.BOOLEAN, defaultValue: true },
      prefers_call: { type: DataTypes.BOOLEAN, defaultValue: false },
      prefers_email: { type: DataTypes.BOOLEAN, defaultValue: false },
      notification_frequency: {
        type: DataTypes.ENUM('real_time', 'daily', 'weekly', 'monthly', 'never'),
        defaultValue: 'daily',
      },
      preferred_language: { type: DataTypes.STRING(10), defaultValue: 'en' },
      preferred_time_window_start: { type: DataTypes.STRING(5), allowNull: true, comment: 'HH:MM format' },
      preferred_time_window_end: { type: DataTypes.STRING(5), allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize, modelName: 'FarmerActivityPreference', tableName: 'farmer_activity_preferences',
      timestamps: true, underscored: true,
    }
  );

  return FarmerActivityPreference;
};
