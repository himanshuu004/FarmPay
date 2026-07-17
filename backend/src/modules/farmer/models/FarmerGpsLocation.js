/**
 * FarmerGpsLocation Model
 * GPS coordinates for farm fields, including boundary points and accuracy metadata.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class FarmerGpsLocation extends Model {
    static associate(models) {
      FarmerGpsLocation.belongsTo(models.User, { foreignKey: 'farmer_id', as: 'user' });
    }
  }

  FarmerGpsLocation.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      farmer_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      field_id: { type: DataTypes.INTEGER, allowNull: true, comment: 'Links to a specific farm field' },
      latitude: { type: DataTypes.DECIMAL(10, 8), allowNull: false },
      longitude: { type: DataTypes.DECIMAL(11, 8), allowNull: false },
      accuracy_meters: { type: DataTypes.INTEGER, allowNull: true },
      recorded_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      device_uuid: { type: DataTypes.STRING(36), allowNull: true },
      is_field_boundary_point: { type: DataTypes.BOOLEAN, defaultValue: false },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize, modelName: 'FarmerGpsLocation', tableName: 'farmer_gps_locations',
      timestamps: true, underscored: true,
      indexes: [{ fields: ['farmer_id'] }],
    }
  );

  return FarmerGpsLocation;
};
