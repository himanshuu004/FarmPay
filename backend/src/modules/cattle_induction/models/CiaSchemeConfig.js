/**
 * CiaSchemeConfig — the versioned config record for a CIA scheme (Convention 5:
 * scheme parameters are config, never code). Holds `rules_json` (subsidy %,
 * govt-share split, contribution %, price ceilings, max cattle, min membership +
 * milk-supply history, geo-fence radius, deadlines, grace, default buckets, SLA
 * timers) and the document checklist. A version is pinned onto an application at
 * submit, so re-publishing a new version never mutates in-flight applications.
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CiaSchemeConfig extends Model {
    static associate() {}
  }
  CiaSchemeConfig.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    scheme_version: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    title: { type: DataTypes.STRING(160), allowNull: true },
    rules_json: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} }, // all scheme params
    doc_checklist: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] }, // [{key,label,required:'MANDATORY'|'OPTIONAL'|'CONDITIONAL',when?}]
    is_published: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    published_by_user_id: { type: DataTypes.INTEGER, allowNull: true },
    published_at: { type: DataTypes.DATE, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'CiaSchemeConfig', tableName: 'cia_scheme_configs',
    timestamps: true, underscored: true,
    indexes: [{ fields: ['scheme_version'], unique: true }, { fields: ['is_published'] }],
  });
  return CiaSchemeConfig;
};
