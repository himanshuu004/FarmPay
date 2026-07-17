/**
 * MarketMilkRateChart — the society milk-rate board, as CONFIG not code
 * (CLAUDE.md #5). Fat/SNF two-axis pricing: rate/litre =
 *   perFatPoint × fat% + perSnfPoint × snf%   (clamped to [minRate, maxRate]).
 *
 * Scoped DEFAULT platform-wide, overridable per society/union. The authoritative
 * source is the ERP; `source` records how the live row arrived (config seed,
 * filedrop, or live API). One active chart per scope.
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class MarketMilkRateChart extends Model {
    static associate() {}
  }
  MarketMilkRateChart.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    chart_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    scope: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'DEFAULT', unique: true },
    method: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'TWO_AXIS' }, // TWO_AXIS | FLAT
    // { perFatPoint, perSnfPoint, minRate, maxRate }  (₹ per litre coefficients)
    rules_json: {
      type: DataTypes.JSONB, allowNull: false,
      defaultValue: { perFatPoint: 4.5, perSnfPoint: 1.2, minRate: 18, maxRate: 90 },
    },
    currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'INR' },
    effective_from: { type: DataTypes.DATEONLY, allowNull: true },
    source: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'config' }, // config|filedrop|live
    version: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'MILK_RATE_V1' },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'MarketMilkRateChart', tableName: 'market_milk_rate_charts',
    timestamps: true, underscored: true,
  });
  return MarketMilkRateChart;
};
