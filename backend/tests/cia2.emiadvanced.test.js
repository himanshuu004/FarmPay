/**
 * CIA Tier-2 (Fix 8 final) — prepayment carry-forward + loan restructuring.
 *   1. prepayment : an overpayment carries to the next installment when the scheme
 *      enables it (config-gated); off by default.
 *   2. restructure : the current schedule + ledger are superseded and re-amortised;
 *      the loan hops LOAN_RESTRUCTURED -> EMI_ACTIVE; refused unless in repayment.
 */
process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || 'mock';
const crypto = require('crypto');
const db = require('../src/shared/models');
const emi = require('../src/modules/cattle_induction/services/emiService');
const schemeConfig = require('../src/modules/cattle_induction/services/schemeConfigService');
const { APP } = require('../src/modules/cattle_induction/constants/ciaStatus');

const uuid = () => crypto.randomUUID();
const AS_OF = new Date('2026-10-15T00:00:00Z');
const PAST = ['2026-08-01', '2026-08-15'];
let bankClaim;
const bankReq = (appUuid, body = {}) => ({ user: { id: bankClaim, role: 'BANK_CHECKER' }, params: { appUuid }, body, query: {} });

const mkLoan = async (farmerRef, status, schemeVersion, dues) => {
  await db.CoopMembership.findOrCreate({ where: { farmer_ref: farmerRef }, defaults: { membership_uuid: uuid(), farmer_ref: farmerRef, society_ref: 'SOC-RANCHI-014', link_status: 'ERP_ONLY', joined_on: '2021-06-12' } });
  const app = await db.CiaApplication.create({ application_uuid: uuid(), farmer_ref: farmerRef, dcs_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI', scheme_version: schemeVersion, status, loan_account: 'SBIN-' + farmerRef, milk_account_ref: farmerRef, eoi_at: new Date() });
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
  await schemeConfig.publishConfig({ schemeVersion: 'CIA_UK_2026_v1', rulesJson: {}, docChecklist: [] }, {});
  await schemeConfig.publishConfig({ schemeVersion: 'CIA_UK_CARRY_v1', rulesJson: { emiConfig: { allowPrepaymentCarry: true } }, docChecklist: [] }, {});
  bankClaim = (await db.User.create({ user_id: 'U-BNK-' + uuid().slice(0, 6), mobile: '9000000099', first_name: 'Bank', is_active: true })).user_id;
});
afterAll(async () => { await db.sequelize.close(); });

describe('1. prepayment carry-forward (config-gated)', () => {
  test('an overpayment carries to the next installment when enabled', async () => {
    const app = await mkLoan('FCA', APP.EMI_ACTIVE, 'CIA_UK_CARRY_v1', PAST);
    const res = await emi.reconcile({ applicationUuid: app.application_uuid, deductions: [{ installmentNo: 1, amountDeducted: 3000 }], asOf: AS_OF });
    expect(res.byStatus).toMatchObject({ PAID: 1, PARTIAL: 1 });
    const l2 = await db.CiaEmiLedger.findOne({ where: { application_id: app.id, installment_no: 2 } });
    expect(Number(l2.carried_amount)).toBe(1000);   // 3000 - 2000 surplus carried
    expect(Number(l2.pending_amount)).toBe(1000);
    expect(l2.status).toBe('PARTIAL');
  });

  test('without the config flag the surplus is not carried', async () => {
    const app = await mkLoan('FCB', APP.EMI_ACTIVE, 'CIA_UK_2026_v1', PAST);
    await emi.reconcile({ applicationUuid: app.application_uuid, deductions: [{ installmentNo: 1, amountDeducted: 3000 }], asOf: AS_OF });
    const l2 = await db.CiaEmiLedger.findOne({ where: { application_id: app.id, installment_no: 2 } });
    expect(Number(l2.carried_amount)).toBe(0);
    expect(l2.status).toBe('OVERDUE');              // installment 2 unpaid + past due
  });
});

describe('2. loan restructuring', () => {
  test('restructure supersedes the old schedule/ledger and re-amortises', async () => {
    const app = await mkLoan('FRB', APP.EMI_ACTIVE, 'CIA_UK_2026_v1', ['2026-08-01', '2026-09-01', '2026-10-01']);
    await emi.reconcile({ applicationUuid: app.application_uuid, deductions: [{ installmentNo: 1, amountDeducted: 2000 }], asOf: AS_OF }); // seeds ledger
    const res = await emi.restructureLoan(bankReq(app.application_uuid, {
      restructureRef: 'RST-1', reason: 'Drought re-amortisation',
      rows: [{ installmentNo: 1, emiDue: 1500, dueDate: '2027-01-01' }, { installmentNo: 2, emiDue: 1500, dueDate: '2027-02-01' }],
    }));
    expect(res.status).toBe(APP.EMI_ACTIVE);
    expect(res.scheduleVersion).toBe(2);
    expect(res.installments).toBe(2);

    const sched = await db.CiaEmiSchedule.findAll({ where: { application_id: app.id } });
    expect(sched).toHaveLength(2);                          // old 3 replaced by new 2
    expect(sched.every((s) => s.schedule_version === 2)).toBe(true);
    expect(await db.CiaEmiLedger.count({ where: { application_id: app.id } })).toBe(0); // old ledger cleared
    const reloaded = await db.CiaApplication.findByPk(app.id);
    expect(reloaded.status).toBe(APP.EMI_ACTIVE);
    expect(reloaded.restructure_ref).toBe('RST-1');
    const ev = await db.DomainEvent.findOne({ where: { event_type: 'cia.emi.restructured', aggregate_id: app.application_uuid } });
    expect(ev).toBeTruthy();
    expect(ev.payload.supersededSchedule).toHaveLength(3);  // audit snapshot of the old schedule
  });

  test('restructure is refused when the loan is not in repayment', async () => {
    const app = await mkLoan('FRC', APP.CATTLE_PURCHASE_PENDING, 'CIA_UK_2026_v1', ['2026-08-01']);
    await expect(emi.restructureLoan(bankReq(app.application_uuid, { restructureRef: 'RST-2', reason: 'x', rows: [{ installmentNo: 1, emiDue: 1000, dueDate: '2027-01-01' }] })))
      .rejects.toMatchObject({ errorCode: 'CIA_APP_BAD_STATE', statusCode: 409 });
  });
});
