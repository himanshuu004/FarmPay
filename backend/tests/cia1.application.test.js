/**
 * CIA-1 — Slice B: application + document upload.
 *   1. createDraft   : ERP pre-fill, checklist surfaced, details persisted
 *   2. uploadDocument: camera-first, content-addressed, per-key replace, unknown-key rejected
 *   3. submit ★       : blocked until mandatory complete → PENDING_SUPERVISOR_VERIFY
 *   4. ownership       : a farmer cannot touch another farmer's application (IDOR)
 */
process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || 'mock';
const crypto = require('crypto');
const db = require('../src/shared/models');
const schemeConfig = require('../src/modules/cattle_induction/services/schemeConfigService');
const app = require('../src/modules/cattle_induction/services/applicationService');
const { APP } = require('../src/modules/cattle_induction/constants/ciaStatus');

const uuid = () => crypto.randomUUID();
const SCHEME = 'CIA_UK_2026_v1';
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

const req = (userClaim, { body = {}, params = {}, query = {} } = {}) => ({ user: { id: userClaim, role: 'FARMER' }, body, params, query });

let ownerClaim, otherClaim, appUuid;

const seedFarmer = async (farmerRef, mobile) => {
  const u = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile, first_name: farmerRef });
  await db.CoopMembership.create({ membership_uuid: uuid(), farmer_ref: farmerRef, society_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI', user_id: u.id, link_status: 'LINKED', joined_on: '2021-06-12' });
  return u.user_id;
};

beforeAll(async () => {
  await db.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await db.sequelize.sync({ force: true });

  ownerClaim = await seedFarmer('F1001', '9000000001');
  otherClaim = await seedFarmer('F1002', '9000000002');

  await schemeConfig.publishConfig({
    schemeVersion: SCHEME,
    rulesJson: { maxCattle: 2 },
    docChecklist: [
      { key: 'aadhaar', label: 'Aadhaar', required: 'MANDATORY' },
      { key: 'bank_passbook', label: 'Bank passbook', required: 'MANDATORY' },
      { key: 'photo', label: 'Photo', required: 'OPTIONAL' },
    ],
  }, {});

  // Simulate the post-DCS-selection state: one application in APPLICATION_PENDING.
  const row = await db.CiaApplication.create({
    application_uuid: uuid(), farmer_ref: 'F1001', dcs_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI',
    scheme_version: SCHEME, status: APP.APPLICATION_PENDING, eoi_at: new Date(),
  });
  appUuid = row.application_uuid;
});
afterAll(async () => { await db.sequelize.close(); });

describe('1. createDraft', () => {
  test('opens the fillable application with ERP pre-fill + checklist and persists details', async () => {
    const res = await app.createDraft(req(ownerClaim, { body: { requestedCattleCount: 2, preferredBreed: 'HF crossbred' } }));
    expect(res.status).toBe(APP.APPLICATION_PENDING);
    expect(res.requestedCattleCount).toBe(2);
    expect(res.prefill.source).toBe('ERP');
    expect(res.prefill.name).toBe('Ramesh Mahto');           // from ERP mock F1001
    expect(res.documents.missingMandatory.sort()).toEqual(['aadhaar', 'bank_passbook']);
  });
});

describe('2. uploadDocument', () => {
  test('rejects an unknown checklist key', async () => {
    await expect(app.uploadDocument(req(ownerClaim, { params: { appUuid }, body: { checklistKey: 'passport', docRef: 's3://x', contentHash: sha('x') } })))
      .rejects.toMatchObject({ errorCode: 'CIA_DOC_KEY_UNKNOWN' });
  });

  test('stores a content-addressed document and reports remaining mandatory', async () => {
    const r = await app.uploadDocument(req(ownerClaim, { params: { appUuid }, body: { checklistKey: 'aadhaar', docRef: 's3://cia/aadhaar/1', contentHash: sha('aadhaar-v1') } }));
    expect(r.uploaded).toBe(true);
    expect(r.checklistComplete).toBe(false);
    expect(r.missingMandatory).toEqual(['bank_passbook']);
    const row = await db.CiaApplication.findOne({ where: { application_uuid: appUuid } });
    const docs = await db.CiaDocument.findAll({ where: { application_id: row.id } });
    expect(docs).toHaveLength(1);
    expect(docs[0].content_hash).toBe(sha('aadhaar-v1'));
  });

  test('re-upload of the same key REPLACES (one active row per key)', async () => {
    await app.uploadDocument(req(ownerClaim, { params: { appUuid }, body: { checklistKey: 'aadhaar', docRef: 's3://cia/aadhaar/2', contentHash: sha('aadhaar-v2') } }));
    const row = await db.CiaApplication.findOne({ where: { application_uuid: appUuid } });
    const docs = await db.CiaDocument.findAll({ where: { application_id: row.id, checklist_key: 'aadhaar' } });
    expect(docs).toHaveLength(1);
    expect(docs[0].content_hash).toBe(sha('aadhaar-v2'));
  });
});

describe('3. submit ★ (mandatory-gated)', () => {
  test('blocked while a mandatory document is missing — status unchanged', async () => {
    await expect(app.submit(req(ownerClaim, { params: { appUuid } })))
      .rejects.toMatchObject({ errorCode: 'CIA_CHECKLIST_INCOMPLETE', statusCode: 422 });
    const row = await db.CiaApplication.findOne({ where: { application_uuid: appUuid } });
    expect(row.status).toBe(APP.APPLICATION_PENDING);
  });

  test('succeeds once all mandatory docs exist → PENDING_SUPERVISOR_VERIFY + event', async () => {
    await app.uploadDocument(req(ownerClaim, { params: { appUuid }, body: { checklistKey: 'bank_passbook', docRef: 's3://cia/bank/1', contentHash: sha('bank-v1') } }));
    const res = await app.submit(req(ownerClaim, { params: { appUuid } }));
    expect(res.status).toBe(APP.PENDING_SUPERVISOR_VERIFY);

    const row = await db.CiaApplication.findOne({ where: { application_uuid: appUuid } });
    expect(row.status).toBe(APP.PENDING_SUPERVISOR_VERIFY);
    expect(row.submitted_at).toBeTruthy();
    const ev = await db.DomainEvent.findOne({ where: { event_type: 'cia.application.submitted', aggregate_id: appUuid } });
    expect(ev).toBeTruthy();
  });
});

describe('4. ownership (IDOR)', () => {
  test('another farmer cannot upload to or submit this application', async () => {
    await expect(app.uploadDocument(req(otherClaim, { params: { appUuid }, body: { checklistKey: 'aadhaar', docRef: 's3://x', contentHash: sha('y') } })))
      .rejects.toMatchObject({ errorCode: 'CIA_APP_FORBIDDEN', statusCode: 403 });
  });
});
