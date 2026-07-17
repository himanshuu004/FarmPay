/**
 * User Model
 * Core user table — stores credentials, profile, and verification status.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    static associate(models) {
      User.hasMany(models.UserRole, { foreignKey: 'user_id', as: 'userRoles' });
      User.hasMany(models.UserPermission, { foreignKey: 'user_id', as: 'userPermissions' });
      User.hasMany(models.UserSession, { foreignKey: 'user_id', as: 'sessions' });
    }

    /**
     * Returns a safe user object without sensitive fields.
     * @returns {Object}
     */
    toSafeJSON() {
      const values = this.toJSON();
      delete values.password_hash;
      delete values.mpin_hash;
      delete values.failed_login_attempts;
      delete values.account_locked_until;
      return values;
    }
  }

  User.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      user_id: {
        type: DataTypes.STRING(36),
        allowNull: false,
        unique: true,
        comment: 'Public-facing UUID — used in API responses and JWT payloads',
      },
      email: {
        type: DataTypes.STRING(120),
        allowNull: true,
        unique: true,
        validate: { isEmail: true },
      },
      mobile: {
        type: DataTypes.STRING(13),
        allowNull: false,
        unique: true,
        comment: 'Indian mobile: 10 digits, stored with country code (+91)',
      },
      password_hash: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Legacy password. NULL for MPIN-onboarded users.',
      },
      mpin_hash: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'bcrypt hash of 4-digit MPIN (primary credential)',
      },
      first_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      last_name: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      profile_picture_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      date_of_birth: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      gender: {
        type: DataTypes.ENUM('male', 'female', 'other'),
        allowNull: true,
      },
      is_email_verified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      is_mobile_verified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      last_login: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      failed_login_attempts: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      account_locked_until: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Account locked after too many failed login attempts',
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      sequelize,
      modelName: 'User',
      tableName: 'users',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['mobile', 'created_at'], name: 'idx_mobile_created' },
        { fields: ['email'] },
        { fields: ['user_id'] },
      ],
    }
  );

  return User;
};
