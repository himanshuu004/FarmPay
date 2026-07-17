/**
 * SurveyorTask — field allocation for the SURVEYOR / VET (§5.2). The field PWA's
 * work queue: one task per field job on a claim, with a same-day-visit SLA.
 *
 *   assigned → enroute → onsite → submitted → qc_passed
 *
 * Submitting a survey/PM task drives the claim's own transition (SURVEY_DONE /
 * PM_DONE) — the field role files once, both records move.
 */
const { Model } = require('sequelize');

const STATES = ['assigned', 'enroute', 'onsite', 'submitted', 'qc_passed'];
const TASK_TYPES = ['VERIFY_LOSS', 'POSTMORTEM', 'VALUATION', 'TAG_VERIFY'];
const ASSIGNEE_ROLES = ['SURVEYOR', 'VET'];

module.exports = (sequelize, DataTypes) => {
  class SurveyorTask extends Model {
    static associate(models) {
      if (models.ClaimCase) SurveyorTask.belongsTo(models.ClaimCase, { foreignKey: 'claim_id', as: 'claim' });
    }
  }
  SurveyorTask.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    task_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    claim_id: { type: DataTypes.INTEGER, allowNull: false },
    assignee_role: { type: DataTypes.ENUM(...ASSIGNEE_ROLES), allowNull: false },
    assignee_id: { type: DataTypes.INTEGER, allowNull: true },
    task_type: { type: DataTypes.ENUM(...TASK_TYPES), allowNull: false },
    sla_due_at: { type: DataTypes.DATE, allowNull: true }, // same-day-visit clock
    status: { type: DataTypes.ENUM(...STATES), allowNull: false, defaultValue: 'assigned' },
    report: { type: DataTypes.JSONB, allowNull: true }, // structured checklist
    submitted_at: { type: DataTypes.DATE, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'SurveyorTask', tableName: 'surveyor_tasks',
    timestamps: true, underscored: true,
    indexes: [{ fields: ['claim_id'] }, { fields: ['assignee_role', 'status'] }, { fields: ['assignee_id'] }],
  });
  SurveyorTask.STATES = STATES;
  SurveyorTask.TASK_TYPES = TASK_TYPES;
  return SurveyorTask;
};
