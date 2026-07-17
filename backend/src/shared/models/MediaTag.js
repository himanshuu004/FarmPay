const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class MediaTag extends Model {
    static associate(models) {
      MediaTag.belongsTo(models.MediaAsset, { foreignKey: 'media_asset_id', as: 'mediaAsset' });
    }
  }
  MediaTag.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    media_asset_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'media_assets', key: 'id' } },
    tag_name: { type: DataTypes.STRING(50), allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'MediaTag', tableName: 'media_tags',
    timestamps: true, underscored: true,
    indexes: [{ unique: true, fields: ['media_asset_id', 'tag_name'], name: 'idx_media_tag_unique' }],
  });
  return MediaTag;
};
