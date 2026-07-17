/**
 * Muzzle biometrics (CLAUDE.md identity module) — SECOND FACTOR only; never
 * replaces the statutory tag/photos, and never auto-decides enrolment or a claim.
 *
 * enrol:   store the consented embedding, then dedupe-search the gallery. A near
 *          duplicate → a surveyor review task (AI proposes, human disposes #21).
 *          Enrolment is NEVER blocked by the muzzle check (it's the second factor).
 * match:   at a claim, score the carcass muzzle vs the enrolled one. CLAIM MATCH
 *          NEVER ACTS on the claim (#10) — it only advises + queues.
 * delete:  right-to-erasure (#24) — the embedding is deletable.
 *
 * Every call is logged (#23) under the model's lifecycle stage (SHADOW by
 * default → observe + queue, never act). Cosine distance via pgvector.
 */
const crypto = require('crypto');
const { CONSENT_PURPOSES } = require('../../../shared/constants/consentPurposes');
const { emitDomainEvent } = require('../../../shared/services/domainEvents');
const registry = require('./modelRegistryService');
const inferenceLog = require('./inferenceLogService');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const err = (msg, code, status = 400) => { const e = new Error(msg); e.statusCode = status; e.errorCode = code; return e; };

const toLiteral = (arr) => {
  if (!Array.isArray(arr) || arr.length === 0) throw err('embedding must be a non-empty number array', 'IDENTITY_EMBEDDING_INVALID');
  if (!arr.every((x) => Number.isFinite(x))) throw err('embedding must contain only finite numbers', 'IDENTITY_EMBEDDING_INVALID');
  return `[${arr.join(',')}]`;
};

const assertBiometricConsent = async (farmerId) => {
  const { ConsentRecord } = getDb();
  // Consent is revocable (#17): honour only a live, non-withdrawn acceptance.
  const c = ConsentRecord ? await ConsentRecord.findOne({
    where: { farmer_id: farmerId, consent_type: CONSENT_PURPOSES.BIOMETRIC, accepted: true, is_active: true, withdrawn_at: null },
  }) : null;
  if (!c) throw err('Muzzle capture needs the farmer’s current biometric consent (DPDP)', 'IDENTITY_BIOMETRIC_CONSENT_REQUIRED', 403);
  return c;
};

/** The animal being enrolled must be in the caller's own herd. */
const assertAnimalOwned = async (animalId, farmerId) => {
  if (animalId == null) return;
  const { DairyAnimal } = getDb();
  const animal = DairyAnimal ? await DairyAnimal.findByPk(animalId) : null;
  if (!animal || animal.farmer_id !== farmerId) throw err('That animal is not in your herd', 'IDENTITY_ANIMAL_FORBIDDEN', 403);
};

/** k nearest gallery neighbours (across ALL farmers — same muzzle, different owner = fraud). */
const nearest = async (literal, dim, { excludeId = null, limit = 1 } = {}) => {
  const { sequelize } = getDb();
  const [rows] = await sequelize.query(
    `SELECT id, biometric_uuid, farmer_id, animal_id, tag_uid,
            (muzzle_embedding::vector <=> :q::vector) AS distance
     FROM animal_biometrics
     WHERE is_active = true AND embedding_dim = :dim ${excludeId ? 'AND id <> :excludeId' : ''}
     ORDER BY muzzle_embedding::vector <=> :q::vector
     LIMIT :limit`,
    { replacements: { q: literal, dim, excludeId, limit } },
  );
  return rows.map((r) => ({ ...r, distance: Number(r.distance) }));
};

/**
 * Enrol a muzzle. Stores the embedding, dedupe-searches, logs the inference, and
 * queues a review task on a near-duplicate. Enrolment always succeeds.
 */
const enrol = async ({ farmerId, animalId = null, tagUid = null, embedding, quality, consentRecordId = null }) => {
  const { AnimalBiometric, BiometricReviewTask } = getDb();
  const literal = toLiteral(embedding);
  const dim = embedding.length;

  await assertBiometricConsent(farmerId);
  await assertAnimalOwned(animalId, farmerId);
  const model = await registry.ensureMuzzleModel();
  const th = registry.thresholdsFor(model);
  if (Number(quality) < th.minQuality) throw err(`Capture quality ${quality} below minimum ${th.minQuality}`, 'IDENTITY_QUALITY_TOO_LOW');

  const biometric = await AnimalBiometric.create({
    biometric_uuid: crypto.randomUUID(), farmer_id: farmerId, animal_id: animalId, tag_uid: tagUid,
    muzzle_embedding: literal, embedding_dim: dim, quality_score: quality,
    model_name: model.model_name, model_version: model.model_version, consent_record_id: consentRecordId,
    captured_at: new Date(),
  });

  const neighbours = await nearest(literal, dim, { excludeId: biometric.id, limit: 1 });
  const top = neighbours[0] || null;
  const flagged = !!(top && top.distance <= th.dedupeCosine);

  const logRow = await inferenceLog.log({
    model, inferenceType: 'ENROL_DEDUPE', subjectRef: biometric.biometric_uuid,
    output: { decision: flagged ? 'DUPLICATE_SUSPECT' : 'UNIQUE', nearest: top ? { biometricUuid: top.biometric_uuid, distance: top.distance, differentOwner: top.farmer_id !== farmerId } : null, threshold: th.dedupeCosine },
    acted: model.canAct, // SHADOW → false: observe only
  });

  let queuedTaskUuid = null;
  if (flagged) {
    // AI proposes, human disposes — always queue, regardless of stage.
    const task = await BiometricReviewTask.create({
      task_uuid: crypto.randomUUID(), kind: 'ENROL_DEDUPE_FLAG',
      subject_biometric_id: biometric.id, candidate_biometric_id: top.id,
      distance: top.distance, threshold: th.dedupeCosine, model_name: model.model_name, inference_log_id: logRow.id,
    });
    queuedTaskUuid = task.task_uuid;
    await emitDomainEvent({ eventType: 'identity.dedupe.flagged', aggregateType: 'AnimalBiometric', aggregateId: biometric.biometric_uuid, farmerId, payload: { distance: top.distance, candidate: top.biometric_uuid } });
  }

  return { biometric, dedupe: { flagged, nearestDistance: top ? top.distance : null, threshold: th.dedupeCosine, differentOwner: top ? top.farmer_id !== farmerId : false }, queuedTaskUuid, acted: model.canAct };
};

/**
 * Score a claim's carcass muzzle against the enrolled one. NEVER changes the
 * claim (advisory only, #10) — logs + queues a surveyor review with the score.
 */
const matchForClaim = async ({ claimId, claimUuid, embedding }) => {
  const { AnimalBiometric, ClaimCase, PolicyAsset, BiometricReviewTask } = getDb();
  const literal = toLiteral(embedding);
  const dim = embedding.length;
  const model = await registry.ensureMuzzleModel();
  const th = registry.thresholdsFor(model);

  const claim = claimId ? await ClaimCase.findByPk(claimId) : await ClaimCase.findOne({ where: { claim_uuid: claimUuid } });
  if (!claim) throw err('Claim not found', 'CLAIMS_NOT_FOUND', 404);

  // Resolve the insured animal's enrolled biometric (by policy asset → animal/tag).
  const asset = claim.policy_asset_id ? await PolicyAsset.findByPk(claim.policy_asset_id) : await PolicyAsset.findOne({ where: { policy_id: claim.policy_id } });
  let enrolled = null;
  if (asset) {
    enrolled = await AnimalBiometric.findOne({ where: { is_active: true, ...(asset.asset_ref_id ? { animal_id: asset.asset_ref_id } : { tag_uid: asset.tag_uid }) }, order: [['created_at', 'DESC']] });
  }

  let distance = null; let matched = false; let dimMismatch = false;
  if (enrolled && enrolled.embedding_dim !== dim) {
    dimMismatch = true; // different model dims → not comparable, don't error
  } else if (enrolled) {
    const [rows] = await getDb().sequelize.query(
      'SELECT (muzzle_embedding::vector <=> :q::vector) AS d FROM animal_biometrics WHERE id = :id',
      { replacements: { q: literal, id: enrolled.id } },
    );
    distance = rows.length ? Number(rows[0].d) : null;
    matched = distance != null && distance <= th.matchCosine;
  }

  const logRow = await inferenceLog.log({
    model, inferenceType: 'CLAIM_MATCH', subjectRef: claim.claim_uuid,
    output: { matched, distance, threshold: th.matchCosine, enrolledBiometric: enrolled ? enrolled.biometric_uuid : null, hasEnrolment: !!enrolled, dimMismatch },
    acted: false, // claim decisions are NEVER automated — advisory only
  });

  const task = await BiometricReviewTask.create({
    task_uuid: crypto.randomUUID(), kind: 'CLAIM_MATCH_REVIEW',
    subject_biometric_id: enrolled ? enrolled.id : null, claim_id: claim.id,
    distance, threshold: th.matchCosine, model_name: model.model_name, inference_log_id: logRow.id,
  });

  return { matched, distance, threshold: th.matchCosine, hasEnrolment: !!enrolled, dimMismatch, queuedTaskUuid: task.task_uuid };
};

/**
 * Right-to-erasure (#24): hard-delete the embedding row. Any review task that
 * referenced it is DETACHED first (its FK nulled) so erasure always succeeds —
 * the audit task survives, but the erased embedding cannot block DPDP deletion.
 */
const deleteBiometric = async (biometricUuid, ownerFarmerId) => {
  const database = getDb();
  const { AnimalBiometric, BiometricReviewTask } = database;
  const b = await AnimalBiometric.findOne({ where: { biometric_uuid: biometricUuid } });
  if (!b) throw err('Biometric not found', 'IDENTITY_NOT_FOUND', 404);
  if (ownerFarmerId != null && b.farmer_id !== ownerFarmerId) throw err('Not your biometric', 'IDENTITY_FORBIDDEN', 403);
  await database.sequelize.transaction(async (t) => {
    await BiometricReviewTask.update({ subject_biometric_id: null }, { where: { subject_biometric_id: b.id }, transaction: t });
    await BiometricReviewTask.update({ candidate_biometric_id: null }, { where: { candidate_biometric_id: b.id }, transaction: t });
    await b.destroy({ transaction: t });
  });
  await emitDomainEvent({ eventType: 'identity.biometric.erased', aggregateType: 'AnimalBiometric', aggregateId: biometricUuid, farmerId: b.farmer_id, payload: {} });
  return { erased: true };
};

const listForFarmer = async (farmerId) => {
  const { AnimalBiometric } = getDb();
  return AnimalBiometric.findAll({ where: { farmer_id: farmerId, is_active: true }, attributes: { exclude: ['muzzle_embedding'] }, order: [['created_at', 'DESC']] });
};

const reviewQueue = async () => {
  const { BiometricReviewTask } = getDb();
  return BiometricReviewTask.findAll({ where: { status: 'queued' }, order: [['created_at', 'ASC']] });
};

/** Human disposes: a surveyor confirms/rejects a queued flag. */
const resolveReview = async (taskUuid, { reviewerId = null, decision, note = null }) => {
  const { BiometricReviewTask } = getDb();
  if (!['confirmed', 'rejected'].includes(decision)) throw err('decision must be confirmed|rejected', 'IDENTITY_REVIEW_DECISION_INVALID');
  const task = await BiometricReviewTask.findOne({ where: { task_uuid: taskUuid } });
  if (!task) throw err('Review task not found', 'IDENTITY_REVIEW_NOT_FOUND', 404);
  if (task.status !== 'queued') throw err(`Task already ${task.status}`, 'IDENTITY_REVIEW_CLOSED');
  await task.update({ status: decision, reviewer_id: reviewerId, review_note: note, resolved_at: new Date() });
  await emitDomainEvent({ eventType: `identity.review.${decision}`, aggregateType: 'BiometricReviewTask', aggregateId: task.task_uuid, payload: { kind: task.kind } });
  return task;
};

module.exports = { enrol, matchForClaim, deleteBiometric, listForFarmer, reviewQueue, resolveReview, nearest };
