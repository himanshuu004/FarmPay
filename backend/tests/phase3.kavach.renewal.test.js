/**
 * Phase-3 KAVACH renewal engine (§7.4).
 *   1. sweep upserts journeys for policies entering the lead window (only)
 *   2. reminders fan out + increment the count
 *   3. one-tap renew CLONES policy + assets (zero re-doc), re-prices premium
 *   4. opt-in auto-renew fires on due date; overdue non-opt-ins lapse
 *   5. HTTP: farmer renews own policy; another farmer is forbidden; opt-out
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const config = require('../src/config');
const db = require('../src/shared/models');
const app = require('../src/app');
const { seedKavachReference } = require('../src/modules/kavach/services/kavachSeed');
const renewal = require('../src/modules/kavach/services/renewalService');
const { runRenewalSweepJob } = require('../src/jobs/renewalSweepJob');

const uuid = () => crypto.randomUUID();
const tokenFor = (id, role) => jwt.sign({ id, role }, config.jwt.accessSecret, { issuer: config.jwt.issuer, algorithm: 'HS256', expiresIn: '10m' });
const auth = (t) => ({ Authorization: `Bearer ${t}` });

let farmer, farmer2, farmerToken, farmer2Token, planId;
let tagSeq = 360000000000;

const makePolicy = async (farmerId, endDate, { tag, financed = false } = {}) => {
  const policy = await db.InsurancePolicy.create({
    policy_uuid: uuid(), farmer_id: farmerId, plan_id: planId,
    sum_insured: 50000, premium_total: 5750, premium_farmer: 862.5,
    start_date: '2023-07-20', end_date: endDate, waiting_until: '2023-08-10',
    status: 'active', premium_debit_confirmed: true, financed_on_kcc: financed,
  });
  await db.PolicyAsset.create({ policy_id: policy.id, species: 'CATTLE', valuation: 50000, tag_uid: tag || String(++tagSeq) });
  return policy;
};

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
  await seedKavachReference({ region: 'HIM' });
  farmer = await db.User.create({ user_id: 'U-RNF-' + uuid().slice(0, 6), mobile: '9666600001', first_name: 'Renew' });
  await db.FarmerProfile.create({ farmer_id: farmer.id, profile_uuid: uuid() });
  farmerToken = tokenFor(farmer.user_id, 'FARMER');
  farmer2 = await db.User.create({ user_id: 'U-RNF2-' + uuid().slice(0, 6), mobile: '9666600002', first_name: 'Other' });
  farmer2Token = tokenFor(farmer2.user_id, 'FARMER');
  planId = (await db.InsurancePlan.findOne({ where: { plan_code: 'NLM-CATTLE-3YR-UK' } })).id;
});
afterAll(async () => { await db.sequelize.close(); });

describe('1. Sweep + reminders', () => {
  test('sweep creates a journey only for policies in the lead window', async () => {
    const asOf = new Date('2026-07-15');
    await makePolicy(farmer.id, '2026-07-25'); // within 30 days
    await makePolicy(farmer.id, '2026-12-01'); // far out
    const res = await renewal.sweep(asOf);
    expect(res.created).toBe(1);
    const journeys = await db.RenewalJourney.findAll();
    expect(journeys).toHaveLength(1);
    expect(journeys[0].status).toBe('pending');
  });

  test('reminders fan out and increment the count', async () => {
    const asOf = new Date('2026-07-15');
    const r = await renewal.sendDueReminders(asOf, 'whatsapp');
    expect(r.sent).toBe(1);
    const j = await db.RenewalJourney.findOne();
    expect(j.status).toBe('reminded');
    expect(j.reminder_count).toBe(1);
    expect(j.channel_last).toBe('whatsapp');
    // Same-day re-run does not double-remind.
    expect((await renewal.sendDueReminders(asOf, 'whatsapp')).sent).toBe(0);
  });
});

describe('2. One-tap renew clones the policy', () => {
  test('renew clones assets, re-prices premium, links the journey', async () => {
    const old = await makePolicy(farmer.id, '2026-08-10', { tag: '360000000999' });
    const { newPolicy } = await renewal.renew(old.policy_uuid, { ownerFarmerId: farmer.id });

    expect(newPolicy.status).toBe('active');
    expect(newPolicy.start_date).toBe('2026-08-10');        // seamless continuation from old.end_date
    expect(newPolicy.end_date).toBe('2029-08-10');          // + 36 months
    expect(Number(newPolicy.premium_farmer)).toBe(862.5);   // re-priced via the engine
    expect(newPolicy.transferred_from_policy_id).toBe(old.id);

    // Asset cloned (same tag, same animal linkage) — zero re-documentation.
    const newAssets = await db.PolicyAsset.findAll({ where: { policy_id: newPolicy.id } });
    expect(newAssets).toHaveLength(1);
    expect(newAssets[0].tag_uid).toBe('360000000999');

    // 3-row premium ledger on the new policy.
    expect(await db.PremiumLedger.count({ where: { policy_id: newPolicy.id } })).toBe(3);

    // Journey closed as renewed.
    const j = await db.RenewalJourney.findOne({ where: { policy_id: old.id } });
    expect(j.status).toBe('renewed');
    expect(j.renewed_policy_id).toBe(newPolicy.id);
  });
});

describe('3. Auto-renew (opt-in) and lapse', () => {
  test('opted-in journey auto-renews on due date; a non-opt-in overdue lapses', async () => {
    const asOf = new Date('2026-09-01');

    // A: opted-in, due today → auto-renews.
    const a = await makePolicy(farmer.id, '2026-09-01', { tag: '360000000777' });
    const ja = await db.RenewalJourney.create({ journey_uuid: uuid(), policy_id: a.id, farmer_id: farmer.id, due_date: '2026-09-01', status: 'pending', auto_renew_opt_in: true });

    // B: not opted-in, already overdue → lapses.
    const b = await makePolicy(farmer.id, '2026-08-20', { tag: '360000000888' });
    await db.RenewalJourney.create({ journey_uuid: uuid(), policy_id: b.id, farmer_id: farmer.id, due_date: '2026-08-20', status: 'reminded' });

    const summary = await runRenewalSweepJob(asOf);
    expect(summary.renewed).toBe(1);            // only the opted-in journey auto-renews
    expect(summary.lapsed).toBeGreaterThanOrEqual(1); // B (+ any other past-due non-opt-in)

    await ja.reload();
    expect(ja.status).toBe('renewed');
    await b.reload();
    expect(b.status).toBe('lapsed');
  });
});

describe('4. HTTP renew guards + opt-out', () => {
  test('farmer renews own policy; another farmer is forbidden', async () => {
    const p = await makePolicy(farmer.id, '2026-07-28', { tag: '360000000555' });
    const forbidden = await request(app).post(`/api/v1/kavach/renewals/${p.policy_uuid}/renew`).set(auth(farmer2Token));
    expect(forbidden.status).toBe(403);
    const ok = await request(app).post(`/api/v1/kavach/renewals/${p.policy_uuid}/renew`).set(auth(farmerToken));
    expect(ok.status).toBe(201);
    expect(ok.body.data.status).toBe('active');
  });

  test('opt-out closes the journey', async () => {
    const p = await makePolicy(farmer.id, '2026-07-26', { tag: '360000000666' });
    await renewal.sweep(new Date('2026-07-15'));
    const j = await db.RenewalJourney.findOne({ where: { policy_id: p.id } });
    const res = await request(app).post(`/api/v1/kavach/renewals/${j.journey_uuid}/opt-out`).set(auth(farmerToken));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('opted_out');
  });
});
