/**
 * CIA Tier-2 (Fix 7) — the CIA grievance module (PRD Part 14B).
 *   1. raise      : OPEN grievance with a config-driven SLA clock + cia.grievance.raised
 *   2. scoped list  : a farmer sees only their own grievances
 *   3. ageing        : an SLA-breached grievance escalates up the owner ladder
 *   4+5. transition   : never RESOLVED without a note; a note resolves + records it
 *   6. illegal jump   : OPEN -> RESOLVED directly is refused (409)
 */
process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || 'mock';
const crypto = require('crypto');
const db = require('../src/shared/models');
const svc = require('../src/modules/cattle_induction/services/ciaGrievanceService');

const uuid = () => crypto.randomUUID();
const farmerReq = (claim, body = {}) => ({ user: { id: claim, role: 'FARMER' }, params: {}, body, query: {} });
const staffReq = (claim, grievanceUuid, body = {}) => ({ user: { id: claim, role: 'UCDF_PM' }, params: { grievanceUuid }, body, query: {} });
const FAR_FUTURE = new Date('2027-01-01T00:00:00Z'); // well past any filed_at + SLA

let F1; let F2; let F3; let F4; let staffClaim;

const mkFarmer = async (farmerRef, mobile) => {
  const u = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile, first_name: farmerRef, is_active: true });
  await db.CoopMembership.create({ membership_uuid: uuid(), farmer_ref: farmerRef, society_ref: 'SOC-RANCHI-014', link_status: 'LINKED', user_id: u.id, joined_on: '2021-06-12' });
  return u.user_id;
};

beforeAll(async () => {
  await db.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await db.sequelize.sync({ force: true });
  F1 = await mkFarmer('F1001', '9000000001');
  F2 = await mkFarmer('F1002', '9000000002');
  F3 = await mkFarmer('F1003', '9000000003');
  F4 = await mkFarmer('F1004', '9000000004');
  staffClaim = (await db.User.create({ user_id: 'U-PM-' + uuid().slice(0, 6), mobile: '9000000099', first_name: 'PM', is_active: true })).user_id;
});
afterAll(async () => { await db.sequelize.close(); });

describe('1. raise', () => {
  test('creates an OPEN grievance with an SLA clock + cia.grievance.raised event', async () => {
    const res = await svc.raise(farmerReq(F1, { category: 'subsidy_delay', description: 'Subsidy not received' }));
    expect(res.status).toBe('OPEN');
    expect(res.grievanceUuid).toBeTruthy();
    const row = await db.CiaGrievance.findOne({ where: { grievance_uuid: res.grievanceUuid } });
    expect(row.sla_days).toBeGreaterThan(0);
    expect(row.sla_due_at).toBeTruthy();
    expect(row.farmer_ref).toBe('F1001');
    expect(await db.DomainEvent.findOne({ where: { event_type: 'cia.grievance.raised', aggregate_id: res.grievanceUuid } })).toBeTruthy();
  });

  test('an unknown category is rejected', async () => {
    await expect(svc.raise(farmerReq(F1, { category: 'nonsense' })))
      .rejects.toMatchObject({ errorCode: 'CIA_GRIEVANCE_BAD_CATEGORY', statusCode: 400 });
  });
});

describe('2. scoped list', () => {
  test('a farmer sees only their own grievances', async () => {
    await svc.raise(farmerReq(F2, { category: 'bank_delay' }));
    const mine = await svc.listForFarmer(farmerReq(F2));
    expect(mine.length).toBe(1);
    expect(mine[0].category).toBe('bank_delay');
  });
});

describe('3. ageing escalates a breach', () => {
  test('a grievance past its SLA escalates up the ladder with an event', async () => {
    const g = await svc.raise(farmerReq(F3, { category: 'cattle_rejected' })); // 3-day SLA
    const res = await svc.ageAndEscalate(FAR_FUTURE);
    expect(res.escalated).toBeGreaterThanOrEqual(1);
    const row = await db.CiaGrievance.findOne({ where: { grievance_uuid: g.grievanceUuid } });
    expect(row.status).toBe('ESCALATED');
    expect(row.escalation_level).toBe(1);
    expect(row.current_owner_role).toBeTruthy();
    expect(await db.DomainEvent.findOne({ where: { event_type: 'cia.grievance.escalated', aggregate_id: g.grievanceUuid } })).toBeTruthy();
  });
});

describe('4 + 5. transition', () => {
  test('never RESOLVED without a note; a note resolves and records it', async () => {
    const g = await svc.raise(farmerReq(F4, { category: 'seller_payment_delay' }));
    await svc.transition(staffReq(staffClaim, g.grievanceUuid, { toStatus: 'ACKNOWLEDGED' }));
    await svc.transition(staffReq(staffClaim, g.grievanceUuid, { toStatus: 'IN_PROGRESS' }));
    await expect(svc.transition(staffReq(staffClaim, g.grievanceUuid, { toStatus: 'RESOLVED' })))
      .rejects.toMatchObject({ errorCode: 'CIA_RESOLUTION_NOTE_REQUIRED', statusCode: 400 });
    const done = await svc.transition(staffReq(staffClaim, g.grievanceUuid, { toStatus: 'RESOLVED', note: 'Seller paid; confirmed with bank' }));
    expect(done.status).toBe('RESOLVED');
    const row = await db.CiaGrievance.findOne({ where: { grievance_uuid: g.grievanceUuid } });
    expect(row.resolved_at).toBeTruthy();
    expect(row.resolution_note).toMatch(/Seller paid/);
    expect(await db.DomainEvent.findOne({ where: { event_type: 'cia.grievance.resolved', aggregate_id: g.grievanceUuid } })).toBeTruthy();
  });
});

describe('6. illegal transition', () => {
  test('OPEN -> RESOLVED directly is refused (409)', async () => {
    const g = await svc.raise(farmerReq(F4, { category: 'other' }));
    await expect(svc.transition(staffReq(staffClaim, g.grievanceUuid, { toStatus: 'RESOLVED', note: 'x' })))
      .rejects.toMatchObject({ errorCode: 'CIA_GRIEVANCE_ILLEGAL', statusCode: 409 });
  });
});
