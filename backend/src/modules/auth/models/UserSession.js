/**
 * UserSession Model
 * Tracks active JWT sessions per user/device for token management and logout.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class UserSession extends Model {
    static associate(models) {
      UserSession.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    }
  }

  UserSession.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      session_token: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        comment: 'Hashed access token identifier for lookup',
      },
      refresh_token: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'Hashed refresh token for rotation',
      },
      device_info: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Device name / OS description',
      },
      device_uuid: {
        type: DataTypes.STRING(36),
        allowNull: true,
        comment: 'Unique device identifier for multi-device management',
      },
      ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true,
      },
      user_agent: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: 'When the refresh token expires',
      },
      refreshed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Last time the access token was refreshed',
      },
      logged_out_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'When the user explicitly logged out',
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      sequelize,
      modelName: 'UserSession',
      tableName: 'user_sessions',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['user_id', 'expires_at'], name: 'idx_session_user_expiry' },
        { fields: ['refresh_token'], name: 'idx_session_refresh' },
      ],
    }
  );

  return UserSession;
};
