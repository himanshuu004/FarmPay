/**
 * KccLimitSchedule — the persisted 6-year MPL/drawing-limit schedule produced by
 * the Limit Engine for a facility (the auto-generated documentation schedule).
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class KccLimitSchedule extends Model {
    static associate(models) {
      if (models.KccFacility) KccLimitSchedule.belongsTo(models.KccFacility, { foreignKey: 'facility_id', as: 'facility' });
    }
  }
  KccLimitSchedule.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    facility_id: { type: DataTypes.INTEGER, allowNull: false },
    year_index: { type: DataTypes.INTEGER, allowNull: false }, // 1..6
    wc_total: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    mpl: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    drawing_limit: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    breakdown: { type: DataTypes.JSONB, allowNull: true }, // per-activity WC + %s + insurance
  }, {
    sequelize, modelName: 'KccLimitSchedule', tableName: 'kcc_limit_schedules',
    timestamps: true, underscored: true,
    indexes: [{ unique: true, fields: ['facility_id', 'year_index'] }],
  });
  return KccLimitSchedule;
};
