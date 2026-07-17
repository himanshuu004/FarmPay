/**
 * CIA Tier-1 (Fix 3) — reconcile drives the application EMI lifecycle, so the loan
 * status (and the DUSS overdue tile) reflect ledger reality instead of stalling at
 * EMI_ACTIVE forever.
 *   1+2. an overdue installment flips EMI_ACTIVE -> EMI_OVERDUE (+ cia.emi.overdue);
 *        the DUSS bank-reconciliation tile now counts it.
 *   3. full repayment flips -> LOAN_CLOSED (+ cia.loan.closed), hopping via EMI_ACTIVE
 *      from OVERDUE; re-running is idempotent.
 *   4. a DEFAULT installment raises cia.emi.default and holds OVERDUE (no auto-reject).
 *   5. reconcile on a pre-repayment app leaves status untouched (no regression).
 */
process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || 'mock';
const crypto = require('crypto');
const db = require('../src/shared/models');
const emi = require('../src/modules/cattle_induction/services/emiService');
const duss = require('../src/modules/cattle_induction/services/dussService');
const { APP } = require('../src/modules/cattle_induction/constants/ciaStatus');

const uuid = () => crypto.randomUUID();
const PAST = '2026-08-01';                                  // before AS_OF (past due)
const AS_OF = new Date('2026-10-15T00:00:00Z');             // grace passed → OVERDUE
const DEFAULT_AS_OF = new Date('2027-02-01T00:00:00Z');     // > 90 days after PAST → DEFAULT

const mkLoan = async (farmerRef, status, dues) => {
  // cia_applications.farmer_ref FKs to coop_memberships (society-membership precondition).
  await db.CoopMembership.findOrCreate({ where: { farmer_ref: farmerRef }, defaults: { membership_uuid: uuid(), farmer_ref: farmerRef, society_ref: 'SOC-RANCHI-014', link_status: 'ERP_ONLY', joined_on: '2021-06-12' } });
  const app = await db.CiaApplication.create({
    application_uuid: uuid(), farmer_ref: farmerRef, dcs_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI',
    scheme_version: 'CIA_UK_2026_v1', status, loan_account: 'SBIN-' + farmerRef, milk_account_ref: farmerRef, eoi_at: new Date(),
  });
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
});
afterAll(async () => { await db.sequelize.close(); });

describe('1 + 2. overdue flips the app and surfaces on the DUSS tile', () => {
  test('EMI_ACTIVE -> EMI_OVERDUE (+ cia.emi.overdue); DUSS tile counts it', async () => {
    const app = await mkLoan('FA', APP.EMI_ACTIVE, [PAST, PAST]);
    const res = await emi.reconcile({ applicationUuid: app.application_uuid, deductions: [{ installmentNo: 1, amountDeducted: 0 }], asOf: AS_OF });
    expect(res.applicationStatus).toBe(APP.EMI_OVERDUE);
    expect((await db.CiaApplication.findByPk(app.id)).status).toBe(APP.EMI_OVERDUE);
    expect(await db.DomainEvent.findOne({ where: { event_type: 'cia.emi.overdue', aggregate_id: app.application_uuid } })).toBeTruthy();

    const report = await duss.report({ params: { reportKey: 'bank-reconciliation' }, query: {} });
    expect(report.totals.emiOverdue).toBeGreaterThanOrEqual(1); // was structurally 0 before the fix
  });
});

describe('3. full repayment closes the loan (from OVERDUE, via EMI_ACTIVE)', () => {
  test('all installments PAID -> LOAN_CLOSED (+ cia.loan.closed); idempotent', async () => {
    const app = await mkLoan('FB', APP.EMI_OVERDUE, [PAST, PAST]);
    const paidAll = [{ installmentNo: 1, amountDeducted: 2000 }, { installmentNo: 2, amountDeducted: 2000 }];
    const res = await emi.reconcile({ applicationUuid: app.application_uuid, deductions: paidAll, asOf: AS_OF });
    expect(res.applicationStatus).toBe(APP.LOAN_CLOSED);
    expect(await db.DomainEvent.findOne({ where: { event_type: 'cia.loan.closed', aggregate_id: app.application_uuid } })).toBeTruthy();

    const before = await db.DomainEvent.count({ where: { event_type: 'cia.loan.closed', aggregate_id: app.application_uuid } });
    const res2 = await emi.reconcile({ applicationUuid: app.application_uuid, deductions: paidAll, asOf: AS_OF });
    expect(res2.applicationStatus).toBe(APP.LOAN_CLOSED); // gate skips a closed loan
    expect(await db.DomainEvent.count({ where: { event_type: 'cia.loan.closed', aggregate_id: app.application_uuid } })).toBe(before);
  });
});

describe('4. default raises an alert, never auto-rejects', () => {
  test('a DEFAULT installment emits cia.emi.default and holds the loan OVERDUE', async () => {
    const app = await mkLoan('FC', APP.EMI_ACTIVE, [PAST]);
    const res = await emi.reconcile({ applicationUuid: app.application_uuid, deductions: [{ installmentNo: 1, amountDeducted: 0 }], asOf: DEFAULT_AS_OF });
    expect(res.byStatus.DEFAULT).toBe(1);
    expect(res.applicationStatus).toBe(APP.EMI_OVERDUE); // not auto-closed / auto-rejected
    const ev = await db.DomainEvent.findOne({ where: { event_type: 'cia.emi.default', aggregate_id: app.application_uuid } });
    expect(ev).toBeTruthy();
    expect(ev.payload.installments).toEqual([1]);
  });
});

describe('5. no regression on a pre-repayment reconcile', () => {
  test('reconcile on a CATTLE_PURCHASE_PENDING app leaves status untouched', async () => {
    const app = await mkLoan('FD', APP.CATTLE_PURCHASE_PENDING, [PAST]);
    const res = await emi.reconcile({ applicationUuid: app.application_uuid, deductions: [{ installmentNo: 1, amountDeducted: 0 }], asOf: AS_OF });
    expect(res.applicationStatus).toBe(APP.CATTLE_PURCHASE_PENDING);
    expect((await db.CiaApplication.findByPk(app.id)).status).toBe(APP.CATTLE_PURCHASE_PENDING);
  });
});
