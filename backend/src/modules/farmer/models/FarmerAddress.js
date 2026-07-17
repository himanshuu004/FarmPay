/**
 * FarmerAddress Model
 * Stores permanent, current, and farm addresses with LGD location references.
 * Includes structured sub-village fields and automatic history tracking.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class FarmerAddress extends Model {
    static associate(models) {
      FarmerAddress.belongsTo(models.User, { foreignKey: 'farmer_id', as: 'user' });
      FarmerAddress.belongsTo(models.LgdPanchayat, { foreignKey: 'lgd_panchayat_id', as: 'panchayat' });
      FarmerAddress.hasMany(models.FarmerAddressHistory, { foreignKey: 'farmer_address_id', as: 'history' });
    }
  }

  FarmerAddress.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      farmer_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      address_type: {
        type: DataTypes.ENUM('permanent', 'current', 'farm'),
        allowNull: false,
      },
      lgd_state_id: { type: DataTypes.INTEGER, allowNull: true },
      lgd_district_id: { type: DataTypes.INTEGER, allowNull: true },
      lgd_block_id: { type: DataTypes.INTEGER, allowNull: true },
      lgd_panchayat_id: {
        type: DataTypes.INTEGER, allowNull: true,
        references: { model: 'lgd_panchayats', key: 'id' },
      },
      lgd_village_id: { type: DataTypes.INTEGER, allowNull: true },
      house_number: { type: DataTypes.STRING(50), allowNull: true },
      ward_number: { type: DataTypes.STRING(20), allowNull: true },
      landmark: { type: DataTypes.STRING(150), allowNull: true },
      street_address: { type: DataTypes.STRING(255), allowNull: true },
      postal_code: { type: DataTypes.STRING(10), allowNull: true },
      latitude: { type: DataTypes.DECIMAL(10, 8), allowNull: true },
      longitude: { type: DataTypes.DECIMAL(11, 8), allowNull: true },
      is_primary_address: { type: DataTypes.BOOLEAN, defaultValue: false },
      address_verified_by_agent: { type: DataTypes.BOOLEAN, defaultValue: false },
      agent_verification_timestamp: { type: DataTypes.DATE, allowNull: true },
      verification_photo_url: { type: DataTypes.TEXT, allowNull: true },
      version_number: { type: DataTypes.INTEGER, defaultValue: 1 },
      address_confidence: {
        type: DataTypes.DECIMAL(5, 2), allowNull: true,
        comment: 'Composite validation score 0-100',
      },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize, modelName: 'FarmerAddress', tableName: 'farmer_addresses',
      timestamps: true, underscored: true,
      indexes: [
        { unique: true, fields: ['farmer_id', 'address_type'], name: 'idx_farmer_address_type', where: { is_active: true } },
      ],
      hooks: {
        afterUpdate: async (address, options) => {
          try {
            const { FarmerAddressHistory } = sequelize.models;
            if (!FarmerAddressHistory) return;

            const { v4: uuidv4 } = require('uuid');
            const snapshot = address.toJSON();
            delete snapshot.created_at;
            delete snapshot.updated_at;

            await FarmerAddressHistory.create({
              history_uuid: uuidv4(),
              farmer_address_id: address.id,
              farmer_id: address.farmer_id,
              version_number: address.version_number,
              change_type: 'updated',
              changed_by: options.userId || null,
              change_reason: options.changeReason || null,
              snapshot_data: snapshot,
            }, { transaction: options.transaction });

            // Increment version
            await address.increment('version_number', { transaction: options.transaction });
          } catch (err) {
            // Don't fail the main update if history logging fails
            const logger = require('../../../shared/utils/logger');
            logger.warn('Address history logging failed', { addressId: address.id, error: err.message });
          }
        },
      },
    }
  );

  return FarmerAddress;
};
