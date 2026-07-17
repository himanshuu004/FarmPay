/**
 * ModelInferenceLog — APPEND-ONLY inference audit (CLAUDE.md #23: every inference
 * logged). Records what the model saw, what it proposed, the lifecycle stage it
 * ran under, and whether it was allowed to ACT (only assist/automate_with_override
 * act; shadow/kill-switch never do). Feeds the shadow→assist promotion eval.
 */
const { Model } = require('sequelize');

const INFERENCE_TYPES = ['ENROL_DEDUPE', 'CLAIM_MATCH'];
const STAGES = ['registered', 'shadow', 'assist', 'automate_with_override', 'retired'];

module.exports = (sequelize, DataTypes) => {
  class ModelInferenceLog extends Model {
    static associate() {}
  }
  ModelInferenceLog.init({
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    log_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    model_name: { type: DataTypes.STRING(60), allowNull: false },
    model_version: { type: DataTypes.STRING(40), allowNull: false },
    inference_type: { type: DataTypes.ENUM(...INFERENCE_TYPES), allowNull: false },
    lifecycle_stage: { type: DataTypes.ENUM(...STAGES), allowNull: false },
    subject_ref: { type: DataTypes.STRING(64), allowNull: true }, // biometric_uuid / claim_uuid
    output: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} }, // candidates, distances, decision, threshold
    acted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, // did it change state (vs shadow-observe)?
  }, {
    sequelize, modelName: 'ModelInferenceLog', tableName: 'model_inference_log',
    timestamps: true, underscored: true, updatedAt: false, // append-only
    indexes: [{ fields: ['model_name'] }, { fields: ['inference_type'] }, { fields: ['subject_ref'] }],
    hooks: {
      beforeUpdate: () => { throw new Error('model_inference_log is append-only (no update)'); },
      beforeBulkUpdate: () => { throw new Error('model_inference_log is append-only (no update)'); },
      beforeDestroy: () => { throw new Error('model_inference_log is append-only (no delete)'); },
      beforeBulkDestroy: () => { throw new Error('model_inference_log is append-only (no delete)'); },
    },
  });
  ModelInferenceLog.INFERENCE_TYPES = INFERENCE_TYPES;
  ModelInferenceLog.STAGES = STAGES;
  return ModelInferenceLog;
};
