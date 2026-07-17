/**
 * CIA Tier-3 (Fix 9) — at-rest encryption for CIA PII/financial columns. bank_account,
 * id_proof_ref and loan_account are ciphertext in the DB and plaintext through the ORM.
 */
process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || 'mock';
const crypto = require('crypto');
const db = require('../src/shared/models');

const uuid = () => crypto.randomUUID();
let userId;

beforeAll(async () => {
  await db.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await db.sequelize.sync({ force: true });
  userId = (await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile: '9000000001', first_name: 'Rec', is_active: true })).id;
});
afterAll(async () => { await db.sequelize.close(); });

describe('CIA at-rest field encryption', () => {
  test('CiaSeller bank_account + id_proof_ref are ciphertext at rest, plaintext on read', async () => {
    const seller = await db.CiaSeller.create({ seller_uuid: uuid(), name: 'Balbir', id_proof_ref: 's3://id/aadhaar', bank_account: 'SBIN0001234-99887766', photo_ref: 's3://ph', relationship_to_buyer: 'unrelated' });
    const raw = await db.CiaSeller.findByPk(seller.id, { raw: true });
    expect(raw.bank_account).not.toBe('SBIN0001234-99887766');
    expect(raw.bank_account.split(':').length).toBe(3);          // iv:tag:cipher
    expect(raw.id_proof_ref).not.toBe('s3://id/aadhaar');
    const inst = await db.CiaSeller.findByPk(seller.id);
    expect(inst.bank_account).toBe('SBIN0001234-99887766');      // getter decrypts
    expect(inst.id_proof_ref).toBe('s3://id/aadhaar');
  });

  test('loan_account is encrypted on CiaApplication and CiaDisbursement', async () => {
    await db.CoopMembership.create({ membership_uuid: uuid(), farmer_ref: 'F1001', society_ref: 'SOC-RANCHI-014', link_status: 'ERP_ONLY', joined_on: '2021-06-12' });
    const app = await db.CiaApplication.create({ application_uuid: uuid(), farmer_ref: 'F1001', dcs_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI', scheme_version: 'CIA_UK_2026_v1', status: 'LOAN_DISBURSED', loan_account: 'LN-778812345', eoi_at: new Date() });
    const rawApp = await db.CiaApplication.findByPk(app.id, { raw: true });
    expect(rawApp.loan_account).not.toBe('LN-778812345');
    expect(rawApp.loan_account.split(':').length).toBe(3);
    expect((await db.CiaApplication.findByPk(app.id)).loan_account).toBe('LN-778812345');

    const disb = await db.CiaDisbursement.create({ disbursement_uuid: uuid(), application_id: app.id, loan_account: 'LN-778812345', amount: 60000, disbursement_ref: 'DREF-1', recorded_by_user_id: userId, recorded_at: new Date() });
    const rawDisb = await db.CiaDisbursement.findByPk(disb.id, { raw: true });
    expect(rawDisb.loan_account).not.toBe('LN-778812345');
    expect((await db.CiaDisbursement.findByPk(disb.id)).loan_account).toBe('LN-778812345');
  });

  test('a null loan_account round-trips without error', async () => {
    await db.CoopMembership.create({ membership_uuid: uuid(), farmer_ref: 'F1002', society_ref: 'SOC-RANCHI-014', link_status: 'ERP_ONLY', joined_on: '2021-06-12' });
    const app = await db.CiaApplication.create({ application_uuid: uuid(), farmer_ref: 'F1002', dcs_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI', scheme_version: 'CIA_UK_2026_v1', status: 'INTEREST_SUBMITTED', eoi_at: new Date() });
    expect((await db.CiaApplication.findByPk(app.id)).loan_account).toBeNull();
  });
});
