/**
 * Auth surface HTTP smoke — regression guard for gaps the runtime smoke found
 * that unit tests missed (they sign JWTs directly, bypassing /auth entirely):
 *   1. the auth router is actually MOUNTED (was 404)
 *   2. register works end-to-end (bcryptjs present; otp_code column fits the
 *      SHA-256 hash — was varchar(6))
 *   3. validation + the token-issuing surface respond
 */
const request = require('supertest');
const db = require('../src/shared/models');
const app = require('../src/app');

beforeAll(async () => { await db.sequelize.sync({ force: true }); });
afterAll(async () => { await db.sequelize.close(); });

test('the auth router is mounted (register is reachable, not 404)', async () => {
  const res = await request(app).post('/api/v1/auth/register').send({ mobile: '9000012399', firstName: 'Neo' });
  expect(res.status).not.toBe(404);
  expect([200, 201]).toContain(res.status);
  expect(res.body.success).toBe(true);
  // The hashed OTP (SHA-256, 64 chars) persisted — the column is wide enough.
  const otp = await db.OtpRequest.findOne({ where: { mobile: '+919000012399' } });
  expect(otp).not.toBeNull();
  expect(otp.otp_code.length).toBe(64);
});

test('send-otp validates its purpose and issues on a valid request', async () => {
  const missing = await request(app).post('/api/v1/auth/send-otp').send({ mobile: '9000012399' });
  expect(missing.status).toBe(400);
  const ok = await request(app).post('/api/v1/auth/send-otp').send({ mobile: '9000012399', purpose: 'login' });
  expect(ok.status).toBe(200);
  expect(ok.body.data.otpRequestId).toBeTruthy();
});
