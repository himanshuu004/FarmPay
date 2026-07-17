/**
 * BiometricReviewTask — the SHADOW-MODE surveyor queue (CLAUDE.md #21: AI
 * proposes, humans dispose; biometric flags → queues). A dedupe hit at enrolment
 * or a claim muzzle-match becomes a task for a human to confirm/reject; the
 * biometric system never auto-decides enrolment or a claim.
 */
const { Model } = require('sequelize');

const KINDS = ['ENROL_DEDUPE_FLAG', 'CLAIM_MATCH_REVIEW'];
const STATUSES = ['queued', 'confirmed', 'rejected'];

module.exports = (sequelize, DataTypes) => {
  class BiometricReviewTask extends Model {
    static associate(models) {
      if (models.AnimalBiometric) BiometricReviewTask.belongsTo(models.AnimalBiometric, { foreignKey: 'subject_biometric_id', as: 'subject' });
      if (models.AnimalBiometric) BiometricReviewTask.belongsTo(models.AnimalBiometric, { foreignKey: 'candidate_biometric_id', as: 'candidate' });
    }
  }
  BiometricReviewTask.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    task_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    kind: { type: DataTypes.ENUM(...KINDS), allowNull: false },
    subject_biometric_id: { type: DataTypes.INTEGER, allowNull: true },
    candidate_biometric_id: { type: DataTypes.INTEGER, allowNull: true }, // the near-duplicate (dedupe)
    claim_id: { type: DataTypes.INTEGER, allowNull: true },               // the claim (match review)
    distance: { type: DataTypes.DECIMAL(8, 6), allowNull: true },         // cosine distance
    threshold: { type: DataTypes.DECIMAL(8, 6), allowNull: true },
    model_name: { type: DataTypes.STRING(60), allowNull: true },
    inference_log_id: { type: DataTypes.BIGINT, allowNull: true },
    status: { type: DataTypes.ENUM(...STATUSES), allowNull: false, defaultValue: 'queued' },
    reviewer_id: { type: DataTypes.INTEGER, allowNull: true },
    review_note: { type: DataTypes.STRING(255), allowNull: true },
    resolved_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    sequelize, modelName: 'BiometricReviewTask', tableName: 'biometric_review_tasks',
    timestamps: true, underscored: true,
    indexes: [{ fields: ['status'] }, { fields: ['kind'] }, { fields: ['claim_id'] }],
  });
  BiometricReviewTask.KINDS = KINDS;
  BiometricReviewTask.STATUSES = STATUSES;
  return BiometricReviewTask;
};
