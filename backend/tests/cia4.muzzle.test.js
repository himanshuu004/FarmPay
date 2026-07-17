/**
 * CIA-4 — Slice V: muzzle re-ID asset verification (SHADOW).
 *   1. adapter    : vision mock embeds; live is notReady
 *   2. enrol       : stores AnimalBiometric + logs a shadow inference (acted=false)
 *   3. match        : same animal re-IDs → match, no flag
 *   4. mismatch      : substitution → MUZZLE_MISMATCH + review task queued; never auto-decides
 */
process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || 'mock';
process.env.VISION_MODE = 'mock';
const crypto = require('crypto');
const db = require('../src/shared/models');
const muzzle = require('../src/modules/cattle_induction/services/muzzleService');
const { vision } = require('../src/integrations');

const uuid = () => crypto.randomUUID();
let supClaim; let tag = 100000000000;
const req = (appUuid, body) => ({ user: { id: supClaim, role: 'ROUTE_SUPERVISOR' }, params: { appUuid }, body, query: {} });

const mkAnimal = async (farmerRef) => {
  const u = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile: '90000' + (tag % 100000), first_name: farmerRef });
  await db.CoopMembership.findOrCreate({ where: { farmer_ref: farmerRef }, defaults: { membership_uuid: uuid(), farmer_ref: farmerRef, society_ref: 'SOC-RANCHI-014', link_status: 'LINKED', user_id: u.id, joined_on: '2021-06-12' } });
  const app = await db.CiaApplication.create({ application_uuid: uuid(), farmer_ref: farmerRef, dcs_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI', scheme_version: 'CIA_UK_2026_v1', status: 'EMI_ACTIVE', user_id: u.id, eoi_at: new Date() });
  const animal = await db.CiaAnimal.create({ animal_uuid: uuid(), ear_tag_no: String(tag += 1), ear_tag_photo_ref: 's3://t', species: 'CATTLE', breed: 'HF', sex: 'FEMALE' });
  const purchase = await db.CiaPurchase.create({ purchase_uuid: uuid(), application_id: app.id, animal_id: animal.id, status: 'SELLER_PAID', initiated_at: new Date() });
  return { appUuid: app.application_uuid, tag: animal.ear_tag_no, purchaseId: purchase.id };
};

beforeAll(async () => {
  await db.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await db.sequelize.sync({ force: true });
  const s = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile: '9444400009', first_name: 'Supervisor' });
  supClaim = s.user_id;
});
afterAll(async () => { delete process.env.VISION_MODE; await db.sequelize.close(); });

describe('1. vision adapter', () => {
  test('mock embeds deterministically; live is notReady', async () => {
    const a = await vision.embedMuzzle({ photoRef: 'p', animalKey: 'X' });
    const b = await vision.embedMuzzle({ photoRef: 'p', animalKey: 'X' });
    expect(a.embedding).toHaveLength(8);
    expect(a.embedding).toEqual(b.embedding);          // deterministic per animalKey
    process.env.VISION_MODE = 'live';
    await expect(vision.embedMuzzle({ photoRef: 'p' })).rejects.toMatchObject({ errorCode: 'VISION_NOT_READY' });
    process.env.VISION_MODE = 'mock';
  });
});

describe('2. enrol (shadow)', () => {
  test('stores a biometric keyed by the ear tag and logs a shadow inference', async () => {
    const c = await mkAnimal('F1001');
    const res = await muzzle.enrol(req(c.appUuid, { photoRef: 's3://muzzle/1', animalKey: 'animal-A' }));
    expect(res.shadow).toBe(true);
    const bio = await db.AnimalBiometric.findOne({ where: { tag_uid: c.tag } });
    expect(bio.model_name).toBe('muzzle-reid');
    const log = await db.ModelInferenceLog.findOne({ where: { subject_ref: res.biometricUuid } });
    expect(log.inference_type).toBe('ENROL_DEDUPE');
    expect(log.acted).toBe(false);                     // shadow-observe, never acts
  });
});

describe('3 + 4. verify (shadow)', () => {
  test('the same animal re-IDs → match, no flag', async () => {
    const c = await mkAnimal('F1002');
    await muzzle.enrol(req(c.appUuid, { photoRef: 's3://m/a', animalKey: 'animal-B' }));
    const res = await muzzle.verify(req(c.appUuid, { photoRef: 's3://m/a2', animalKey: 'animal-B' }));
    expect(res.match).toBe(true);
    expect(res.flagged).toBe(false);
    const p = await db.CiaPurchase.findByPk(c.purchaseId);
    expect(p.exception_flags == null || !p.exception_flags.includes('MUZZLE_MISMATCH')).toBe(true);
  });

  test('a substitution → MUZZLE_MISMATCH + queued review task; never auto-decides', async () => {
    const c = await mkAnimal('F1003');
    await muzzle.enrol(req(c.appUuid, { photoRef: 's3://m/x', animalKey: 'animal-C' }));
    const res = await muzzle.verify(req(c.appUuid, { photoRef: 's3://m/y', animalKey: 'DIFFERENT-animal' }));
    expect(res.match).toBe(false);
    expect(res.flagged).toBe(true);
    expect(res.reviewTaskId).toBeTruthy();

    const p = await db.CiaPurchase.findByPk(c.purchaseId);
    expect(p.exception_flags).toContain('MUZZLE_MISMATCH');   // surfaces on the fraud panel
    const task = await db.BiometricReviewTask.findByPk(res.reviewTaskId);
    expect(task.status).toBe('queued');                       // to a human, not auto-resolved
    const log = await db.ModelInferenceLog.findOne({ where: { inference_type: 'CLAIM_MATCH' }, order: [['id', 'DESC']] });
    expect(log.acted).toBe(false);                            // shadow — no state change
  });

  test('verify before enrol is refused', async () => {
    const c = await mkAnimal('F1004');
    await expect(muzzle.verify(req(c.appUuid, { photoRef: 's3://m/z', animalKey: 'animal-D' })))
      .rejects.toMatchObject({ errorCode: 'CIA_MUZZLE_NOT_ENROLLED' });
  });
});
