/**
 * Phase-0 exit-criteria suite.
 *   1. Core loop        : register → log → P&L on Postgres
 *   2. Filedrop         : reconciliation idempotency (file + row level)
 *   3. Offline sync     : idempotent replay + server-wins conflict
 *   4. AI-0a invariants : domain_events append-only · consent model_improvement
 */
const crypto = require('crypto');
const db = require('../src/shared/models');
const { ingestFile } = require('../src/modules/coop/services/erpSyncService');
const { pushOps } = require('../src/shared/services/offlineSyncService');
const { emitDomainEvent } = require('../src/shared/services/domainEvents');
const { CONSENT_PURPOSES } = require('../src/shared/constants/consentPurposes');

const uuid = () => crypto.randomUUID();
const firstEnum = (model, field) => model.rawAttributes[field].values[0];

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
});
afterAll(async () => {
  await db.sequelize.close();
});

describe('1. Core loop: register → log → P&L', () => {
  test('P&L = revenue − cost on Postgres', async () => {
    const user = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile: '9111100001', first_name: 'Test' });
    const farmer = await db.FarmerProfile.create({ farmer_id: user.id, profile_uuid: uuid() });
    const herd = await db.DairyHerdRegister.create({ register_uuid: uuid(), farmer_id: farmer.farmer_id, register_name: 'Shed' });
    await db.DairyAnimal.create({ animal_uuid: uuid(), herd_id: herd.id, tag_number: '360000099999' });

    await db.DairyCostEvent.create({ event_uuid: uuid(), farmer_id: farmer.farmer_id, event_date: '2026-07-01', category: firstEnum(db.DairyCostEvent, 'category'), amount: 1800 });
    await db.DairyRevenueEvent.create({ event_uuid: uuid(), farmer_id: farmer.farmer_id, event_date: '2026-07-02', category: firstEnum(db.DairyRevenueEvent, 'category'), amount: 4460 });

    const cost = await db.DairyCostEvent.sum('amount', { where: { farmer_id: farmer.farmer_id } });
    const revenue = await db.DairyRevenueEvent.sum('amount', { where: { farmer_id: farmer.farmer_id } });
    expect(Number(revenue) - Number(cost)).toBe(2660);
  });
});

describe('2. Filedrop reconciliation idempotency', () => {
  const memberCsv = [
    'farmer_ref,society_ref,member_name,mobile',
    'F9001,SOC-A,Asha Devi,9000000001',
    'F9002,SOC-A,Bhola Ram,9000000002',
  ].join('\n');

  test('identical re-drop is skipped (file-level)', async () => {
    const first = await ingestFile({ fileName: 'MEMBER_MASTER_20260705_001.csv', kind: 'MEMBER_MASTER', buffer: Buffer.from(memberCsv) });
    expect(first.status).toBe('APPLIED');
    expect(first.rowsApplied).toBe(2);

    const again = await ingestFile({ fileName: 'MEMBER_MASTER_20260705_001.csv', kind: 'MEMBER_MASTER', buffer: Buffer.from(memberCsv) });
    expect(again.status).toBe('DUPLICATE_SKIPPED');

    expect(await db.CoopMembership.count({ where: { farmer_ref: ['F9001', 'F9002'] } })).toBe(2);
    expect(await db.ErpSyncLog.count()).toBe(1); // duplicate did NOT create a second log
  });

  test('changed batch upserts the delta, no duplicate rows (row-level)', async () => {
    const changed = [
      'farmer_ref,society_ref,member_name,mobile',
      'F9001,SOC-A,Asha Devi,9999999999', // mobile changed
      'F9002,SOC-A,Bhola Ram,9000000002',
      'F9003,SOC-B,Chandni,9000000003',   // new member
    ].join('\n');
    const res = await ingestFile({ fileName: 'MEMBER_MASTER_20260705_002.csv', kind: 'MEMBER_MASTER', buffer: Buffer.from(changed) });
    expect(res.status).toBe('APPLIED');
    expect(await db.CoopMembership.count({ where: { farmer_ref: ['F9001', 'F9002', 'F9003'] } })).toBe(3);
    const asha = await db.CoopMembership.findOne({ where: { farmer_ref: 'F9001' } });
    expect(asha.mobile).toBe('9999999999');
  });

  test('milk summary lands outstanding payables for the 70% engine', async () => {
    const milk = [
      'farmer_ref,society_ref,period,litres,value,outstanding,as_of_date',
      'F9001,SOC-A,2026-06,180,6840,5000,2026-07-04',
    ].join('\n');
    await ingestFile({ fileName: 'MILK_SUMMARY_20260705_001.csv', kind: 'MILK_SUMMARY', buffer: Buffer.from(milk) });
    const snap = await db.CoopMilkSnapshot.findOne({ where: { farmer_ref: 'F9001', period: '2026-06' } });
    expect(Number(snap.outstanding)).toBe(5000);
    expect(snap.source_mode).toBe('filedrop');
  });
});

describe('3. Offline sync: idempotent replay + server-wins conflict', () => {
  let farmerId;
  beforeAll(async () => {
    const u = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile: '9111100002', first_name: 'Offline' });
    const f = await db.FarmerProfile.create({ farmer_id: u.id, profile_uuid: uuid() });
    farmerId = f.farmer_id;
  });

  test('replaying the same op does not double-apply', async () => {
    const op = {
      opUuid: uuid(), entityType: 'DairyCostEvent', action: 'CREATE', clientTs: new Date().toISOString(),
      payload: { event_uuid: uuid(), farmer_id: farmerId, event_date: '2026-07-03', category: firstEnum(db.DairyCostEvent, 'category'), amount: 500 },
    };
    const r1 = await pushOps({ userId: farmerId, ops: [op] });
    expect(r1[0].status).toBe('APPLIED');
    const r2 = await pushOps({ userId: farmerId, ops: [op] }); // exact replay
    expect(r2[0].status).toBe('DUPLICATE');
    expect(await db.DairyCostEvent.count({ where: { farmer_id: farmerId } })).toBe(1);
  });

  test('server-wins: stale UPDATE is flagged CONFLICT and does not overwrite', async () => {
    const rev = await db.DairyRevenueEvent.create({ event_uuid: uuid(), farmer_id: farmerId, event_date: '2026-07-04', category: firstEnum(db.DairyRevenueEvent, 'category'), amount: 1000 });
    // client captured its edit BEFORE the server row's last change → stale.
    const staleTs = new Date(new Date(rev.updatedAt).getTime() - 60000).toISOString();
    const res = await pushOps({ userId: farmerId, ops: [{
      opUuid: uuid(), entityType: 'DairyRevenueEvent', action: 'UPDATE', entityRef: rev.event_uuid, clientTs: staleTs, payload: { amount: 9999 },
    }] });
    expect(res[0].status).toBe('CONFLICT');
    await rev.reload();
    expect(Number(rev.amount)).toBe(1000); // server value stands
  });
});

describe('4. AI-0a invariants', () => {
  test('domain_events outbox: emit works, update/delete blocked (append-only)', async () => {
    const ev = await emitDomainEvent({ eventType: 'test.happened', aggregateType: 'DairyAnimal', aggregateId: 'A-1', payload: { ok: true } });
    // publish stamp is allowed
    await expect(ev.update({ published_at: new Date() })).resolves.toBeDefined();
    // any other mutation is blocked
    await expect(ev.update({ event_type: 'tampered' })).rejects.toThrow(/append-only/);
    await expect(ev.destroy()).rejects.toThrow(/append-only/);
  });

  test('domain_events: static bulk update/delete cannot bypass the guard', async () => {
    const ev = await emitDomainEvent({ eventType: 'bulk.test', aggregateType: 'DairyAnimal', aggregateId: 'A-2', payload: {} });
    // Static Model.update()/destroy() skip instance hooks — must be blocked by the bulk hooks.
    await expect(db.DomainEvent.update({ event_type: 'tampered' }, { where: { event_uuid: ev.event_uuid } }))
      .rejects.toThrow(/append-only/);
    await expect(db.DomainEvent.destroy({ where: { event_uuid: ev.event_uuid } }))
      .rejects.toThrow(/append-only/);
    // The one legitimate bulk write — stamping published_at — is still allowed.
    const [count] = await db.DomainEvent.update({ published_at: new Date() }, { where: { event_uuid: ev.event_uuid } });
    expect(count).toBe(1);
    // The row survived, untampered.
    const still = await db.DomainEvent.findOne({ where: { event_uuid: ev.event_uuid } });
    expect(still.event_type).toBe('bulk.test');
  });

  test('consent taxonomy carries model_improvement as its own purpose', async () => {
    const u = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile: '9111100003', first_name: 'Consent' });
    const c = await db.ConsentRecord.create({
      consent_uuid: uuid(), farmer_id: u.id, consent_type: CONSENT_PURPOSES.MODEL_IMPROVEMENT,
      consent_version: 'v1', accepted: true, accepted_at: new Date(),
    });
    expect(c.consent_type).toBe('model_improvement');
  });
});
