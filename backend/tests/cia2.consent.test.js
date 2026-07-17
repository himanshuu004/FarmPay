/**
 * CIA-2 — Slice N: tri-partite EMI consent instrument.
 *   1. no consent  : mode TRACK; initiate refused
 *   2. record       : consent flips mode → INITIATE; initiate works via coopbank mock
 *   3. revoke        : mode falls back to TRACK; initiate refused again
 *   4. live transport : with consent but COOPBANK_MODE=live, fails loud (never silent)
 */
process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || 'mock';
process.env.COOPBANK_MODE = 'mock';
const crypto = require('crypto');
const db = require('../src/shared/models');
const emi = require('../src/modules/cattle_induction/services/emiService');
const { APP } = require('../src/modules/cattle_induction/constants/ciaStatus');

const uuid = () => crypto.randomUUID();
let ownerClaim; let otherClaim; let appUuid; let appId;
const farmerReq = (claim, u, body = {}) => ({ user: { id: claim, role: 'FARMER' }, params: { appUuid: u }, body, query: {} });

const seedFarmer = async (farmerRef, mobile) => {
  const u = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile, first_name: farmerRef });
  await db.CoopMembership.create({ membership_uuid: uuid(), farmer_ref: farmerRef, society_ref: 'SOC-RANCHI-014', link_status: 'LINKED', user_id: u.id, joined_on: '2021-06-12' });
  return u;
};

beforeAll(async () => {
  await db.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await db.sequelize.sync({ force: true });
  const owner = await seedFarmer('F1001', '9000000001');
  const other = await seedFarmer('F1002', '9000000002');
  ownerClaim = owner.user_id; otherClaim = other.user_id;
  const app = await db.CiaApplication.create({
    application_uuid: uuid(), farmer_ref: 'F1001', dcs_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI',
    scheme_version: 'CIA_UK_2026_v1', status: APP.CATTLE_PURCHASE_PENDING, loan_account: 'SBIN-7781', milk_account_ref: 'F1001', eoi_at: new Date(),
  });
  appUuid = app.application_uuid; appId = app.id;
});
afterAll(async () => { delete process.env.COOPBANK_MODE; await db.sequelize.close(); });

const reload = () => db.CiaApplication.findByPk(appId);

describe('1. no consent → track-only', () => {
  test('mode is TRACK and initiate is refused', async () => {
    const app = await reload();
    expect(emi.getDeductionMode(app)).toBe('TRACK');
    await expect(emi.initiateDeduction(app, { installmentNo: 1, amount: 2150 }))
      .rejects.toMatchObject({ errorCode: 'CIA_CONSENT_REQUIRED', statusCode: 403 });
  });
});

describe('2. record consent → initiate works', () => {
  test('recording flips mode to INITIATE and initiate returns a bank deduction ref', async () => {
    const res = await emi.recordConsent(farmerReq(ownerClaim, appUuid, { authorisationRef: 'AUTH-DEED-001', bankRef: 'COOPBANK-RANCHI' }));
    expect(res.emiMode).toBe('INITIATE');

    const app = await reload();
    expect(emi.getDeductionMode(app)).toBe('INITIATE');
    const consent = await db.CiaEmiConsent.findOne({ where: { application_id: appId, status: 'ACTIVE' } });
    expect(consent.purpose).toBe('emi_deduction');
    const ev = await db.DomainEvent.findOne({ where: { event_type: 'cia.emi.consent_recorded', aggregate_id: appUuid } });
    expect(ev).toBeTruthy();

    const init = await emi.initiateDeduction(app, { installmentNo: 1, amount: 2150 });
    expect(init.accepted).toBe(true);
    expect(init.deductionRef).toMatch(/^DED-/);
  });

  test('another farmer cannot record consent on this application', async () => {
    await expect(emi.recordConsent(farmerReq(otherClaim, appUuid, { authorisationRef: 'X' })))
      .rejects.toMatchObject({ errorCode: 'CIA_APP_FORBIDDEN', statusCode: 403 });
  });
});

describe('4. live transport fails loud (checked before revoke)', () => {
  test('with consent but COOPBANK_MODE=live, initiate is notReady — never a silent deduction', async () => {
    process.env.COOPBANK_MODE = 'live';
    const app = await reload();
    await expect(emi.initiateDeduction(app, { installmentNo: 1, amount: 2150 }))
      .rejects.toMatchObject({ errorCode: 'COOPBANK_NOT_READY', statusCode: 503 });
    process.env.COOPBANK_MODE = 'mock';
  });
});

describe('3. revoke consent → track-only', () => {
  test('revoking falls back to TRACK and refuses initiate again', async () => {
    const res = await emi.revokeConsent(farmerReq(ownerClaim, appUuid));
    expect(res.emiMode).toBe('TRACK');
    const app = await reload();
    expect(emi.getDeductionMode(app)).toBe('TRACK');
    await expect(emi.initiateDeduction(app, { installmentNo: 1, amount: 2150 }))
      .rejects.toMatchObject({ errorCode: 'CIA_CONSENT_REQUIRED' });
    // history kept: one REVOKED row remains.
    const revoked = await db.CiaEmiConsent.count({ where: { application_id: appId, status: 'REVOKED' } });
    expect(revoked).toBe(1);
  });
});
