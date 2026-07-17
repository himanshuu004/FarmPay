/**
 * LgdDistrict Model
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class LgdDistrict extends Model {
    static associate(models) {
      LgdDistrict.belongsTo(models.LgdState, { foreignKey: 'state_id', as: 'state' });
      LgdDistrict.hasMany(models.LgdDistrictTranslation, { foreignKey: 'lgd_district_id', as: 'translations' });
      LgdDistrict.hasMany(models.LgdBlock, { foreignKey: 'district_id', as: 'blocks' });
    }
  }

  LgdDistrict.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    district_code: { type: DataTypes.STRING(10), allowNull: false, unique: true },
    state_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'lgd_states', key: 'id' } },
    district_name: { type: DataTypes.STRING(100), allowNull: false },
    district_name_en: { type: DataTypes.STRING(100), allowNull: true },
    longitude: { type: DataTypes.DECIMAL(11, 8), allowNull: true },
    latitude: { type: DataTypes.DECIMAL(10, 8), allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'LgdDistrict', tableName: 'lgd_districts',
    timestamps: true, underscored: true,
    indexes: [{ fields: ['state_id'] }],
  });

  return LgdDistrict;
};
