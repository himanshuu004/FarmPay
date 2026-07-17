/**
 * Phase-3 KAVACH lifecycle (HTTP) — the NLM enrolment machine end to end plus
 * the role/ownership/consent guards.
 *   1. Farmer draft → tag → VET examine/value → OPS pay/issue → active policy
 *   2. Policy carries waiting period, asset (tag), 3-row premium ledger
 *   3. Protection snapshot + covered badges
 *   4. Guards: role separation, proposal ownership, consent-before-pay, tag dedupe
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const config = require('../src/config');
const db = require('../src/shared/models');
const app = require('../src/app');
const { seedKavachReference } = require('../src/modules/kavach/services/kavachSeed');

const uuid = () => crypto.randomUUID();
const tokenFor = (id, role) => jwt.sign({ id, role }, config.jwt.accessSecret, { issuer: config.jwt.issuer, algorithm: 'HS256', expiresIn: '10m' });
const auth = (t) => ({ Authorization: `Bearer ${t}` });

let farmer, animal1, animal2, consent;
let farmerToken, farmer2Token, vetToken, opsToken;
let proposalUuid, policyUuid;

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
  await seedKavachReference({ region: 'HIM' });

  farmer = await db.User.create({ user_id: 'U-KVF-' + uuid().slice(0, 6), mobile: '9777700001', first_name: 'Insured' });
  await db.FarmerProfile.create({ farmer_id: farmer.id, profile_uuid: uuid() });
  animal1 = await db.DairyAnimal.create({ animal_uuid: uuid(), farmer_id: farmer.id, species: 'CATTLE', tag_number: 'A1' });
  animal2 = await db.DairyAnimal.create({ animal_uuid: uuid(), farmer_id: farmer.id, species: 'CATTLE', tag_number: 'A2' });
  consent = await db.ConsentRecord.create({ consent_uuid: uuid(), farmer_id: farmer.id, consent_type: 'insurance', consent_version: 'v1', accepted: true, accepted_at: new Date() });
  farmerToken = tokenFor(farmer.user_id, 'FARMER');

  const farmer2 = await db.User.create({ user_id: 'U-KVF2-' + uuid().slice(0, 6), mobile: '9777700002', first_name: 'Other' });
  await db.FarmerProfile.create({ farmer_id: farmer2.id, profile_uuid: uuid() });
  farmer2Token = tokenFor(farmer2.user_id, 'FARMER');

  const vet = await db.User.create({ user_id: 'U-VET-' + uuid().slice(0, 6), mobile: '9777700003', first_name: 'Vet' });
  vetToken = tokenFor(vet.user_id, 'VET');
  opsToken = tokenFor('U-OPS', 'INSURER_OPS');
});
afterAll(async () => { await db.sequelize.close(); });

describe('1. Full enrolment lifecycle', () => {
  test('quote reflects NLM cattle 3yr Himalayan', async () => {
    const res = await request(app).post('/api/v1/kavach/quote').set(auth(farmerToken)).send({ planCode: 'NLM-CATTLE-3YR-UK', marketValue: 50000 });
    expect(res.status).toBe(200);
    expect(res.body.data.premiumTotal).toBe(5750);   // 11.5%
    expect(res.body.data.farmerShare).toBe(862.5);   // 15%
  });

  test('farmer drafts a proposal', async () => {
    const res = await request(app).post('/api/v1/kavach/proposals').set(auth(farmerToken))
      .send({ planCode: 'NLM-CATTLE-3YR-UK', assetRefId: animal1.id, marketValue: 50000, consentRecordId: consent.id });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('DRAFT');
    proposalUuid = res.body.data.proposalUuid;
  });

  test('tag → examine → value → pay → issue', async () => {
    await request(app).post(`/api/v1/kavach/proposals/${proposalUuid}/tag`).set(auth(farmerToken))
      .send({ tagUid: '360000000111', ownerPhotoUrl: 'https://s3/o.jpg', tagPhotoUrl: 'https://s3/t.jpg' }).expect(200);
    await request(app).post(`/api/v1/kavach/proposals/${proposalUuid}/examine`).set(auth(vetToken)).expect(200);
    await request(app).post(`/api/v1/kavach/proposals/${proposalUuid}/value`).set(auth(vetToken)).send({}).expect(200);
    await request(app).post(`/api/v1/kavach/proposals/${proposalUuid}/pay`).set(auth(opsToken)).send({ viaKcc: false }).expect(200);
    const issued = await request(app).post(`/api/v1/kavach/proposals/${proposalUuid}/issue`).set(auth(opsToken)).send({});
    expect(issued.status).toBe(201);
    expect(issued.body.data.status).toBe('active');
    expect(issued.body.data.waitingUntil).toBeDefined();
    policyUuid = issued.body.data.policyUuid;
  });

  test('policy detail: asset with tag + 3-row premium ledger', async () => {
    const res = await request(app).get(`/api/v1/kavach/policies/${policyUuid}`).set(auth(farmerToken));
    expect(res.status).toBe(200);
    expect(res.body.data.assets[0].tag_uid).toBe('360000000111');
    expect(res.body.data.assets[0].asset_ref_id).toBe(animal1.id);
    const ledger = res.body.data.premiumLedger;
    expect(ledger).toHaveLength(3);
    const farmerEntry = ledger.find((l) => l.entry_type === 'farmer_debit');
    expect(Number(farmerEntry.amount)).toBe(862.5);
    expect(Number(ledger.find((l) => l.entry_type === 'subsidy_central').amount)).toBe(4398.75); // 90% of 4887.5
  });
});

describe('2. Protection snapshot + covered badges', () => {
  test('policies/me → 1 of 2 covered', async () => {
    const res = await request(app).get('/api/v1/kavach/policies/me').set(auth(farmerToken));
    expect(res.body.data.snapshot.animalsCovered).toBe(1);
    expect(res.body.data.snapshot.animalsTotal).toBe(2);
    expect(res.body.data.snapshot.label).toBe('1 of 2 covered');
  });

  test('assets/me marks the insured animal covered', async () => {
    const res = await request(app).get('/api/v1/kavach/assets/me').set(auth(farmerToken));
    const a1 = res.body.data.find((a) => a.animalId === animal1.id);
    const a2 = res.body.data.find((a) => a.animalId === animal2.id);
    expect(a1.covered).toBe(true);
    expect(a2.covered).toBe(false);
    // Covered animal carries its policy uuid so the registry can deep-link to the vault.
    expect(a1.coverPolicyUuid).toBe(policyUuid);
    expect(a2.coverPolicyUuid).toBeNull();
  });
});

describe('3. Guards', () => {
  test('a farmer cannot examine (role separation)', async () => {
    // fresh proposal in DRAFT
    const mk = await request(app).post('/api/v1/kavach/proposals').set(auth(farmerToken))
      .send({ planCode: 'NLM-CATTLE-3YR-UK', assetRefId: animal2.id, marketValue: 40000, consentRecordId: consent.id });
    const pu = mk.body.data.proposalUuid;
    await request(app).post(`/api/v1/kavach/proposals/${pu}/tag`).set(auth(farmerToken))
      .send({ tagUid: '360000000222', ownerPhotoUrl: 'https://s3/o.jpg', tagPhotoUrl: 'https://s3/t.jpg' }).expect(200);
    // FARMER token hits roleCheck('VET') → 403
    await request(app).post(`/api/v1/kavach/proposals/${pu}/examine`).set(auth(farmerToken)).expect(403);

    // another farmer cannot tag/read this proposal
    const mk2 = await request(app).post('/api/v1/kavach/proposals').set(auth(farmerToken))
      .send({ planCode: 'NLM-CATTLE-3YR-UK', marketValue: 30000, consentRecordId: consent.id });
    const forbidden = await request(app).post(`/api/v1/kavach/proposals/${mk2.body.data.proposalUuid}/tag`).set(auth(farmer2Token))
      .send({ tagUid: '360000000333', ownerPhotoUrl: 'https://s3/o.jpg', tagPhotoUrl: 'https://s3/t.jpg' });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.errorCode).toBe('KAVACH_PROPOSAL_FORBIDDEN');
  });

  test('payment requires a recorded consent', async () => {
    // A farmer with NO insurance consent — so the proposal cannot auto-link one,
    // and payment must be refused (createProposal auto-links a live consent when present).
    const noConsent = await db.User.create({ user_id: 'U-NC-' + uuid().slice(0, 6), mobile: '9777700009', first_name: 'NoConsent' });
    await db.FarmerProfile.create({ farmer_id: noConsent.id, profile_uuid: uuid() });
    const ncToken = tokenFor(noConsent.user_id, 'FARMER');

    const mk = await request(app).post('/api/v1/kavach/proposals').set(auth(ncToken))
      .send({ planCode: 'NLM-CATTLE-3YR-UK', marketValue: 45000 }); // no consentRecordId + no live consent
    const pu = mk.body.data.proposalUuid;
    await request(app).post(`/api/v1/kavach/proposals/${pu}/tag`).set(auth(ncToken))
      .send({ tagUid: '360000000444', ownerPhotoUrl: 'https://s3/o.jpg', tagPhotoUrl: 'https://s3/t.jpg' }).expect(200);
    await request(app).post(`/api/v1/kavach/proposals/${pu}/examine`).set(auth(vetToken)).expect(200);
    await request(app).post(`/api/v1/kavach/proposals/${pu}/value`).set(auth(vetToken)).send({}).expect(200);
    const pay = await request(app).post(`/api/v1/kavach/proposals/${pu}/pay`).set(auth(opsToken)).send({});
    expect(pay.status).toBe(400);
    expect(pay.body.errorCode).toBe('KAVACH_CONSENT_REQUIRED');
  });

  test('a proposal auto-links the farmer’s recorded insurance consent', async () => {
    // The main farmer HAS an insurance consent (beforeAll) → a no-consentId proposal links it.
    const mk = await request(app).post('/api/v1/kavach/proposals').set(auth(farmerToken))
      .send({ planCode: 'NLM-CATTLE-3YR-UK', marketValue: 40000 });
    const proposal = await db.InsuranceProposal.findOne({ where: { proposal_uuid: mk.body.data.proposalUuid } });
    expect(proposal.consent_record_id).toBe(consent.id);
  });

  test('a tag already insured is refused (identity dedupe)', async () => {
    const mk = await request(app).post('/api/v1/kavach/proposals').set(auth(farmerToken))
      .send({ planCode: 'NLM-CATTLE-3YR-UK', marketValue: 45000, consentRecordId: consent.id });
    const dup = await request(app).post(`/api/v1/kavach/proposals/${mk.body.data.proposalUuid}/tag`).set(auth(farmerToken))
      .send({ tagUid: '360000000111', ownerPhotoUrl: 'https://s3/o.jpg', tagPhotoUrl: 'https://s3/t.jpg' }); // already on the issued policy
    expect(dup.status).toBe(409);
    expect(dup.body.errorCode).toBe('KAVACH_TAG_DUPLICATE');
  });
});
