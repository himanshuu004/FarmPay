/**
 * CiaPostPurchaseInspection — a scheduled 7/30/90-day inspection of a delivered
 * animal (CIA-4). Protects the asset + loan: asset-existence (ear-tag re-confirm +
 * live re-photo of the SAME animal), health, and milk-yield vs the valued yield.
 * A tag mismatch / missing animal / yield shortfall raises a SHADOW exception flag
 * (surfaced to humans, never auto-rejected — Convention 32).
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CiaPostPurchaseInspection extends Model {
    static associate(models) {
      if (models.CiaApplication) CiaPostPurchaseInspection.belongsTo(models.CiaApplication, { foreignKey: 'application_id', as: 'application' });
      if (models.CiaPurchase) CiaPostPurchaseInspection.belongsTo(models.CiaPurchase, { foreignKey: 'purchase_id', as: 'purchase' });
    }
  }
  CiaPostPurchaseInspection.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    inspection_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    application_id: { type: DataTypes.INTEGER, allowNull: false },
    purchase_id: { type: DataTypes.INTEGER, allowNull: false },
    due_day: { type: DataTypes.INTEGER, allowNull: false },   // 7 | 30 | 90
    due_date: { type: DataTypes.DATEONLY, allowNull: false },
    status: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'SCHEDULED' }, // SCHEDULED|DONE|MISSED
    inspected_by_user_id: { type: DataTypes.INTEGER, allowNull: true },
    inspected_at: { type: DataTypes.DATE, allowNull: true },
    ear_tag_confirmed: { type: DataTypes.BOOLEAN, allowNull: true },
    ear_tag_match: { type: DataTypes.BOOLEAN, allowNull: true },
    asset_exists: { type: DataTypes.BOOLEAN, allowNull: true },
    photos: { type: DataTypes.JSONB, allowNull: true },       // [{ref,hash}], live re-capture
    healthy: { type: DataTypes.BOOLEAN, allowNull: true },
    milk_yield: { type: DataTypes.DECIMAL(6, 2), allowNull: true },
    exception_flags: { type: DataTypes.JSONB, allowNull: true },
  }, {
    sequelize, modelName: 'CiaPostPurchaseInspection', tableName: 'cia_post_purchase_inspections',
    timestamps: true, underscored: true,
    indexes: [
      { fields: ['application_id'] },
      { fields: ['application_id', 'due_day'], unique: true, name: 'cia_inspection_app_day_uniq' },
      { fields: ['status', 'due_date'] },
    ],
  });
  return CiaPostPurchaseInspection;
};
