/**
 * Tier-0 security — Aadhaar step-up guard on CIA money-movement endpoints.
 * The guard (requireAadhaarAuth) exists but was wired to zero routes; these tests
 * pin it onto the money surface end-to-end through the real Express middleware.
 *   1. EMI-consent (farmer) 403s AADHAAR_STEPUP_REQUIRED without the step-up token,
 *      and writes nothing; the full OTP flow (send -> verify) then unlocks it.
 *   2. The guard fires before the bank payment-gate logic (seller-payment confirm).
 */
process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || 'mock';
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const config = require('../src/config');
const db = require('../src/shared/models');
const app = require('../src/app');
const { APP } = require('../src/modules/cattle_induction/constants/ciaStatus');

const uuid = () => crypto.randomUUID();
const tokenFor = (id, role) => jwt.sign({ id, role }, config.jwt.accessSecret, { issuer: config.jwt.issuer, algorithm: 'HS256', expiresIn: '10m' });
const auth = (t) => ({ Authorization: `Bearer ${t}` });

let farmer; let bankUser; let appUuid; let farmerToken; let bankToken;
const consentUrl = () => `/api/v1/cattle-induction/applications/${appUuid}/emi/consent`;

beforeAll(async () => {
  await db.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await db.sequelize.sync({ force: true });
  farmer = await db.User.create({ user_id: 'U-SF-' + uuid().slice(0, 8), mobile: '9000000101', first_name: 'F1001', is_active: true });
  await db.CoopMembership.create({ membership_uuid: uuid(), farmer_ref: 'F1001', society_ref: 'SOC-RANCHI-014', link_status: 'LINKED', user_id: farmer.id, joined_on: '2021-06-12' });
  const a = await db.CiaApplication.create({
    application_uuid: uuid(), farmer_ref: 'F1001', dcs_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI',
    scheme_version: 'CIA_UK_2026_v1', status: APP.CATTLE_PURCHASE_PENDING, loan_account: 'SBIN-7781', milk_account_ref: 'F1001', eoi_at: new Date(),
  });
  appUuid = a.application_uuid;
  bankUser = await db.User.create({ user_id: 'U-SB-' + uuid().slice(0, 8), mobile: '9000000102', first_name: 'BankChecker', is_active: true });
  farmerToken = tokenFor(farmer.user_id, 'FARMER');
  bankToken = tokenFor(bankUser.user_id, 'BANK_CHECKER');
});
afterAll(async () => { await db.sequelize.close(); });

describe('1. farmer money endpoint is gated by Aadhaar step-up', () => {
  test('EMI consent 403s AADHAAR_STEPUP_REQUIRED without the step-up token, and writes nothing', async () => {
    const res = await request(app).post(consentUrl()).set(auth(farmerToken)).send({ authorisationRef: 'DEED-1' });
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('AADHAAR_STEPUP_REQUIRED');
    // The guard blocked before the controller — no consent instrument was created.
    expect(await db.CiaEmiConsent.count()).toBe(0);
  });

  test('the OTP step-up flow (send -> verify) unlocks the same endpoint', async () => {
    const send = await request(app).post('/api/v1/auth/aadhaar/send-otp').set(auth(farmerToken)).send({ aadhaar: '234567890123' });
    expect(send.status).toBe(200);
    const otpRequestId = send.body.data.otpRequestId;
    const otpCode = send.body.data.demoOtp || '123456';
    expect(otpRequestId).toBeTruthy();

    const verify = await request(app).post('/api/v1/auth/aadhaar/verify-otp').set(auth(farmerToken)).send({ otpRequestId, otpCode });
    expect(verify.status).toBe(200);
    const stepUpToken = verify.body.data.stepUpToken;
    expect(stepUpToken).toBeTruthy();

    const ok = await request(app).post(consentUrl()).set(auth(farmerToken)).set('x-aadhaar-token', stepUpToken).send({ authorisationRef: 'DEED-1' });
    expect(ok.status).toBe(200);
    expect(await db.CiaEmiConsent.count({ where: { status: 'ACTIVE' } })).toBe(1);
  });
});

describe('2. the guard fires before the bank payment-gate logic', () => {
  test('seller-payment confirm 403s AADHAAR_STEPUP_REQUIRED without step-up (BANK_CHECKER, valid role)', async () => {
    const res = await request(app).post(`/api/v1/cattle-induction/bank/seller-payment/${appUuid}/confirm`).set(auth(bankToken)).send({});
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('AADHAAR_STEPUP_REQUIRED');
  });
});
