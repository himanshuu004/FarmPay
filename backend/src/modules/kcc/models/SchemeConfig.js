/**
 * SchemeConfig — versioned KCC scheme parameters. Both KCC_DIR_2026 (sanctions
 * from 01-Jan-2027) and KCC_MC_2018 (pre-2027) coexist; the engine reads the
 * version applicable at sanction date. MISS subvention rates live here too —
 * config, not code (CLAUDE.md #5).
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SchemeConfig extends Model {
    static associate() {}
  }
  SchemeConfig.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    code: { type: DataTypes.STRING(20), allowNull: false, unique: true }, // KCC_DIR_2026 | KCC_MC_2018
    consumption_pct: { type: DataTypes.DECIMAL(4, 3), allowNull: false, defaultValue: 0.100 },
    maintenance_pct: { type: DataTypes.DECIMAL(4, 3), allowNull: false, defaultValue: 0.200 },
    escalation_pct: { type: DataTypes.DECIMAL(4, 3), allowNull: false, defaultValue: 0.100 },
    tenure_years: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 6 },
    collateral_free_limit: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 200000 }, // ¶23
    collateral_free_tieup_limit: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 300000 },
    // MISS (FY25-26): 7% lending, 1.5% subvention, 3% PRI → 4% effective; ₹2L AH sub-limit.
    miss: {
      type: DataTypes.JSONB, allowNull: false,
      defaultValue: { lendingRate: 0.07, subvention: 0.015, pri: 0.03, effectiveRate: 0.04, ahSubLimit: 200000 },
    },
    applicable_from: { type: DataTypes.DATEONLY, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'SchemeConfig', tableName: 'scheme_configs',
    timestamps: true, underscored: true,
  });
  return SchemeConfig;
};
