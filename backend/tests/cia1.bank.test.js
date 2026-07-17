/**
 * CIA-1 — Slice G: bank sanction-file stage → confirm (fallback file mode).
 *   1. stage       : matched vs unmatched preview
 *   2. idempotency  : re-uploading the same file dedupes by file_row_hash
 *   3. confirm       : matched apply (LOAN_SANCTIONED/REJECTED), unmatched QUARANTINED
 *   4. segregation    : checker == staging maker → 403 (SoD); no money moves
 */
process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || 'mock';
const crypto = require('crypto');
const db = require('../src/shared/models');
const bank = require('../src/modules/cattle_induction/services/bankFiledropService');
const { APP } = require('../src/modules/cattle_induction/constants/ciaStatus');

const uuid = () => crypto.randomUUID();
let makerClaim, checkerClaim, makerUserId;

const makerReq = (body) => ({ user: { id: makerClaim, role: 'BANK_MAKER' }, body, query: {}, params: {} });
const checkerReq = (body) => ({ user: { id: checkerClaim, role: 'BANK_CHECKER' }, body, query: {}, params: {} });

const mkBatch = async (appUuids) => {
  const b = await db.CiaBankBatch.create({
    batch_uuid: uuid(), bank_ref: 'COOPBANK-RANCHI', union_ref: 'UNI-RANCHI',
    application_ids: appUuids, packet_doc_ref: 's3://cia/packets/x', status: 'GENERATED',
    generated_by_user_id: makerUserId, generated_at: new Date(),
  });
  return b;
};
const mkSubmitted = async (farmerRef, batchUuid) => {
  const row = await db.CiaApplication.create({
    application_uuid: uuid(), farmer_ref: farmerRef, dcs_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI',
    scheme_version: 'CIA_UK_2026_v1', status: APP.SUBMITTED_TO_BANK, bank_batch_id: batchUuid, eoi_at: new Date(),
  });
  return row.application_uuid;
};

beforeAll(async () => {
  await db.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await db.sequelize.sync({ force: true });
  const maker = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile: '9666600001', first_name: 'BankMaker' });
  const checker = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile: '9666600002', first_name: 'BankChecker' });
  makerClaim = maker.user_id; makerUserId = maker.id; checkerClaim = checker.user_id;
  for (const ref of ['F1001', 'F1002', 'F1003']) {
    await db.CoopMembership.create({ membership_uuid: uuid(), farmer_ref: ref, society_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI', link_status: 'ERP_ONLY', joined_on: '2021-06-12' });
  }
});
afterAll(async () => { await db.sequelize.close(); });

describe('stage → confirm', () => {
  let a1; let a2; let file1;

  test('1. stage previews matched vs unmatched', async () => {
    const batch = await mkBatch([]);
    a1 = await mkSubmitted('F1001', batch.batch_uuid);
    a2 = await mkSubmitted('F1002', batch.batch_uuid);
    file1 = 'sftp://bank/sanction-2026-07-11.csv';
    const rows = [
      { applicationUuid: a1, outcome: 'SANCTIONED', sanctionedAmount: 62000, loanAccount: 'SBIN0001234-7781' },
      { applicationUuid: a2, outcome: 'REJECTED', rejectReason: 'insufficient milk history' },
      { applicationUuid: uuid(), outcome: 'SANCTIONED', sanctionedAmount: 50000, loanAccount: 'X-0000' }, // no such app → unmatched
    ];
    const res = await bank.stageSanctionFile(makerReq({ batchUuid: batch.batch_uuid, fileRef: file1, rows }));
    expect(res.matched).toBe(2);
    expect(res.unmatched).toBe(1);
    expect(res.staged).toBe(3);
  });

  test('2. re-uploading the same file is idempotent (dedupe by file_row_hash)', async () => {
    const batch = await db.CiaBankBatch.findOne({ order: [['id', 'ASC']] });
    const rows = [
      { applicationUuid: a1, outcome: 'SANCTIONED', sanctionedAmount: 62000, loanAccount: 'SBIN0001234-7781' },
      { applicationUuid: a2, outcome: 'REJECTED', rejectReason: 'insufficient milk history' },
    ];
    const res = await bank.stageSanctionFile(makerReq({ batchUuid: batch.batch_uuid, fileRef: file1, rows }));
    expect(res.staged).toBe(0);
    expect(res.duplicates).toBe(2);
    const count = await db.CiaSanction.count({ where: { file_ref: file1 } });
    expect(count).toBe(3);                       // still just the original 3 rows
  });

  test('3. confirm applies matched (sanctioned/rejected), quarantines unmatched', async () => {
    const res = await bank.confirmSanctionFile(checkerReq({ fileRef: file1 }));
    expect(res.sanctioned).toBe(1);
    expect(res.rejected).toBe(1);
    expect(res.quarantined).toBe(1);

    const r1 = await db.CiaApplication.findOne({ where: { application_uuid: a1 } });
    expect(r1.status).toBe(APP.LOAN_SANCTIONED);
    expect(Number(r1.sanctioned_amount)).toBe(62000);
    expect(r1.loan_account).toBe('SBIN0001234-7781');
    const r2 = await db.CiaApplication.findOne({ where: { application_uuid: a2 } });
    expect(r2.status).toBe(APP.LOAN_REJECTED);

    const unmatched = await db.CiaSanction.findOne({ where: { file_ref: file1, match_status: 'QUARANTINED' } });
    expect(unmatched).toBeTruthy();              // never auto-applied
    const ev = await db.DomainEvent.findOne({ where: { event_type: 'cia.sanction.confirmed', aggregate_id: a1 } });
    expect(ev).toBeTruthy();
  });
});

describe('maker-checker segregation', () => {
  test('the maker who staged cannot confirm (403); the application is untouched', async () => {
    const batch = await mkBatch([]);
    const a3 = await mkSubmitted('F1003', batch.batch_uuid);
    const file2 = 'sftp://bank/sanction-sod.csv';
    await bank.stageSanctionFile(makerReq({ batchUuid: batch.batch_uuid, fileRef: file2, rows: [{ applicationUuid: a3, outcome: 'SANCTIONED', sanctionedAmount: 40000, loanAccount: 'Y-1111' }] }));
    // Same user acts as checker.
    await expect(bank.confirmSanctionFile({ user: { id: makerClaim, role: 'BANK_CHECKER' }, body: { fileRef: file2 }, query: {}, params: {} }))
      .rejects.toMatchObject({ errorCode: 'CIA_SOD_VIOLATION', statusCode: 403 });
    const r3 = await db.CiaApplication.findOne({ where: { application_uuid: a3 } });
    expect(r3.status).toBe(APP.SUBMITTED_TO_BANK);
  });
});
