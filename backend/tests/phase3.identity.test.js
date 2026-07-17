/**
 * Phase-3 identity / muzzle biometrics (AI-1 shadow).
 *   1. enrol stores the embedding, logs the inference (SHADOW → not acted)
 *   2. dedupe flags a near-duplicate (cross-owner) → queued review; enrol NOT blocked
 *   3. claim match is advisory — scores + queues, NEVER touches the claim
 *   4. consent + quality gates; right-to-erasure deletes the embedding
 *   5. shadow governance: canAct only in assist+; kill-switch disables; log append-only
 *   6. HTTP role separation (match = SURVEYOR/VET; enrol = owner)
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const config = require('../src/config');
const db = require('../src/shared/models');
const app = require('../src/app');
const biometric = require('../src/modules/identity/services/biometricService');
const registry = require('../src/modules/identity/services/modelRegistryService');
const { seedKavachReference } = require('../src/modules/kavach/services/kavachSeed');

const uuid = () => crypto.randomUUID();
const tokenFor = (id, role) => jwt.sign({ id, role }, config.jwt.accessSecret, { issuer: config.jwt.issuer, algorithm: 'HS256', expiresIn: '10m' });
const auth = (t) => ({ Authorization: `Bearer ${t}` });

// 8-dim toy embeddings with known cosine relationships.
const E1 = [1, 0, 0, 0, 0, 0, 0, 0];
const E_NEAR = [0.98, 0.02, 0.01, 0, 0, 0, 0, 0]; // ~0 cosine distance to E1 → duplicate
const E_FAR = [0, 1, 0, 0, 0, 0, 0, 0];           // cosine distance 1 → distinct

let farmerA, farmerB, farmerAToken, surveyorToken;
const consentFor = async (farmerId) => (await db.ConsentRecord.create({ consent_uuid: uuid(), farmer_id: farmerId, consent_type: 'biometric', consent_version: 'v1', accepted: true, accepted_at: new Date() })).id;

beforeAll(async () => {
  await db.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await db.sequelize.sync({ force: true });
  await seedKavachReference({ region: 'HIM' });
  farmerA = await db.User.create({ user_id: 'U-BIOA-' + uuid().slice(0, 6), mobile: '9444400021', first_name: 'A' });
  await db.FarmerProfile.create({ farmer_id: farmerA.id, profile_uuid: uuid() });
  farmerAToken = tokenFor(farmerA.user_id, 'FARMER');
  farmerB = await db.User.create({ user_id: 'U-BIOB-' + uuid().slice(0, 6), mobile: '9444400022', first_name: 'B' });
  await db.FarmerProfile.create({ farmer_id: farmerB.id, profile_uuid: uuid() });
  const sur = await db.User.create({ user_id: 'U-SUR2-' + uuid().slice(0, 6), mobile: '9444400023', first_name: 'Surv' });
  surveyorToken = tokenFor(sur.user_id, 'SURVEYOR');
});
afterAll(async () => { await db.sequelize.close(); });

describe('1. Enrol + shadow inference log', () => {
  test('enrol stores embedding and logs a SHADOW inference (not acted)', async () => {
    const consentId = await consentFor(farmerA.id);
    const res = await biometric.enrol({ farmerId: farmerA.id, tagUid: '360000000101', embedding: E1, quality: 0.9, consentRecordId: consentId });
    expect(res.biometric.id).toBeGreaterThan(0);
    expect(res.acted).toBe(false); // shadow
    const log = await db.ModelInferenceLog.findOne({ where: { inference_type: 'ENROL_DEDUPE' } });
    expect(log.lifecycle_stage).toBe('shadow');
    expect(log.acted).toBe(false);
    expect(log.output.decision).toBe('UNIQUE');
  });
});

describe('2. Dedupe (second factor, never blocks)', () => {
  test('a near-duplicate muzzle by a different owner is flagged + queued', async () => {
    const consentId = await consentFor(farmerB.id);
    const res = await biometric.enrol({ farmerId: farmerB.id, tagUid: '360000000102', embedding: E_NEAR, quality: 0.9, consentRecordId: consentId });
    expect(res.dedupe.flagged).toBe(true);
    expect(res.dedupe.nearestDistance).toBeLessThan(0.15);
    expect(res.dedupe.differentOwner).toBe(true);
    expect(res.queuedTaskUuid).toBeTruthy();
    // Enrolment still succeeded — muzzle is the second factor, not a gate.
    expect(res.biometric.is_active).toBe(true);
    const task = await db.BiometricReviewTask.findOne({ where: { task_uuid: res.queuedTaskUuid } });
    expect(task.kind).toBe('ENROL_DEDUPE_FLAG');
    expect(task.status).toBe('queued');
  });

  test('a distinct muzzle is not flagged', async () => {
    const consentId = await consentFor(farmerA.id);
    const res = await biometric.enrol({ farmerId: farmerA.id, tagUid: '360000000103', embedding: E_FAR, quality: 0.9, consentRecordId: consentId });
    expect(res.dedupe.flagged).toBe(false);
    expect(res.queuedTaskUuid).toBeNull();
  });
});

describe('3. Claim match is advisory only', () => {
  test('scores the muzzle and queues review WITHOUT changing the claim', async () => {
    // An animal with an enrolled muzzle, an issued policy asset, and an open claim.
    const animal = await db.DairyAnimal.create({ animal_uuid: uuid(), farmer_id: farmerA.id, species: 'CATTLE', tag_number: 'M1' });
    await biometric.enrol({ farmerId: farmerA.id, animalId: animal.id, tagUid: '360000000200', embedding: E1, quality: 0.95, consentRecordId: await consentFor(farmerA.id) });
    const plan = await db.InsurancePlan.findOne();
    const policy = await db.InsurancePolicy.create({ policy_uuid: uuid(), farmer_id: farmerA.id, plan_id: plan ? plan.id : 1, sum_insured: 50000, premium_total: 5750, premium_farmer: 862.5, status: 'active' });
    const asset = await db.PolicyAsset.create({ policy_id: policy.id, asset_ref_id: animal.id, tag_uid: '360000000200', species: 'CATTLE', valuation: 50000 });
    const claim = await db.ClaimCase.create({ claim_uuid: uuid(), policy_id: policy.id, farmer_id: farmerA.id, policy_asset_id: asset.id, claim_type: 'livestock_death', intimated_at: new Date(), sum_claimed: 50000, status: 'SURVEY_DONE' });

    const good = await biometric.matchForClaim({ claimUuid: claim.claim_uuid, embedding: E1 });
    expect(good.hasEnrolment).toBe(true);
    expect(good.matched).toBe(true);
    expect(good.distance).toBeLessThan(0.25);
    expect(good.queuedTaskUuid).toBeTruthy();

    // The claim is untouched — the match never decides.
    await claim.reload();
    expect(claim.status).toBe('SURVEY_DONE');
    const log = await db.ModelInferenceLog.findOne({ where: { inference_type: 'CLAIM_MATCH', subject_ref: claim.claim_uuid } });
    expect(log.acted).toBe(false); // claim decisions never automated

    const bad = await biometric.matchForClaim({ claimUuid: claim.claim_uuid, embedding: E_FAR });
    expect(bad.matched).toBe(false);
  });
});

describe('4. Consent, quality, erasure', () => {
  test('enrol without biometric consent is refused', async () => {
    const lone = await db.User.create({ user_id: 'U-NOC-' + uuid().slice(0, 6), mobile: '9444400030', first_name: 'NoConsent' });
    await expect(biometric.enrol({ farmerId: lone.id, embedding: E1, quality: 0.9 })).rejects.toThrow(/consent/i);
  });

  test('low capture quality is refused (server re-validates on-device QC)', async () => {
    await expect(biometric.enrol({ farmerId: farmerA.id, embedding: E1, quality: 0.3, consentRecordId: await consentFor(farmerA.id) }))
      .rejects.toThrow(/quality/i);
  });

  test('right-to-erasure deletes the embedding — even when a review task references it', async () => {
    // Enrol a near-duplicate so a review task is created against the new biometric.
    const res = await biometric.enrol({ farmerId: farmerA.id, tagUid: '360000000104', embedding: E_NEAR, quality: 0.9, consentRecordId: await consentFor(farmerA.id) });
    expect(res.queuedTaskUuid).toBeTruthy(); // it is flagged → has a task
    await biometric.deleteBiometric(res.biometric.biometric_uuid, farmerA.id); // must not throw on the FK
    expect(await db.AnimalBiometric.findOne({ where: { biometric_uuid: res.biometric.biometric_uuid } })).toBeNull();
    // The audit task survives, detached.
    const task = await db.BiometricReviewTask.findOne({ where: { task_uuid: res.queuedTaskUuid } });
    expect(task.subject_biometric_id).toBeNull();
  });

  test('a farmer cannot enrol against another farmer’s animal', async () => {
    const othersAnimal = await db.DairyAnimal.create({ animal_uuid: uuid(), farmer_id: farmerB.id, species: 'CATTLE', tag_number: 'B-owned' });
    await expect(biometric.enrol({ farmerId: farmerA.id, animalId: othersAnimal.id, embedding: E_FAR, quality: 0.9, consentRecordId: await consentFor(farmerA.id) }))
      .rejects.toThrow(/not in your herd/i);
  });

  test('withdrawn consent is not honoured', async () => {
    const w = await db.User.create({ user_id: 'U-WD-' + uuid().slice(0, 6), mobile: '9444400031', first_name: 'Withdrawn' });
    await db.ConsentRecord.create({ consent_uuid: uuid(), farmer_id: w.id, consent_type: 'biometric', consent_version: 'v1', accepted: true, accepted_at: new Date(), withdrawn_at: new Date(), is_active: false });
    await expect(biometric.enrol({ farmerId: w.id, embedding: E1, quality: 0.9 })).rejects.toThrow(/consent/i);
  });
});

describe('5. Shadow governance', () => {
  test('canAct only in assist+; kill-switch disables; log is append-only', async () => {
    const model = await registry.ensureMuzzleModel();
    expect(model.canAct).toBe(false); // shadow

    await model.update({ lifecycle_stage: 'assist' });
    await model.reload();
    expect(model.canAct).toBe(true);

    await model.update({ kill_switch: true });
    await model.reload();
    expect(model.canAct).toBe(false); // kill-switch overrides

    const log = await db.ModelInferenceLog.findOne();
    await expect(db.ModelInferenceLog.update({ acted: true }, { where: { id: log.id } })).rejects.toThrow(/append-only/);
    await model.update({ lifecycle_stage: 'shadow', kill_switch: false }); // restore
  });
});

describe('6. HTTP role separation', () => {
  test('enrol over HTTP; a farmer cannot run the match (SURVEYOR/VET only)', async () => {
    const consentId = await consentFor(farmerA.id);
    const enrolRes = await request(app).post('/api/v1/identity/biometrics').set(auth(farmerAToken))
      .send({ tagUid: '360000000105', embedding: E1, quality: 0.9, consentRecordId: consentId });
    expect(enrolRes.status).toBe(201);
    expect(enrolRes.body.data.biometricUuid).toBeTruthy();

    // Farmer hitting the field match route → roleCheck 403.
    const forbidden = await request(app).post('/api/v1/identity/match').set(auth(farmerAToken)).send({ claimUuid: uuid(), embedding: E1 });
    expect(forbidden.status).toBe(403);

    // Surveyor can read the shadow review queue.
    const queue = await request(app).get('/api/v1/identity/review-queue').set(auth(surveyorToken));
    expect(queue.status).toBe(200);
    expect(Array.isArray(queue.body.data)).toBe(true);
  });
});
