/**
 * CIA Tier-2 (Fix 8 follow-on) — EMI moratorium + reversal.
 *   1. moratorium : setMoratorium shields installments due within the window from
 *      ageing (MORATORIUM, not OVERDUE); refused unless the loan is in repayment.
 *   2. reversal   : a reversed deduction nets against the installment, is recorded on
 *      the ledger, and emits cia.emi.reversed (auditable, never silently absorbed).
 */
process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || 'mock';
const crypto = require('crypto');
const db = require('../src/shared/models');
const emi = require('../src/modules/cattle_induction/services/emiService');
const { APP } = require('../src/modules/cattle_induction/constants/ciaStatus');

const uuid = () => crypto.randomUUID();
const AS_OF = new Date('2026-10-15T00:00:00Z'); // well past the Aug due dates → would be OVERDUE
let staffClaim;
const staffReq = (appUuid, body = {}) => ({ user: { id: staffClaim, role: 'DUSS_CHECKER' }, params: { appUuid }, body, query: {} });

const mkLoan = async (farmerRef, status, dues) => {
  await db.CoopMembership.findOrCreate({ where: { farmer_ref: farmerRef }, defaults: { membership_uuid: uuid(), farmer_ref: farmerRef, society_ref: 'SOC-RANCHI-014', link_status: 'ERP_ONLY', joined_on: '2021-06-12' } });
  const app = await db.CiaApplication.create({ application_uuid: uuid(), farmer_ref: farmerRef, dcs_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI', scheme_version: 'CIA_UK_2026_v1', status, loan_account: 'SBIN-' + farmerRef, milk_account_ref: farmerRef, eoi_at: new Date() });
  let n = 0;
  for (const due of dues) {
    n += 1;
    // eslint-disable-next-line no-await-in-loop
    await db.CiaEmiSchedule.create({ schedule_uuid: uuid(), application_id: app.id, installment_no: n, emi_due: 2000, due_date: due, status: 'SCHEDULED', file_row_hash: uuid().replace(/-/g, '') });
  }
  return app;
};

beforeAll(async () => {
  await db.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await db.sequelize.sync({ force: true });
  staffClaim = (await db.User.create({ user_id: 'U-DUSS-' + uuid().slice(0, 6), mobile: '9000000099', first_name: 'DUSS', is_active: true })).user_id;
});
afterAll(async () => { await db.sequelize.close(); });

describe('1. moratorium shields installments from ageing', () => {
  test('reconcile classifies shielded installments MORATORIUM, not OVERDUE; app stays EMI_ACTIVE', async () => {
    const app = await mkLoan('FMA', APP.EMI_ACTIVE, ['2026-08-01', '2026-08-15']); // both past due
    const set = await emi.setMoratorium(staffReq(app.application_uuid, { untilDate: '2026-11-01', reason: 'Flood relief' }));
    expect(set.moratoriumUntil).toBeTruthy();
    expect(await db.DomainEvent.findOne({ where: { event_type: 'cia.emi.moratorium_set', aggregate_id: app.application_uuid } })).toBeTruthy();

    const res = await emi.reconcile({ applicationUuid: app.application_uuid, deductions: [], asOf: AS_OF });
    expect(res.byStatus.MORATORIUM).toBe(2);
    expect(res.byStatus.OVERDUE).toBeUndefined();
    expect(res.applicationStatus).toBe(APP.EMI_ACTIVE);
    expect(await db.DomainEvent.findOne({ where: { event_type: 'cia.emi.overdue', aggregate_id: app.application_uuid } })).toBeNull();
  });

  test('setMoratorium is refused when the loan is not in repayment', async () => {
    const app = await mkLoan('FMB', APP.CATTLE_PURCHASE_PENDING, ['2026-08-01']);
    await expect(emi.setMoratorium(staffReq(app.application_uuid, { untilDate: '2026-11-01', reason: 'x' })))
      .rejects.toMatchObject({ errorCode: 'CIA_APP_BAD_STATE', statusCode: 409 });
  });
});

describe('2. reversal is netted and recorded', () => {
  test('a reversed deduction nets against the installment and emits cia.emi.reversed', async () => {
    const app = await mkLoan('FRA', APP.EMI_ACTIVE, ['2026-08-01']);
    const res = await emi.reconcile({ applicationUuid: app.application_uuid, deductions: [{ installmentNo: 1, amountDeducted: 2000, amountReversed: 500 }], asOf: AS_OF });
    expect(res.byStatus.PARTIAL).toBe(1);                  // net covered 1500 < 2000
    const ledger = await db.CiaEmiLedger.findOne({ where: { application_id: app.id, installment_no: 1 } });
    expect(Number(ledger.reversed_amount)).toBe(500);
    expect(Number(ledger.pending_amount)).toBe(500);
    expect(ledger.status).toBe('PARTIAL');
    const ev = await db.DomainEvent.findOne({ where: { event_type: 'cia.emi.reversed', aggregate_id: app.application_uuid } });
    expect(ev).toBeTruthy();
    expect(ev.payload.reversals[0].installmentNo).toBe(1);
  });
});
