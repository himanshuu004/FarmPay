/**
 * CIA-1 — Slice H: guided cattle-purchase capture (evidence only).
 *   1. capture       : assembles the traceability chain → PURCHASE_INITIATED
 *   2. ear-tag        : ^\d{12}$ regex + DB registry-uniqueness
 *   3. payment gate    : SELLER_PAYMENT_PENDING unreachable in CIA-1
 *   4. acknowledge/IDOR: farmer flag; cross-farmer blocked
 */
process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || 'mock';
const crypto = require('crypto');
const db = require('../src/shared/models');
const purchase = require('../src/modules/cattle_induction/services/purchaseCaptureService');
const { APP, PURCHASE, canTransition, guardTransition } = require('../src/modules/cattle_induction/constants/ciaStatus');

const uuid = () => crypto.randomUUID();
const memberUsers = {};

const req = (farmerRef, appUuid, body = {}) => ({ user: { id: memberUsers[farmerRef], role: 'FARMER' }, params: { appUuid }, body, query: {} });
const captureBody = (earTagNo) => ({
  earTagNo, earTagPhotoRef: 's3://cia/tag/' + earTagNo, species: 'CATTLE', breed: 'HF crossbred', sex: 'FEMALE',
  purchaseGeo: { lat: 30.3149, lng: 78.0301 }, photoRefs: ['s3://cia/animal/p1', 's3://cia/animal/p2'], videoRef: 's3://cia/animal/v1',
  seller: { name: 'Balbir Singh', idProofRef: 's3://cia/seller/id', bankAccount: 'SBIN0009999-1234', photoRef: 's3://cia/seller/photo', relationshipToBuyer: 'unrelated' },
  transport: { vehicleRegNo: 'UK07AB1234', driverName: 'Rakesh', billRef: 's3://cia/tp/bill', challanRef: 's3://cia/tp/challan' },
});

const mkPurchasable = async (farmerRef, mobile) => {
  const u = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile, first_name: farmerRef });
  memberUsers[farmerRef] = u.user_id;
  await db.CoopMembership.create({ membership_uuid: uuid(), farmer_ref: farmerRef, society_ref: 'SOC-RANCHI-014', link_status: 'LINKED', user_id: u.id, joined_on: '2021-06-12' });
  const row = await db.CiaApplication.create({
    application_uuid: uuid(), farmer_ref: farmerRef, dcs_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI',
    scheme_version: 'CIA_UK_2026_v1', status: APP.CATTLE_PURCHASE_PENDING, eoi_at: new Date(),
  });
  return row.application_uuid;
};

beforeAll(async () => {
  await db.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await db.sequelize.sync({ force: true });
});
afterAll(async () => { await db.sequelize.close(); });

describe('1. capture — traceability chain', () => {
  test('assembles application → animal → seller → transport and sets PURCHASE_INITIATED', async () => {
    const a = await mkPurchasable('F1001', '9000000001');
    const res = await purchase.capture(req('F1001', a, captureBody('123456789012')));
    expect(res.purchaseStatus).toBe(PURCHASE.PURCHASE_INITIATED);
    expect(res.sellerPaymentReachable).toBe(false);

    const app = await db.CiaApplication.findOne({ where: { application_uuid: a } });
    expect(app.status).toBe(APP.PURCHASE_INITIATED);
    const p = await db.CiaPurchase.findOne({ where: { application_id: app.id } });
    expect(p.animal_id).toBeTruthy();
    expect(p.seller_id).toBeTruthy();
    const tp = await db.CiaTransport.findOne({ where: { purchase_id: p.id } });
    expect(tp.vehicle_reg_no).toBe('UK07AB1234');
    // gate inputs all false in CIA-1
    expect(p.vet_certified).toBe(false);
    expect(p.transit_insured).toBe(false);
    expect(p.cattle_insured).toBe(false);
    const ev = await db.DomainEvent.findOne({ where: { event_type: 'cia.purchase.captured', aggregate_id: a } });
    expect(ev).toBeTruthy();
  });
});

describe('2. ear-tag regex + registry uniqueness', () => {
  test('rejects a non-12-digit ear tag (422)', async () => {
    const a = await mkPurchasable('F1002', '9000000002');
    await expect(purchase.capture(req('F1002', a, captureBody('12345'))))
      .rejects.toMatchObject({ errorCode: 'CIA_EARTAG_INVALID', statusCode: 422 });
  });

  test('rejects a duplicate ear tag already on another animal (409)', async () => {
    const a = await mkPurchasable('F1003', '9000000003');
    // '123456789012' was used by F1001 above.
    await expect(purchase.capture(req('F1003', a, captureBody('123456789012'))))
      .rejects.toMatchObject({ errorCode: 'CIA_EARTAG_DUPLICATE', statusCode: 409 });
  });
});

describe('3. payment gate is unreachable in CIA-1', () => {
  test('purchase machine cannot jump to SELLER_PAYMENT_PENDING', () => {
    expect(canTransition('purchase', PURCHASE.PURCHASE_INITIATED, PURCHASE.SELLER_PAYMENT_PENDING)).toBe(false);
    expect(() => guardTransition('purchase', PURCHASE.PURCHASE_INITIATED, PURCHASE.SELLER_PAYMENT_PENDING))
      .toThrow(/Illegal purchase transition/);
  });
});

describe('4. acknowledge + ownership', () => {
  test('acknowledge sets the farmer flag without opening the gate', async () => {
    const a = await mkPurchasable('F1004', '9000000004');
    await purchase.capture(req('F1004', a, captureBody('222233334444')));
    const res = await purchase.acknowledge(req('F1004', a));
    expect(res.farmerAcknowledged).toBe(true);
    const app = await db.CiaApplication.findOne({ where: { application_uuid: a } });
    const p = await db.CiaPurchase.findOne({ where: { application_id: app.id } });
    expect(p.farmer_acknowledged).toBe(true);
    expect(p.status).toBe(PURCHASE.PURCHASE_INITIATED);   // gate not opened in CIA-1
  });

  test('a farmer cannot capture on another farmer\'s application (403)', async () => {
    const a = await mkPurchasable('F1005', '9000000005');
    await expect(purchase.capture(req('F1004', a, captureBody('555566667777'))))
      .rejects.toMatchObject({ errorCode: 'CIA_APP_FORBIDDEN', statusCode: 403 });
  });
});

describe('5. getState — resumable hub read', () => {
  test('reports purchasable + not-captured before capture, then captured state after', async () => {
    const a = await mkPurchasable('F1006', '9000000006');
    const before = await purchase.getState(req('F1006', a));
    expect(before.captured).toBe(false);
    expect(before.purchasable).toBe(true);
    expect(before.appStatus).toBe(APP.CATTLE_PURCHASE_PENDING);

    await purchase.capture(req('F1006', a, captureBody('888899990000')));
    const after = await purchase.getState(req('F1006', a));
    expect(after.captured).toBe(true);
    expect(after.purchasable).toBe(false);
    expect(after.purchaseStatus).toBe(PURCHASE.PURCHASE_INITIATED);
    expect(after.animal.earTagNo).toBe('888899990000');
    expect(after.seller.name).toBe('Balbir Singh');
    expect(after.sellerPaymentReachable).toBe(false);            // gate closed in CIA-1
    expect(after.gate).toMatchObject({ vetCertified: false, transitInsured: false, cattleInsured: false });
  });

  test('ownership enforced on the read (403)', async () => {
    const a = await mkPurchasable('F1007', '9000000007');
    await expect(purchase.getState(req('F1006', a)))
      .rejects.toMatchObject({ errorCode: 'CIA_APP_FORBIDDEN', statusCode: 403 });
  });
});
