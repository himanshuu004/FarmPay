/**
 * Permission Model
 * Fine-grained permissions that can be assigned to roles or directly to users.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Permission extends Model {
    static associate(models) {
      Permission.hasMany(models.RolePermission, { foreignKey: 'permission_id', as: 'rolePermissions' });
      Permission.hasMany(models.UserPermission, { foreignKey: 'permission_id', as: 'userPermissions' });
    }
  }

  Permission.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      permission_code: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment: 'Machine-readable code (e.g. auth:register, farmer:view_profile)',
      },
      display_name: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      category: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'Grouping category (auth, farmer, loan, report, etc.)',
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      sequelize,
      modelName: 'Permission',
      tableName: 'permissions',
      timestamps: true,
      underscored: true,
    }
  );

  return Permission;
};
