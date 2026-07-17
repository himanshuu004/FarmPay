/**
 * AdvisoryItem — a generated advisory for a farmer (optionally a specific
 * animal), produced by the deterministic rule engine from the livestock
 * registers. Regenerated idempotently: unique on (farmer_id, animal_ref,
 * pack_code, due_on) so a nightly re-run updates rather than duplicates.
 * The farmer disposes (mark done / dismiss); advisories never auto-act.
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AdvisoryItem extends Model {
    static associate(models) {
      AdvisoryItem.belongsTo(models.User, { foreignKey: 'farmer_id', as: 'farmer' });
    }
  }
  AdvisoryItem.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    item_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    farmer_id: { type: DataTypes.INTEGER, allowNull: false },
    animal_ref: { type: DataTypes.STRING(36), allowNull: true }, // animal_uuid, null = herd-wide
    animal_label: { type: DataTypes.STRING(80), allowNull: true }, // tag/name for display
    pack_code: { type: DataTypes.STRING(40), allowNull: false },
    category: { type: DataTypes.ENUM('VACCINATION', 'MASTITIS', 'HEAT_STRESS', 'BREEDING', 'DRY_OFF'), allowNull: false },
    severity: { type: DataTypes.ENUM('INFO', 'ADVISE', 'URGENT'), allowNull: false, defaultValue: 'ADVISE' },
    title: { type: DataTypes.STRING(140), allowNull: false },
    body: { type: DataTypes.STRING(400), allowNull: false },
    due_on: { type: DataTypes.DATEONLY, allowNull: true },
    // What in the register triggered this (for transparency, not a black box).
    evidence_json: { type: DataTypes.JSONB, allowNull: true },
    status: { type: DataTypes.ENUM('OPEN', 'DONE', 'DISMISSED', 'EXPIRED'), allowNull: false, defaultValue: 'OPEN' },
    generated_at: { type: DataTypes.DATE, allowNull: false },
    resolved_at: { type: DataTypes.DATE, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'AdvisoryItem', tableName: 'advisory_items',
    timestamps: true, underscored: true,
    indexes: [
      { unique: true, fields: ['farmer_id', 'animal_ref', 'pack_code', 'due_on'] },
      { fields: ['farmer_id', 'status'] },
    ],
  });
  return AdvisoryItem;
};
