/**
 * CoopMilkSnapshot — the milk PASSBOOK mirror (THE WEDGE surface).
 *
 * One row per member per period, sourced from the ERP milk summary with ZERO
 * farmer data entry. Carries the outstanding payables the 70% order-limit
 * engine reads (Phase 1). `as_of_date` + `source_mode` power the honest
 * freshness label ("as of yesterday" under filedrop / T-1).
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CoopMilkSnapshot extends Model {
    static associate(models) {
      if (models.CoopMembership) {
        CoopMilkSnapshot.belongsTo(models.CoopMembership, { foreignKey: 'membership_id', as: 'membership' });
      }
      if (models.ErpSyncLog) {
        CoopMilkSnapshot.belongsTo(models.ErpSyncLog, { foreignKey: 'source_sync_id', as: 'sourceSync' });
      }
    }
  }
  CoopMilkSnapshot.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    snapshot_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    membership_id: { type: DataTypes.INTEGER, allowNull: true },
    farmer_ref: { type: DataTypes.STRING(40), allowNull: false },
    society_ref: { type: DataTypes.STRING(40), allowNull: true },
    period: { type: DataTypes.STRING(7), allowNull: false }, // YYYY-MM
    litres: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    value: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    avg_fat_pct: { type: DataTypes.DECIMAL(4, 2), allowNull: true },
    avg_snf_pct: { type: DataTypes.DECIMAL(4, 2), allowNull: true },
    // Outstanding payables owed to the member — the 70% limit base.
    outstanding: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    // Honest freshness.
    as_of_date: { type: DataTypes.DATEONLY, allowNull: false },
    source_mode: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'mock' },
    source_sync_id: { type: DataTypes.INTEGER, allowNull: true },
  }, {
    sequelize, modelName: 'CoopMilkSnapshot', tableName: 'coop_milk_snapshots',
    timestamps: true, underscored: true,
    indexes: [
      { unique: true, fields: ['farmer_ref', 'period'] }, // one snapshot per member per month
    ],
  });
  return CoopMilkSnapshot;
};
