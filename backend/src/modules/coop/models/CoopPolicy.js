/**
 * CoopPolicy — the co-op ordering parameters, as CONFIG not code (CLAUDE.md #5).
 *
 * Governs the 70%-of-payables order limit and the 1st/3rd-week demand windows
 * (blueprint §7). Scoped DEFAULT platform-wide, overridable per society/union
 * later. A seeded DEFAULT row is the source of truth; coopPolicyService falls
 * back to hard-coded defaults only if the table is empty.
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CoopPolicy extends Model {
    static associate() {}
  }
  CoopPolicy.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    policy_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    // 'DEFAULT' or a society_ref / union_ref for overrides.
    scope: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'DEFAULT', unique: true },
    // 70% of outstanding milk payables.
    order_limit_factor: { type: DataTypes.DECIMAL(4, 3), allowNull: false, defaultValue: 0.700 },
    // Supply-regularity floor for credit-linked inputs (0..1).
    min_consistency: { type: DataTypes.DECIMAL(4, 3), allowNull: false, defaultValue: 0.500 },
    // Demand windows as day-of-month ranges: 1st week (1–7) and 3rd week (15–21).
    demand_windows: {
      type: DataTypes.JSONB, allowNull: false,
      defaultValue: [
        { label: 'WEEK_1', fromDay: 1, toDay: 7 },
        { label: 'WEEK_3', fromDay: 15, toDay: 21 },
      ],
    },
    currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'INR' },
    version: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'COOP_POLICY_V1' },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'CoopPolicy', tableName: 'coop_policy',
    timestamps: true, underscored: true,
  });
  return CoopPolicy;
};
