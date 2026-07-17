/**
 * UserPermission Model (Junction Table)
 * Grants individual permissions directly to users (beyond role-based permissions).
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class UserPermission extends Model {
    static associate(models) {
      UserPermission.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
      UserPermission.belongsTo(models.Permission, { foreignKey: 'permission_id', as: 'permission' });
    }
  }

  UserPermission.init(
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
      permission_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'permissions', key: 'id' },
      },
      granted_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      granted_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      sequelize,
      modelName: 'UserPermission',
      tableName: 'user_permissions',
      timestamps: true,
      underscored: true,
      indexes: [
        { unique: true, fields: ['user_id', 'permission_id'], name: 'idx_user_permission_unique' },
      ],
    }
  );

  return UserPermission;
};
