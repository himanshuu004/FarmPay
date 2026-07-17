const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class MediaProcessingJob extends Model {
    static associate(models) {
      MediaProcessingJob.belongsTo(models.MediaAsset, { foreignKey: 'media_asset_id', as: 'mediaAsset' });
    }
  }
  MediaProcessingJob.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    media_asset_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'media_assets', key: 'id' } },
    job_type: { type: DataTypes.ENUM('thumbnail', 'compress', 'convert'), allowNull: false },
    job_status: { type: DataTypes.ENUM('pending', 'in_progress', 'completed', 'failed'), defaultValue: 'pending' },
    started_at: { type: DataTypes.DATE, allowNull: true },
    completed_at: { type: DataTypes.DATE, allowNull: true },
    error_message: { type: DataTypes.TEXT, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'MediaProcessingJob', tableName: 'media_processing_jobs',
    timestamps: true, underscored: true,
  });
  return MediaProcessingJob;
};
