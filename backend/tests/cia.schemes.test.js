/**
 * CIA frontend entry-flow prep — multiple concurrent schemes + per-scheme eligibility.
 *   1. listSchemes : all active schemes, each with rules + a best-effort per-scheme
 *      likelyEligible (null for a non-member).
 *   2. checkEligibility : scheme-scoped, with structured checks[] (ticks, not a sentence).
 *   3. getSchemeDetail : one scheme by version; unknown → 404.
 */
process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || 'mock';
const crypto = require('crypto');
const db = require('../src/shared/models');
const app = require('../src/modules/cattle_induction/services/applicationService');
const schemeConfig = require('../src/modules/cattle_induction/services/schemeConfigService');

const uuid = () => crypto.randomUUID();
let farmerClaim; let strangerClaim;
const req = (claim, query = {}) => ({ user: { id: claim, role: 'FARMER' }, body: {}, query, params: {} });

beforeAll(async () => {
  await db.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await db.sequelize.sync({ force: true });
  const u = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile: '9000000001', first_name: 'F1001', is_active: true });
  await db.CoopMembership.create({ membership_uuid: uuid(), farmer_ref: 'F1001', society_ref: 'SOC-RANCHI-014', link_status: 'LINKED', user_id: u.id, joined_on: '2021-06-12' });
  farmerClaim = u.user_id;
  strangerClaim = (await db.User.create({ user_id: 'U-STR-' + uuid().slice(0, 6), mobile: '9000000099', first_name: 'Stranger', is_active: true })).user_id; // no membership
  // Two concurrently-published schemes with different thresholds.
  await schemeConfig.publishConfig({ schemeVersion: 'SCH_A', title: 'Scheme A', rulesJson: { subsidyPct: 50, minMembershipMonths: 12, minAvgMonthlyMilkValue: 1 }, docChecklist: [{ key: 'aadhaar', label: 'Aadhaar', required: 'MANDATORY' }] }, {});
  await schemeConfig.publishConfig({ schemeVersion: 'SCH_B', title: 'Scheme B', rulesJson: { subsidyPct: 60, minMembershipMonths: 600, minAvgMonthlyMilkValue: 9999999 }, docChecklist: [] }, {});
});
afterAll(async () => { await db.sequelize.close(); });

describe('1. list multiple schemes', () => {
  test('returns all active schemes with rules + per-scheme likelyEligible', async () => {
    const list = await app.listSchemes(req(farmerClaim));
    expect(list.length).toBe(2);
    const a = list.find((s) => s.schemeVersion === 'SCH_A');
    const b = list.find((s) => s.schemeVersion === 'SCH_B');
    expect(a.rules.subsidyPct).toBe(50);
    expect(a.likelyEligible).toBe(true);   // meets A's low thresholds
    expect(b.likelyEligible).toBe(false);  // fails B's high thresholds
  });

  test('a non-member gets the schemes with likelyEligible null', async () => {
    const list = await app.listSchemes(req(strangerClaim));
    expect(list.length).toBe(2);
    expect(list.every((s) => s.likelyEligible === null)).toBe(true);
  });
});

describe('2. eligibility is per-scheme with structured checks', () => {
  test('eligible for SCH_A — membership check ticks, advisory only', async () => {
    const r = await app.checkEligibility(req(farmerClaim, { scheme: 'SCH_A' }));
    expect(r.schemeVersion).toBe('SCH_A');
    expect(r.likelyEligible).toBe(true);
    expect(r.advisory).toBe(true);
    expect(r.checks.find((c) => c.key === 'membership').ok).toBe(true);
  });

  test('not eligible for SCH_B — checks + reasons explain why', async () => {
    const r = await app.checkEligibility(req(farmerClaim, { scheme: 'SCH_B' }));
    expect(r.likelyEligible).toBe(false);
    expect(r.checks.find((c) => c.key === 'membership').ok).toBe(false);
    expect(r.checks.find((c) => c.key === 'milk').ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/600/);
  });
});

describe('3. scheme detail by version', () => {
  test('returns one scheme; an unknown version 404s', async () => {
    const d = await app.getSchemeDetail({ params: { schemeVersion: 'SCH_A' } });
    expect(d.title).toBe('Scheme A');
    expect(d.documentChecklist.length).toBe(1);
    await expect(app.getSchemeDetail({ params: { schemeVersion: 'NOPE' } }))
      .rejects.toMatchObject({ errorCode: 'CIA_SCHEME_UNKNOWN', statusCode: 404 });
  });
});
