/**
 * Whole-Phase-3 integration — one farmer's animal, end to end across every slice:
 *
 *   KAVACH enrol (POSP channel, vet exam ₹50) → policy issued (+commission)
 *     → identity muzzle enrolled (shadow)
 *     → animal dies → CLAIMS intimate → field task flow (surveyor → vet PM ₹125)
 *       → 4 docs → muzzle match (advisory, claim untouched) → ops settle
 *     → policy claimed · hash chain clean · honorarium ₹175 · commission paid
 *     → grievance filed + resolved
 *
 * Proves the P3-1..P3-6 seams connect in a single flow.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const config = require('../src/config');
const db = require('../src/shared/models');
const app = require('../src/app');
const { seedKavachReference } = require('../src/modules/kavach/services/kavachSeed');
const biometric = require('../src/modules/identity/services/biometricService');
const commissionService = require('../src/modules/kavach/services/commissionService');

const uuid = () => crypto.randomUUID();
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const tokenFor = (id, role) => jwt.sign({ id, role }, config.jwt.accessSecret, { issuer: config.jwt.issuer, algorithm: 'HS256', expiresIn: '10m' });
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const MUZZLE = [1, 0, 0, 0, 0, 0, 0, 0];

let farmer, vet, surveyor, ops, posp, animal, insConsent, bioConsent, planCode;
let farmerT, vetT, surveyorT, opsT, pospT;
let proposalUuid, policyUuid, policyDbId, claimUuid;

beforeAll(async () => {
  await db.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await db.sequelize.sync({ force: true });
  await seedKavachReference({ region: 'HIM' });
  planCode = 'NLM-CATTLE-3YR-UK';

  farmer = await db.User.create({ user_id: 'U-INTF-' + uuid().slice(0, 6), mobile: '9222200041', first_name: 'Asha' });
  await db.FarmerProfile.create({ farmer_id: farmer.id, profile_uuid: uuid() });
  animal = await db.DairyAnimal.create({ animal_uuid: uuid(), farmer_id: farmer.id, species: 'CATTLE', tag_number: 'INT-1' });
  insConsent = (await db.ConsentRecord.create({ consent_uuid: uuid(), farmer_id: farmer.id, consent_type: 'insurance', consent_version: 'v1', accepted: true, accepted_at: new Date() })).id;
  bioConsent = (await db.ConsentRecord.create({ consent_uuid: uuid(), farmer_id: farmer.id, consent_type: 'biometric', consent_version: 'v1', accepted: true, accepted_at: new Date() })).id;
  vet = await db.User.create({ user_id: 'U-INTV-' + uuid().slice(0, 6), mobile: '9222200042', first_name: 'Vet' });
  surveyor = await db.User.create({ user_id: 'U-INTS-' + uuid().slice(0, 6), mobile: '9222200043', first_name: 'Surv' });
  posp = await db.User.create({ user_id: 'U-INTP-' + uuid().slice(0, 6), mobile: '9222200044', first_name: 'Posp' });
  farmerT = tokenFor(farmer.user_id, 'FARMER'); vetT = tokenFor(vet.user_id, 'VET');
  surveyorT = tokenFor(surveyor.user_id, 'SURVEYOR'); opsT = tokenFor('U-INTOPS', 'INSURER_OPS');
  pospT = tokenFor(posp.user_id, 'POSP');
});
afterAll(async () => { await db.sequelize.close(); });

describe('A. Enrol → policy (KAVACH + POSP commission + vet honorarium)', () => {
  test('full enrolment via a POSP channel issues an active policy', async () => {
    const mk = await request(app).post('/api/v1/kavach/proposals').set(auth(farmerT))
      .send({ planCode, assetRefId: animal.id, marketValue: 50000, channel: 'posp', pospId: posp.id, consentRecordId: insConsent });
    proposalUuid = mk.body.data.proposalUuid;
    expect(mk.status).toBe(201);

    await request(app).post(`/api/v1/kavach/proposals/${proposalUuid}/tag`).set(auth(farmerT))
      .send({ tagUid: '360000009001', ownerPhotoUrl: 'https://s3/o.jpg', tagPhotoUrl: 'https://s3/t.jpg' }).expect(200);
    await request(app).post(`/api/v1/kavach/proposals/${proposalUuid}/examine`).set(auth(vetT)).expect(200); // ₹50 honorarium
    await request(app).post(`/api/v1/kavach/proposals/${proposalUuid}/value`).set(auth(vetT)).send({}).expect(200);
    await request(app).post(`/api/v1/kavach/proposals/${proposalUuid}/pay`).set(auth(opsT)).send({ viaKcc: false }).expect(200);
    const issued = await request(app).post(`/api/v1/kavach/proposals/${proposalUuid}/issue`).set(auth(opsT)).send({});
    expect(issued.status).toBe(201);
    policyUuid = issued.body.data.policyUuid;
    const policy = await db.InsurancePolicy.findOne({ where: { policy_uuid: policyUuid } });
    policyDbId = policy.id;
    expect(policy.status).toBe('active');

    // POSP commission accrued; vet enrol-exam honorarium accrued.
    expect(await db.CommissionLedger.count({ where: { posp_id: posp.id, state: 'accrued' } })).toBe(1);
    expect(await db.VetHonorariumLedger.count({ where: { vet_id: vet.id, kind: 'ENROL_EXAM' } })).toBe(1);
  });
});

describe('B. Muzzle enrolled (identity, shadow)', () => {
  test('the insured animal gets a muzzle print', async () => {
    const res = await biometric.enrol({ farmerId: farmer.id, animalId: animal.id, tagUid: '360000009001', embedding: MUZZLE, quality: 0.95, consentRecordId: bioConsent });
    expect(res.biometric.id).toBeGreaterThan(0);
    expect(res.dedupe.flagged).toBe(false);
  });
});

describe('C. Death → field-role claim → settle', () => {
  test('claim runs through the field roles and settles; policy → claimed', async () => {
    // Waiting period elapsed (time-travel).
    await db.InsurancePolicy.update({ waiting_until: '2026-01-01' }, { where: { id: policyDbId } });

    const intim = await request(app).post('/api/v1/claims').set(auth(farmerT)).send({ policyUuid, peril: 'disease', sumClaimed: 50000 });
    claimUuid = intim.body.data.claimUuid;
    expect(intim.status).toBe(201);

    // Field flow: surveyor VERIFY_LOSS → vet POSTMORTEM (₹125).
    const claim = await db.ClaimCase.findOne({ where: { claim_uuid: claimUuid } });
    const vTask = await db.SurveyorTask.findOne({ where: { claim_id: claim.id, task_type: 'VERIFY_LOSS' } });
    await request(app).post(`/api/v1/claims/field/tasks/${vTask.task_uuid}/submit`).set(auth(surveyorT)).send({ report: {} }).expect(200);
    const pmTask = await db.SurveyorTask.findOne({ where: { claim_id: claim.id, task_type: 'POSTMORTEM' } });
    await request(app).post(`/api/v1/claims/field/tasks/${pmTask.task_uuid}/submit`).set(auth(vetT)).send({ report: { cause: 'disease' } }).expect(200);

    // Advisory muzzle match — queues, never touches the claim.
    const match = await biometric.matchForClaim({ claimUuid, embedding: MUZZLE });
    expect(match.matched).toBe(true);
    const afterMatch = await db.ClaimCase.findOne({ where: { claim_uuid: claimUuid } });
    expect(afterMatch.status).toBe('PM_DONE'); // unchanged by the match

    // 4 documents → submit → review → settle.
    for (const kind of ['DEATH_INTIMATION', 'POSTMORTEM_REPORT', 'EAR_TAG_PHOTO', 'CLAIM_FORM']) {
      await request(app).post(`/api/v1/claims/${claimUuid}/evidence`).set(auth(farmerT)).send({ kind, objectKey: `s3/${kind}`, contentHash: sha(kind + claimUuid) }).expect(201);
    }
    await request(app).post(`/api/v1/claims/${claimUuid}/submit-docs`).set(auth(farmerT)).expect(200);
    await request(app).post(`/api/v1/admin/claims/${claimUuid}/review`).set(auth(opsT)).expect(200);
    const settle = await request(app).post(`/api/v1/admin/claims/${claimUuid}/settle`).set(auth(opsT)).send({ amount: 50000 });
    expect(settle.body.data.status).toBe('SETTLED');

    // Policy claimed; hash chain clean; both honoraria on the ledger (₹50 + ₹125).
    expect((await db.InsurancePolicy.findByPk(policyDbId)).status).toBe('claimed');
    const chain = await request(app).get(`/api/v1/claims/${claimUuid}/verify`).set(auth(farmerT));
    expect(chain.body.data.ok).toBe(true);
    const honorarium = await db.VetHonorariumLedger.sum('amount', { where: { vet_id: vet.id } });
    expect(Number(honorarium)).toBe(175);
  });
});

describe('D. Commission escrow + grievance close the loop', () => {
  test('POSP commission walks to paid; a grievance is filed and resolved', async () => {
    const [c] = await commissionService.listForPosp(posp.id);
    for (const s of ['escrow_held', 'qc_passed', 'released', 'paid']) {
      await request(app).post(`/api/v1/kavach/commissions/${c.commission_uuid}/advance`).set(auth(opsT)).send({ toState: s }).expect(200);
    }
    expect((await db.CommissionLedger.findByPk(c.id)).state).toBe('paid');

    const g = await request(app).post('/api/v1/grievances').set(auth(farmerT)).send({ category: 'claim_delay', priority: 'high' });
    const tu = g.body.data.ticketUuid;
    await request(app).post(`/api/v1/grievances/${tu}/transition`).set(auth(opsT)).send({ toStatus: 'ack' }).expect(200);
    await request(app).post(`/api/v1/grievances/${tu}/transition`).set(auth(opsT)).send({ toStatus: 'in_progress' }).expect(200);
    const done = await request(app).post(`/api/v1/grievances/${tu}/transition`).set(auth(opsT)).send({ toStatus: 'resolved', note: 'settled' });
    expect(done.body.data.status).toBe('resolved');
  });
});
