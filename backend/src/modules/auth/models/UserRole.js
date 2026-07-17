/**
 * UserRole Model (Junction Table)
 * Maps users to their assigned roles.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class UserRole extends Model {
    static associate(models) {
      UserRole.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
      UserRole.belongsTo(models.Role, { foreignKey: 'role_id', as: 'role' });
    }
  }

  UserRole.init(
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
      role_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'roles', key: 'id' },
      },
      assigned_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      assigned_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        comment: 'User who assigned this role (null for self-registration)',
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      sequelize,
      modelName: 'UserRole',
      tableName: 'user_roles',
      timestamps: true,
      underscored: true,
      indexes: [
        { unique: true, fields: ['user_id', 'role_id'], name: 'idx_user_role_unique' },
      ],
    }
  );

  return UserRole;
};
