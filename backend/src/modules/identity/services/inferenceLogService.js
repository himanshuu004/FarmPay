/**
 * Inference logging (CLAUDE.md #23: every inference logged, append-only).
 * One row per model call — enrol-dedupe or claim-match — capturing the stage it
 * ran under, the proposal, and whether it was allowed to ACT.
 */
const crypto = require('crypto');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const log = async ({ model, inferenceType, subjectRef = null, output = {}, acted = false }, t = null) => {
  const { ModelInferenceLog } = getDb();
  return ModelInferenceLog.create({
    log_uuid: crypto.randomUUID(),
    model_name: model.model_name, model_version: model.model_version,
    inference_type: inferenceType, lifecycle_stage: model.lifecycle_stage,
    subject_ref: subjectRef, output, acted,
  }, { transaction: t });
};

module.exports = { log };
