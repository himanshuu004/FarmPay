/**
 * CIA-1 — Slice E: offline supervisor field verification.
 *   1. submit (online) : geo+photo mandatory; APPROVED → FORWARDED_TO_DUSS
 *   2. offline sync    : idempotent (replay = DUPLICATE), one row/one transition
 *   3. conflict         : server-wins (app already moved on) → CONFLICT recorded
 *   4. return           : RETURNED → RETURNED_FOR_CORRECTION with reason
 */
process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || 'mock';
const crypto = require('crypto');
const db = require('../src/shared/models');
const verify = require('../src/modules/cattle_induction/services/verificationService');
const { APP } = require('../src/modules/cattle_induction/constants/ciaStatus');

const uuid = () => crypto.randomUUID();
const GEO = { shedGeo: { lat: 30.31, lng: 78.03 }, residenceGeo: { lat: 30.32, lng: 78.04 }, mediaRefs: ['s3://cia/verify/p1'] };
let supClaim;

const supReq = (appUuid, body) => ({ user: { id: supClaim, role: 'ROUTE_SUPERVISOR' }, params: { appUuid }, body, query: {} });
const syncReq = (ops) => ({ user: { id: supClaim, role: 'ROUTE_SUPERVISOR' }, body: { deviceId: 'dev-1', ops }, query: {} });

const mkPendingApp = async (farmerRef) => {
  const row = await db.CiaApplication.create({
    application_uuid: uuid(), farmer_ref: farmerRef, dcs_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI',
    scheme_version: 'CIA_UK_2026_v1', status: APP.PENDING_SUPERVISOR_VERIFY, eoi_at: new Date(), submitted_at: new Date(),
  });
  return row.application_uuid;
};

beforeAll(async () => {
  await db.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await db.sequelize.sync({ force: true });
  const sup = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile: '9444400000', first_name: 'Supervisor' });
  supClaim = sup.user_id;
  for (const ref of ['F1001', 'F1002', 'F1003', 'F1004', 'F1005']) {
    await db.CoopMembership.create({ membership_uuid: uuid(), farmer_ref: ref, society_ref: 'SOC-RANCHI-014', link_status: 'ERP_ONLY', joined_on: '2021-06-12' });
  }
});
afterAll(async () => { await db.sequelize.close(); });

describe('1. online submit', () => {
  test('geo + live photo are mandatory (server re-validates)', async () => {
    const a = await mkPendingApp('F1001');
    await expect(verify.submit(supReq(a, { result: 'APPROVED', mediaRefs: ['s3://x'], residenceGeo: GEO.residenceGeo })))
      .rejects.toMatchObject({ errorCode: 'CIA_VERIFY_GEO_REQUIRED' });
  });

  test('APPROVED forwards to DUSS + writes a verification record and event', async () => {
    const a = await mkPendingApp('F1001');
    const res = await verify.submit(supReq(a, { result: 'APPROVED', ...GEO, checks: { identity_ok: true, membership_ok: true } }));
    expect(res.status).toBe(APP.FORWARDED_TO_DUSS);
    const row = await db.CiaApplication.findOne({ where: { application_uuid: a } });
    expect(row.status).toBe(APP.FORWARDED_TO_DUSS);
    const fv = await db.CiaFieldVerification.findOne({ where: { application_id: row.id } });
    expect(fv.result).toBe('APPROVED');
    expect(Number(fv.shed_lat)).toBeCloseTo(30.31, 2);
    const ev = await db.DomainEvent.findOne({ where: { event_type: 'cia.verification.submitted', aggregate_id: a } });
    expect(ev).toBeTruthy();
  });
});

describe('2. offline sync idempotency', () => {
  test('replaying the same op is a DUPLICATE no-op (one row, one transition)', async () => {
    const a = await mkPendingApp('F1002');
    const op = { opUuid: uuid(), clientTs: new Date().toISOString(), appUuid: a, result: 'APPROVED', ...GEO };

    const first = await verify.sync(syncReq([op]));
    expect(first.synced[0].status).toBe('APPLIED');

    const replay = await verify.sync(syncReq([op]));   // same opUuid
    expect(replay.synced[0].status).toBe('DUPLICATE');

    const row = await db.CiaApplication.findOne({ where: { application_uuid: a } });
    expect(row.status).toBe(APP.FORWARDED_TO_DUSS);
    const fvCount = await db.CiaFieldVerification.count({ where: { application_id: row.id } });
    expect(fvCount).toBe(1);                              // not double-applied
    const evCount = await db.DomainEvent.count({ where: { event_type: 'cia.verification.submitted', aggregate_id: a } });
    expect(evCount).toBe(1);
  });
});

describe('3. conflict — server-wins', () => {
  test('two ops on the same application: first APPLIED, second CONFLICT', async () => {
    const a = await mkPendingApp('F1003');
    const op1 = { opUuid: uuid(), clientTs: new Date().toISOString(), appUuid: a, result: 'APPROVED', ...GEO };
    const op2 = { opUuid: uuid(), clientTs: new Date().toISOString(), appUuid: a, result: 'APPROVED', ...GEO };

    const res = await verify.sync(syncReq([op1, op2]));
    const byId = Object.fromEntries(res.synced.map((r) => [r.opUuid, r.status]));
    expect(byId[op1.opUuid]).toBe('APPLIED');
    expect(byId[op2.opUuid]).toBe('CONFLICT');

    const conflictItem = await db.SyncQueueItem.findOne({ where: { op_uuid: op2.opUuid } });
    expect(conflictItem.status).toBe('CONFLICT');
    expect(conflictItem.conflict_detail).toBeTruthy();   // recorded for farmer notify
  });
});

describe('4. return for correction', () => {
  test('RETURNED → RETURNED_FOR_CORRECTION with the reason recorded', async () => {
    const a = await mkPendingApp('F1004');
    const res = await verify.submit(supReq(a, { result: 'RETURNED', remarks: 'Shed photo does not match', ...GEO }));
    expect(res.status).toBe(APP.RETURNED_FOR_CORRECTION);
    const row = await db.CiaApplication.findOne({ where: { application_uuid: a } });
    expect(row.reject_reason).toMatch(/shed photo/i);
  });

  test('RETURNED without remarks is rejected', async () => {
    const a = await mkPendingApp('F1005');
    await expect(verify.submit(supReq(a, { result: 'RETURNED', ...GEO })))
      .rejects.toMatchObject({ errorCode: 'CIA_VERIFY_REMARKS_REQUIRED' });
  });
});
