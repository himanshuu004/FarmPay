const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class MediaTranslation extends Model {
    static associate(models) {
      MediaTranslation.belongsTo(models.MediaAsset, { foreignKey: 'media_asset_id', as: 'mediaAsset' });
    }
  }
  MediaTranslation.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    media_asset_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'media_assets', key: 'id' } },
    language_code: { type: DataTypes.STRING(10), allowNull: false },
    title_translated: { type: DataTypes.STRING(255), allowNull: true },
    description_translated: { type: DataTypes.TEXT, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'MediaTranslation', tableName: 'media_translations',
    timestamps: true, underscored: true,
    indexes: [{ unique: true, fields: ['media_asset_id', 'language_code'], name: 'idx_media_lang_unique' }],
  });
  return MediaTranslation;
};
