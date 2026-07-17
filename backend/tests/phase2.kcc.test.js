/**
 * Phase-2 DB-backed KCC tests.
 *   1. Calculator reproduces the RBI illustrations from SEEDED catalog + SoF
 *   2. Units resolve LIVE from the livestock register (never a typed count)
 *   3. Origination persists facility + 6-year schedule; collateral-free flag
 *   4. SoF-pending activity is gated out of KCC (¶16(2))
 */
const crypto = require('crypto');
const db = require('../src/shared/models');
const { seedKccReference } = require('../src/modules/kcc/services/kccSeed');
const kcc = require('../src/modules/kcc/services/kccLimitService');

const uuid = () => crypto.randomUUID();

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
  await seedKccReference();
});
afterAll(async () => { await db.sequelize.close(); });

describe('1. Calculator reproduces illustrations from seeded data', () => {
  test('dairy (2 units) → MPL(6) ₹29,956', async () => {
    const r = await kcc.calculate({ stateCode: 'UK', activities: [{ code: 'DAIRY', units: 2 }] });
    expect(r.mpl).toEqual([18600, 20460, 22506, 24757, 27233, 29956]);
    expect(r.cmpl).toBe(29956);
  });
  test('fishery (1 acre) + investment → CMPL ₹6,25,981', async () => {
    const r = await kcc.calculate({
      stateCode: 'UK', activities: [{ code: 'FISHERY', units: 1 }],
      investmentItems: [{ item: 'HARVESTER', amount: 150000 }, { item: 'POND', amount: 50000 }],
    });
    expect(r.mplFinal).toBe(425981);
    expect(r.cmpl).toBe(625981);
  });
});

describe('2. Units live from the register', () => {
  test('dairy units = count of animals in the farmer’s herd', async () => {
    const user = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile: '9444400001', first_name: 'Herder' });
    await db.FarmerProfile.create({ farmer_id: user.id, profile_uuid: uuid() });
    const herd = await db.DairyHerdRegister.create({ register_uuid: uuid(), farmer_id: user.id, register_name: 'Shed' });
    await db.DairyAnimal.create({ animal_uuid: uuid(), farmer_id: user.id, herd_register_id: herd.id, animal_identification_number: '360000000001' });
    await db.DairyAnimal.create({ animal_uuid: uuid(), farmer_id: user.id, herd_register_id: herd.id, animal_identification_number: '360000000002' });

    // No explicit units → resolved from register (2 animals) → same as illustration 1B.
    const r = await kcc.calculate({ farmerId: user.id, activities: [{ code: 'DAIRY' }] });
    expect(r.yearly[0].wcActivities[0].units).toBe(2);
    expect(r.mplFinal).toBe(29956);
  });
});

describe('3. Origination persists facility + schedule', () => {
  test('facility carries CMPL, sub-limits, collateral-free flag, and 6 schedule rows', async () => {
    const user = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile: '9444400002', first_name: 'Applicant' });
    await db.FarmerProfile.create({ farmer_id: user.id, profile_uuid: uuid() });
    await db.CoopMembership.create({ membership_uuid: uuid(), farmer_ref: 'F-A2', society_ref: 'SOC-A', user_id: user.id, link_status: 'LINKED' });

    const { facility } = await kcc.originateFacility({ farmerId: user.id, activities: [{ code: 'DAIRY', units: 2 }] });
    expect(Number(facility.cmpl)).toBe(29956);
    expect(Number(facility.st_sublimit)).toBe(29956);
    expect(facility.status).toBe('DRAFT');
    expect(facility.collateral_free).toBe(true); // ≤ ₹2 lakh

    const rows = await db.KccLimitSchedule.findAll({ where: { facility_id: facility.id }, order: [['year_index', 'ASC']] });
    expect(rows.length).toBe(6);
    expect(Number(rows[5].mpl)).toBe(29956);

    // Domain event emitted (outbox).
    const ev = await db.DomainEvent.findOne({ where: { aggregate_type: 'KccFacility', event_type: 'kcc.facility.computed' } });
    expect(ev).not.toBeNull();
  });
});

describe('4. Catalog gates non-notified activities', () => {
  test('an activity flagged SoF-pending is outside KCC (¶16(2))', async () => {
    await db.ActivityCatalog.create({ code: 'DUCKERY', name: 'Duck rearing', category: 'ANIMAL_HUSBANDRY', unit_type: 'BIRD', insurance_scheme: 'PRIVATE_STATE', kcc_ready: false });
    await expect(kcc.calculate({ activities: [{ code: 'DUCKERY', units: 5 }] }))
      .rejects.toThrow(/outside KCC/);
  });
});
