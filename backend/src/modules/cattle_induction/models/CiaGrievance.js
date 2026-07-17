/**
 * CiaGrievance — a CIA-specific grievance with a config-driven SLA clock and a
 * multi-level escalation ladder (PRD Part 14B / Screen 21). Distinct from the
 * claims-side GrievanceTicket: different FKs (cia_applications/cia_purchases),
 * different owner desks (DCS/DUSS/UCDF/bank vs INSURER_OPS), farmer_ref identity,
 * and a laddered escalation instead of a single `escalated` state.
 *
 *   OPEN → ACKNOWLEDGED → IN_PROGRESS → RESOLVED | ESCALATED
 * Attributable + immutable via append-only domain_events (row updates are allowed;
 * only domain_events/claim_events are immutable — Convention 8).
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CiaGrievance extends Model {
    static associate(models) {
      if (models.CiaApplication) CiaGrievance.belongsTo(models.CiaApplication, { foreignKey: 'application_id', as: 'application' });
      if (models.CiaPurchase) CiaGrievance.belongsTo(models.CiaPurchase, { foreignKey: 'purchase_id', as: 'purchase' });
    }
  }
  CiaGrievance.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    grievance_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    farmer_ref: { type: DataTypes.STRING(40), allowNull: false },   // ERP join key (like CiaApplication.farmer_ref)
    application_id: { type: DataTypes.INTEGER, allowNull: true },
    purchase_id: { type: DataTypes.INTEGER, allowNull: true },
    category: { type: DataTypes.STRING(60), allowNull: false },
    channel: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'app' }, // app | voice | ivr | posp
    priority: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'med' }, // low | med | high
    description: { type: DataTypes.STRING(500), allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'OPEN' },
    current_owner_role: { type: DataTypes.STRING(30), allowNull: true },
    escalation_level: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    sla_days: { type: DataTypes.INTEGER, allowNull: false },
    filed_at: { type: DataTypes.DATE, allowNull: false },
    sla_due_at: { type: DataTypes.DATE, allowNull: false },
    resolved_at: { type: DataTypes.DATE, allowNull: true },
    resolution_note: { type: DataTypes.STRING(500), allowNull: true },
    raised_by_user_id: { type: DataTypes.INTEGER, allowNull: true },
    assigned_to_user_id: { type: DataTypes.INTEGER, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  }, {
    sequelize, modelName: 'CiaGrievance', tableName: 'cia_grievances',
    timestamps: true, underscored: true,
    indexes: [
      { fields: ['farmer_ref'] },
      { fields: ['status'] },
      { fields: ['sla_due_at'] },
      { fields: ['application_id'] },
    ],
  });
  return CiaGrievance;
};
