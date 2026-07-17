/**
 * CoopInputOrder — a member's input order, mirrored against the Aanchal ERP.
 *
 * State machine (blueprint §7): the APP authors ONLY the two ★ transitions;
 * every approval status arrives via ERP sync (erpSyncJob). The app NEVER
 * approves — the discarded dairy_cooperative auto-approval + avgMilkValue×factor
 * are deliberately NOT carried over.
 *
 *   DRAFT → SUBMITTED★ → SECRETARY_APPROVED → SUPERVISOR_APPROVED
 *         → DUSS_PROCESSING → DISPATCHED → RECEIPT_CONFIRMED★
 *         (↘ REJECTED at any approval stage)
 *
 * The 70%-of-outstanding-payables limit engine + demand windows land in
 * Phase 1 (the wedge build); this Phase-0 model just captures the audit
 * snapshot fields the engine will fill.
 */
const { Model } = require('sequelize');

const STATUSES = [
  'DRAFT', 'SUBMITTED', 'SECRETARY_APPROVED', 'SUPERVISOR_APPROVED',
  'DUSS_PROCESSING', 'DISPATCHED', 'RECEIPT_CONFIRMED', 'REJECTED',
];

module.exports = (sequelize, DataTypes) => {
  class CoopInputOrder extends Model {
    static associate(models) {
      if (models.CoopInputOrderItem) {
        CoopInputOrder.hasMany(models.CoopInputOrderItem, { foreignKey: 'order_id', as: 'items' });
      }
      if (models.CoopMembership) {
        CoopInputOrder.belongsTo(models.CoopMembership, { foreignKey: 'membership_id', as: 'membership' });
      }
    }
  }
  CoopInputOrder.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    order_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    membership_id: { type: DataTypes.INTEGER, allowNull: true },
    farmer_ref: { type: DataTypes.STRING(40), allowNull: false },
    society_ref: { type: DataTypes.STRING(40), allowNull: true },
    total_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    status: { type: DataTypes.ENUM(...STATUSES), allowNull: false, defaultValue: 'DRAFT' },
    // ERP order id once mirrored (null while DRAFT).
    erp_order_ref: { type: DataTypes.STRING(40), allowNull: true },
    // Eligibility snapshot at SUBMIT time (70% engine fills this in Phase 1).
    limit_snapshot: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    outstanding_at_submit: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    demand_window: { type: DataTypes.STRING(12), allowNull: true }, // WEEK_1|WEEK_3
    rejection_reason: { type: DataTypes.STRING(255), allowNull: true },
    submitted_at: { type: DataTypes.DATE, allowNull: true },
    dispatched_at: { type: DataTypes.DATE, allowNull: true },
    receipt_confirmed_at: { type: DataTypes.DATE, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'CoopInputOrder', tableName: 'coop_input_orders',
    timestamps: true, underscored: true,
  });
  CoopInputOrder.STATUSES = STATUSES;
  return CoopInputOrder;
};
