/**
 * Phase-3 CLAIMS + SLA — the safety-critical spine.
 *   1. Full lifecycle intimate→survey→pm→docs→review→settle; policy → claimed
 *   2. Hash-chain: verifies clean; raw tamper is detected; model blocks writes
 *   3. SLA: 12% p.a. COMPOUND penal interest accrues on breach; idempotent tick
 *   4. 4-doc checklist gates submit; unknown/duplicate evidence refused
 *   5. Waiting period blocks intimation; decisions are human-only (no auto)
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const config = require('../src/config');
const db = require('../src/shared/models');
const app = require('../src/app');
const { seedKavachReference } = require('../src/modules/kavach/services/kavachSeed');
const claimEvents = require('../src/modules/claims/services/claimEventService');
const slaClock = require('../src/modules/claims/services/slaClockService');
const claimService = require('../src/modules/claims/services/claimService');
const evidenceService = require('../src/modules/claims/services/evidenceService');
const { runSlaClockTickJob } = require('../src/jobs/slaClockTickJob');
const { REQUIRED_CLAIM_DOCS } = require('../src/modules/claims/constants/claimDocs');

const uuid = () => crypto.randomUUID();
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const tokenFor = (id, role) => jwt.sign({ id, role }, config.jwt.accessSecret, { issuer: config.jwt.issuer, algorithm: 'HS256', expiresIn: '10m' });
const auth = (t) => ({ Authorization: `Bearer ${t}` });

let farmer, farmerToken, surveyorToken, vetToken, opsToken, planId;

const makeActivePolicy = async (farmerId, { waitingUntil = '2026-01-01' } = {}) => {
  const policy = await db.InsurancePolicy.create({
    policy_uuid: uuid(), farmer_id: farmerId, plan_id: planId,
    sum_insured: 50000, premium_total: 5750, premium_farmer: 862.5,
    start_date: '2025-12-01', end_date: '2028-12-01', waiting_until: waitingUntil, status: 'active', premium_debit_confirmed: true,
  });
  await db.PolicyAsset.create({ policy_id: policy.id, species: 'CATTLE', valuation: 50000, tag_uid: String(360000000000 + policy.id) });
  return policy;
};

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
  await seedKavachReference({ region: 'HIM' });
  farmer = await db.User.create({ user_id: 'U-CLF-' + uuid().slice(0, 6), mobile: '9555500011', first_name: 'Claimant' });
  await db.FarmerProfile.create({ farmer_id: farmer.id, profile_uuid: uuid() });
  farmerToken = tokenFor(farmer.user_id, 'FARMER');
  const surveyor = await db.User.create({ user_id: 'U-SUR-' + uuid().slice(0, 6), mobile: '9555500012', first_name: 'Surveyor' });
  surveyorToken = tokenFor(surveyor.user_id, 'SURVEYOR');
  const vet = await db.User.create({ user_id: 'U-VET2-' + uuid().slice(0, 6), mobile: '9555500013', first_name: 'Vet' });
  vetToken = tokenFor(vet.user_id, 'VET');
  opsToken = tokenFor('U-OPS2', 'INSURER_OPS');
  planId = (await db.InsurancePlan.findOne({ where: { plan_code: 'NLM-CATTLE-3YR-UK' } })).id;
});
afterAll(async () => { await db.sequelize.close(); });

const addAllDocs = async (claimUuid) => {
  for (const kind of REQUIRED_CLAIM_DOCS) {
    await request(app).post(`/api/v1/claims/${claimUuid}/evidence`).set(auth(farmerToken))
      .send({ kind, objectKey: `s3/${kind}`, contentHash: sha(kind + claimUuid) }).expect(201);
  }
};

describe('1. Full lifecycle + hash chain', () => {
  let claimUuid;
  test('intimate → survey → pm → docs → review → settle', async () => {
    const policy = await makeActivePolicy(farmer.id);
    const intim = await request(app).post('/api/v1/claims').set(auth(farmerToken)).send({ policyUuid: policy.policy_uuid, peril: 'disease', sumClaimed: 50000 });
    expect(intim.status).toBe(201);
    claimUuid = intim.body.data.claimUuid;

    await request(app).post(`/api/v1/claims/field/${claimUuid}/survey`).set(auth(surveyorToken)).send({ report: { ok: true } }).expect(200);
    await request(app).post(`/api/v1/claims/field/${claimUuid}/postmortem`).set(auth(vetToken)).send({ report: { cause: 'disease' } }).expect(200);
    await addAllDocs(claimUuid);
    const docs = await request(app).post(`/api/v1/claims/${claimUuid}/submit-docs`).set(auth(farmerToken));
    expect(docs.status).toBe(200);
    expect(docs.body.data.status).toBe('DOCS_SUBMITTED');
    await request(app).post(`/api/v1/admin/claims/${claimUuid}/review`).set(auth(opsToken)).expect(200);
    const settle = await request(app).post(`/api/v1/admin/claims/${claimUuid}/settle`).set(auth(opsToken)).send({ amount: 50000 });
    expect(settle.status).toBe(200);
    expect(settle.body.data.status).toBe('SETTLED');
    expect(settle.body.data.settledAmount).toBe(50000);

    // Policy is now claimed.
    const policyAfter = await db.InsurancePolicy.findByPk(policy.id);
    expect(policyAfter.status).toBe('claimed');
  });

  test('event chain verifies clean', async () => {
    const res = await request(app).get(`/api/v1/claims/${claimUuid}/verify`).set(auth(farmerToken));
    expect(res.status).toBe(200);
    expect(res.body.data.ok).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(6); // intimated..settled + 4 evidence
  });

  test('raw out-of-band tamper breaks the chain; the model blocks writes', async () => {
    const claim = await claimService.find(claimUuid);
    const ev = await db.ClaimEvent.findOne({ where: { claim_id: claim.id }, order: [['id', 'ASC']] });

    // Model-level guards: instance + bulk update/delete are refused.
    await expect(ev.update({ payload: { x: 1 } })).rejects.toThrow(/append-only/);
    await expect(db.ClaimEvent.update({ payload: { x: 1 } }, { where: { id: ev.id } })).rejects.toThrow(/append-only/);
    await expect(db.ClaimEvent.destroy({ where: { id: ev.id } })).rejects.toThrow(/append-only/);

    // A raw SQL tamper (bypassing the ORM) is caught by the hash chain.
    await db.sequelize.query('UPDATE claim_events SET payload = :p WHERE id = :id', { replacements: { p: JSON.stringify({ tampered: true }), id: ev.id } });
    const check = await claimEvents.verifyChain(claim.id);
    expect(check.ok).toBe(false);
    expect(check.brokenAt).toBe(ev.id);
  });
});

describe('2. SLA penal interest (12% p.a. compound)', () => {
  test('12% compound over a year ≈ 12.75% (beats simple 12%)', () => {
    const deadline = new Date('2026-01-01');
    const asOf = new Date('2027-01-01'); // 365 days
    const penal = slaClock.penalInterest(100000, deadline, asOf);
    expect(penal).toBeGreaterThan(12700);  // compound > simple 12,000
    expect(penal).toBeLessThan(12800);
  });

  test('tick accrues on a breached claim, escalates, and is idempotent', async () => {
    const policy = await makeActivePolicy(farmer.id);
    // A claim already at DOCS_SUBMITTED with the settlement deadline 10 days ago.
    const claim = await db.ClaimCase.create({
      claim_uuid: uuid(), policy_id: policy.id, farmer_id: farmer.id, claim_type: 'livestock_death',
      intimated_at: new Date('2026-06-01'), sum_claimed: 50000, status: 'DOCS_SUBMITTED',
      docs_complete_at: new Date('2026-06-20'), stage_deadline_at: new Date('2026-07-05'),
    });
    const asOf = new Date('2026-07-15'); // 10 days overdue
    const expected = slaClock.penalInterest(50000, claim.stage_deadline_at, asOf);
    expect(expected).toBeGreaterThan(0);

    const res = await runSlaClockTickJob(asOf);
    expect(res.breached).toBeGreaterThanOrEqual(1);
    await claim.reload();
    expect(Number(claim.penal_interest_accrued)).toBeCloseTo(expected, 2);
    expect(claim.escalated).toBe(true);

    // Idempotent: a second tick at the same asOf does not double-count.
    await runSlaClockTickJob(asOf);
    await claim.reload();
    expect(Number(claim.penal_interest_accrued)).toBeCloseTo(expected, 2);
  });

  test('a within-deadline claim accrues nothing', async () => {
    const policy = await makeActivePolicy(farmer.id);
    const claim = await db.ClaimCase.create({
      claim_uuid: uuid(), policy_id: policy.id, farmer_id: farmer.id, claim_type: 'livestock_death',
      intimated_at: new Date('2026-07-10'), sum_claimed: 50000, status: 'DOCS_SUBMITTED',
      docs_complete_at: new Date('2026-07-10'), stage_deadline_at: new Date('2026-07-25'),
    });
    await runSlaClockTickJob(new Date('2026-07-15'));
    await claim.reload();
    expect(Number(claim.penal_interest_accrued)).toBe(0);
    expect(claim.escalated).toBe(false);
  });
});

describe('3. Guards: 4-doc gate, waiting period, human-only decisions', () => {
  test('submit is blocked until all four documents are present', async () => {
    const policy = await makeActivePolicy(farmer.id);
    const intim = await request(app).post('/api/v1/claims').set(auth(farmerToken)).send({ policyUuid: policy.policy_uuid, peril: 'accident' });
    const cu = intim.body.data.claimUuid;
    await request(app).post(`/api/v1/claims/field/${cu}/survey`).set(auth(surveyorToken)).send({ report: {} }).expect(200);
    await request(app).post(`/api/v1/claims/field/${cu}/postmortem`).set(auth(vetToken)).send({ report: {} }).expect(200);
    // Only 3 of 4 docs.
    for (const kind of REQUIRED_CLAIM_DOCS.slice(0, 3)) {
      await request(app).post(`/api/v1/claims/${cu}/evidence`).set(auth(farmerToken)).send({ kind, objectKey: `s3/${kind}`, contentHash: sha(kind + cu) }).expect(201);
    }
    const incomplete = await request(app).post(`/api/v1/claims/${cu}/submit-docs`).set(auth(farmerToken));
    expect(incomplete.status).toBe(400);
    expect(incomplete.body.errorCode).toBe('CLAIMS_DOCS_INCOMPLETE');

    // A duplicate kind is refused (one doc per kind).
    const dup = await request(app).post(`/api/v1/claims/${cu}/evidence`).set(auth(farmerToken)).send({ kind: REQUIRED_CLAIM_DOCS[0], objectKey: 's3/x', contentHash: sha('x' + cu) });
    expect(dup.status).toBe(409);
  });

  test('intimation is blocked during the 21-day waiting period', async () => {
    const policy = await makeActivePolicy(farmer.id, { waitingUntil: '2099-01-01' });
    const res = await request(app).post('/api/v1/claims').set(auth(farmerToken)).send({ policyUuid: policy.policy_uuid, peril: 'disease' });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('CLAIMS_WITHIN_WAITING');
  });

  test('a farmer cannot settle (decisions are human INSURER_OPS only)', async () => {
    const policy = await makeActivePolicy(farmer.id);
    const intim = await request(app).post('/api/v1/claims').set(auth(farmerToken)).send({ policyUuid: policy.policy_uuid });
    // Farmer hitting the admin settle route → roleCheck 403.
    const res = await request(app).post(`/api/v1/admin/claims/${intim.body.data.claimUuid}/settle`).set(auth(farmerToken)).send({ amount: 1000 });
    expect(res.status).toBe(403);
  });
});

describe('4. Audit hardening', () => {
  test('the chain cannot fork: (claim_id, prev_hash) is unique', async () => {
    const policy = await makeActivePolicy(farmer.id);
    const claim = await claimService.intimate({ farmerId: farmer.id, policyUuid: policy.policy_uuid, sumClaimed: 50000 });
    const genesis = await db.ClaimEvent.findOne({ where: { claim_id: claim.id }, order: [['id', 'ASC']] });
    // A second event linking to the same prev_hash on the same claim is refused.
    await expect(db.ClaimEvent.create({
      claim_id: claim.id, event_type: 'forged', actor_role: 'system', payload: {},
      prev_hash: genesis.prev_hash, event_hash: 'f'.repeat(64), hashed_at: new Date(),
    })).rejects.toThrow();
  });

  test('a second open claim on the same policy is refused', async () => {
    const policy = await makeActivePolicy(farmer.id);
    await claimService.intimate({ farmerId: farmer.id, policyUuid: policy.policy_uuid, sumClaimed: 50000 });
    await expect(claimService.intimate({ farmerId: farmer.id, policyUuid: policy.policy_uuid, sumClaimed: 50000 }))
      .rejects.toThrow(/open claim already/);
  });

  test('evidence cannot be added to a settled/rejected claim', async () => {
    const policy = await makeActivePolicy(farmer.id);
    const claim = await db.ClaimCase.create({
      claim_uuid: uuid(), policy_id: policy.id, farmer_id: farmer.id, claim_type: 'livestock_death',
      intimated_at: new Date(), sum_claimed: 50000, status: 'SETTLED',
    });
    await expect(evidenceService.addEvidence(claim, { kind: 'CLAIM_FORM', objectKey: 's3/x', contentHash: sha('x') }))
      .rejects.toThrow(/SETTLED claim/);
  });
});
