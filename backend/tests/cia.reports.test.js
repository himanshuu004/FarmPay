/**
 * CIA — generated bank + gov reports (Convention 28/19; the sanctioned form of
 * the deferred bank/gov "dashboards").
 *   1. bank-reconciliation : sanctioned/disbursed/paid/overdue totals + by-bank
 *   2. scheme-annexure      : beneficiaries by stage, subsidy, breed summary
 *   3. unknown key           : 404
 */
process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || 'mock';
const crypto = require('crypto');
const db = require('../src/shared/models');
const duss = require('../src/modules/cattle_induction/services/dussService');
const { APP } = require('../src/modules/cattle_induction/constants/ciaStatus');

const uuid = () => crypto.randomUUID();
let userId; let tag = 100000000000;
const reportReq = (reportKey) => ({ params: { reportKey }, query: {}, user: { id: 'u', role: 'GOV_VIEWER' } });

const mkApp = async (farmerRef, status) => {
  await db.CoopMembership.findOrCreate({ where: { farmer_ref: farmerRef }, defaults: { membership_uuid: uuid(), farmer_ref: farmerRef, society_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI', link_status: 'ERP_ONLY', joined_on: '2021-06-12' } });
  return db.CiaApplication.create({ application_uuid: uuid(), farmer_ref: farmerRef, dcs_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI', scheme_version: 'CIA_UK_2026_v1', status, eoi_at: new Date() });
};
const mkAnimal = (breed) => db.CiaAnimal.create({ animal_uuid: uuid(), ear_tag_no: String(tag += 1), ear_tag_photo_ref: 's3://t', species: 'CATTLE', breed, sex: 'FEMALE' });

beforeAll(async () => {
  await db.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await db.sequelize.sync({ force: true });
  const u = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile: '9000000009', first_name: 'Officer' });
  userId = u.id;

  const a1 = await mkApp('F1001', APP.SUBMITTED_TO_BANK);
  await mkApp('F1002', APP.SUBMITTED_TO_BANK);
  const a3 = await mkApp('F1003', APP.LOAN_SANCTIONED);
  const a4 = await mkApp('F1004', APP.EMI_ACTIVE);
  await mkApp('F1005', APP.EMI_OVERDUE);

  const batch = await db.CiaBankBatch.create({ batch_uuid: uuid(), bank_ref: 'COOPBANK-RANCHI', union_ref: 'UNI-RANCHI', application_ids: [a1.application_uuid], packet_doc_ref: 's3://p', status: 'GENERATED', generated_by_user_id: userId, generated_at: new Date() });
  await db.CiaSanction.create({ batch_id: batch.id, application_id: a3.id, raw_row: {}, match_status: 'MATCHED', outcome: 'SANCTIONED', sanctioned_amount: 60000, file_ref: 'f', file_row_hash: 'h1'.padEnd(64, '1'), confirmed_by_user_id: userId, confirmed_at: new Date() });
  await db.CiaSanction.create({ batch_id: batch.id, application_id: null, raw_row: {}, match_status: 'MATCHED', outcome: 'REJECTED', reject_reason: 'x', file_ref: 'f', file_row_hash: 'h2'.padEnd(64, '2'), confirmed_by_user_id: userId, confirmed_at: new Date() });
  await db.CiaDisbursement.create({ disbursement_uuid: uuid(), application_id: a3.id, loan_account: 'SBIN-1', amount: 24800, disbursement_ref: 'D1', recorded_by_user_id: userId, recorded_at: new Date() });
  await db.CiaSubsidyTransfer.create({ transfer_uuid: uuid(), application_id: a3.id, amount: 30000, transfer_ref: 'S1', recorded_by_user_id: userId, recorded_at: new Date() });
  const purchase = await db.CiaPurchase.create({ purchase_uuid: uuid(), application_id: a4.id, status: 'SELLER_PAID', initiated_at: new Date() });
  const seller = await db.CiaSeller.create({ seller_uuid: uuid(), name: 'S', id_proof_ref: 'i', bank_account: 'A', photo_ref: 'p', relationship_to_buyer: 'u' });
  await db.CiaSellerPayout.create({ payout_uuid: uuid(), application_id: a4.id, purchase_id: purchase.id, seller_id: seller.id, payee_account: 'A', amount: 60000, status: 'PAID', recommended_by_user_id: userId, recommended_at: new Date(), paid_at: new Date() });

  await mkAnimal('HF crossbred'); await mkAnimal('HF crossbred'); await mkAnimal('Jersey');
});
afterAll(async () => { await db.sequelize.close(); });

describe('1. bank-reconciliation', () => {
  test('reconciles sanctioned → disbursed → paid + overdue, by bank', async () => {
    const r = await duss.report(reportReq('bank-reconciliation'));
    expect(r.format).toBe('CIA_BANK_RECON_v0');
    expect(r.totals.submittedToBank).toBe(2);
    expect(r.totals.sanctionedAmount).toBe(60000);
    expect(r.totals.rejected).toBe(1);
    expect(r.totals.disbursedAmount).toBe(24800);
    expect(r.totals.sellerPaidAmount).toBe(60000);
    expect(r.totals.emiOverdue).toBe(1);
    expect(r.byBank.find((b) => b.bankRef === 'COOPBANK-RANCHI').batches).toBe(1);
  });
});

describe('2. scheme-annexure (gov)', () => {
  test('summarises beneficiaries, subsidy utilisation and breed induction', async () => {
    const r = await duss.report(reportReq('scheme-annexure'));
    expect(r.export).toBe('ANNEXURE_XX');
    expect(r.beneficiaries.total).toBe(5);
    expect(r.subsidy.totalSubsidy).toBe(30000);
    expect(r.disbursement.totalAmount).toBe(24800);
    expect(r.cattleInduction.byBreed.find((b) => b.breed === 'HF crossbred').count).toBe(2);
  });
});

describe('3. unknown report', () => {
  test('is a 404', async () => {
    await expect(duss.report(reportReq('nope'))).rejects.toMatchObject({ errorCode: 'CIA_REPORT_UNKNOWN', statusCode: 404 });
  });
});
