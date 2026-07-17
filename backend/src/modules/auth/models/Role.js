/**
 * Role Model
 * Defines the roles available in the platform (FARMER, ADMIN, AGENT, etc.).
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Role extends Model {
    static associate(models) {
      Role.hasMany(models.UserRole, { foreignKey: 'role_id', as: 'userRoles' });
      Role.hasMany(models.RolePermission, { foreignKey: 'role_id', as: 'rolePermissions' });
    }
  }

  Role.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      role_name: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: 'Machine-readable role identifier (e.g. FARMER, ADMIN)',
      },
      display_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      priority: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: 'Higher priority = more privileged role',
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      sequelize,
      modelName: 'Role',
      tableName: 'roles',
      timestamps: true,
      underscored: true,
    }
  );

  return Role;
};
