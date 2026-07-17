/**
 * Phase-3 KAVACH premium engine tests — deterministic NLM math (§7.1; CLAUDE.md).
 *   1. Pure engine: farmer 15% / govt 85%, region ceilings + centre:state split
 *   2. SI floor from milk yield; CU-cap checker; ceiling caps the rate
 *   3. DB quote service: reads the seeded plan; resolves household CU from policies
 */
const crypto = require('crypto');
const db = require('../src/shared/models');
const { computeNlmPremium } = require('../src/modules/kavach/services/premiumQuoteEngine');
const { seedKavachReference } = require('../src/modules/kavach/services/kavachSeed');
const quoteService = require('../src/modules/kavach/services/kavachQuoteService');

const uuid = () => crypto.randomUUID();

describe('1. Pure NLM premium engine', () => {
  test('buffalo, SI ₹60,000, 3yr, Himalayan (Uttarakhand)', () => {
    const r = computeNlmPremium({ species: 'BUFFALO', marketValue: 60000, termMonths: 36, region: 'HIM' });
    expect(r.statutoryCeilingPct).toBe(11.5);
    expect(r.premiumTotal).toBe(6900);   // 11.5% × 60,000
    expect(r.farmerShare).toBe(1035);    // 15%
    expect(r.govtShare).toBe(5865);      // 85%
    expect(r.govtCentre).toBe(5278.5);   // 90% of govt
    expect(r.govtState).toBe(586.5);     // 10%
    expect(r.cu.total).toBe(1);
    expect(r.cu.ok).toBe(true);
    expect(r.waitingPeriodDays).toBe(21);
  });

  test('cattle, SI ₹50,000, 3yr, plains → 60:40 split', () => {
    const r = computeNlmPremium({ species: 'CATTLE', marketValue: 50000, termMonths: 36, region: 'NORMAL' });
    expect(r.premiumTotal).toBe(5500);   // 11%
    expect(r.farmerShare).toBe(825);
    expect(r.govtCentre).toBe(2805);     // 60%
    expect(r.govtState).toBe(1870);      // 40%
  });

  test('SI floor from milk yield applies when it beats market value', () => {
    const r = computeNlmPremium({ species: 'CATTLE', marketValue: 30000, milkLitresPerDay: 12, termMonths: 36, region: 'HIM' });
    expect(r.sumInsured).toBe(36000);    // 3,000/litre × 12 > 30,000
    expect(r.siFloorApplied).toBe(true);
    expect(r.premiumTotal).toBe(4140);   // 11.5% × 36,000
  });

  test('cattle-unit cap is enforced across the household', () => {
    const r = computeNlmPremium({ species: 'CATTLE', marketValue: 40000, termMonths: 36, region: 'HIM', animals: 3, existingCuUsed: 8 });
    expect(r.cu.total).toBe(11);
    expect(r.cu.ok).toBe(false);         // 11 > 10
  });

  test('plan rate is capped at the statutory ceiling; unknown term throws', () => {
    const r = computeNlmPremium({ species: 'CATTLE', marketValue: 10000, termMonths: 36, region: 'HIM', premiumRatePct: 20 });
    expect(r.premiumRatePct).toBe(11.5); // capped, never 20
    expect(() => computeNlmPremium({ species: 'CATTLE', marketValue: 10000, termMonths: 18, region: 'HIM' })).toThrow(/ceiling/);
  });
});

describe('2. DB quote service', () => {
  beforeAll(async () => {
    await db.sequelize.sync({ force: true });
    await seedKavachReference({ region: 'HIM' });
  });
  afterAll(async () => { await db.sequelize.close(); });

  test('quote reads the seeded buffalo plan', async () => {
    const q = await quoteService.quote({ planCode: 'NLM-BUFFALO-3YR-UK', marketValue: 60000 });
    expect(q.premiumTotal).toBe(6900);
    expect(q.farmerShare).toBe(1035);
    expect(q.region).toBe('HIM');
  });

  test('household CU is resolved from the farmer’s active policies', async () => {
    const user = await db.User.create({ user_id: 'U-KV-' + uuid().slice(0, 6), mobile: '9888800001', first_name: 'Insured' });
    const plan = await db.InsurancePlan.findOne({ where: { plan_code: 'NLM-CATTLE-3YR-UK' } });
    const policy = await db.InsurancePolicy.create({
      policy_uuid: uuid(), farmer_id: user.id, plan_id: plan.id,
      sum_insured: 50000, premium_total: 5500, premium_farmer: 825, status: 'active',
    });
    await db.PolicyAsset.create({ policy_id: policy.id, species: 'CATTLE', valuation: 50000, tag_uid: '360000000123' });

    const q = await quoteService.quote({ farmerId: user.id, planCode: 'NLM-CATTLE-3YR-UK', marketValue: 40000, animals: 1 });
    expect(q.cu.existing).toBe(1);       // the already-insured cow
    expect(q.cu.total).toBe(2);          // + this one
    expect(q.cu.ok).toBe(true);
  });
});
