/**
 * CIA-3 — Slice O: vet examination / valuation / e-sign.
 *   1. approve      : sets vet_certified + PURCHASE_APPROVED + valuation
 *   2. ceiling       : price over the config ceiling is a hard stop (422)
 *   3. outlier        : below-band price flags PRICE_OUTLIER (shadow) but approves
 *   4. reject          : PURCHASE_REJECTED → app back to CATTLE_PURCHASE_PENDING
 */
process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || 'mock';
const crypto = require('crypto');
const db = require('../src/shared/models');
const schemeConfig = require('../src/modules/cattle_induction/services/schemeConfigService');
const vet = require('../src/modules/cattle_induction/services/vetService');
const { APP, PURCHASE } = require('../src/modules/cattle_induction/constants/ciaStatus');

const uuid = () => crypto.randomUUID();
let vetClaim; let counter = 0;
const vetReq = (appUuid, body) => ({ user: { id: vetClaim, role: 'VET' }, params: { appUuid }, body, query: {} });

const mkPurchase = async (farmerRef) => {
  await db.CoopMembership.findOrCreate({ where: { farmer_ref: farmerRef }, defaults: { membership_uuid: uuid(), farmer_ref: farmerRef, society_ref: 'SOC-RANCHI-014', link_status: 'ERP_ONLY', joined_on: '2021-06-12' } });
  const app = await db.CiaApplication.create({
    application_uuid: uuid(), farmer_ref: farmerRef, dcs_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI',
    scheme_version: 'CIA_UK_2026_v1', status: APP.PURCHASE_INITIATED, eoi_at: new Date(),
  });
  const animal = await db.CiaAnimal.create({ animal_uuid: uuid(), ear_tag_no: String(100000000000 + (counter += 1)), ear_tag_photo_ref: 's3://tag', species: 'CATTLE', breed: 'HF', sex: 'FEMALE' });
  const purchase = await db.CiaPurchase.create({ purchase_uuid: uuid(), application_id: app.id, animal_id: animal.id, status: PURCHASE.PURCHASE_INITIATED, initiated_at: new Date() });
  return { appUuid: app.application_uuid, appId: app.id, purchaseId: purchase.id, animalId: animal.id };
};

const APPROVE = (price) => ({
  result: 'APPROVED', estimatedMarketValue: price, approvedPurchasePrice: price, bodyConditionScore: 3.5,
  fitnessForTransport: true, esign: { vetReg: 'UK-VET-2231' },
  // PRD Part 7.3 health/valuation fields — previously validated then dropped.
  testMilking: 6.5, mastitisScreening: 'CMT_NEGATIVE', parity: 2, dentition: '4-teeth',
  vaccinationHistory: [{ vaccine: 'FMD', date: '2026-01-10' }],
});

beforeAll(async () => {
  await db.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await db.sequelize.sync({ force: true });
  await schemeConfig.publishConfig({ schemeVersion: 'CIA_UK_2026_v1', rulesJson: { priceCeiling: 70000, priceBand: [45000, 70000] }, docChecklist: [] }, {});
  const v = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile: '9999900001', first_name: 'Vet' });
  vetClaim = v.user_id;
});
afterAll(async () => { await db.sequelize.close(); });

describe('1. approve', () => {
  test('certifies the animal → PURCHASE_APPROVED, sets vet_certified + valuation + event', async () => {
    const p = await mkPurchase('F1001');
    const res = await vet.vetExam(vetReq(p.appUuid, APPROVE(60000)));
    expect(res.vetCertified).toBe(true);
    expect(res.purchaseStatus).toBe(PURCHASE.PURCHASE_APPROVED);
    expect(res.exceptionFlags).toEqual([]);

    const purchase = await db.CiaPurchase.findByPk(p.purchaseId);
    expect(purchase.vet_certified).toBe(true);
    const animal = await db.CiaAnimal.findByPk(p.animalId);
    expect(Number(animal.approved_purchase_price)).toBe(60000);
    expect(animal.fitness_for_transport).toBe(true);
    // PRD Part 7.3 fields now persist (previously silently dropped).
    expect(Number(animal.test_milking)).toBe(6.5);
    expect(animal.mastitis_screening).toBe('CMT_NEGATIVE');
    expect(animal.parity).toBe(2);
    expect(animal.dentition).toBe('4-teeth');
    expect(animal.vaccination_history).toEqual([{ vaccine: 'FMD', date: '2026-01-10' }]);
    const ev = await db.DomainEvent.findOne({ where: { event_type: 'cia.vet.certified', aggregate_id: p.appUuid } });
    expect(ev).toBeTruthy();
  });
});

describe('2. ceiling hard stop', () => {
  test('a price above the ceiling cannot be approved', async () => {
    const p = await mkPurchase('F1002');
    await expect(vet.vetExam(vetReq(p.appUuid, APPROVE(75000))))
      .rejects.toMatchObject({ errorCode: 'CIA_PRICE_OVER_CEILING', statusCode: 422 });
    const purchase = await db.CiaPurchase.findByPk(p.purchaseId);
    expect(purchase.status).toBe(PURCHASE.PURCHASE_INITIATED);   // untouched
  });
});

describe('3. shadow outlier', () => {
  test('a below-band price approves but is flagged PRICE_OUTLIER (not blocked)', async () => {
    const p = await mkPurchase('F1003');
    const res = await vet.vetExam(vetReq(p.appUuid, APPROVE(40000)));
    expect(res.purchaseStatus).toBe(PURCHASE.PURCHASE_APPROVED);
    expect(res.exceptionFlags).toContain('PRICE_OUTLIER');
    const purchase = await db.CiaPurchase.findByPk(p.purchaseId);
    expect(purchase.exception_flags).toContain('PRICE_OUTLIER');
  });
});

describe('4. reject', () => {
  test('rejection sends the purchase to PURCHASE_REJECTED and the app back to CATTLE_PURCHASE_PENDING', async () => {
    const p = await mkPurchase('F1004');
    const res = await vet.vetExam(vetReq(p.appUuid, { result: 'REJECTED', remarks: 'Lame; failed soundness' }));
    expect(res.purchaseStatus).toBe(PURCHASE.PURCHASE_REJECTED);
    expect(res.applicationStatus).toBe(APP.CATTLE_PURCHASE_PENDING);
    const app = await db.CiaApplication.findByPk(p.appId);
    expect(app.status).toBe(APP.CATTLE_PURCHASE_PENDING);
  });
});
