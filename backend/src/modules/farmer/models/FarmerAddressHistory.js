/**
 * FarmerAddressHistory Model
 * Immutable history of address changes for audit trail and versioning.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class FarmerAddressHistory extends Model {
    static associate(models) {
      FarmerAddressHistory.belongsTo(models.FarmerAddress, { foreignKey: 'farmer_address_id', as: 'address' });
      FarmerAddressHistory.belongsTo(models.User, { foreignKey: 'farmer_id', as: 'farmer' });
      FarmerAddressHistory.belongsTo(models.User, { foreignKey: 'changed_by', as: 'changedByUser' });
    }
  }

  FarmerAddressHistory.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      history_uuid: { type: DataTypes.STRING(36), allowNull: false, unique: true },
      farmer_address_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'farmer_addresses', key: 'id' },
      },
      farmer_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      version_number: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      change_type: {
        type: DataTypes.ENUM('created', 'updated', 'deactivated'),
        allowNull: false,
      },
      changed_by: {
        type: DataTypes.INTEGER, allowNull: true,
        references: { model: 'users', key: 'id' },
        comment: 'User who made the change (farmer, agent, admin)',
      },
      change_reason: { type: DataTypes.STRING(255), allowNull: true },
      snapshot_data: {
        type: DataTypes.JSON, allowNull: true,
        comment: 'Full serialized address state at this point in time',
      },
    },
    {
      sequelize, modelName: 'FarmerAddressHistory', tableName: 'farmer_address_history',
      timestamps: true, underscored: true,
      updatedAt: false,
      indexes: [
        { fields: ['farmer_address_id', 'version_number'], name: 'idx_addr_history_version' },
        { fields: ['farmer_id'], name: 'idx_addr_history_farmer' },
      ],
    }
  );

  return FarmerAddressHistory;
};
