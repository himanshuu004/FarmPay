/**
 * LgdBlock Model
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class LgdBlock extends Model {
    static associate(models) {
      LgdBlock.belongsTo(models.LgdDistrict, { foreignKey: 'district_id', as: 'district' });
      LgdBlock.hasMany(models.LgdBlockTranslation, { foreignKey: 'lgd_block_id', as: 'translations' });
      LgdBlock.hasMany(models.LgdVillage, { foreignKey: 'block_id', as: 'villages' });
    }
  }

  LgdBlock.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    block_code: { type: DataTypes.STRING(10), allowNull: false, unique: true },
    district_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'lgd_districts', key: 'id' } },
    block_name: { type: DataTypes.STRING(100), allowNull: false },
    block_name_en: { type: DataTypes.STRING(100), allowNull: true },
    longitude: { type: DataTypes.DECIMAL(11, 8), allowNull: true },
    latitude: { type: DataTypes.DECIMAL(10, 8), allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'LgdBlock', tableName: 'lgd_blocks',
    timestamps: true, underscored: true,
    indexes: [{ fields: ['district_id'] }],
  });

  return LgdBlock;
};
