/**
 * CIA-3 — Slice Q: transit + cattle insurance (KAVACH).
 *   1. transit    : required before movement → TRANSIT_IN_PROGRESS
 *   2. arrival     : → CATTLE_DELIVERED, sets farmer_acknowledged
 *   3. no-backdate  : cattle effective < arrival → 422
 *   4. cattle        : effective ≥ arrival → INSURANCE_PENDING, assigned to bank; all gate inputs set
 */
process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || 'mock';
const crypto = require('crypto');
const db = require('../src/shared/models');
const ins = require('../src/modules/cattle_induction/services/insuranceService');
const { PURCHASE } = require('../src/modules/cattle_induction/constants/ciaStatus');

const uuid = () => crypto.randomUUID();
let farmerClaim; let appUuid; let purchaseId;
const req = (u, body = {}) => ({ user: { id: farmerClaim, role: 'FARMER' }, params: { appUuid: u }, body, query: {} });
const today = () => new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  await db.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await db.sequelize.sync({ force: true });
  const farmer = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile: '9000000001', first_name: 'Ramesh' });
  farmerClaim = farmer.user_id;
  await db.CoopMembership.create({ membership_uuid: uuid(), farmer_ref: 'F1001', society_ref: 'SOC-RANCHI-014', link_status: 'LINKED', user_id: farmer.id, joined_on: '2021-06-12' });
  const app = await db.CiaApplication.create({ application_uuid: uuid(), farmer_ref: 'F1001', dcs_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI', scheme_version: 'CIA_UK_2026_v1', status: 'PURCHASE_INITIATED', eoi_at: new Date() });
  appUuid = app.application_uuid;
  const animal = await db.CiaAnimal.create({ animal_uuid: uuid(), ear_tag_no: '123456789012', ear_tag_photo_ref: 's3://tag', species: 'CATTLE', breed: 'HF', sex: 'FEMALE' });
  const seller = await db.CiaSeller.create({ seller_uuid: uuid(), name: 'Balbir', id_proof_ref: 's3://id', bank_account: 'SBIN-1', account_verified: true, photo_ref: 's3://ph', relationship_to_buyer: 'unrelated' });
  const purchase = await db.CiaPurchase.create({ purchase_uuid: uuid(), application_id: app.id, animal_id: animal.id, seller_id: seller.id, status: PURCHASE.PURCHASE_APPROVED, vet_certified: true, initiated_at: new Date() });
  purchaseId = purchase.id;
  await db.CiaTransport.create({ purchase_id: purchase.id, vehicle_reg_no: 'UK07AB1234', driver_name: 'Rakesh' });
});
afterAll(async () => { await db.sequelize.close(); });

describe('transit → arrival → cattle', () => {
  test('1. transit policy issued → TRANSIT_IN_PROGRESS + transit_insured + transport policy no', async () => {
    const res = await ins.issueTransit(req(appUuid, { sumInsured: 60000 }));
    expect(res.transitInsured).toBe(true);
    expect(res.purchaseStatus).toBe(PURCHASE.TRANSIT_IN_PROGRESS);
    const transport = await db.CiaTransport.findOne({ where: { purchase_id: purchaseId } });
    expect(transport.transit_policy_no).toBe(res.transitPolicyNo);
    const link = await db.CiaInsuranceLink.findOne({ where: { purchase_id: purchaseId, policy_type: 'TRANSIT' } });
    expect(link).toBeTruthy();
  });

  test('2. arrival confirmed → CATTLE_DELIVERED + farmer_acknowledged', async () => {
    const res = await ins.confirmArrival(req(appUuid, { destinationGeo: { lat: 30.31, lng: 78.03 } }));
    expect(res.purchaseStatus).toBe(PURCHASE.CATTLE_DELIVERED);
    const purchase = await db.CiaPurchase.findByPk(purchaseId);
    expect(purchase.farmer_acknowledged).toBe(true);
    expect(purchase.delivered_at).toBeTruthy();
  });

  test('3. a backdated cattle policy is refused (effective before arrival)', async () => {
    await expect(ins.issueCattle(req(appUuid, { effectiveDate: '2020-01-01' })))
      .rejects.toMatchObject({ errorCode: 'CIA_INSURANCE_BACKDATED', statusCode: 422 });
    const purchase = await db.CiaPurchase.findByPk(purchaseId);
    expect(purchase.status).toBe(PURCHASE.CATTLE_DELIVERED); // untouched
  });

  test('4. cattle policy (effective = arrival) → INSURANCE_PENDING, assigned to bank; all gate inputs set', async () => {
    const res = await ins.issueCattle(req(appUuid, { effectiveDate: today(), sumInsured: 60000 }));
    expect(res.assignedToBank).toBe(true);
    expect(res.purchaseStatus).toBe(PURCHASE.INSURANCE_PENDING);
    const purchase = await db.CiaPurchase.findByPk(purchaseId);
    expect(purchase.cattle_insured).toBe(true);
    // The full payment-gate input set is now satisfied (→ Slice R).
    expect(purchase.vet_certified && purchase.transit_insured && purchase.cattle_insured && purchase.farmer_acknowledged).toBe(true);
    const link = await db.CiaInsuranceLink.findOne({ where: { purchase_id: purchaseId, policy_type: 'CATTLE' } });
    expect(link.assigned_to_bank).toBe(true);
  });

  test('transit cannot be issued from the wrong state', async () => {
    await expect(ins.issueTransit(req(appUuid, {})))
      .rejects.toMatchObject({ errorCode: 'CIA_PURCHASE_BAD_STATE', statusCode: 409 });
  });
});
