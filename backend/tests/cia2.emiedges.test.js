/**
 * CIA Tier-2 (Fix 8, ship-first EMI edges — the lifecycle piece shipped in Tier 1).
 *   1. deductionPriority : surfaced in getEmi; a scheme rules_json override is honored (config)
 *   2. no-dues certificate : 409 until LOAN_CLOSED, then a generated cert (owner-scoped)
 *   3. DCS milk-account re-map : re-maps for a loan in repayment (+ event); refused otherwise
 */
process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || 'mock';
const crypto = require('crypto');
const db = require('../src/shared/models');
const emi = require('../src/modules/cattle_induction/services/emiService');
const schemeConfig = require('../src/modules/cattle_induction/services/schemeConfigService');
const { emitDomainEvent } = require('../src/shared/services/domainEvents');
const { APP } = require('../src/modules/cattle_induction/constants/ciaStatus');

const uuid = () => crypto.randomUUID();
let ownerClaim; let otherClaim; let staffClaim;
const farmerReq = (claim, appUuid, body = {}) => ({ user: { id: claim, role: 'FARMER' }, params: { appUuid }, body, query: {} });
const staffReq = (claim, appUuid, body = {}) => ({ user: { id: claim, role: 'DUSS_CHECKER' }, params: { appUuid }, body, query: {} });

const mkFarmer = async (farmerRef, mobile) => {
  const u = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile, first_name: farmerRef, is_active: true });
  await db.CoopMembership.create({ membership_uuid: uuid(), farmer_ref: farmerRef, society_ref: 'SOC-RANCHI-014', link_status: 'LINKED', user_id: u.id, joined_on: '2021-06-12' });
  return u.user_id;
};
const mkApp = (farmerRef, status, schemeVersion = 'CIA_UK_2026_v1') => db.CiaApplication.create({
  application_uuid: uuid(), farmer_ref: farmerRef, dcs_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI',
  scheme_version: schemeVersion, status, loan_account: 'SBIN-' + farmerRef, milk_account_ref: farmerRef, eoi_at: new Date(),
});

beforeAll(async () => {
  await db.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await db.sequelize.sync({ force: true });
  await schemeConfig.publishConfig({ schemeVersion: 'CIA_UK_2026_v1', rulesJson: {}, docChecklist: [] }, {});
  await schemeConfig.publishConfig({ schemeVersion: 'CIA_UK_PRIO_v1', rulesJson: { emiConfig: { deductionPriority: ['feed', 'emi', 'insurance', 'other'] } }, docChecklist: [] }, {});
  ownerClaim = await mkFarmer('F1001', '9000000001');
  otherClaim = await mkFarmer('F1002', '9000000002');
  staffClaim = (await db.User.create({ user_id: 'U-DUSS-' + uuid().slice(0, 6), mobile: '9000000099', first_name: 'DUSS', is_active: true })).user_id;
});
afterAll(async () => { await db.sequelize.close(); });

describe('1. deductionPriority config surfacing', () => {
  test('getEmi returns the default order; a scheme override is honored', async () => {
    const app1 = await mkApp('F1001', APP.EMI_ACTIVE);
    const v1 = await emi.getEmi(farmerReq(ownerClaim, app1.application_uuid));
    expect(v1.deductionPriority).toEqual(['emi', 'feed', 'insurance', 'other']);

    const app2 = await mkApp('F1001', APP.EMI_ACTIVE, 'CIA_UK_PRIO_v1');
    const v2 = await emi.getEmi(farmerReq(ownerClaim, app2.application_uuid));
    expect(v2.deductionPriority).toEqual(['feed', 'emi', 'insurance', 'other']);
  });
});

describe('2. no-dues certificate', () => {
  test('unavailable until the loan is closed; a generated cert after', async () => {
    const app = await mkApp('F1001', APP.EMI_ACTIVE);
    await expect(emi.getNoDuesCertificate(farmerReq(ownerClaim, app.application_uuid)))
      .rejects.toMatchObject({ errorCode: 'CIA_LOAN_NOT_CLOSED', statusCode: 409 });

    await app.update({ status: APP.LOAN_CLOSED });
    for (let n = 1; n <= 3; n += 1) {
      // eslint-disable-next-line no-await-in-loop
      await db.CiaEmiLedger.create({ ledger_uuid: uuid(), application_id: app.id, installment_no: n, emi_due: 2000, amount_deducted: 2000, pending_amount: 0, status: 'PAID' });
    }
    await emitDomainEvent({ eventType: 'cia.loan.closed', aggregateType: 'CiaApplication', aggregateId: app.application_uuid, farmerId: null, payload: { reason: 'fully_repaid' } });

    const cert = await emi.getNoDuesCertificate(farmerReq(ownerClaim, app.application_uuid));
    expect(cert.certificateNo).toMatch(/^NDC-/);
    expect(cert.totalRepaid).toBe(6000);
    expect(cert.closedAt).toBeTruthy();
    expect(cert.statement).toBe('No dues outstanding');
  });

  test('a non-owner cannot fetch the certificate', async () => {
    const app = await mkApp('F1001', APP.LOAN_CLOSED);
    await expect(emi.getNoDuesCertificate(farmerReq(otherClaim, app.application_uuid)))
      .rejects.toMatchObject({ errorCode: 'CIA_APP_FORBIDDEN', statusCode: 403 });
  });
});

describe('3. DCS milk-account re-map', () => {
  test('re-maps the milk account for a loan in repayment (+ event)', async () => {
    const app = await mkApp('F1001', APP.EMI_ACTIVE);
    const res = await emi.remapMilkAccount(staffReq(staffClaim, app.application_uuid, { newMilkAccountRef: 'F1001-NEWSOC', newDcsRef: 'SOC-HALDWANI-002', reason: 'Farmer moved societies' }));
    expect(res.milkAccountRef).toBe('F1001-NEWSOC');
    expect(res.dcsRef).toBe('SOC-HALDWANI-002');
    const reloaded = await db.CiaApplication.findByPk(app.id);
    expect(reloaded.milk_account_ref).toBe('F1001-NEWSOC');
    expect(await db.DomainEvent.findOne({ where: { event_type: 'cia.emi.milk_account_remapped', aggregate_id: app.application_uuid } })).toBeTruthy();
  });

  test('re-map is refused when the loan is not in repayment', async () => {
    const app = await mkApp('F1001', APP.CATTLE_PURCHASE_PENDING);
    await expect(emi.remapMilkAccount(staffReq(staffClaim, app.application_uuid, { newMilkAccountRef: 'X', reason: 'y' })))
      .rejects.toMatchObject({ errorCode: 'CIA_APP_BAD_STATE', statusCode: 409 });
  });
});
