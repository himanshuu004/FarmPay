/**
 * CIA-2 — Slice L: EMI reconciliation (track-only) + ledger + consent gate.
 *   1. reconcile      : classify PAID / PARTIAL / OVERDUE / DUE from deductions
 *   2. idempotency     : re-reconcile updates in place
 *   3. consent gate     : initiate blocked without consent (track-only)
 *   4. getEmi          : farmer ledger + mode + outstanding
 */
process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || 'mock';
const crypto = require('crypto');
const db = require('../src/shared/models');
const schemeConfig = require('../src/modules/cattle_induction/services/schemeConfigService');
const emi = require('../src/modules/cattle_induction/services/emiService');
const { APP } = require('../src/modules/cattle_induction/constants/ciaStatus');

const uuid = () => crypto.randomUUID();
let ownerClaim; let appUuid; let appId;
const farmerReq = (u) => ({ user: { id: ownerClaim, role: 'FARMER' }, params: { appUuid: u }, query: {}, body: {} });
const AS_OF = new Date('2026-10-15T00:00:00Z');

beforeAll(async () => {
  await db.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await db.sequelize.sync({ force: true });
  await schemeConfig.publishConfig({ schemeVersion: 'CIA_UK_2026_v1', rulesJson: { emiConfig: { graceDays: 5, defaultAfterDays: 90 } }, docChecklist: [] }, {});

  const owner = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile: '9000000001', first_name: 'Ramesh' });
  ownerClaim = owner.user_id;
  await db.CoopMembership.create({ membership_uuid: uuid(), farmer_ref: 'F1001', society_ref: 'SOC-RANCHI-014', link_status: 'LINKED', user_id: owner.id, joined_on: '2021-06-12' });

  const app = await db.CiaApplication.create({
    application_uuid: uuid(), farmer_ref: 'F1001', dcs_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI',
    scheme_version: 'CIA_UK_2026_v1', status: APP.CATTLE_PURCHASE_PENDING, loan_account: 'SBIN-7781', milk_account_ref: 'F1001', eoi_at: new Date(),
  });
  appUuid = app.application_uuid; appId = app.id;
  const rows = [
    { n: 1, due: '2026-08-01' }, { n: 2, due: '2026-09-01' }, { n: 3, due: '2026-09-15' }, { n: 4, due: '2026-12-01' },
  ];
  for (const r of rows) {
    await db.CiaEmiSchedule.create({ schedule_uuid: uuid(), application_id: app.id, installment_no: r.n, emi_due: 2150, due_date: r.due, status: 'SCHEDULED', file_row_hash: uuid().replace(/-/g, '') });
  }
});
afterAll(async () => { await db.sequelize.close(); });

const DEDUCTIONS = [
  { installmentNo: 1, amountDeducted: 2150, amountRemitted: 2150 }, // PAID
  { installmentNo: 2, amountDeducted: 1200, amountRemitted: 1200 }, // PARTIAL
  { installmentNo: 3, amountDeducted: 0, amountRemitted: 0 },        // OVERDUE (past due, none)
  // installment 4: no deduction, due in the future → DUE
];

describe('1 + 2. reconcile', () => {
  test('classifies each installment against the deductions', async () => {
    const res = await emi.reconcile({ applicationUuid: appUuid, deductions: DEDUCTIONS, asOf: AS_OF, sourceRef: 'settle-oct' });
    expect(res.mode).toBe('TRACK');
    expect(res.byStatus).toMatchObject({ PAID: 1, PARTIAL: 1, OVERDUE: 1, DUE: 1 });

    const ledger = await db.CiaEmiLedger.findAll({ where: { application_id: appId }, order: [['installment_no', 'ASC']] });
    expect(ledger.map((l) => l.status)).toEqual(['PAID', 'PARTIAL', 'OVERDUE', 'DUE']);
    expect(Number(ledger[1].pending_amount)).toBe(950); // 2150 - 1200
    const ev = await db.DomainEvent.findOne({ where: { event_type: 'cia.emi.reconciled', aggregate_id: appUuid } });
    expect(ev).toBeTruthy();
  });

  test('re-reconciling updates the ledger in place (no duplicate rows)', async () => {
    await emi.reconcile({ applicationUuid: appUuid, deductions: DEDUCTIONS, asOf: AS_OF });
    const count = await db.CiaEmiLedger.count({ where: { application_id: appId } });
    expect(count).toBe(4);
  });
});

describe('3. consent gate (Convention 33)', () => {
  test('without consent the mode is TRACK and initiation is refused', async () => {
    const app = await db.CiaApplication.findByPk(appId);
    expect(emi.getDeductionMode(app)).toBe('TRACK');
    await expect(emi.initiateDeduction(app)).rejects.toMatchObject({ errorCode: 'CIA_CONSENT_REQUIRED', statusCode: 403 });
  });

  test('an active consent pointer flips the mode to INITIATE', async () => {
    const app = await db.CiaApplication.findByPk(appId);
    await app.update({ emi_consent_ref: 'CONSENT-DEED-001' });
    expect(emi.getDeductionMode(app)).toBe('INITIATE');
    await app.update({ emi_consent_ref: null }); // reset — the initiate transport is covered by cia2.consent
  });
});

describe('4. getEmi ledger', () => {
  test('the farmer sees the reconciled ledger, track mode, and outstanding', async () => {
    const v = await emi.getEmi(farmerReq(appUuid));
    expect(v.mode).toBe('TRACK');
    expect(v.consentOnFile).toBe(false);
    expect(v.ledger).toHaveLength(4);
    // outstanding = 0 + 950 + 2150 + 2150
    expect(v.outstanding).toBe(5250);
    expect(v.nextEmi.installmentNo).toBe(3); // first OVERDUE/DUE
  });
});
