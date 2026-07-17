/**
 * CIA-3 — Slice P: anti-fraud shadow checks (penny-drop, geo-fence, registry, photo-hash).
 *   1. adapters   : payment-rails + registry mock/live behaviour
 *   2. clean       : verified seller, in-fence, unique tag/photo → no flags
 *   3. fraud        : bad account, out-of-fence, dup tag, dup photo → flags (shadow, never blocks)
 */
process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || 'mock';
process.env.PAYMENT_RAILS_MODE = 'mock';
process.env.REGISTRY_MODE = 'mock';
const crypto = require('crypto');
const db = require('../src/shared/models');
const schemeConfig = require('../src/modules/cattle_induction/services/schemeConfigService');
const fraud = require('../src/modules/cattle_induction/services/fraudCheckService');
const { paymentRails, livestockRegistry } = require('../src/integrations');
const { PURCHASE } = require('../src/modules/cattle_induction/constants/ciaStatus');

const uuid = () => crypto.randomUUID();
let supClaim; let tagSeq = 100000000000;
const supReq = (appUuid) => ({ user: { id: supClaim, role: 'ROUTE_SUPERVISOR' }, params: { appUuid }, body: {}, query: {} });

const mkPurchase = async (farmerRef, { account, lat, lng, earTag, photoRefs }) => {
  await db.CoopMembership.findOrCreate({ where: { farmer_ref: farmerRef }, defaults: { membership_uuid: uuid(), farmer_ref: farmerRef, society_ref: 'SOC-RANCHI-014', link_status: 'ERP_ONLY', joined_on: '2021-06-12' } });
  const app = await db.CiaApplication.create({ application_uuid: uuid(), farmer_ref: farmerRef, dcs_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI', scheme_version: 'CIA_UK_2026_v1', status: 'PURCHASE_INITIATED', eoi_at: new Date() });
  const animal = await db.CiaAnimal.create({ animal_uuid: uuid(), ear_tag_no: earTag || String(tagSeq += 1), ear_tag_photo_ref: 's3://tagphoto/' + uuid(), species: 'CATTLE', breed: 'HF', sex: 'FEMALE', photo_refs: photoRefs || ['s3://uniq/' + uuid()] });
  const seller = await db.CiaSeller.create({ seller_uuid: uuid(), name: 'Balbir Singh', id_proof_ref: 's3://id', bank_account: account, photo_ref: 's3://ph', relationship_to_buyer: 'unrelated' });
  const purchase = await db.CiaPurchase.create({ purchase_uuid: uuid(), application_id: app.id, animal_id: animal.id, seller_id: seller.id, status: PURCHASE.PURCHASE_APPROVED, purchase_lat: lat, purchase_lng: lng, initiated_at: new Date() });
  return { appUuid: app.application_uuid, purchaseId: purchase.id, sellerId: seller.id };
};

beforeAll(async () => {
  await db.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await db.sequelize.sync({ force: true });
  await schemeConfig.publishConfig({ schemeVersion: 'CIA_UK_2026_v1', rulesJson: { geoFence: { lat: 30.31, lng: 78.03, radiusKm: 25 } }, docChecklist: [] }, {});
  const sup = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile: '9999900002', first_name: 'Supervisor' });
  supClaim = sup.user_id;
});
afterAll(async () => { delete process.env.PAYMENT_RAILS_MODE; delete process.env.REGISTRY_MODE; await db.sequelize.close(); });

describe('1. adapters', () => {
  test('penny-drop mock verifies (and flags BADACCT / MISMATCH); live is notReady', async () => {
    expect((await paymentRails.pennyDrop({ accountNumber: 'SBIN123', name: 'Balbir' })).verified).toBe(true);
    expect((await paymentRails.pennyDrop({ accountNumber: 'BADACCT9', name: 'X' })).verified).toBe(false);
    expect((await paymentRails.pennyDrop({ accountNumber: 'SBIN123', name: 'MISMATCH' })).nameMatch).toBe(false);
    process.env.PAYMENT_RAILS_MODE = 'live';
    await expect(paymentRails.payout({ payeeAccount: 'A', amount: 1, reference: 'r' })).rejects.toMatchObject({ errorCode: 'PAYMENT_RAILS_NOT_READY' });
    process.env.PAYMENT_RAILS_MODE = 'mock';
  });
  test('registry mock flags a 9999-prefixed tag; live is notReady', async () => {
    expect((await livestockRegistry.lookupEarTag('999900000001')).onOtherLoan).toBe(true);
    expect((await livestockRegistry.lookupEarTag('123456789012')).onOtherLoan).toBe(false);
    process.env.REGISTRY_MODE = 'live';
    await expect(livestockRegistry.lookupEarTag('123456789012')).rejects.toMatchObject({ errorCode: 'REGISTRY_NOT_READY' });
    process.env.REGISTRY_MODE = 'mock';
  });
});

describe('2. clean purchase', () => {
  test('verified seller, in-fence, unique tag + photo → no flags', async () => {
    const p = await mkPurchase('F1001', { account: 'SBIN0001-7781', lat: 30.315, lng: 78.035, earTag: '123456789012', photoRefs: ['s3://clean/a'] });
    const res = await fraud.runChecks(supReq(p.appUuid));
    expect(res.accountVerified).toBe(true);
    expect(res.withinGeofence).toBe(true);
    expect(res.flags).toEqual([]);
    const purchase = await db.CiaPurchase.findByPk(p.purchaseId);
    expect(purchase.within_geofence).toBe(true);
  });
});

describe('3. fraud purchase (shadow flags, never blocks)', () => {
  test('bad account + out-of-fence + registry dup + duplicate photo all flag', async () => {
    // Seed another animal that shares a photo ref, to trigger DUPLICATE_PHOTO.
    await db.CiaAnimal.create({ animal_uuid: uuid(), ear_tag_no: '111122223333', ear_tag_photo_ref: 's3://tp/x', species: 'CATTLE', breed: 'HF', sex: 'FEMALE', photo_refs: ['s3://shared/photo'] });
    const p = await mkPurchase('F1002', { account: 'BADACCT-9', lat: 28.61, lng: 77.20, earTag: '999900000002', photoRefs: ['s3://shared/photo'] });

    const res = await fraud.runChecks(supReq(p.appUuid));   // resolves — never throws
    expect(res.accountVerified).toBe(false);
    expect(res.withinGeofence).toBe(false);
    expect(res.flags).toEqual(expect.arrayContaining(['PAYEE_UNVERIFIED', 'GEOFENCE_BREACH', 'REGISTRY_DUPLICATE', 'DUPLICATE_PHOTO']));

    const purchase = await db.CiaPurchase.findByPk(p.purchaseId);
    expect(purchase.exception_flags).toEqual(expect.arrayContaining(['GEOFENCE_BREACH']));
    expect(purchase.status).toBe(PURCHASE.PURCHASE_APPROVED); // NOT auto-rejected
    const seller = await db.CiaSeller.findByPk(p.sellerId);
    expect(seller.account_verified).toBe(false);
  });
});
