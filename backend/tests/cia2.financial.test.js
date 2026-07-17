/**
 * CIA-2 — Slice J: subsidy + disbursement records (money recorded, not moved).
 *   1. subsidy calc + transfer : split from config; LOAN_SANCTIONED → SUBSIDY_TRANSFERRED
 *   2. disbursement            : SUBSIDY_TRANSFERRED → LOAN_DISBURSED → CATTLE_PURCHASE_PENDING
 *   3. loop closed              : purchase capture is now reachable end-to-end
 *   4. status financials         : farmer sees the money breakdown + purchaseUnlocked
 */
process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || 'mock';
const crypto = require('crypto');
const db = require('../src/shared/models');
const schemeConfig = require('../src/modules/cattle_induction/services/schemeConfigService');
const financial = require('../src/modules/cattle_induction/services/financialService');
const application = require('../src/modules/cattle_induction/services/applicationService');
const purchase = require('../src/modules/cattle_induction/services/purchaseCaptureService');
const { APP, PURCHASE } = require('../src/modules/cattle_induction/constants/ciaStatus');

const uuid = () => crypto.randomUUID();
let dussClaim; let bankClaim; let farmerClaim; let appUuid;

const dussReq = (u, body) => ({ user: { id: dussClaim, role: 'DUSS_CHECKER' }, params: { appUuid: u }, body, query: {} });
const bankReq = (body) => ({ user: { id: bankClaim, role: 'BANK_MAKER' }, body, params: {}, query: {} });
const farmerReq = (u, body = {}) => ({ user: { id: farmerClaim, role: 'FARMER' }, params: { appUuid: u }, body, query: {} });

beforeAll(async () => {
  await db.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await db.sequelize.sync({ force: true });
  await schemeConfig.publishConfig({ schemeVersion: 'CIA_UK_2026_v1', rulesJson: { subsidyPct: 50, beneficiaryContributionPct: 10, maxCattle: 2 }, docChecklist: [] }, {});

  const duss = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile: '9777700001', first_name: 'Finance' });
  const bankU = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile: '9777700002', first_name: 'BankMaker' });
  const farmer = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile: '9000000001', first_name: 'Ramesh' });
  dussClaim = duss.user_id; bankClaim = bankU.user_id; farmerClaim = farmer.user_id;
  await db.CoopMembership.create({ membership_uuid: uuid(), farmer_ref: 'F1001', society_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI', link_status: 'LINKED', user_id: farmer.id, joined_on: '2021-06-12' });

  const app = await db.CiaApplication.create({
    application_uuid: uuid(), farmer_ref: 'F1001', dcs_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI',
    scheme_version: 'CIA_UK_2026_v1', status: APP.LOAN_SANCTIONED, sanctioned_amount: 62000, loan_account: 'SBIN-7781', eoi_at: new Date(),
  });
  appUuid = app.application_uuid;
});
afterAll(async () => { await db.sequelize.close(); });

describe('1. subsidy transfer', () => {
  test('computes the split from config and moves to SUBSIDY_TRANSFERRED', async () => {
    const res = await financial.recordSubsidyTransfer(dussReq(appUuid, { transferRef: 'UTR-77' }));
    expect(res.status).toBe(APP.SUBSIDY_TRANSFERRED);
    expect(res.subsidyAmount).toBe(31000);        // 50% of 62000
    expect(res.farmerContribution).toBe(6200);    // 10%
    expect(res.loanComponent).toBe(24800);        // remainder

    const app = await db.CiaApplication.findOne({ where: { application_uuid: appUuid } });
    expect(app.status).toBe(APP.SUBSIDY_TRANSFERRED);
    expect(Number(app.subsidy_amount)).toBe(31000);
    const st = await db.CiaSubsidyTransfer.findOne({ where: { application_id: app.id } });
    expect(st.transfer_ref).toBe('UTR-77');
    const ev = await db.DomainEvent.findOne({ where: { event_type: 'cia.subsidy.transferred', aggregate_id: appUuid } });
    expect(ev).toBeTruthy();
  });

  test('cannot record subsidy twice / from the wrong state', async () => {
    await expect(financial.recordSubsidyTransfer(dussReq(appUuid, { transferRef: 'UTR-78' })))
      .rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('2 + 3. disbursement closes the loop', () => {
  test('disbursement → CATTLE_PURCHASE_PENDING and then capture is reachable', async () => {
    const res = await financial.recordDisbursement(bankReq({ rows: [{ applicationUuid: appUuid, loanAccount: 'SBIN-7781', amount: 24800, ref: 'DISB-91' }] }));
    expect(res.recorded[0].status).toBe(APP.CATTLE_PURCHASE_PENDING);

    const app = await db.CiaApplication.findOne({ where: { application_uuid: appUuid } });
    expect(app.status).toBe(APP.CATTLE_PURCHASE_PENDING);
    const disb = await db.CiaDisbursement.findOne({ where: { application_id: app.id } });
    expect(Number(disb.amount)).toBe(24800);

    // The loop CIA-1 left open now closes: purchase capture works.
    const cap = await purchase.capture(farmerReq(appUuid, {
      earTagNo: '123456789012', earTagPhotoRef: 's3://tag', species: 'CATTLE', breed: 'HF', sex: 'FEMALE',
      purchaseGeo: { lat: 30.31, lng: 78.03 }, photoRefs: ['s3://p1'],
      seller: { name: 'Balbir', idProofRef: 's3://id', bankAccount: 'X-1', photoRef: 's3://ph', relationshipToBuyer: 'unrelated' },
    }));
    expect(cap.purchaseStatus).toBe(PURCHASE.PURCHASE_INITIATED);
  });
});

describe('4. status financials', () => {
  test('the farmer status carries the money breakdown', async () => {
    // Use a fresh sanctioned app to read financials mid-flow.
    const app2 = await db.CiaApplication.create({
      application_uuid: uuid(), farmer_ref: 'F1001', dcs_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI',
      scheme_version: 'CIA_UK_2026_v1', status: APP.LOAN_SANCTIONED, sanctioned_amount: 62000, eoi_at: new Date(),
    });
    await financial.recordSubsidyTransfer(dussReq(app2.application_uuid, { transferRef: 'UTR-79' }));
    const s = await application.getStatus(farmerReq(app2.application_uuid));
    expect(s.financials.subsidyAmount).toBe(31000);
    expect(s.subsidyTransfer.ref).toBe('UTR-79');
    expect(s.purchaseUnlocked).toBe(false);   // not disbursed yet
  });
});
