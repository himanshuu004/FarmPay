/**
 * FpoMembership Model
 * Farmer Producer Organization membership tracking.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class FpoMembership extends Model {
    static associate(models) {
      FpoMembership.belongsTo(models.User, { foreignKey: 'farmer_id', as: 'farmer' });
      FpoMembership.hasMany(models.FpoTransaction, { foreignKey: 'fpo_membership_id', as: 'transactions' });
    }
  }

  FpoMembership.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      membership_uuid: { type: DataTypes.STRING(36), allowNull: false, unique: true },
      farmer_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      fpo_name: { type: DataTypes.STRING(100), allowNull: false },
      fpo_registration_number: { type: DataTypes.STRING(50), allowNull: true },
      membership_status: {
        type: DataTypes.ENUM('active', 'inactive', 'suspended'), defaultValue: 'active',
      },
      share_value: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      joined_date: { type: DataTypes.DATEONLY, allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize, modelName: 'FpoMembership', tableName: 'fpo_memberships',
      timestamps: true, underscored: true,
      indexes: [
        { fields: ['membership_uuid'], unique: true },
        { fields: ['farmer_id'] },
      ],
    }
  );

  return FpoMembership;
};
