/**
 * Phase-3 field roles (P3-6).
 *   1. Field task queue drives the claim: intimate → surveyor VERIFY_LOSS →
 *      SURVEY_DONE → vet POSTMORTEM → PM_DONE + ₹125 honorarium
 *   2. POSP commission escrow: accrue on POSP-channel issue → T+15 → escrow chain
 *   3. Grievance: file (15-day clock) → transitions; ageing escalates overdue
 *   4. Role separation on the field queue
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const config = require('../src/config');
const db = require('../src/shared/models');
const app = require('../src/app');
const { seedKavachReference } = require('../src/modules/kavach/services/kavachSeed');
const proposalService = require('../src/modules/kavach/services/proposalService');
const commissionService = require('../src/modules/kavach/services/commissionService');
const { runGrievanceAgeingJob } = require('../src/jobs/grievanceAgeingJob');

const uuid = () => crypto.randomUUID();
const tokenFor = (id, role) => jwt.sign({ id, role }, config.jwt.accessSecret, { issuer: config.jwt.issuer, algorithm: 'HS256', expiresIn: '10m' });
const auth = (t) => ({ Authorization: `Bearer ${t}` });

let farmer, surveyor, vet, ops, posp, planId, consentId;
let farmerToken, surveyorToken, vetToken, opsToken, pospToken;

const makeActivePolicy = async () => {
  const p = await db.InsurancePolicy.create({ policy_uuid: uuid(), farmer_id: farmer.id, plan_id: planId, sum_insured: 50000, premium_total: 5750, premium_farmer: 862.5, waiting_until: '2026-01-01', status: 'active' });
  await db.PolicyAsset.create({ policy_id: p.id, species: 'CATTLE', valuation: 50000, tag_uid: String(360000000000 + p.id) });
  return p;
};

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
  await seedKavachReference({ region: 'HIM' });
  farmer = await db.User.create({ user_id: 'U-FF-' + uuid().slice(0, 6), mobile: '9333300031', first_name: 'F' });
  await db.FarmerProfile.create({ farmer_id: farmer.id, profile_uuid: uuid() });
  consentId = (await db.ConsentRecord.create({ consent_uuid: uuid(), farmer_id: farmer.id, consent_type: 'insurance', consent_version: 'v1', accepted: true, accepted_at: new Date() })).id;
  surveyor = await db.User.create({ user_id: 'U-SVY-' + uuid().slice(0, 6), mobile: '9333300032', first_name: 'S' });
  vet = await db.User.create({ user_id: 'U-VET3-' + uuid().slice(0, 6), mobile: '9333300033', first_name: 'V' });
  posp = await db.User.create({ user_id: 'U-POSP-' + uuid().slice(0, 6), mobile: '9333300034', first_name: 'P' });
  farmerToken = tokenFor(farmer.user_id, 'FARMER');
  surveyorToken = tokenFor(surveyor.user_id, 'SURVEYOR');
  vetToken = tokenFor(vet.user_id, 'VET');
  opsToken = tokenFor('U-OPS3', 'INSURER_OPS');
  pospToken = tokenFor(posp.user_id, 'POSP');
  planId = (await db.InsurancePlan.findOne({ where: { plan_code: 'NLM-CATTLE-3YR-UK' } })).id;
});
afterAll(async () => { await db.sequelize.close(); });

describe('1. Field task queue → claim + honorarium', () => {
  test('surveyor and vet file from the field; PM accrues ₹125', async () => {
    const policy = await makeActivePolicy();
    const intim = await request(app).post('/api/v1/claims').set(auth(farmerToken)).send({ policyUuid: policy.policy_uuid, peril: 'disease' });
    expect(intim.status).toBe(201);
    const claimUuid = intim.body.data.claimUuid;

    // Surveyor sees the auto-created VERIFY_LOSS task.
    const q1 = await request(app).get('/api/v1/claims/field/tasks').set(auth(surveyorToken));
    expect(q1.status).toBe(200);
    const verify = q1.body.data.find((t) => t.task_type === 'VERIFY_LOSS');
    expect(verify).toBeTruthy();

    await request(app).post(`/api/v1/claims/field/tasks/${verify.task_uuid}/submit`).set(auth(surveyorToken)).send({ report: { lossConfirmed: true } }).expect(200);
    // Claim advanced to SURVEY_DONE; a POSTMORTEM task now exists for the vet.
    const q2 = await request(app).get('/api/v1/claims/field/tasks').set(auth(vetToken));
    const pm = q2.body.data.find((t) => t.task_type === 'POSTMORTEM');
    expect(pm).toBeTruthy();

    await request(app).post(`/api/v1/claims/field/tasks/${pm.task_uuid}/submit`).set(auth(vetToken)).send({ report: { cause: 'disease' } }).expect(200);

    const claim = await db.ClaimCase.findOne({ where: { claim_uuid: claimUuid } });
    expect(claim.status).toBe('PM_DONE');

    // The vet's ₹125 honorarium is on the ledger.
    const led = await request(app).get('/api/v1/claims/field/honorarium').set(auth(vetToken));
    expect(led.status).toBe(200);
    expect(led.body.data.totals.accrued).toBe(125);
  });

  test('a farmer cannot read the field task queue', async () => {
    const res = await request(app).get('/api/v1/claims/field/tasks').set(auth(farmerToken));
    expect(res.status).toBe(403);
  });

  test('a surveyor cannot file a POSTMORTEM (statutory: VCI vet only)', async () => {
    const policy = await makeActivePolicy();
    const intim = await request(app).post('/api/v1/claims').set(auth(farmerToken)).send({ policyUuid: policy.policy_uuid, peril: 'accident' });
    const cUuid = intim.body.data.claimUuid;
    // Surveyor files the loss survey → a POSTMORTEM task opens.
    const q = await request(app).get('/api/v1/claims/field/tasks').set(auth(surveyorToken));
    const verify = q.body.data.find((t) => t.task_type === 'VERIFY_LOSS' && t.claim_id);
    // find the one for THIS claim
    const claim = await db.ClaimCase.findOne({ where: { claim_uuid: cUuid } });
    const vTask = (await db.SurveyorTask.findOne({ where: { claim_id: claim.id, task_type: 'VERIFY_LOSS' } }));
    await request(app).post(`/api/v1/claims/field/tasks/${vTask.task_uuid}/submit`).set(auth(surveyorToken)).send({ report: {} }).expect(200);
    const pmTask = await db.SurveyorTask.findOne({ where: { claim_id: claim.id, task_type: 'POSTMORTEM' } });

    // A SURVEYOR submitting the POSTMORTEM is refused.
    const bad = await request(app).post(`/api/v1/claims/field/tasks/${pmTask.task_uuid}/submit`).set(auth(surveyorToken)).send({ report: {} });
    expect(bad.status).toBe(403);
    expect(bad.body.errorCode).toBe('FIELD_TASK_ROLE_MISMATCH');
    // The VET can.
    await request(app).post(`/api/v1/claims/field/tasks/${pmTask.task_uuid}/submit`).set(auth(vetToken)).send({ report: {} }).expect(200);
  });
});

describe('2. POSP commission escrow', () => {
  test('a POSP-channel issue accrues commission with a T+15 payout', async () => {
    const proposal = await db.InsuranceProposal.create({
      proposal_uuid: uuid(), farmer_id: farmer.id, plan_id: planId, asset_type: 'dairy_animal',
      channel: 'posp', posp_id: posp.id, species: 'CATTLE', sum_insured: 50000, premium_total: 5750,
      premium_farmer: 862.5, consent_record_id: consentId, status: 'PAID',
    });
    await proposalService.issue(proposal.proposal_uuid, {}, { actorRole: 'OPS' });

    const list = await request(app).get('/api/v1/kavach/commissions/me').set(auth(pospToken));
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBe(1);
    const c = list.body.data[0];
    expect(Number(c.amount)).toBe(43.13); // 5% of 862.50
    expect(c.state).toBe('accrued');
    expect(c.payout_due_date).toBeTruthy();
  });

  test('escrow chain accrued→escrow_held→qc_passed→released→paid; POSP cannot advance', async () => {
    const commissions = await commissionService.listForPosp(posp.id);
    const cu = commissions[0].commission_uuid;

    // POSP is not allowed to advance the escrow.
    const forbidden = await request(app).post(`/api/v1/kavach/commissions/${cu}/advance`).set(auth(pospToken)).send({ toState: 'released' });
    expect(forbidden.status).toBe(403);

    // INSURER_OPS walks the escrow.
    for (const toState of ['escrow_held', 'qc_passed', 'released', 'paid']) {
      const res = await request(app).post(`/api/v1/kavach/commissions/${cu}/advance`).set(auth(opsToken)).send({ toState });
      expect(res.status).toBe(200);
      expect(res.body.data.state).toBe(toState);
    }
    // An illegal jump is refused.
    await expect(commissionService.advance(cu, 'accrued')).rejects.toThrow(/Illegal/);
  });
});

describe('3. Grievance + disposal clock', () => {
  test('file → transitions; ageing escalates an overdue ticket', async () => {
    const filed = await request(app).post('/api/v1/grievances').set(auth(farmerToken)).send({ category: 'claim_delay', priority: 'high' });
    expect(filed.status).toBe(201);
    const tu = filed.body.data.ticketUuid;
    expect(filed.body.data.disposalDueAt).toBeTruthy();

    await request(app).post(`/api/v1/grievances/${tu}/transition`).set(auth(opsToken)).send({ toStatus: 'ack' }).expect(200);
    await request(app).post(`/api/v1/grievances/${tu}/transition`).set(auth(opsToken)).send({ toStatus: 'in_progress' }).expect(200);
    const resolved = await request(app).post(`/api/v1/grievances/${tu}/transition`).set(auth(opsToken)).send({ toStatus: 'resolved', note: 'settled' });
    expect(resolved.body.data.status).toBe('resolved');

    // An overdue open ticket escalates on the ageing job.
    await db.GrievanceTicket.create({ ticket_uuid: uuid(), farmer_id: farmer.id, category: 'tag', channel_filed: 'app', status: 'open', filed_at: new Date('2026-06-01'), disposal_due_at: new Date('2026-06-16') });
    const res = await runGrievanceAgeingJob(new Date('2026-07-15'));
    expect(res.escalated).toBeGreaterThanOrEqual(1);
  });
});
