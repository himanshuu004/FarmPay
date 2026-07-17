const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class MediaAccessLog extends Model {
    static associate(models) {
      MediaAccessLog.belongsTo(models.MediaAsset, { foreignKey: 'media_asset_id', as: 'mediaAsset' });
    }
  }
  MediaAccessLog.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    media_asset_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'media_assets', key: 'id' } },
    accessed_by: { type: DataTypes.INTEGER, allowNull: false },
    accessed_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    ip_address: { type: DataTypes.STRING(45), allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'MediaAccessLog', tableName: 'media_access_logs',
    timestamps: true, underscored: true,
  });
  return MediaAccessLog;
};
