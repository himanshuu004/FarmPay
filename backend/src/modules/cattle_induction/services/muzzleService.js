/**
 * CIA muzzle re-ID asset verification (CIA-4, SHADOW). A biometric SECOND FACTOR
 * on top of the statutory ear tag (never replaces it — Convention 24). Reuses the
 * `identity` data model: AnimalBiometric (embeddings), the AiModelRegistry (muzzle
 * model, seeded SHADOW), ModelInferenceLog (every inference logged, Convention 23)
 * and BiometricReviewTask (the surveyor queue).
 *
 * enrol:  compute + store the muzzle embedding (keyed by the CIA ear tag).
 * verify: re-embed at an inspection and score vs the enrolled one; a mismatch
 *         queues a review task + raises MUZZLE_MISMATCH (shadow → fraud panel).
 * NEVER auto-decides (shadow: acted=false; the model has a kill-switch).
 */
const crypto = require('crypto');
const { emitDomainEvent } = require('../../../shared/services/domainEvents');
const { vision } = require('../../../integrations');
const registry = require('../../identity/services/modelRegistryService');
const inferenceLog = require('../../identity/services/inferenceLogService');
const { resolveActor } = require('./context');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };
const err = (msg, code, status = 400) => { const e = new Error(msg); e.statusCode = status; e.errorCode = code; return e; };
const toLiteral = (arr) => `[${arr.join(',')}]`;
const parseLiteral = (t) => JSON.parse(t);
const cosineDistance = (a, b) => {
  let dot = 0; let na = 0; let nb = 0;
  for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 1;
  return 1 - dot / (Math.sqrt(na) * Math.sqrt(nb));
};

const loadAnimal = async (appUuid) => {
  const { CiaApplication, CiaPurchase, CiaAnimal } = getDb();
  const app = await CiaApplication.findOne({ where: { application_uuid: appUuid } });
  if (!app) throw err('Application not found', 'CIA_APP_NOT_FOUND', 404);
  const purchase = await CiaPurchase.findOne({ where: { application_id: app.id } });
  if (!purchase || !purchase.animal_id) throw err('No animal to verify', 'CIA_ANIMAL_NONE', 404);
  const animal = await CiaAnimal.findByPk(purchase.animal_id);
  return { app, purchase, animal };
};

/** Enrol the muzzle (shadow) — keyed by the statutory ear tag. */
const enrol = async (req) => {
  const actor = await resolveActor(req);
  const { app, animal } = await loadAnimal(req.params.appUuid);
  const b = req.body || {};
  const model = await registry.ensureMuzzleModel();
  const { embedding, quality, dim } = await vision.embedMuzzle({ photoRef: b.photoRef, animalKey: b.animalKey || animal.ear_tag_no });

  const { AnimalBiometric } = getDb();
  const bio = await AnimalBiometric.create({
    biometric_uuid: crypto.randomUUID(), farmer_id: app.user_id || actor.appUserId,
    animal_id: null, tag_uid: animal.ear_tag_no, // CIA animal ≠ DairyAnimal; the tag is the anchor
    muzzle_embedding: toLiteral(embedding), embedding_dim: dim, quality_score: quality,
    model_name: model.model_name, model_version: model.model_version, captured_at: new Date(),
  });
  await inferenceLog.log({ model, inferenceType: 'ENROL_DEDUPE', subjectRef: bio.biometric_uuid, output: { quality }, acted: false });
  await emitDomainEvent({
    eventType: 'cia.muzzle.enrolled', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
    farmerId: null, payload: { biometricUuid: bio.biometric_uuid, tagUid: animal.ear_tag_no, shadow: true },
  });
  return { applicationUuid: app.application_uuid, biometricUuid: bio.biometric_uuid, quality, shadow: true };
};

/** Verify the muzzle at an inspection (shadow) — mismatch → review queue + flag. */
const verify = async (req) => {
  const actor = await resolveActor(req);
  const { app, purchase, animal } = await loadAnimal(req.params.appUuid);
  const b = req.body || {};
  const model = await registry.ensureMuzzleModel();
  const th = registry.thresholdsFor(model);

  const { AnimalBiometric, BiometricReviewTask, sequelize } = getDb();
  const enrolled = await AnimalBiometric.findOne({ where: { tag_uid: animal.ear_tag_no, is_active: true }, order: [['created_at', 'DESC']] });
  if (!enrolled) throw err('No enrolled muzzle for this animal — enrol first', 'CIA_MUZZLE_NOT_ENROLLED', 409);

  const { embedding } = await vision.embedMuzzle({ photoRef: b.photoRef, animalKey: b.animalKey || animal.ear_tag_no });
  const distance = Math.round(cosineDistance(embedding, parseLiteral(enrolled.muzzle_embedding)) * 1e6) / 1e6;
  const match = distance <= Number(th.matchCosine);

  return sequelize.transaction(async (t) => {
    const logRow = await inferenceLog.log({ model, inferenceType: 'CLAIM_MATCH', subjectRef: enrolled.biometric_uuid, output: { distance, threshold: th.matchCosine, match }, acted: false }, t);
    let reviewTaskId = null;
    if (!match) {
      const task = await BiometricReviewTask.create({
        task_uuid: crypto.randomUUID(), kind: 'CLAIM_MATCH_REVIEW', subject_biometric_id: enrolled.id,
        distance, threshold: th.matchCosine, model_name: model.model_name, inference_log_id: logRow.id, status: 'queued',
      }, { transaction: t });
      reviewTaskId = task.id;
      const flags = Array.isArray(purchase.exception_flags) ? purchase.exception_flags : [];
      if (!flags.includes('MUZZLE_MISMATCH')) await purchase.update({ exception_flags: [...flags, 'MUZZLE_MISMATCH'] }, { transaction: t });
    }
    await emitDomainEvent({
      eventType: 'cia.muzzle.verified', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
      farmerId: null, payload: { match, distance, threshold: th.matchCosine, reviewTaskId, shadow: true },
    }, { transaction: t });
    return { applicationUuid: app.application_uuid, match, distance, threshold: Number(th.matchCosine), flagged: !match, reviewTaskId, shadow: true };
  });
};

module.exports = { enrol, verify };
