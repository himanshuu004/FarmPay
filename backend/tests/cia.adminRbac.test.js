/**
 * Tier-0 security — CIA admin write endpoints exclude read-only AUDITOR/GOV_VIEWER.
 * The adminRouter is gated by CIA_UCDF_ROLES (which admits AUDITOR + GOV_VIEWER for
 * the read surfaces); two mutating endpoints had no per-endpoint roleCheck. These
 * tests go through the real router + middleware, which the service-level suites
 * (cia3.exceptions, cia4.claim) structurally cannot cover.
 *   1. clear-exception (un-holds the payment gate) — AUDITOR/GOV 403, PM 200
 *   2. adjust-loan (financial event)               — AUDITOR 403, PM passes RBAC
 *   3. audit-log stays readable by AUDITOR (read-only convention preserved)
 */
process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || 'mock';
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const config = require('../src/config');
const db = require('../src/shared/models');
const app = require('../src/app');
const { PURCHASE } = require('../src/modules/cattle_induction/constants/ciaStatus');

const uuid = () => crypto.randomUUID();
const tokenFor = (id, role) => jwt.sign({ id, role }, config.jwt.accessSecret, { issuer: config.jwt.issuer, algorithm: 'HS256', expiresIn: '10m' });
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const CLEAR_BODY = { flag: 'GEOFENCE_BREACH', reason: 'reviewed: shed just outside radius, genuine' };

let appUuid; let pmToken; let auditorToken; let govToken;
const clearUrl = () => `/api/v1/admin/cattle-induction/exceptions/${appUuid}/clear`;
const adjustUrl = () => `/api/v1/admin/cattle-induction/claim/${appUuid}/adjust-loan`;

beforeAll(async () => {
  await db.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await db.sequelize.sync({ force: true });
  await db.CoopMembership.findOrCreate({ where: { farmer_ref: 'F1001' }, defaults: { membership_uuid: uuid(), farmer_ref: 'F1001', society_ref: 'SOC-RANCHI-014', link_status: 'ERP_ONLY', joined_on: '2021-06-12' } });
  const a = await db.CiaApplication.create({ application_uuid: uuid(), farmer_ref: 'F1001', dcs_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI', scheme_version: 'CIA_UK_2026_v1', status: 'PURCHASE_INITIATED', eoi_at: new Date() });
  const animal = await db.CiaAnimal.create({ animal_uuid: uuid(), ear_tag_no: '200000000001', ear_tag_photo_ref: 's3://t', species: 'CATTLE', breed: 'HF', sex: 'FEMALE' });
  await db.CiaPurchase.create({ purchase_uuid: uuid(), application_id: a.id, animal_id: animal.id, status: PURCHASE.INSURANCE_PENDING, exception_flags: ['GEOFENCE_BREACH', 'PRICE_OUTLIER'], initiated_at: new Date() });
  appUuid = a.application_uuid;
  // Only the PM needs to resolve to a real user (clearException resolves the reviewer).
  const pm = await db.User.create({ user_id: 'U-PM-' + uuid().slice(0, 6), mobile: '9000000201', first_name: 'PM', is_active: true });
  pmToken = tokenFor(pm.user_id, 'UCDF_PM');
  auditorToken = tokenFor('U-AUD', 'AUDITOR');
  govToken = tokenFor('U-GOV', 'GOV_VIEWER');
});
afterAll(async () => { await db.sequelize.close(); });

describe('1. clear-exception excludes read-only roles', () => {
  test('AUDITOR is forbidden (does not reach the handler)', async () => {
    const res = await request(app).post(clearUrl()).set(auth(auditorToken)).send(CLEAR_BODY);
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('AUTH_005'); // AUTH_INSUFFICIENT_ROLE
  });
  test('GOV_VIEWER is forbidden', async () => {
    const res = await request(app).post(clearUrl()).set(auth(govToken)).send(CLEAR_BODY);
    expect(res.status).toBe(403);
  });
  test('UCDF_PM can clear the flag (un-holds the gate)', async () => {
    const res = await request(app).post(clearUrl()).set(auth(pmToken)).send(CLEAR_BODY);
    expect(res.status).toBe(200);
    expect(res.body.data.cleared).toBe('GEOFENCE_BREACH');
  });
});

describe('2. adjust-loan excludes AUDITOR; PM passes RBAC', () => {
  test('AUDITOR is forbidden by RBAC', async () => {
    const res = await request(app).post(adjustUrl()).set(auth(auditorToken)).send({});
    expect(res.status).toBe(403);
  });
  test('UCDF_PM is not blocked by RBAC (reaches the handler)', async () => {
    const res = await request(app).post(adjustUrl()).set(auth(pmToken)).send({});
    // No settled claim is seeded, so the handler returns a domain 4xx — the point is
    // that PM is NOT stopped at the RBAC gate the way AUDITOR is.
    expect(res.status).not.toBe(403);
  });
});

describe('3. AUDITOR read-only convention preserved', () => {
  test('AUDITOR can still read the audit log', async () => {
    const res = await request(app).get('/api/v1/admin/cattle-induction/audit-log').set(auth(auditorToken));
    expect(res.status).toBe(200);
  });
});
