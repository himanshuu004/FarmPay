/**
 * CIA-3 — Slice R: payment gate + seller-payment recommendation (Convention 31).
 *   1. open → recommend : RECOMMEND_ONLY, no money moved; SELLER_PAYMENT_PENDING
 *   2. closed → held    : missing input / blocking flag → held, no transition
 *   3. confirm            : rail payout → SELLER_PAID → app EMI_ACTIVE
 *   4. SoD                 : confirmer must differ from recommender
 */
process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || 'mock';
process.env.PAYMENT_RAILS_MODE = 'mock';
const crypto = require('crypto');
const db = require('../src/shared/models');
const gate = require('../src/modules/cattle_induction/services/paymentGateService');
const { APP, PURCHASE } = require('../src/modules/cattle_induction/constants/ciaStatus');

const uuid = () => crypto.randomUUID();
let makerClaim; let checkerClaim; let tag = 100000000000;
const makerReq = (u) => ({ user: { id: makerClaim, role: 'BANK_MAKER' }, params: { appUuid: u }, body: {}, query: {} });
const checkerReq = (u) => ({ user: { id: checkerClaim, role: 'BANK_CHECKER' }, params: { appUuid: u }, body: {}, query: {} });

/** Build a fully-gated purchase at INSURANCE_PENDING; opts can break one input. */
const mkGated = async (farmerRef, opts = {}) => {
  await db.CoopMembership.findOrCreate({ where: { farmer_ref: farmerRef }, defaults: { membership_uuid: uuid(), farmer_ref: farmerRef, society_ref: 'SOC-RANCHI-014', link_status: 'ERP_ONLY', joined_on: '2021-06-12' } });
  const app = await db.CiaApplication.create({ application_uuid: uuid(), farmer_ref: farmerRef, dcs_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI', scheme_version: 'CIA_UK_2026_v1', status: APP.PURCHASE_INITIATED, eoi_at: new Date() });
  const animal = await db.CiaAnimal.create({ animal_uuid: uuid(), ear_tag_no: String(tag += 1), ear_tag_photo_ref: 's3://tag', species: 'CATTLE', breed: 'HF', sex: 'FEMALE', approved_purchase_price: 60000 });
  const seller = await db.CiaSeller.create({ seller_uuid: uuid(), name: 'Balbir', id_proof_ref: 's3://id', bank_account: 'SBIN-9999', account_verified: opts.sellerVerified !== false, photo_ref: 's3://ph', relationship_to_buyer: 'unrelated' });
  const purchase = await db.CiaPurchase.create({
    purchase_uuid: uuid(), application_id: app.id, animal_id: animal.id, seller_id: seller.id,
    status: PURCHASE.INSURANCE_PENDING,
    vet_certified: true, transit_insured: true, cattle_insured: opts.cattleInsured !== false, farmer_acknowledged: true,
    purchase_lat: 30.31, purchase_lng: 78.03, exception_flags: opts.flags || null, initiated_at: new Date(),
  });
  await db.CiaTransport.create({ purchase_id: purchase.id, vehicle_reg_no: 'UK07AB1234', driver_name: 'R' });
  await db.CiaInsuranceLink.create({ link_uuid: uuid(), application_id: app.id, purchase_id: purchase.id, policy_type: 'TRANSIT', policy_no: 'TRN-1', effective_date: '2026-11-15' });
  await db.CiaInsuranceLink.create({ link_uuid: uuid(), application_id: app.id, purchase_id: purchase.id, policy_type: 'CATTLE', policy_no: 'CTL-1', effective_date: '2026-11-15', assigned_to_bank: true });
  return { appUuid: app.application_uuid, appId: app.id, purchaseId: purchase.id };
};

beforeAll(async () => {
  await db.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await db.sequelize.sync({ force: true });
  const m = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile: '9111100001', first_name: 'Maker' });
  const c = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile: '9111100002', first_name: 'Checker' });
  makerClaim = m.user_id; checkerClaim = c.user_id;
});
afterAll(async () => { delete process.env.PAYMENT_RAILS_MODE; await db.sequelize.close(); });

describe('1. gate open → recommend only', () => {
  test('recommends a payout without moving money → SELLER_PAYMENT_PENDING', async () => {
    const p = await mkGated('F1001');
    const res = await gate.recommendSellerPayment(makerReq(p.appUuid));
    expect(res.gateOpen).toBe(true);
    expect(res.action).toBe('RECOMMEND_ONLY');
    expect(res.purchaseStatus).toBe(PURCHASE.SELLER_PAYMENT_PENDING);

    const payout = await db.CiaSellerPayout.findOne({ where: { purchase_id: p.purchaseId } });
    expect(payout.status).toBe('RECOMMENDED');   // NOT paid — no execution
    expect(payout.paid_at).toBeFalsy();
    const ev = await db.DomainEvent.findOne({ where: { event_type: 'cia.payment.recommended', aggregate_id: p.appUuid } });
    expect(ev).toBeTruthy();
  });
});

describe('2. gate closed → held (never silent)', () => {
  test('a missing input holds payment with reasons, no transition', async () => {
    const p = await mkGated('F1002', { cattleInsured: false });
    const res = await gate.recommendSellerPayment(makerReq(p.appUuid));
    expect(res.gateOpen).toBe(false);
    expect(res.reasons).toContain('cattle_insured');
    expect(res.held).toBe(true);
    const purchase = await db.CiaPurchase.findByPk(p.purchaseId);
    expect(purchase.status).toBe(PURCHASE.INSURANCE_PENDING);   // untouched
    const ev = await db.DomainEvent.findOne({ where: { event_type: 'cia.payment.gate_held', aggregate_id: p.appUuid } });
    expect(ev).toBeTruthy();
  });

  test('a blocking exception flag (payee mismatch) holds payment', async () => {
    const p = await mkGated('F1003', { flags: ['PAYEE_NAME_MISMATCH'] });
    const res = await gate.recommendSellerPayment(makerReq(p.appUuid));
    expect(res.gateOpen).toBe(false);
    expect(res.reasons).toContain('unresolved_exceptions');
  });
});

describe('3 + 4. confirm → paid (SoD)', () => {
  test('confirm executes the payout → SELLER_PAID → app EMI_ACTIVE; recommender cannot confirm', async () => {
    const p = await mkGated('F1004');
    await gate.recommendSellerPayment(makerReq(p.appUuid));

    // SoD: the maker who recommended cannot confirm.
    await expect(gate.confirmSellerPaid(makerReq(p.appUuid)))
      .rejects.toMatchObject({ errorCode: 'CIA_SOD_VIOLATION', statusCode: 403 });

    const res = await gate.confirmSellerPaid(checkerReq(p.appUuid));
    expect(res.purchaseStatus).toBe(PURCHASE.SELLER_PAID);
    expect(res.applicationStatus).toBe(APP.EMI_ACTIVE);
    expect(res.payoutRef).toMatch(/^PO-/);

    const payout = await db.CiaSellerPayout.findOne({ where: { purchase_id: p.purchaseId } });
    expect(payout.status).toBe('PAID');
    const app = await db.CiaApplication.findByPk(p.appId);
    expect(app.status).toBe(APP.EMI_ACTIVE);
  });
});
