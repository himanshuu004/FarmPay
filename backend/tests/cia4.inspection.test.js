/**
 * CIA-4 — Slice T: post-purchase inspections (7/30/90-day + asset-existence).
 *   1. schedule    : 7/30/90 rows from delivery, idempotent
 *   2. match        : ear-tag + photo → asset_exists, no flags
 *   3. substitution  : tag mismatch → SUBSTITUTION_SUSPECTED (shadow, surfaces on panel)
 *   4. shortfall      : low yield → YIELD_SHORTFALL; job schedules delivered purchases
 */
process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || 'mock';
const crypto = require('crypto');
const db = require('../src/shared/models');
const schemeConfig = require('../src/modules/cattle_induction/services/schemeConfigService');
const insp = require('../src/modules/cattle_induction/services/inspectionService');
const { runCiaPostPurchaseInspectionJob } = require('../src/jobs/ciaPostPurchaseInspectionJob');
const { PURCHASE } = require('../src/modules/cattle_induction/constants/ciaStatus');

const uuid = () => crypto.randomUUID();
let supClaim; let tag = 100000000000;
const fieldReq = (appUuid, body) => ({ user: { id: supClaim, role: 'ROUTE_SUPERVISOR' }, params: { appUuid }, body, query: {} });

const mkDelivered = async (farmerRef, earTag) => {
  await db.CoopMembership.findOrCreate({ where: { farmer_ref: farmerRef }, defaults: { membership_uuid: uuid(), farmer_ref: farmerRef, society_ref: 'SOC-RANCHI-014', link_status: 'ERP_ONLY', joined_on: '2021-06-12' } });
  const app = await db.CiaApplication.create({ application_uuid: uuid(), farmer_ref: farmerRef, dcs_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI', scheme_version: 'CIA_UK_2026_v1', status: 'EMI_ACTIVE', eoi_at: new Date() });
  const animal = await db.CiaAnimal.create({ animal_uuid: uuid(), ear_tag_no: earTag || String(tag += 1), ear_tag_photo_ref: 's3://t', species: 'CATTLE', breed: 'HF', sex: 'FEMALE', daily_milk_yield: 10 });
  const purchase = await db.CiaPurchase.create({ purchase_uuid: uuid(), application_id: app.id, animal_id: animal.id, status: PURCHASE.SELLER_PAID, delivered_at: new Date('2026-11-15'), initiated_at: new Date() });
  return { app, purchase, appUuid: app.application_uuid, appId: app.id };
};

beforeAll(async () => {
  await db.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await db.sequelize.sync({ force: true });
  await schemeConfig.publishConfig({ schemeVersion: 'CIA_UK_2026_v1', rulesJson: { postPurchaseYieldMinRatio: 0.7 }, docChecklist: [] }, {});
  const s = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile: '9333300001', first_name: 'Supervisor' });
  supClaim = s.user_id;
});
afterAll(async () => { await db.sequelize.close(); });

describe('1. schedule', () => {
  test('creates 7/30/90-day inspections from delivery, idempotently', async () => {
    const { app, purchase } = await mkDelivered('F1001', '123456789012');
    const r1 = await insp.scheduleFor(app, purchase);
    expect(r1.scheduled).toBe(3);
    const r2 = await insp.scheduleFor(app, purchase);
    expect(r2.scheduled).toBe(0);
    const rows = await db.CiaPostPurchaseInspection.findAll({ where: { application_id: app.id }, order: [['due_day', 'ASC']] });
    expect(rows.map((x) => x.due_day)).toEqual([7, 30, 90]);
    expect(rows[0].due_date).toBe('2026-11-22'); // 15 Nov + 7
  });
});

describe('2 + 3 + 4. record', () => {
  test('matching tag + photo → asset exists, no flags', async () => {
    const { app, purchase } = await mkDelivered('F1002', '223456789012');
    await insp.scheduleFor(app, purchase);
    const res = await insp.recordInspection(fieldReq(app.application_uuid, { dueDay: 7, earTagNo: '223456789012', photoRefs: ['s3://p1'], healthy: true, milkYield: 10 }));
    expect(res.assetExists).toBe(true);
    expect(res.exceptionFlags).toEqual([]);
    const row = await db.CiaPostPurchaseInspection.findOne({ where: { application_id: app.id, due_day: 7 } });
    expect(row.status).toBe('DONE');
  });

  test('a tag mismatch raises SUBSTITUTION_SUSPECTED and surfaces on the fraud panel', async () => {
    const { app, purchase } = await mkDelivered('F1003', '323456789012');
    await insp.scheduleFor(app, purchase);
    const res = await insp.recordInspection(fieldReq(app.application_uuid, { dueDay: 7, earTagNo: '999999999999', photoRefs: ['s3://p1'], milkYield: 10 }));
    expect(res.assetExists).toBe(false);
    expect(res.exceptionFlags).toContain('SUBSTITUTION_SUSPECTED');
    const p = await db.CiaPurchase.findByPk(purchase.id);
    expect(p.exception_flags).toContain('SUBSTITUTION_SUSPECTED'); // now visible on the panel
  });

  test('low yield raises YIELD_SHORTFALL (advisory)', async () => {
    const { app, purchase } = await mkDelivered('F1004', '423456789012');
    await insp.scheduleFor(app, purchase);
    const res = await insp.recordInspection(fieldReq(app.application_uuid, { dueDay: 7, earTagNo: '423456789012', photoRefs: ['s3://p1'], milkYield: 5 }));
    expect(res.exceptionFlags).toContain('YIELD_SHORTFALL');
    expect(res.assetExists).toBe(true); // still exists — advisory only
  });

  test('the scheduling job covers delivered purchases', async () => {
    await mkDelivered('F1005', '111111111111');
    const r = await runCiaPostPurchaseInspectionJob();
    expect(r.scheduled).toBeGreaterThanOrEqual(3); // at least the new one's 7/30/90
  });
});
