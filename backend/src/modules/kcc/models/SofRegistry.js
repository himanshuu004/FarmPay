/**
 * SofRegistry — Scale of Finance notified by the SLTC/DLTC, per activity × state
 * × scheme version. Stores the full 6-year SoF schedule and the per-year cost of
 * insurance (both feed the Limit Engine). Scheme parameters are CONFIG, never
 * code (CLAUDE.md #5). No row for an (activity,state) ⇒ activity is not KCC-ready
 * there (¶16(2)).
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SofRegistry extends Model {
    static associate() {}
  }
  SofRegistry.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    sof_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    activity_code: { type: DataTypes.STRING(30), allowNull: false },
    state_code: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'UK' }, // LGD/ISO — Uttarakhand default
    scheme_version: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'KCC_DIR_2026' },
    unit_type: { type: DataTypes.STRING(20), allowNull: false }, // ANIMAL | ACRE | ...
    // 6-year notified schedules (index 0 = year 1).
    sof_by_year: { type: DataTypes.JSONB, allowNull: false },        // [7000,7500,...]
    insurance_by_year: { type: DataTypes.JSONB, allowNull: true },   // [400,450,...]
    notified_by: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'SLTC' },
    effective_from: { type: DataTypes.DATEONLY, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'SofRegistry', tableName: 'sof_registry',
    timestamps: true, underscored: true,
    indexes: [{ unique: true, fields: ['activity_code', 'state_code', 'scheme_version'] }],
  });
  return SofRegistry;
};
