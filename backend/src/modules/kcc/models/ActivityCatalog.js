/**
 * ActivityCatalog — every KCC-eligible allied activity (¶8(2)). Credit works
 * for ALL of these from day 1 (incl. FISHERY) even where the ERP module is
 * deferred. `kcc_ready` gates activities with no notified SoF → outside KCC
 * (¶16(2)). `insurance_scheme` routes protection (NLM/PMMSY/private) — no PMFBY.
 */
const { Model } = require('sequelize');

const CATEGORIES = ['ANIMAL_HUSBANDRY', 'FISHERIES_AQUACULTURE', 'OTHER_ALLIED'];
const INSURANCE_SCHEMES = ['NLM', 'PMMSY', 'PRIVATE_STATE', 'NONE'];

module.exports = (sequelize, DataTypes) => {
  class ActivityCatalog extends Model {
    static associate() {}
  }
  ActivityCatalog.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    code: { type: DataTypes.STRING(30), allowNull: false, unique: true }, // DAIRY, FISHERY, GOATERY, ...
    name: { type: DataTypes.STRING(80), allowNull: false },
    category: { type: DataTypes.ENUM(...CATEGORIES), allowNull: false },
    unit_type: { type: DataTypes.STRING(20), allowNull: false }, // ANIMAL | ACRE | HIVE | ...
    insurance_scheme: { type: DataTypes.ENUM(...INSURANCE_SCHEMES), allowNull: false, defaultValue: 'NONE' },
    // Which register supplies live unit counts for the engine (never a typed number).
    register_source: { type: DataTypes.STRING(40), allowNull: true }, // 'DairyAnimal', 'FisheryPond', ...
    kcc_ready: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }, // false → SoF pending (¶16(2))
    erp_module_phase: { type: DataTypes.INTEGER, allowNull: true }, // when deep ERP lands (fishery = 4)
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'ActivityCatalog', tableName: 'activity_catalog',
    timestamps: true, underscored: true,
  });
  ActivityCatalog.CATEGORIES = CATEGORIES;
  ActivityCatalog.INSURANCE_SCHEMES = INSURANCE_SCHEMES;
  return ActivityCatalog;
};
