/**
 * MediaAsset Model
 * Stores metadata for uploaded media files (images, videos, audio, PDFs).
 */
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class MediaAsset extends Model {
    static associate(models) {
      MediaAsset.hasMany(models.MediaTag, { foreignKey: 'media_asset_id', as: 'tags' });
      MediaAsset.hasMany(models.MediaAccessLog, { foreignKey: 'media_asset_id', as: 'accessLogs' });
      MediaAsset.hasMany(models.MediaProcessingJob, { foreignKey: 'media_asset_id', as: 'processingJobs' });
      MediaAsset.hasMany(models.MediaTranslation, { foreignKey: 'media_asset_id', as: 'translations' });
      MediaAsset.hasMany(models.MediaRendition, { foreignKey: 'media_asset_id', as: 'renditions' });
    }
  }
  MediaAsset.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    asset_uuid: { type: DataTypes.STRING(36), allowNull: false, unique: true },
    asset_type: { type: DataTypes.ENUM('image', 'video', 'audio', 'pdf'), allowNull: false },
    owner_id: { type: DataTypes.INTEGER, allowNull: false },
    original_filename: { type: DataTypes.STRING(255), allowNull: true },
    file_size_bytes: { type: DataTypes.INTEGER, allowNull: true },
    mime_type: { type: DataTypes.STRING(50), allowNull: true },
    s3_key: { type: DataTypes.STRING(255), allowNull: true },
    s3_bucket: { type: DataTypes.STRING(100), allowNull: true },
    duration_seconds: { type: DataTypes.INTEGER, allowNull: true },
    width: { type: DataTypes.INTEGER, allowNull: true },
    height: { type: DataTypes.INTEGER, allowNull: true },
    is_public: { type: DataTypes.BOOLEAN, defaultValue: false },
    uploaded_by: { type: DataTypes.INTEGER, allowNull: true },
    uploaded_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'MediaAsset', tableName: 'media_assets',
    timestamps: true, underscored: true,
    indexes: [{ fields: ['owner_id'] }],
  });
  return MediaAsset;
};
