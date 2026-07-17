/**
 * CIA-2 — Slice K: loan↔milk map + EMI schedule ingest.
 *   1. ingest       : disbursed loan → schedule rows created
 *   2. idempotency    : re-uploading the same file dedupes by file_row_hash
 *   3. not-disbursed   : schedule ingest skipped
 *   4. getEmi          : owner-scoped schedule + loan↔milk map; IDOR blocked
 */
process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || 'mock';
const crypto = require('crypto');
const db = require('../src/shared/models');
const emi = require('../src/modules/cattle_induction/services/emiService');
const { APP } = require('../src/modules/cattle_induction/constants/ciaStatus');

const uuid = () => crypto.randomUUID();
let bankClaim; let ownerClaim; let otherClaim; let disbursedApp; let sanctionedOnly;

const bankReq = (body) => ({ user: { id: bankClaim, role: 'BANK_MAKER' }, body, params: {}, query: {} });
const farmerReq = (claim, appUuid) => ({ user: { id: claim, role: 'FARMER' }, params: { appUuid }, query: {}, body: {} });

const seedFarmer = async (farmerRef, mobile) => {
  const u = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile, first_name: farmerRef });
  await db.CoopMembership.create({ membership_uuid: uuid(), farmer_ref: farmerRef, society_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI', link_status: 'LINKED', user_id: u.id, joined_on: '2021-06-12' });
  return u;
};

beforeAll(async () => {
  await db.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await db.sequelize.sync({ force: true });
  const bankU = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile: '9888800001', first_name: 'BankMaker' });
  bankClaim = bankU.user_id;
  const owner = await seedFarmer('F1001', '9000000001');
  const other = await seedFarmer('F1002', '9000000002');
  ownerClaim = owner.user_id; otherClaim = other.user_id;

  // A disbursed loan (mapping already set), plus its disbursement record.
  const app = await db.CiaApplication.create({
    application_uuid: uuid(), farmer_ref: 'F1001', dcs_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI',
    scheme_version: 'CIA_UK_2026_v1', status: APP.CATTLE_PURCHASE_PENDING, loan_account: 'SBIN-7781', milk_account_ref: 'F1001', eoi_at: new Date(),
  });
  disbursedApp = app.application_uuid;
  await db.CiaDisbursement.create({ disbursement_uuid: uuid(), application_id: app.id, loan_account: 'SBIN-7781', amount: 24800, disbursement_ref: 'DISB-91', recorded_by_user_id: bankU.id, recorded_at: new Date() });

  // A sanctioned-but-not-disbursed loan.
  const s = await db.CiaApplication.create({
    application_uuid: uuid(), farmer_ref: 'F1002', dcs_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI',
    scheme_version: 'CIA_UK_2026_v1', status: APP.LOAN_SANCTIONED, sanctioned_amount: 60000, eoi_at: new Date(),
  });
  sanctionedOnly = s.application_uuid;
});
afterAll(async () => { await db.sequelize.close(); });

const scheduleRows = (appUuid) => [
  { applicationUuid: appUuid, installmentNo: 1, emiDue: 2150, dueDate: '2026-08-01' },
  { applicationUuid: appUuid, installmentNo: 2, emiDue: 2150, dueDate: '2026-09-01' },
];
const FILE = 'sftp://bank/emi-2026-07.csv';

describe('1 + 2. ingest + idempotency', () => {
  test('ingests a schedule for a disbursed loan', async () => {
    const res = await emi.ingestSchedule(bankReq({ fileRef: FILE, rows: scheduleRows(disbursedApp) }));
    expect(res.ingested).toBe(2);
    const app = await db.CiaApplication.findOne({ where: { application_uuid: disbursedApp } });
    const count = await db.CiaEmiSchedule.count({ where: { application_id: app.id } });
    expect(count).toBe(2);
  });

  test('re-uploading the same file is idempotent', async () => {
    const res = await emi.ingestSchedule(bankReq({ fileRef: FILE, rows: scheduleRows(disbursedApp) }));
    expect(res.ingested).toBe(0);
    expect(res.duplicates).toBe(2);
  });
});

describe('3. not-disbursed', () => {
  test('schedule ingest is skipped for a loan that is not disbursed', async () => {
    const res = await emi.ingestSchedule(bankReq({ fileRef: 'sftp://bank/other.csv', rows: scheduleRows(sanctionedOnly) }));
    expect(res.ingested).toBe(0);
    expect(res.skipped[0].reason).toMatch(/not disbursed/);
  });
});

describe('4. getEmi (owner-scoped)', () => {
  test('the farmer sees the schedule + loan↔milk map', async () => {
    const v = await emi.getEmi(farmerReq(ownerClaim, disbursedApp));
    expect(v.installments).toBe(2);
    expect(v.loanAccount).toBe('SBIN-7781');
    expect(v.milkAccountRef).toBe('F1001');
    expect(v.schedule[0].emiDue).toBe(2150);
  });

  test('another farmer cannot read it', async () => {
    await expect(emi.getEmi(farmerReq(otherClaim, disbursedApp)))
      .rejects.toMatchObject({ errorCode: 'CIA_APP_FORBIDDEN', statusCode: 403 });
  });
});
