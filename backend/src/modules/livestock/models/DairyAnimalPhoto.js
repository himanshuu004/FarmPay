/**
 * DairyAnimalPhoto Model
 * Manual photo uploads for dairy animals. No AI processing — uploaded via
 * standard multipart, resized via sharp at upload time, served by an
 * authenticated GET endpoint.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class DairyAnimalPhoto extends Model {
    static associate(models) {
      DairyAnimalPhoto.belongsTo(models.User, { foreignKey: 'farmer_id', as: 'farmer' });
    }
  }

  DairyAnimalPhoto.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      photo_uuid: { type: DataTypes.STRING(36), allowNull: false, unique: true },
      animal_id: { type: DataTypes.STRING(36), allowNull: false },
      farmer_id: { type: DataTypes.INTEGER, allowNull: false },
      photo_url: { type: DataTypes.STRING(500), allowNull: false },
      photo_type: {
        type: DataTypes.ENUM('PROFILE', 'HEALTH', 'TAG_VERIFICATION', 'OTHER'),
        allowNull: false,
        defaultValue: 'PROFILE',
      },
      caption: { type: DataTypes.STRING(200), allowNull: true },
      taken_at: { type: DataTypes.DATE, allowNull: true },
      is_primary: { type: DataTypes.BOOLEAN, defaultValue: false },
      file_size_kb: { type: DataTypes.INTEGER, allowNull: true },
      width_px: { type: DataTypes.INTEGER, allowNull: true },
      height_px: { type: DataTypes.INTEGER, allowNull: true },
      uploaded_via: { type: DataTypes.ENUM('CAMERA', 'GALLERY'), allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize,
      modelName: 'DairyAnimalPhoto',
      tableName: 'dairy_animal_photos',
      timestamps: true,
      underscored: true,
    },
  );

  return DairyAnimalPhoto;
};
