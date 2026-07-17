/**
 * CIA-3 — Slice S: fraud exception panel (shadow).
 *   1. list      : surfaces flagged purchases with blocking classification + hold
 *   2. clear      : clears a flag with a reason (append-only event); nothing deleted silently
 *   3. release     : clearing the last blocking flag drops the payment hold
 */
process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || 'mock';
const crypto = require('crypto');
const db = require('../src/shared/models');
const fraud = require('../src/modules/cattle_induction/services/fraudCheckService');
const { PURCHASE } = require('../src/modules/cattle_induction/constants/ciaStatus');

const uuid = () => crypto.randomUUID();
let reviewerClaim; let tag = 100000000000;
const revReq = (appUuid, body = {}) => ({ user: { id: reviewerClaim, role: 'UCDF_PM' }, params: { appUuid }, body, query: {} });

const mkFlagged = async (farmerRef, flags) => {
  await db.CoopMembership.findOrCreate({ where: { farmer_ref: farmerRef }, defaults: { membership_uuid: uuid(), farmer_ref: farmerRef, society_ref: 'SOC-RANCHI-014', link_status: 'ERP_ONLY', joined_on: '2021-06-12' } });
  const app = await db.CiaApplication.create({ application_uuid: uuid(), farmer_ref: farmerRef, dcs_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI', scheme_version: 'CIA_UK_2026_v1', status: 'PURCHASE_INITIATED', eoi_at: new Date() });
  const animal = await db.CiaAnimal.create({ animal_uuid: uuid(), ear_tag_no: String(tag += 1), ear_tag_photo_ref: 's3://t', species: 'CATTLE', breed: 'HF', sex: 'FEMALE' });
  const purchase = await db.CiaPurchase.create({ purchase_uuid: uuid(), application_id: app.id, animal_id: animal.id, status: PURCHASE.INSURANCE_PENDING, exception_flags: flags, initiated_at: new Date() });
  return { appUuid: app.application_uuid, purchaseId: purchase.id };
};

beforeAll(async () => {
  await db.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await db.sequelize.sync({ force: true });
  const r = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile: '9222200001', first_name: 'Reviewer' });
  reviewerClaim = r.user_id;
});
afterAll(async () => { await db.sequelize.close(); });

describe('1. list', () => {
  test('surfaces flagged purchases (not the unflagged ones), with hold + classification', async () => {
    await mkFlagged('F1001', ['PAYEE_NAME_MISMATCH', 'PRICE_OUTLIER']); // blocking + advisory → held
    await mkFlagged('F1002', ['PRICE_OUTLIER']);                        // advisory only → not held
    await mkFlagged('F1003', null);                                     // no flags → excluded

    const list = await fraud.listExceptions();
    expect(list.length).toBe(2);
    const held = list.find((x) => x.farmerRef === 'F1001');
    expect(held.paymentHeld).toBe(true);
    expect(held.flags.find((f) => f.flag === 'PAYEE_NAME_MISMATCH').blocking).toBe(true);
    const adv = list.find((x) => x.farmerRef === 'F1002');
    expect(adv.paymentHeld).toBe(false);
  });
});

describe('2 + 3. clear → release', () => {
  test('clearing the blocking flag (with reason) records it and drops the hold', async () => {
    const p = await mkFlagged('F1004', ['GEOFENCE_BREACH', 'PRICE_OUTLIER']);
    const res = await fraud.clearException(revReq(p.appUuid, { flag: 'GEOFENCE_BREACH', reason: 'Verified: shed just outside radius, genuine' }));
    expect(res.cleared).toBe('GEOFENCE_BREACH');
    expect(res.paymentHeld).toBe(false);                 // only the advisory outlier remains
    expect(res.remaining).toEqual(['PRICE_OUTLIER']);

    const purchase = await db.CiaPurchase.findByPk(p.purchaseId);
    expect(purchase.exception_flags).toEqual(['PRICE_OUTLIER']);
    const ev = await db.DomainEvent.findOne({ where: { event_type: 'cia.fraud.cleared', aggregate_id: p.appUuid } });
    expect(ev).toBeTruthy();
    expect(ev.payload.reason).toMatch(/genuine/);        // recorded, not erased
  });

  test('clearing a flag that is not open is rejected', async () => {
    const p = await mkFlagged('F1005', ['DUPLICATE_PHOTO']);
    await expect(fraud.clearException(revReq(p.appUuid, { flag: 'PAYEE_UNVERIFIED', reason: 'x' })))
      .rejects.toMatchObject({ errorCode: 'CIA_FLAG_NOT_FOUND', statusCode: 404 });
  });
});
