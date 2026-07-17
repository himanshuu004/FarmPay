/**
 * CIA-1 — Slice F: DUSS scrutiny + bank packet.
 *   1. scrutinise      : FORWARDED_TO_DUSS → UNDER_DUSS_SCRUTINY (captures maker)
 *   2. deficiency       : UNDER_DUSS_SCRUTINY → DOCUMENTS_INCOMPLETE (itemised)
 *   3. generateBankBatch: checker → SUBMITTED_TO_BANK + content-addressed packet
 *   4. segregation       : checker == scrutinising maker → 403 (SoD)
 */
process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || 'mock';
const crypto = require('crypto');
const db = require('../src/shared/models');
const duss = require('../src/modules/cattle_induction/services/dussService');
const { APP } = require('../src/modules/cattle_induction/constants/ciaStatus');

const uuid = () => crypto.randomUUID();
let makerClaim, checkerClaim;

const makerReq = (appUuid = null, body = {}) => ({ user: { id: makerClaim, role: 'DUSS_MAKER' }, params: { appUuid }, body, query: {} });
const checkerReq = (body = {}) => ({ user: { id: checkerClaim, role: 'DUSS_CHECKER' }, params: {}, body, query: {} });

const mkFwd = async (farmerRef) => {
  const row = await db.CiaApplication.create({
    application_uuid: uuid(), farmer_ref: farmerRef, dcs_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI',
    scheme_version: 'CIA_UK_2026_v1', status: APP.FORWARDED_TO_DUSS, eoi_at: new Date(),
  });
  return row.application_uuid;
};

beforeAll(async () => {
  await db.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await db.sequelize.sync({ force: true });
  const maker = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile: '9555500001', first_name: 'Maker' });
  const checker = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile: '9555500002', first_name: 'Checker' });
  makerClaim = maker.user_id; checkerClaim = checker.user_id;
  for (const ref of ['F1001', 'F1002', 'F1003', 'F1004']) {
    await db.CoopMembership.create({ membership_uuid: uuid(), farmer_ref: ref, society_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI', link_status: 'ERP_ONLY', joined_on: '2021-06-12' });
  }
});
afterAll(async () => { await db.sequelize.close(); });

describe('1. scrutinise', () => {
  test('FORWARDED_TO_DUSS → UNDER_DUSS_SCRUTINY and records the maker', async () => {
    const a = await mkFwd('F1001');
    const res = await duss.scrutinise(makerReq(a));
    expect(res.status).toBe(APP.UNDER_DUSS_SCRUTINY);
    const row = await db.CiaApplication.findOne({ where: { application_uuid: a } });
    expect(row.scrutinised_by_user_id).toBeTruthy();
  });
});

describe('2. deficiency', () => {
  test('UNDER_DUSS_SCRUTINY → DOCUMENTS_INCOMPLETE with itemised gaps', async () => {
    const a = await mkFwd('F1002');
    await duss.scrutinise(makerReq(a));
    const res = await duss.raiseDeficiency(makerReq(a, { items: ['Aadhaar unclear', 'Bank IFSC missing'] }));
    expect(res.status).toBe(APP.DOCUMENTS_INCOMPLETE);
    const row = await db.CiaApplication.findOne({ where: { application_uuid: a } });
    expect(row.reject_reason).toMatch(/IFSC/);
  });
});

describe('3. generateBankBatch (checker)', () => {
  test('scrutinised apps → SUBMITTED_TO_BANK with a content-addressed packet + event', async () => {
    const a1 = await mkFwd('F1003');
    const a2 = await mkFwd('F1004');
    await duss.scrutinise(makerReq(a1));
    await duss.scrutinise(makerReq(a2));

    const res = await duss.generateBankBatch(checkerReq({ bankRef: 'COOPBANK-RANCHI', applicationUuids: [a1, a2] }));
    expect(res.applicationCount).toBe(2);
    expect(res.packetDocRef).toMatch(/^s3:\/\/cia\/packets\//);

    for (const a of [a1, a2]) {
      const row = await db.CiaApplication.findOne({ where: { application_uuid: a } });
      expect(row.status).toBe(APP.SUBMITTED_TO_BANK);
      expect(row.bank_batch_id).toBe(res.batchUuid);
    }
    const ev = await db.DomainEvent.findOne({ where: { event_type: 'cia.bank_batch.generated', aggregate_id: res.batchUuid } });
    expect(ev).toBeTruthy();
  });
});

describe('4. maker-checker segregation of duties', () => {
  test('the maker who scrutinised cannot also generate the batch (403)', async () => {
    const a = await mkFwd('F1001');
    await duss.scrutinise(makerReq(a));   // scrutinised by makerClaim
    // Same user acts as checker on the same app → SoD violation.
    const selfCheck = { user: { id: makerClaim, role: 'DUSS_CHECKER' }, params: {}, body: { bankRef: 'COOPBANK-RANCHI', applicationUuids: [a] }, query: {} };
    await expect(duss.generateBankBatch(selfCheck))
      .rejects.toMatchObject({ errorCode: 'CIA_SOD_VIOLATION', statusCode: 403 });
    // ...and the app is untouched (still under scrutiny).
    const row = await db.CiaApplication.findOne({ where: { application_uuid: a } });
    expect(row.status).toBe(APP.UNDER_DUSS_SCRUTINY);
  });
});
