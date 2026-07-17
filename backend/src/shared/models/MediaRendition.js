const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class MediaRendition extends Model {
    static associate(models) {
      MediaRendition.belongsTo(models.MediaAsset, { foreignKey: 'media_asset_id', as: 'mediaAsset' });
    }
  }
  MediaRendition.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    media_asset_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'media_assets', key: 'id' } },
    rendition_type: { type: DataTypes.STRING(50), allowNull: false, comment: 'e.g. thumbnail_sm, thumbnail_lg, webp, compressed' },
    file_size_bytes: { type: DataTypes.INTEGER, allowNull: true },
    dimensions: { type: DataTypes.STRING(20), allowNull: true, comment: 'e.g. 150x150, 800x600' },
    s3_key: { type: DataTypes.STRING(255), allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'MediaRendition', tableName: 'media_renditions',
    timestamps: true, underscored: true,
  });
  return MediaRendition;
};
