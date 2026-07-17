/**
 * LgdState Model
 * India's states and union territories from the Land Geographic Database.
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class LgdState extends Model {
    static associate(models) {
      LgdState.hasMany(models.LgdStateTranslation, { foreignKey: 'lgd_state_id', as: 'translations' });
      LgdState.hasMany(models.LgdDistrict, { foreignKey: 'state_id', as: 'districts' });
    }
  }

  LgdState.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    state_code: { type: DataTypes.STRING(5), allowNull: false, unique: true },
    state_name: { type: DataTypes.STRING(50), allowNull: false },
    state_name_en: { type: DataTypes.STRING(50), allowNull: true },
    state_abbreviation: { type: DataTypes.STRING(3), allowNull: true },
    region: { type: DataTypes.STRING(50), allowNull: true, comment: 'North, South, East, West, Central, Northeast' },
    is_union_territory: { type: DataTypes.BOOLEAN, defaultValue: false },
    gst_code: { type: DataTypes.STRING(5), allowNull: true },
    longitude: { type: DataTypes.DECIMAL(11, 8), allowNull: true },
    latitude: { type: DataTypes.DECIMAL(10, 8), allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'LgdState', tableName: 'lgd_states',
    timestamps: true, underscored: true,
  });

  return LgdState;
};
