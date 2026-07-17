/**
 * InsurancePlan — a sellable NLM livestock cover variant (§5.1). Self-contained
 * (no insurance_products catalog in scope). Scheme parameters live here / in
 * rules_json (config, never code #5); the engine reads them.
 */
const { Model } = require('sequelize');

const SI_BASES = ['market_value', 'notional_avg_value', 'milk_yield_floor'];

module.exports = (sequelize, DataTypes) => {
  class InsurancePlan extends Model {
    static associate(models) {
      if (models.InsuranceProposal) InsurancePlan.hasMany(models.InsuranceProposal, { foreignKey: 'plan_id', as: 'proposals' });
      if (models.InsurancePolicy) InsurancePlan.hasMany(models.InsurancePolicy, { foreignKey: 'plan_id', as: 'policies' });
    }
  }
  InsurancePlan.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    plan_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    plan_code: { type: DataTypes.STRING(50), allowNull: false, unique: true }, // e.g. NLM-CATTLE-3YR-UK
    name: { type: DataTypes.STRING(150), allowNull: false },
    scheme: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'NLM' }, // NLM only in v1
    species: { type: DataTypes.STRING(20), allowNull: false }, // CATTLE|BUFFALO|GOAT|SHEEP|PIG|RABBIT...
    term_months: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 36 },
    farmer_share_pct: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 15.0 },
    govt_share_pct: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 85.0 },
    si_basis: { type: DataTypes.ENUM(...SI_BASES), allowNull: false, defaultValue: 'market_value' },
    cattle_unit_cap: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 10 },
    waiting_period_days: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 21 },
    region: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'HIM' }, // Uttarakhand
    rules_json: { type: DataTypes.JSONB, allowNull: true }, // ceilings, govt split, add-ons
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'InsurancePlan', tableName: 'insurance_plans',
    timestamps: true, underscored: true,
  });
  InsurancePlan.SI_BASES = SI_BASES;
  return InsurancePlan;
};
