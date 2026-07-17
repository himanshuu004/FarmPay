/**
 * ClaimCase — a livestock-death claim (§5.2). LIVESTOCK line only.
 *
 *   INTIMATED → SURVEY_DONE → PM_DONE → DOCS_SUBMITTED → UNDER_REVIEW
 *             → SETTLED | REJECTED
 *
 * SLA breach is represented by the `escalated` flag (+ penal interest), NOT a
 * status, so the settlement clock/stage is preserved and a human can still
 * settle/reject (CLAUDE.md's "| ESCALATED on SLA breach" side-branch). Claims
 * decisions are NEVER automated (#10) — SETTLED/REJECTED are human (INSURER_OPS).
 */
const { Model } = require('sequelize');

const STATES = ['INTIMATED', 'SURVEY_DONE', 'PM_DONE', 'DOCS_SUBMITTED', 'UNDER_REVIEW', 'SETTLED', 'REJECTED'];

module.exports = (sequelize, DataTypes) => {
  class ClaimCase extends Model {
    static associate(models) {
      if (models.InsurancePolicy) ClaimCase.belongsTo(models.InsurancePolicy, { foreignKey: 'policy_id', as: 'policy' });
      if (models.ClaimEvent) ClaimCase.hasMany(models.ClaimEvent, { foreignKey: 'claim_id', as: 'events' });
      if (models.EvidenceFile) ClaimCase.hasMany(models.EvidenceFile, { foreignKey: 'claim_id', as: 'evidence' });
      if (models.User) ClaimCase.belongsTo(models.User, { foreignKey: 'farmer_id', as: 'farmer' });
    }
  }
  ClaimCase.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    claim_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    policy_id: { type: DataTypes.INTEGER, allowNull: false },
    farmer_id: { type: DataTypes.INTEGER, allowNull: false },
    policy_asset_id: { type: DataTypes.INTEGER, allowNull: true }, // which insured animal
    claim_type: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'livestock_death' },
    peril: { type: DataTypes.STRING(80), allowNull: true }, // disease/accident/...
    death_date: { type: DataTypes.DATEONLY, allowNull: true }, // for the >72h intimation flag
    intimated_at: { type: DataTypes.DATE, allowNull: false },
    sum_claimed: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    status: { type: DataTypes.ENUM(...STATES), allowNull: false, defaultValue: 'INTIMATED' },
    stage_deadline_at: { type: DataTypes.DATE, allowNull: true }, // current SLA clock target
    docs_complete_at: { type: DataTypes.DATE, allowNull: true }, // starts the 15-day settlement clock
    penal_interest_accrued: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 }, // 12% p.a., farmer-visible
    escalated: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    escalated_at: { type: DataTypes.DATE, allowNull: true },
    fraud_flags: { type: DataTypes.JSONB, allowNull: true }, // deterministic rules (§7.3)
    settled_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
    settled_at: { type: DataTypes.DATE, allowNull: true },
    rejection_reason: { type: DataTypes.STRING(255), allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'ClaimCase', tableName: 'claim_cases',
    timestamps: true, underscored: true,
    indexes: [{ fields: ['farmer_id'] }, { fields: ['policy_id'] }, { fields: ['status'] }],
  });
  ClaimCase.STATES = STATES;
  return ClaimCase;
};
