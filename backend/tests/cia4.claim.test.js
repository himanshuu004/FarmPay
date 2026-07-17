/**
 * CIA-4 — Slice U: claims (death/loss) via deep reuse of the platform CLAIMS engine.
 *   1. retrofit   : issueCattle creates a real KAVACH InsurancePolicy + PolicyAsset
 *   2. report      : reportDeath intimates a claim; status shows the 4-doc checklist
 *   3. waiting      : a claim inside the 21-day waiting period is refused (engine rule)
 *   4. loan-adjust   : a SETTLED claim → cia.claim.loan_adjusted (idempotent)
 */
process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || 'mock';
const crypto = require('crypto');
const db = require('../src/shared/models');
const schemeConfig = require('../src/modules/cattle_induction/services/schemeConfigService');
const insurance = require('../src/modules/cattle_induction/services/insuranceService');
const claims = require('../src/modules/cattle_induction/services/claimIntegrationService');
const emi = require('../src/modules/cattle_induction/services/emiService');
const { PURCHASE } = require('../src/modules/cattle_induction/constants/ciaStatus');

const uuid = () => crypto.randomUUID();
let tag = 100000000000;
const farmerReqFor = (claim, appUuid, body = {}) => ({ user: { id: claim, role: 'FARMER' }, params: { appUuid }, body, query: {} });
const financeReq = (appUuid) => ({ user: { id: 'fin', role: 'UCDF_FINANCE' }, params: { appUuid }, body: {}, query: {} });

/** Farmer + delivered purchase ready for cattle insurance. */
const mkDelivered = async (farmerRef, mobile) => {
  const u = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile, first_name: farmerRef });
  await db.CoopMembership.create({ membership_uuid: uuid(), farmer_ref: farmerRef, society_ref: 'SOC-RANCHI-014', link_status: 'LINKED', user_id: u.id, joined_on: '2021-06-12' });
  const app = await db.CiaApplication.create({ application_uuid: uuid(), farmer_ref: farmerRef, dcs_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI', scheme_version: 'CIA_UK_2026_v1', status: 'PURCHASE_INITIATED', eoi_at: new Date() });
  const animal = await db.CiaAnimal.create({ animal_uuid: uuid(), ear_tag_no: String(tag += 1), ear_tag_photo_ref: 's3://t', species: 'CATTLE', breed: 'HF', sex: 'FEMALE', approved_purchase_price: 60000 });
  const seller = await db.CiaSeller.create({ seller_uuid: uuid(), name: 'Balbir', id_proof_ref: 's3://id', bank_account: 'SBIN-1', photo_ref: 's3://ph', relationship_to_buyer: 'unrelated' });
  const purchase = await db.CiaPurchase.create({ purchase_uuid: uuid(), application_id: app.id, animal_id: animal.id, seller_id: seller.id, status: PURCHASE.CATTLE_DELIVERED, transit_insured: true, farmer_acknowledged: true, delivered_at: new Date('2026-01-01'), initiated_at: new Date() });
  await db.CiaTransport.create({ purchase_id: purchase.id, vehicle_reg_no: 'UK07AB1234', driver_name: 'R' });
  await db.CiaInsuranceLink.create({ link_uuid: uuid(), application_id: app.id, purchase_id: purchase.id, policy_type: 'TRANSIT', policy_no: 'TRN-1', effective_date: '2026-01-01' });
  return { app, appUuid: app.application_uuid, claim: u.user_id };
};

beforeAll(async () => {
  await db.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await db.sequelize.sync({ force: true });
  await schemeConfig.publishConfig({ schemeVersion: 'CIA_UK_2026_v1', rulesJson: {}, docChecklist: [] }, {});
});
afterAll(async () => { await db.sequelize.close(); });

describe('1 + 2. retrofit + report (past waiting)', () => {
  let ctx;
  test('issueCattle creates a KAVACH policy + asset and links it', async () => {
    ctx = await mkDelivered('F1001', '9000000001');
    const res = await insurance.issueCattle(farmerReqFor(ctx.claim, ctx.appUuid, { effectiveDate: '2026-01-01', sumInsured: 60000 }));
    expect(res.policyUuid).toBeTruthy();
    const link = await db.CiaInsuranceLink.findOne({ where: { application_id: ctx.app.id, policy_type: 'CATTLE' } });
    expect(link.insurance_policy_uuid).toBe(res.policyUuid);
    const policy = await db.InsurancePolicy.findOne({ where: { policy_uuid: res.policyUuid } });
    expect(Number(policy.sum_insured)).toBe(60000);
    const asset = await db.PolicyAsset.findByPk(link.insurance_policy_asset_id);
    expect(asset.species).toBe('CATTLE');
  });

  test('reportDeath intimates a claim; status exposes the 4-doc checklist + penal fields', async () => {
    const res = await claims.reportDeath(farmerReqFor(ctx.claim, ctx.appUuid, { deathDate: '2026-06-01', peril: 'disease' }));
    expect(res.status).toBe('INTIMATED');
    const status = await claims.claimStatus(farmerReqFor(ctx.claim, ctx.appUuid));
    expect(status.claimUuid).toBe(res.claimUuid);
    expect(status.docChecklist.missing.length).toBe(4);        // 4 documents only
    expect(status.penalInterestAccrued).toBe(0);
    const ev = await db.DomainEvent.findOne({ where: { event_type: 'cia.claim.intimated', aggregate_id: ctx.appUuid } });
    expect(ev).toBeTruthy();
  });
});

describe('3. waiting period (engine rule)', () => {
  test('a claim inside the 21-day waiting period is refused', async () => {
    const ctx = await mkDelivered('F1002', '9000000002');
    // Effective today → waiting_until is ~21 days out.
    await insurance.issueCattle(farmerReqFor(ctx.claim, ctx.appUuid, { effectiveDate: new Date().toISOString().slice(0, 10), sumInsured: 60000 }));
    await expect(claims.reportDeath(farmerReqFor(ctx.claim, ctx.appUuid, { deathDate: new Date().toISOString().slice(0, 10) })))
      .rejects.toMatchObject({ errorCode: 'CLAIMS_WITHIN_WAITING' });
  });
});

describe('4. loan adjustment on settlement', () => {
  test('a settled claim adjusts the loan once (idempotent)', async () => {
    const ctx = await mkDelivered('F1003', '9000000003');
    await insurance.issueCattle(farmerReqFor(ctx.claim, ctx.appUuid, { effectiveDate: '2026-01-01', sumInsured: 60000 }));
    const rep = await claims.reportDeath(farmerReqFor(ctx.claim, ctx.appUuid, { deathDate: '2026-06-01' }));
    // Drive to SETTLED directly (the full survey→PM→docs→review flow is the claims module's own test surface).
    await db.ClaimCase.update({ status: 'SETTLED', settled_amount: 58000, penal_interest_accrued: 500 }, { where: { claim_uuid: rep.claimUuid } });

    const res = await claims.recordLoanAdjustment(financeReq(ctx.appUuid));
    expect(res.adjusted).toBe(true);
    expect(res.appliedToLoan).toBe(58500);   // 58000 + 500 penal
    const ev = await db.DomainEvent.findOne({ where: { event_type: 'cia.claim.loan_adjusted', aggregate_id: ctx.appUuid } });
    expect(ev).toBeTruthy();

    const again = await claims.recordLoanAdjustment(financeReq(ctx.appUuid));
    expect(again.alreadyAdjusted).toBe(true);   // idempotent
  });

  test('a settled claim reduces the EMI ledger and closes a fully-cleared loan', async () => {
    const ctx = await mkDelivered('F1010', '9000000010');
    await insurance.issueCattle(farmerReqFor(ctx.claim, ctx.appUuid, { effectiveDate: '2026-01-01', sumInsured: 60000 }));
    const rep = await claims.reportDeath(farmerReqFor(ctx.claim, ctx.appUuid, { deathDate: '2026-06-01' }));
    await db.ClaimCase.update({ status: 'SETTLED', settled_amount: 58000, penal_interest_accrued: 500 }, { where: { claim_uuid: rep.claimUuid } });
    // Put the loan into repayment with a small schedule (outstanding 6000).
    await ctx.app.update({ status: 'EMI_ACTIVE' });
    for (let n = 1; n <= 3; n += 1) {
      // eslint-disable-next-line no-await-in-loop
      await db.CiaEmiSchedule.create({ schedule_uuid: uuid(), application_id: ctx.app.id, installment_no: n, emi_due: 2000, due_date: '2026-08-01', status: 'SCHEDULED', file_row_hash: uuid().replace(/-/g, '') });
    }

    const res = await claims.recordLoanAdjustment(financeReq(ctx.appUuid));
    expect(res.appliedToLoan).toBe(58500);
    expect(res.appliedToLedger).toBe(6000);   // capped at what the ledger owed
    expect(res.outstandingAfter).toBe(0);
    expect(res.loanClosed).toBe(true);
    const emiV = await emi.getEmi(farmerReqFor(ctx.claim, ctx.appUuid));
    expect(emiV.outstanding).toBe(0);
    expect((await db.CiaApplication.findByPk(ctx.app.id)).status).toBe('LOAN_CLOSED');
    expect(await db.DomainEvent.findOne({ where: { event_type: 'cia.loan.closed', aggregate_id: ctx.appUuid } })).toBeTruthy();
  });

  test('a partial claim reduces outstanding and survives a later reconcile sweep', async () => {
    const ctx = await mkDelivered('F1011', '9000000011');
    await insurance.issueCattle(farmerReqFor(ctx.claim, ctx.appUuid, { effectiveDate: '2026-01-01', sumInsured: 60000 }));
    const rep = await claims.reportDeath(farmerReqFor(ctx.claim, ctx.appUuid, { deathDate: '2026-06-01' }));
    await db.ClaimCase.update({ status: 'SETTLED', settled_amount: 2000, penal_interest_accrued: 0 }, { where: { claim_uuid: rep.claimUuid } });
    await ctx.app.update({ status: 'EMI_ACTIVE' });
    for (let n = 1; n <= 3; n += 1) {
      // eslint-disable-next-line no-await-in-loop
      await db.CiaEmiSchedule.create({ schedule_uuid: uuid(), application_id: ctx.app.id, installment_no: n, emi_due: 2000, due_date: '2026-12-01', status: 'SCHEDULED', file_row_hash: uuid().replace(/-/g, '') });
    }

    const res = await claims.recordLoanAdjustment(financeReq(ctx.appUuid));
    expect(res.appliedToLedger).toBe(2000);
    expect(res.outstandingAfter).toBe(4000);
    expect(res.loanClosed).toBe(false);
    const emiV1 = await emi.getEmi(farmerReqFor(ctx.claim, ctx.appUuid));
    expect(emiV1.outstanding).toBe(4000);
    expect(emiV1.ledger[0].status).toBe('PAID'); // oldest installment cleared by the claim

    // A later reconcile sweep with no deductions must NOT wipe the claim reduction.
    await emi.reconcile({ applicationUuid: ctx.appUuid, deductions: [], asOf: new Date('2026-11-01T00:00:00Z') });
    const emiV2 = await emi.getEmi(farmerReqFor(ctx.claim, ctx.appUuid));
    expect(emiV2.outstanding).toBe(4000);
  });
});
