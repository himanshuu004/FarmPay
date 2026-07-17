/**
 * AdvisoryRulePack — a deterministic dairy advisory rule set, as CONFIG not code
 * (CLAUDE.md #5, #20: statutory/agronomic math is never a model). Categories:
 * VACCINATION (FMD/HS/BQ), MASTITIS, HEAT_STRESS (THI), BREEDING, DRY_OFF.
 * `rules_json` carries the thresholds/intervals; the engine reads them and
 * NEVER hardcodes a schedule. AI may later re-rank, never author.
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AdvisoryRulePack extends Model {
    static associate() {}
  }
  AdvisoryRulePack.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    pack_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    code: { type: DataTypes.STRING(40), allowNull: false, unique: true }, // e.g. VAX_FMD, DRY_OFF
    title: { type: DataTypes.STRING(140), allowNull: false },
    species: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'CATTLE' }, // CATTLE|BUFFALO|ALL
    category: { type: DataTypes.ENUM('VACCINATION', 'MASTITIS', 'HEAT_STRESS', 'BREEDING', 'DRY_OFF'), allowNull: false },
    default_severity: { type: DataTypes.ENUM('INFO', 'ADVISE', 'URGENT'), allowNull: false, defaultValue: 'ADVISE' },
    rules_json: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    // Advisory wording only — never a CV/vet "diagnosis" (CLAUDE.md OUT OF SCOPE).
    body_template: { type: DataTypes.STRING(400), allowNull: false },
    version: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'ADVISORY_V1' },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'AdvisoryRulePack', tableName: 'advisory_rule_packs',
    timestamps: true, underscored: true,
  });
  return AdvisoryRulePack;
};
