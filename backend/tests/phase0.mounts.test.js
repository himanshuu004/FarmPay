/**
 * Route-mount smoke — guards the gap the runtime smoke found: Phase-0 modules
 * (farmer, livestock, location, pop, compliance) existed but were never mounted,
 * and the livestock module had a broken extraction path (4-level ../../../../).
 * These asserts fail loudly if a module silently un-mounts again.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const config = require('../src/config');
const db = require('../src/shared/models');
const app = require('../src/app');

const uuid = () => crypto.randomUUID();
let token;

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
  const u = await db.User.create({ user_id: 'U-MNT-' + uuid().slice(0, 6), mobile: '9000013000', first_name: 'Mount' });
  await db.FarmerProfile.create({ farmer_id: u.id, profile_uuid: uuid() });
  token = jwt.sign({ id: u.user_id, role: 'FARMER' }, config.jwt.accessSecret, { issuer: config.jwt.issuer, algorithm: 'HS256', expiresIn: '10m' });
});
afterAll(async () => { await db.sequelize.close(); });

const H = () => ({ Authorization: `Bearer ${token}` });

// Each module must be mounted (not 404) and must not crash (not 500).
const MOUNTED = [
  ['GET', '/api/v1/farmer/profile'],
  ['GET', '/api/v1/livestock/animals'],
  ['GET', '/api/v1/location/states'],
  ['GET', '/api/v1/pop/DAIRY/template'],
  ['GET', '/api/v1/compliance/consent'],
];

test.each(MOUNTED)('%s %s is mounted and does not 500', async (method, path) => {
  const res = await request(app)[method.toLowerCase()](path).set(H());
  expect(res.status).not.toBe(404);
  expect(res.status).toBeLessThan(500);
});

test('the removed out-of-scope loan endpoint is gone (404)', async () => {
  const res = await request(app).get('/api/v1/compliance/fee-disclosure/1').set(H());
  expect(res.status).toBe(404);
});
