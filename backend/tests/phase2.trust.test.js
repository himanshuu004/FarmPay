/**
 * Phase-2 P2-5 TRUST tests — the co-op formality-evidence pillar.
 *   1. A linked member with milk history + receivables scores well, ESTABLISHED+
 *   2. A non-member scores THIN with a join-society reason code
 *   3. GET /api/v1/kcc/eligibility surfaces the trust score + reason codes
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const config = require('../src/config');
const db = require('../src/shared/models');
const app = require('../src/app');
const policySvc = require('../src/modules/coop/services/coopPolicyService');
const trust = require('../src/modules/trust/services/trustService');

const uuid = () => crypto.randomUUID();
const tokenFor = (id) => jwt.sign({ id, role: 'FARMER' }, config.jwt.accessSecret, { issuer: config.jwt.issuer, algorithm: 'HS256', expiresIn: '10m' });

let memberId, memberToken, strangerToken;

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
  await policySvc.ensureDefaultPolicy();

  const member = await db.User.create({ user_id: 'U-TM-' + uuid().slice(0, 6), mobile: '9111100001', first_name: 'Member' });
  await db.FarmerProfile.create({ farmer_id: member.id, profile_uuid: uuid() });
  await db.CoopMembership.create({ membership_uuid: uuid(), farmer_ref: 'F7001', society_ref: 'SOC-Z', user_id: member.id, link_status: 'LINKED' });
  // 4 consecutive months of supply + outstanding payables.
  for (const [period, asOf] of [['2026-03', '2026-04-01'], ['2026-04', '2026-05-01'], ['2026-05', '2026-06-01'], ['2026-06', '2026-07-01']]) {
    await db.CoopMilkSnapshot.create({ snapshot_uuid: uuid(), farmer_ref: 'F7001', society_ref: 'SOC-Z', period, litres: 180, value: 6500, outstanding: 4200, as_of_date: asOf, source_mode: 'filedrop' });
  }
  memberId = member.id;
  memberToken = tokenFor(member.user_id);

  const stranger = await db.User.create({ user_id: 'U-TS-' + uuid().slice(0, 6), mobile: '9111100002', first_name: 'Stranger' });
  await db.FarmerProfile.create({ farmer_id: stranger.id, profile_uuid: uuid() });
  strangerToken = tokenFor(stranger.user_id);
});
afterAll(async () => { await db.sequelize.close(); });

test('linked member with history + receivables scores ESTABLISHED or better', async () => {
  const result = await trust.computeScore(memberId);
  expect(result.evidence.outstandingPayables).toBe(4200);
  expect(result.score).toBeGreaterThanOrEqual(600);
  expect(['ESTABLISHED', 'STRONG']).toContain(result.band);
  const codes = result.reasonCodes.map((r) => r.code);
  expect(codes).toEqual(expect.arrayContaining(['COOP_LINKED', 'COOP_RECEIVABLES']));
  expect(result.pillarsPending).toContain('INSURANCE'); // Phase 3
});

test('non-member scores THIN with a not-linked reason code', async () => {
  const stranger = await db.User.findOne({ where: { first_name: 'Stranger' } });
  const result = await trust.computeScore(stranger.id);
  expect(result.score).toBe(0);
  expect(result.band).toBe('THIN');
  expect(result.reasonCodes.map((r) => r.code)).toContain('COOP_NOT_LINKED');
});

test('GET /api/v1/kcc/eligibility surfaces trust + reason codes', async () => {
  const res = await request(app).get('/api/v1/kcc/eligibility').set('Authorization', `Bearer ${memberToken}`);
  expect(res.status).toBe(200);
  expect(res.body.data.trust.band).toBeDefined();
  expect(res.body.data.trust.reasonCodes.length).toBeGreaterThan(0);
  expect(res.body.data.collateralFreeCeiling).toBe(200000);

  const strangerRes = await request(app).get('/api/v1/kcc/eligibility').set('Authorization', `Bearer ${strangerToken}`);
  expect(strangerRes.body.data.trust.band).toBe('THIN');
});
