/**
 * AI model registry access — the shadow/kill-switch gate (CLAUDE.md #22).
 * The muzzle model ships in SHADOW: it observes, logs, and queues for humans but
 * never acts on state. Promotion (shadow → assist → automate_with_override) and
 * the kill-switch are DATA (ai_model_registry), never code.
 */
let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const MUZZLE_MODEL = 'muzzle-reid';
const DEFAULT_THRESHOLDS = { dedupeCosine: 0.15, matchCosine: 0.25, minQuality: 0.6 };

/** Ensure the muzzle model exists (seeded in SHADOW). Returns the row. */
const ensureMuzzleModel = async ({ version = 'v0.1', stage = 'shadow' } = {}) => {
  const { AiModelRegistry } = getDb();
  const [row] = await AiModelRegistry.findOrCreate({
    where: { model_name: MUZZLE_MODEL },
    defaults: { model_name: MUZZLE_MODEL, model_version: version, lifecycle_stage: stage, kill_switch: false, thresholds: DEFAULT_THRESHOLDS },
  });
  return row;
};

const get = async (modelName = MUZZLE_MODEL) => {
  const { AiModelRegistry } = getDb();
  return AiModelRegistry.findOne({ where: { model_name: modelName, is_active: true } });
};

const thresholdsFor = (model) => ({ ...DEFAULT_THRESHOLDS, ...((model && model.thresholds) || {}) });

module.exports = { ensureMuzzleModel, get, thresholdsFor, MUZZLE_MODEL, DEFAULT_THRESHOLDS };
