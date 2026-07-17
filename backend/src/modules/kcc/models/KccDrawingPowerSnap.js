/**
 * KccDrawingPowerSnap — periodic drawing-power snapshot vs stocks / receivables /
 * cash flows (¶16(4)). Milk payables from the COOP ERP STRENGTHEN drawing power
 * as receivables evidence — but co-op input credit is NEVER counted inside the
 * KCC limit (CLAUDE.md #15).
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class KccDrawingPowerSnap extends Model {
    static associate(models) {
      if (models.KccFacility) KccDrawingPowerSnap.belongsTo(models.KccFacility, { foreignKey: 'facility_id', as: 'facility' });
    }
  }
  KccDrawingPowerSnap.init({
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    facility_id: { type: DataTypes.INTEGER, allowNull: false },
    snapshot_date: { type: DataTypes.DATEONLY, allowNull: false },
    stocks_value: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    milk_receivables: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 }, // co-op payables as evidence
    other_receivables: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    cash_flow_monthly: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    drawing_power: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    st_limit_cap: { type: DataTypes.DECIMAL(14, 2), allowNull: true }, // DP is capped at the ST sub-limit
  }, {
    sequelize, modelName: 'KccDrawingPowerSnap', tableName: 'kcc_drawing_power_snaps',
    timestamps: true, underscored: true,
    indexes: [{ fields: ['facility_id', 'snapshot_date'] }],
  });
  return KccDrawingPowerSnap;
};
