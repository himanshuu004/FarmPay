/**
 * Phase-1 authorization tests — the two wedge auth gaps found in audit.
 *   1. Membership link binds to ownership proof (mobile match), refuses takeover.
 *   2. Order submit/receipt is guarded to the caller's own orders (no cross-member).
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const config = require('../src/config');
const db = require('../src/shared/models');
const app = require('../src/app');
const policySvc = require('../src/modules/coop/services/coopPolicyService');

const uuid = () => crypto.randomUUID();
const tokenFor = (userIdStr) => jwt.sign({ id: userIdStr, role: 'FARMER' }, config.jwt.accessSecret, { issuer: config.jwt.issuer, algorithm: 'HS256', expiresIn: '10m' });
const auth = (t) => ({ Authorization: `Bearer ${t}` });

let userA, userB, tokenA, tokenB;

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
  await policySvc.ensureDefaultPolicy();

  userA = await db.User.create({ user_id: 'U-A-' + uuid().slice(0, 6), mobile: '+919000012345', first_name: 'Asha' });
  await db.FarmerProfile.create({ farmer_id: userA.id, profile_uuid: uuid() });
  tokenA = tokenFor(userA.user_id);

  userB = await db.User.create({ user_id: 'U-B-' + uuid().slice(0, 6), mobile: '+919000055555', first_name: 'Bhola' });
  await db.FarmerProfile.create({ farmer_id: userB.id, profile_uuid: uuid() });
  tokenB = tokenFor(userB.user_id);

  // ERP_ONLY memberships (unlinked), with registered mobiles from the "ERP master".
  await db.CoopMembership.create({ membership_uuid: uuid(), farmer_ref: 'F-A', society_ref: 'SOC-A', mobile: '9000012345', link_status: 'ERP_ONLY' }); // matches userA
  await db.CoopMembership.create({ membership_uuid: uuid(), farmer_ref: 'F-C', society_ref: 'SOC-A', mobile: '9000099999', link_status: 'ERP_ONLY' }); // matches nobody here
  // B is already a linked member of F-B.
  await db.CoopMembership.create({ membership_uuid: uuid(), farmer_ref: 'F-B', society_ref: 'SOC-A', mobile: '9000055555', user_id: userB.id, link_status: 'LINKED' });
});
afterAll(async () => { await db.sequelize.close(); });

describe('1. Membership link ownership proof', () => {
  test('matching mobile links successfully', async () => {
    const res = await request(app).post('/api/v1/coop/membership/link').set(auth(tokenA)).send({ farmerRef: 'F-A' });
    expect(res.status).toBe(200);
    const m = await db.CoopMembership.findOne({ where: { farmer_ref: 'F-A' } });
    expect(m.user_id).toBe(userA.id);
    expect(m.link_status).toBe('LINKED');
  });

  test('mismatched mobile is refused (403), no link made', async () => {
    const res = await request(app).post('/api/v1/coop/membership/link').set(auth(tokenA)).send({ farmerRef: 'F-C' });
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('COOP_LINK_MOBILE_MISMATCH');
    const m = await db.CoopMembership.findOne({ where: { farmer_ref: 'F-C' } });
    expect(m.user_id).toBeNull();
  });

  test('cannot take over a membership already linked to another user (409)', async () => {
    // userA tries to claim F-B (owned by userB) — refused before any mobile check.
    const res = await request(app).post('/api/v1/coop/membership/link').set(auth(tokenA)).send({ farmerRef: 'F-B' });
    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('COOP_MEMBERSHIP_TAKEN');
    const m = await db.CoopMembership.findOne({ where: { farmer_ref: 'F-B' } });
    expect(m.user_id).toBe(userB.id); // unchanged
  });
});

describe('2. Order ownership guard', () => {
  test('a member cannot submit another member’s order', async () => {
    // A owns a DRAFT order (F-A is now linked to userA from test 1).
    const order = await db.CoopInputOrder.create({ order_uuid: uuid(), farmer_ref: 'F-A', society_ref: 'SOC-A', total_amount: 500, status: 'DRAFT' });
    // B (a different linked member) tries to submit it.
    const res = await request(app).post(`/api/v1/coop/orders/${order.order_uuid}/submit`).set(auth(tokenB));
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('COOP_ORDER_FORBIDDEN');
    const after = await db.CoopInputOrder.findOne({ where: { order_uuid: order.order_uuid } });
    expect(after.status).toBe('DRAFT'); // untouched
  });

  test('a member cannot confirm receipt of another member’s order', async () => {
    const order = await db.CoopInputOrder.create({ order_uuid: uuid(), farmer_ref: 'F-A', society_ref: 'SOC-A', total_amount: 500, status: 'DISPATCHED' });
    const res = await request(app).post(`/api/v1/coop/orders/${order.order_uuid}/receipt`).set(auth(tokenB));
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('COOP_ORDER_FORBIDDEN');
  });
});
