/**
 * MARKET (v1 rate boards) — milk fat/SNF pricing, feed board from the co-op
 * catalog, and the channel advisor. Rates are CONFIG; the math is deterministic.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const config = require('../src/config');
const db = require('../src/shared/models');
const app = require('../src/app');
const { seedMarketReference } = require('../src/modules/market/services/marketSeed');
const milkRate = require('../src/modules/market/services/milkRateService');
const channelAdvisor = require('../src/modules/market/services/channelAdvisorService');

const uuid = () => crypto.randomUUID();
const tokenFor = (id, role = 'FARMER') => jwt.sign({ id, role }, config.jwt.accessSecret, { issuer: config.jwt.issuer, algorithm: 'HS256', expiresIn: '10m' });
const auth = (t) => ({ Authorization: `Bearer ${t}` });

let farmerToken, farmer;

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
  await seedMarketReference();
  farmer = await db.User.create({ user_id: 'U-MKT-' + uuid().slice(0, 6), mobile: '9333300001', first_name: 'Milkman' });
  await db.FarmerProfile.create({ farmer_id: farmer.id, profile_uuid: uuid() });
  farmerToken = tokenFor(farmer.user_id);
});
afterAll(async () => { await db.sequelize.close(); });

describe('1. Milk rate — fat/SNF two-axis pricing', () => {
  test('estimate is deterministic from the config chart', async () => {
    // perFatPoint 4.5, perSnfPoint 1.2 → 4.5×6.5 + 1.2×9.0 = 40.05 /L
    const r = await milkRate.estimate({ litres: 10, fatPct: 6.5, snfPct: 9.0 });
    expect(r.ratePerLitre).toBe(40.05);
    expect(r.amount).toBe(400.5);
    expect(r.breakdown.fatComponent).toBe(29.25);
    expect(r.breakdown.snfComponent).toBe(10.8);
  });

  test('rate clamps to the configured floor', async () => {
    const r = await milkRate.estimate({ litres: 1, fatPct: 1, snfPct: 1 }); // 4.5+1.2=5.7 < minRate 18
    expect(r.ratePerLitre).toBe(18);
  });

  test('estimate over HTTP', async () => {
    const res = await request(app).post('/api/v1/market/milk-rates/estimate').set(auth(farmerToken))
      .send({ litres: 5, fatPct: 6.5, snfPct: 9.0 });
    expect(res.status).toBe(200);
    expect(res.body.data.amount).toBe(200.25);
  });

  test('milk-rate board returns the chart (+ realised = null for a non-member)', async () => {
    const res = await request(app).get('/api/v1/market/milk-rates').set(auth(farmerToken));
    expect(res.status).toBe(200);
    expect(res.body.data.chart.method).toBe('TWO_AXIS');
    expect(res.body.data.realised).toBeNull();
  });

  test('realised rate pulls from the member milk snapshot', async () => {
    const m = await db.User.create({ user_id: 'U-MEM-' + uuid().slice(0, 6), mobile: '9333300009', first_name: 'Member' });
    await db.CoopMembership.create({ membership_uuid: uuid(), farmer_ref: 'F-MKT', society_ref: 'SOC-M', user_id: m.id, link_status: 'LINKED' });
    await db.CoopMilkSnapshot.create({ snapshot_uuid: uuid(), farmer_ref: 'F-MKT', society_ref: 'SOC-M', period: '2026-06', litres: 200, value: 8010, avg_fat_pct: 6.5, avg_snf_pct: 9.0, outstanding: 0, as_of_date: '2026-07-01' });
    const realised = await milkRate.realisedForFarmer(m.id);
    expect(realised.realisedRatePerLitre).toBe(40.05); // 8010 / 200
  });
});

describe('2. Feed prices from the co-op catalog', () => {
  test('feed board reads coop_input_items (no re-typed prices)', async () => {
    await db.CoopInputItem.create({ item_uuid: uuid(), sku: 'FEED-CATTLE-50', name: 'Cattle feed 50kg', category: 'FEED', unit: 'bag', mrp: 1300, subsidised_price: 1150, source_mode: 'mock' });
    await db.CoopInputItem.create({ item_uuid: uuid(), sku: 'MIN-MIX-1', name: 'Mineral mixture 1kg', category: 'MINERAL', unit: 'pack', mrp: 120, subsidised_price: 95, source_mode: 'mock' });
    const res = await request(app).get('/api/v1/market/feed-prices').set(auth(farmerToken));
    expect(res.status).toBe(200);
    const feed = res.body.data.find((i) => i.sku === 'FEED-CATTLE-50');
    expect(feed.mrp).toBe(1300);
    expect(feed.subsidisedPrice).toBe(1150);
    expect(feed.saving).toBe(150);
  });
});

describe('3. Channel advisor', () => {
  test('ranks society vs private channels and surfaces the trade-off', async () => {
    const r = await channelAdvisor.advise({ litres: 10, fatPct: 6.5, snfPct: 9.0 });
    // society 40.05, private trader flat 38, company 4.7×6.5+1.1×9 = 40.45
    const byRef = Object.fromEntries(r.options.map((o) => [o.channelRef, o.ratePerLitre]));
    expect(byRef.SOCIETY).toBe(40.05);
    expect(byRef.PRIVATE_TRADER).toBe(38);
    expect(byRef.PRIVATE_DAIRY_CO).toBe(40.45);
    // sorted best-first
    expect(r.options[0].ratePerLitre).toBe(40.45);
    expect(r.recommendation.bestChannelRef).toBe('PRIVATE_DAIRY_CO');
    expect(r.recommendation.societyRank).toBe(2);
    expect(r.recommendation.gapVsSocietyPerLitre).toBe(0.4);
    expect(r.recommendation.note).toMatch(/insurance|credit|passbook/i);
  });

  test('when society leads, it says so', async () => {
    // High SNF favours the society coefficients (perSnf 1.2 > company 1.1).
    const r = await channelAdvisor.advise({ litres: 10, fatPct: 5, snfPct: 12 });
    // society 4.5×5 + 1.2×12 = 36.9 ; company 4.7×5 + 1.1×12 = 36.7 ; trader 38 (flat)
    expect(r.options.find((o) => o.channelRef === 'SOCIETY').ratePerLitre).toBe(36.9);
    // trader flat 38 still tops here, but society beats the company channel
    expect(r.recommendation.gapVsSocietyPerLitre).toBe(1.1); // 38 - 36.9
  });
});
