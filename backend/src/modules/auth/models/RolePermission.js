/**
 * RolePermission Model (Junction Table)
 * Maps permissions to roles — defines what each role is allowed to do.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class RolePermission extends Model {
    static associate(models) {
      RolePermission.belongsTo(models.Role, { foreignKey: 'role_id', as: 'role' });
      RolePermission.belongsTo(models.Permission, { foreignKey: 'permission_id', as: 'permission' });
    }
  }

  RolePermission.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      role_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'roles', key: 'id' },
      },
      permission_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'permissions', key: 'id' },
      },
    },
    {
      sequelize,
      modelName: 'RolePermission',
      tableName: 'role_permissions',
      timestamps: true,
      underscored: true,
      indexes: [
        { unique: true, fields: ['role_id', 'permission_id'], name: 'idx_role_permission_unique' },
      ],
    }
  );

  return RolePermission;
};
