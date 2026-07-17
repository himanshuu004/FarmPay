/**
 * CIA Tier-2 (Fix 6) — the outbox relay + farmer notification dispatcher (PRD Part 11).
 * Closes the "nothing is ever dispatched" gap: CIA domain_events now become in-app
 * notifications and the outbox rows get stamped.
 *   1. a mapped event -> in-app NotificationV2 for the farmer; event stamped; idempotent
 *   2. recipient resolved via farmer_ref when the event has no farmer_id (staff-authored)
 *   3. an unmapped cia event is stamped but not notified; a non-cia event is left untouched
 */
// Keep the relay hermetic — no real RabbitMQ connection attempt in tests.
jest.mock('../src/config/rabbitmq', () => ({ getChannel: async () => null, closeRabbitMQ: async () => {} }));

process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || 'mock';
const crypto = require('crypto');
const db = require('../src/shared/models');
const { emitDomainEvent } = require('../src/shared/services/domainEvents');
const { runOutboxRelayJob } = require('../src/jobs/outboxRelayJob');

const uuid = () => crypto.randomUUID();
let farmer1; let farmer2; let app2Uuid;

const mkFarmer = async (farmerRef, mobile) => {
  const u = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile, first_name: farmerRef, is_active: true });
  await db.CoopMembership.create({ membership_uuid: uuid(), farmer_ref: farmerRef, society_ref: 'SOC-RANCHI-014', link_status: 'LINKED', user_id: u.id, joined_on: '2021-06-12' });
  return u;
};

beforeAll(async () => {
  await db.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await db.sequelize.sync({ force: true });
  farmer1 = await mkFarmer('F1001', '9000000001');
  farmer2 = await mkFarmer('F1002', '9000000002');
  const app2 = await db.CiaApplication.create({ application_uuid: uuid(), farmer_ref: 'F1002', dcs_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI', scheme_version: 'CIA_UK_2026_v1', status: 'LOAN_DISBURSED', eoi_at: new Date() });
  app2Uuid = app2.application_uuid;
});
afterAll(async () => { await db.sequelize.close(); });

describe('1. relay dispatches farmer notifications and stamps the outbox', () => {
  test('a mapped event (with farmer_id) creates an in-app notification and stamps the event', async () => {
    const ev = await emitDomainEvent({ eventType: 'cia.loan.disbursed', aggregateType: 'CiaApplication', aggregateId: uuid(), farmerId: farmer1.id, payload: { amount: 120000 } });
    const res = await runOutboxRelayJob();
    expect(res.relayed).toBeGreaterThanOrEqual(1);
    expect(res.dispatched).toBeGreaterThanOrEqual(1);
    expect((await db.DomainEvent.findByPk(ev.id)).published_at).toBeTruthy();
    const notif = await db.NotificationV2.findOne({ where: { recipient_user_id: farmer1.id } });
    expect(notif).toBeTruthy();
    expect(notif.delivery_status).toBe('sent');
    expect((await db.NotificationTemplate.findByPk(notif.template_id)).template_code).toBe('CIA_LOAN_DISBURSED');
  });

  test('idempotent: a second run finds nothing unpublished and creates no new notifications', async () => {
    const before = await db.NotificationV2.count();
    const res = await runOutboxRelayJob();
    expect(res.relayed).toBe(0);
    expect(await db.NotificationV2.count()).toBe(before);
  });
});

describe('2. recipient resolution via farmer_ref', () => {
  test('a staff-authored event (farmer_id null) resolves the farmer via the application membership', async () => {
    await emitDomainEvent({ eventType: 'cia.subsidy.transferred', aggregateType: 'CiaApplication', aggregateId: app2Uuid, farmerId: null, payload: { amount: 30000 } });
    await runOutboxRelayJob();
    const notif = await db.NotificationV2.findOne({ where: { recipient_user_id: farmer2.id } });
    expect(notif).toBeTruthy();
    expect((await db.NotificationTemplate.findByPk(notif.template_id)).template_code).toBe('CIA_SUBSIDY_TRANSFERRED');
  });
});

describe('3. unmapped + non-cia events', () => {
  test('an unmapped cia event is stamped but not notified; a non-cia event is left untouched', async () => {
    const unmapped = await emitDomainEvent({ eventType: 'cia.document.uploaded', aggregateType: 'CiaApplication', aggregateId: uuid(), farmerId: farmer1.id, payload: {} });
    const nonCia = await emitDomainEvent({ eventType: 'kavach.policy.issued', aggregateType: 'InsurancePolicy', aggregateId: uuid(), farmerId: farmer1.id, payload: {} });
    const before = await db.NotificationV2.count();
    await runOutboxRelayJob();
    expect(await db.NotificationV2.count()).toBe(before);                              // unmapped → no notification
    expect((await db.DomainEvent.findByPk(unmapped.id)).published_at).toBeTruthy();    // but still stamped
    expect((await db.DomainEvent.findByPk(nonCia.id)).published_at).toBeNull();        // non-cia untouched (CIA-scoped relay)
  });
});
