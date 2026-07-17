/**
 * Phase-1 HTTP smoke test — proves the wedge API end to end over real HTTP
 * (supertest), including JWT auth, the passbook, and the join-society nudge
 * for non-members.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const config = require('../src/config');
const db = require('../src/shared/models');
const app = require('../src/app');
const policySvc = require('../src/modules/coop/services/coopPolicyService');

const uuid = () => crypto.randomUUID();
const tokenFor = (userIdStr) =>
  jwt.sign({ id: userIdStr }, config.jwt.accessSecret, { issuer: config.jwt.issuer, algorithm: 'HS256', expiresIn: '10m' });

let memberToken, strangerToken;

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
  await policySvc.ensureDefaultPolicy();

  const member = await db.User.create({ user_id: 'U-MEM-' + uuid().slice(0, 6), mobile: '9333300001', first_name: 'Member' });
  await db.FarmerProfile.create({ farmer_id: member.id, profile_uuid: uuid() });
  await db.CoopMembership.create({ membership_uuid: uuid(), farmer_ref: 'F6001', society_ref: 'SOC-Y', user_id: member.id, link_status: 'LINKED' });
  await db.CoopMilkSnapshot.create({ snapshot_uuid: uuid(), farmer_ref: 'F6001', society_ref: 'SOC-Y', period: '2026-06', litres: 200, value: 7200, outstanding: 4000, as_of_date: '2026-07-04', source_mode: 'filedrop' });
  memberToken = tokenFor(member.user_id);

  const stranger = await db.User.create({ user_id: 'U-STR-' + uuid().slice(0, 6), mobile: '9333300002', first_name: 'Stranger' });
  strangerToken = tokenFor(stranger.user_id);
});
afterAll(async () => { await db.sequelize.close(); });

test('GET /api/v1/coop/passbook without a token → 401', async () => {
  const res = await request(app).get('/api/v1/coop/passbook');
  expect(res.status).toBe(401);
});

test('member passbook → 200 with outstanding + 70% limit', async () => {
  const res = await request(app).get('/api/v1/coop/passbook').set('Authorization', `Bearer ${memberToken}`);
  expect(res.status).toBe(200);
  expect(res.body.data.isMember).toBe(true);
  expect(res.body.data.outstandingPayables).toBe(4000);
  expect(res.body.data.availableOrderLimit).toBe(2800); // 0.70 × 4000
  expect(res.body.data.freshness).toBe('as of yesterday');
});

test('non-member passbook → join-society nudge (not a 403)', async () => {
  const res = await request(app).get('/api/v1/coop/passbook').set('Authorization', `Bearer ${strangerToken}`);
  expect(res.status).toBe(200);
  expect(res.body.data.isMember).toBe(false);
  expect(res.body.data.nudge.cta).toBeDefined();
});

test('health endpoint is live', async () => {
  const res = await request(app).get('/health');
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('ok');
});
