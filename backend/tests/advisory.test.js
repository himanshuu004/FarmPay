/**
 * ADVISORY (dairy v1 rule packs) — deterministic generation from the livestock
 * registers: vaccination (FMD/HS/BQ), mastitis, heat stress (THI), breeding,
 * dry-off. Rules only, config-driven; the farmer disposes; idempotent re-runs.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const config = require('../src/config');
const db = require('../src/shared/models');
const app = require('../src/app');
const { seedAdvisoryReference } = require('../src/modules/advisory/services/advisorySeed');
const engine = require('../src/modules/advisory/services/advisoryEngine');
const advisoryService = require('../src/modules/advisory/services/advisoryService');

const uuid = () => crypto.randomUUID();
const tokenFor = (id, role = 'FARMER') => jwt.sign({ id, role }, config.jwt.accessSecret, { issuer: config.jwt.issuer, algorithm: 'HS256', expiresIn: '10m' });
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return iso(d); };
const daysAhead = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return iso(d); };

const mkFarmer = async (mobile) => {
  const u = await db.User.create({ user_id: 'U-ADV-' + uuid().slice(0, 6), mobile, first_name: 'Herder' });
  await db.FarmerProfile.create({ farmer_id: u.id, profile_uuid: uuid() });
  return u;
};
const mkAnimal = async (farmerId, over = {}) => {
  const herd = await db.DairyHerdRegister.create({ register_uuid: uuid(), farmer_id: farmerId, register_name: 'Shed' });
  return db.DairyAnimal.create({ animal_uuid: uuid(), farmer_id: farmerId, herd_register_id: herd.id, species: 'CATTLE', gender: 'FEMALE', tag_number: 'T-100', ...over });
};

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
  await seedAdvisoryReference();
});
afterAll(async () => { await db.sequelize.close(); });

describe('1. Rule packs seeded (config)', () => {
  test('the 7 dairy packs exist', async () => {
    const packs = await db.AdvisoryRulePack.findAll();
    const codes = packs.map((p) => p.code).sort();
    expect(codes).toEqual(['BREEDING_WINDOW', 'DRY_OFF', 'HEAT_STRESS', 'MASTITIS_WATCH', 'VAX_BQ', 'VAX_FMD', 'VAX_HS']);
  });
});

describe('2. Vaccination', () => {
  test('an animal with no vaccination record is due FMD/HS/BQ', async () => {
    const f = await mkFarmer('9666600001');
    await mkAnimal(f.id);
    await engine.generateForFarmer(f.id);
    const items = await advisoryService.listForFarmer(f.id, { category: 'VACCINATION' });
    expect(items.map((i) => i.packCode).sort()).toEqual(['VAX_BQ', 'VAX_FMD', 'VAX_HS']);
  });

  test('a recent FMD vaccination clears the FMD advisory', async () => {
    const f = await mkFarmer('9666600002');
    const a = await mkAnimal(f.id);
    await db.DairyTreatmentEvent.create({ event_uuid: uuid(), farmer_id: f.id, animal_id: a.animal_uuid, treatment_date: daysAgo(30), treatment_type: 'VACCINATION', condition: 'FMD booster' });
    await engine.generateForFarmer(f.id);
    const codes = (await advisoryService.listForFarmer(f.id, { category: 'VACCINATION' })).map((i) => i.packCode);
    expect(codes).not.toContain('VAX_FMD'); // 30d < 180d interval
    expect(codes).toContain('VAX_HS');
  });
});

describe('3. Mastitis', () => {
  test('a recent mastitis treatment raises an URGENT follow-up', async () => {
    const f = await mkFarmer('9666600003');
    const a = await mkAnimal(f.id);
    await db.DairyTreatmentEvent.create({ event_uuid: uuid(), farmer_id: f.id, animal_id: a.animal_uuid, treatment_date: daysAgo(5), treatment_type: 'MASTITIS', condition: 'clinical mastitis LF' });
    await engine.generateForFarmer(f.id);
    const m = (await advisoryService.listForFarmer(f.id, { category: 'MASTITIS' }))[0];
    expect(m.severity).toBe('URGENT');
    expect(m.evidence.trigger).toBe('recent_treatment');
  });

  test('a sharp yield drop raises a screening advisory', async () => {
    const f = await mkFarmer('9666600004');
    const a = await mkAnimal(f.id, { tag_number: 'T-DROP' });
    // baseline ~10 L, latest 6 L (40% drop) → over the 30% threshold
    await db.DairyMilkProductionLog.create({ animal_id: a.id, production_date: daysAgo(3), total_daily_milk: 10 });
    await db.DairyMilkProductionLog.create({ animal_id: a.id, production_date: daysAgo(2), total_daily_milk: 10 });
    await db.DairyMilkProductionLog.create({ animal_id: a.id, production_date: daysAgo(1), total_daily_milk: 6 });
    await engine.generateForFarmer(f.id);
    const m = (await advisoryService.listForFarmer(f.id, { category: 'MASTITIS' }))[0];
    expect(m.evidence.trigger).toBe('yield_drop');
  });
});

describe('4. Heat stress (THI, weather-supplied)', () => {
  test('high THI raises an URGENT herd-wide advisory; no weather → none', async () => {
    const f = await mkFarmer('9666600005');
    await mkAnimal(f.id);
    await engine.generateForFarmer(f.id); // no weather
    expect(await advisoryService.listForFarmer(f.id, { category: 'HEAT_STRESS' })).toHaveLength(0);

    await engine.generateForFarmer(f.id, { weather: { tempC: 38, rhPct: 70 } }); // THI ≈ 93
    const h = (await advisoryService.listForFarmer(f.id, { category: 'HEAT_STRESS' }))[0];
    expect(h.severity).toBe('URGENT');
    expect(h.animalRef).toBeNull(); // herd-wide
    expect(h.evidence.thi).toBeGreaterThanOrEqual(80);
  });
});

describe('5. Breeding + dry-off', () => {
  test('served-but-unconfirmed cow → heat-watch; confirmed-pregnant → dry-off', async () => {
    const f = await mkFarmer('9666600006');
    const a = await mkAnimal(f.id, { tag_number: 'T-BREED' });
    // Served 25 days ago, not confirmed → heat watch (due at AI+21).
    await db.DairyBreedingEvent.create({ event_uuid: uuid(), farmer_id: f.id, animal_id: a.animal_uuid, service_type: 'AI', ai_date: daysAgo(25), pregnancy_confirmed: 'PENDING' });
    await engine.generateForFarmer(f.id);
    expect((await advisoryService.listForFarmer(f.id, { category: 'BREEDING' })).length).toBeGreaterThanOrEqual(1);

    const b = await mkAnimal(f.id, { tag_number: 'T-DRY' });
    // Confirmed pregnant, calving in 30 days → dry off now (60d lead).
    await db.DairyBreedingEvent.create({ event_uuid: uuid(), farmer_id: f.id, animal_id: b.animal_uuid, service_type: 'AI', ai_date: daysAgo(240), pregnancy_confirmed: 'YES', expected_calving_date: daysAhead(30) });
    await engine.generateForFarmer(f.id);
    const dry = await advisoryService.listForFarmer(f.id, { category: 'DRY_OFF' });
    expect(dry.map((i) => i.animalLabel)).toContain('T-DRY');
  });
});

describe('6. Disposal + idempotency + HTTP', () => {
  test('farmer marks an advisory done; a re-run does not duplicate it', async () => {
    const f = await mkFarmer('9666600007');
    await mkAnimal(f.id);
    const first = await engine.generateForFarmer(f.id);
    const again = await engine.generateForFarmer(f.id);
    expect(again.created).toBe(0); // idempotent
    expect(first.created).toBeGreaterThan(0);

    const open = await advisoryService.listForFarmer(f.id);
    await advisoryService.markDone(open[0].itemUuid, f.id);
    const afterDone = await advisoryService.listForFarmer(f.id);
    expect(afterDone.find((i) => i.itemUuid === open[0].itemUuid)).toBeUndefined();
  });

  test('IDOR: another farmer cannot dispose my advisory', async () => {
    const f1 = await mkFarmer('9666600008'); await mkAnimal(f1.id);
    const f2 = await mkFarmer('9666600009');
    await engine.generateForFarmer(f1.id);
    const item = (await advisoryService.listForFarmer(f1.id))[0];
    await expect(advisoryService.markDone(item.itemUuid, f2.id)).rejects.toThrow(/not your|forbidden/i);
  });

  test('GET /advisory/feed generates + lists over HTTP', async () => {
    const f = await mkFarmer('9666600010'); await mkAnimal(f.id);
    const res = await request(app).get('/api/v1/advisory/feed').set(auth(tokenFor(f.user_id)));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty('severity');
  });
});
