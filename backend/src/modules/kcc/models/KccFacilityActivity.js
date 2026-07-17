/**
 * KccFacilityActivity — an activity included in a facility, with the eligible
 * unit count (LIVE from registers, never a typed number — CLAUDE.md #6) and a
 * snapshot of the SoF schedule used at computation time (audit).
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class KccFacilityActivity extends Model {
    static associate(models) {
      if (models.KccFacility) KccFacilityActivity.belongsTo(models.KccFacility, { foreignKey: 'facility_id', as: 'facility' });
    }
  }
  KccFacilityActivity.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    facility_id: { type: DataTypes.INTEGER, allowNull: false },
    activity_code: { type: DataTypes.STRING(30), allowNull: false },
    units: { type: DataTypes.DECIMAL(10, 2), allowNull: false }, // resolved from register at compute time
    unit_type: { type: DataTypes.STRING(20), allowNull: false },
    sof_registry_id: { type: DataTypes.INTEGER, allowNull: true },
    sof_by_year_snapshot: { type: DataTypes.JSONB, allowNull: true },
    insurance_by_year_snapshot: { type: DataTypes.JSONB, allowNull: true },
  }, {
    sequelize, modelName: 'KccFacilityActivity', tableName: 'kcc_facility_activities',
    timestamps: true, underscored: true,
    indexes: [{ fields: ['facility_id'] }],
  });
  return KccFacilityActivity;
};
