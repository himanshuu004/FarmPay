/**
 * VetHonorariumLedger — the VO's honorarium tracking (§5.2; a top VO pain point).
 * ₹50 per enrolment exam, ₹125 per post-mortem, tracked by quarter.
 *
 *   accrued → claimed → paid
 *
 * Amounts are config (#5): they come from the caller (scheme rates), not hardcoded
 * business logic here.
 */
const { Model } = require('sequelize');

const KINDS = ['ENROL_EXAM', 'POSTMORTEM'];
const STATUSES = ['accrued', 'claimed', 'paid'];

module.exports = (sequelize, DataTypes) => {
  class VetHonorariumLedger extends Model {
    static associate() {}
  }
  VetHonorariumLedger.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    ledger_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    vet_id: { type: DataTypes.INTEGER, allowNull: false },
    kind: { type: DataTypes.ENUM(...KINDS), allowNull: false },
    claim_id: { type: DataTypes.INTEGER, allowNull: true },   // POSTMORTEM
    proposal_id: { type: DataTypes.INTEGER, allowNull: true }, // ENROL_EXAM
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    quarter: { type: DataTypes.STRING(8), allowNull: false }, // e.g. 2026-Q3
    status: { type: DataTypes.ENUM(...STATUSES), allowNull: false, defaultValue: 'accrued' },
    accrued_at: { type: DataTypes.DATE, allowNull: false },
    paid_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    sequelize, modelName: 'VetHonorariumLedger', tableName: 'vet_honorarium_ledger',
    timestamps: true, underscored: true,
    indexes: [{ fields: ['vet_id', 'quarter'] }, { fields: ['status'] }],
  });
  VetHonorariumLedger.KINDS = KINDS;
  VetHonorariumLedger.STATUSES = STATUSES;
  return VetHonorariumLedger;
};
