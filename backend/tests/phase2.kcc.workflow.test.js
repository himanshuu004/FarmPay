/**
 * Phase-2 P2-4 tests — origination workflow, LT drawdown, drawing power.
 *   1. 11-state facility lifecycle walks DRAFT → … → ACTIVE with guards
 *   2. Illegal transition + wrong-authority are both rejected
 *   3. LT drawdown DRAFT→…→DISBURSED: animal enters register + insurance nudge
 *   4. Drawdown guarded against the LT sub-limit ceiling
 *   5. Drawing-power snapshot pulls milk receivables, caps at ST sub-limit
 */
const crypto = require('crypto');
const db = require('../src/shared/models');
const { seedKccReference } = require('../src/modules/kcc/services/kccSeed');
const kcc = require('../src/modules/kcc/services/kccLimitService');
const origination = require('../src/modules/kcc/services/kccOriginationService');
const drawdown = require('../src/modules/kcc/services/kccDrawdownService');
const drawingPower = require('../src/modules/kcc/services/kccDrawingPowerService');

const uuid = () => crypto.randomUUID();

const makeFarmer = async (mobile) => {
  const user = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile, first_name: 'F' });
  await db.FarmerProfile.create({ farmer_id: user.id, profile_uuid: uuid() });
  // KCC is society-mediated → the applicant must be a linked society member.
  await db.CoopMembership.create({ membership_uuid: uuid(), farmer_ref: 'F-' + user.id, society_ref: 'SOC-A', user_id: user.id, link_status: 'LINKED' });
  return user;
};

// Walk a fresh facility to a target status (test helper, not production path).
// SOCIETY_CERTIFIED is ERP-authored (certify), not a bank transition.
const walkTo = async (facilityUuid, target) => {
  const path = ['SUBMITTED', 'SOCIETY_CERTIFIED', 'UNDER_REVIEW', 'FORWARDED_TO_BANK', 'SANCTIONED', 'DISBURSED', 'ACTIVE'];
  const steps = {
    SUBMITTED: origination.submit,
    SOCIETY_CERTIFIED: (fu) => origination.certify(fu, { tieup: false }), // base ₹2L in the general walk
    UNDER_REVIEW: origination.beginReview,
    FORWARDED_TO_BANK: origination.forwardToBank, SANCTIONED: origination.sanction,
    DISBURSED: origination.disburse, ACTIVE: origination.activate,
  };
  for (const s of path) { await steps[s](facilityUuid); if (s === target) return; }
};

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
  await seedKccReference();
});
afterAll(async () => { await db.sequelize.close(); });

describe('1. Facility 11-state lifecycle', () => {
  test('walks DRAFT → SUBMITTED → … → ACTIVE and stamps sanction/review', async () => {
    const user = await makeFarmer('9555500001');
    const { facility } = await kcc.originateFacility({ farmerId: user.id, activities: [{ code: 'DAIRY', units: 2 }] });
    expect(facility.status).toBe('DRAFT');

    await origination.submit(facility.facility_uuid);
    await origination.certify(facility.facility_uuid, { tieup: false }); // ERP-authored society certification
    await origination.beginReview(facility.facility_uuid);
    await origination.forwardToBank(facility.facility_uuid);
    const sanctioned = await origination.sanction(facility.facility_uuid);
    expect(sanctioned.status).toBe('SANCTIONED');
    expect(sanctioned.sanctioned_at).not.toBeNull();
    expect(sanctioned.next_review_at).not.toBeNull();

    await origination.disburse(facility.facility_uuid);
    const active = await origination.activate(facility.facility_uuid);
    expect(active.status).toBe('ACTIVE');

    const events = await db.DomainEvent.findAll({ where: { aggregate_id: facility.facility_uuid } });
    const types = events.map((e) => e.event_type);
    expect(types).toEqual(expect.arrayContaining(['kcc.facility.submitted', 'kcc.facility.sanctioned', 'kcc.facility.active']));
  });

  test('opt-in renewal: RENEWAL_DUE → RENEWED → ACTIVE re-anchors review', async () => {
    const user = await makeFarmer('9555500002');
    const { facility } = await kcc.originateFacility({ farmerId: user.id, activities: [{ code: 'DAIRY', units: 2 }] });
    await walkTo(facility.facility_uuid, 'ACTIVE');
    await origination.markRenewalDue(facility.facility_uuid);
    const renewed = await origination.renew(facility.facility_uuid);
    expect(renewed.status).toBe('ACTIVE');
    expect(renewed.next_review_at).not.toBeNull();
  });
});

describe('2. Transition guards', () => {
  test('illegal transition is rejected', async () => {
    const user = await makeFarmer('9555500003');
    const { facility } = await kcc.originateFacility({ farmerId: user.id, activities: [{ code: 'DAIRY', units: 2 }] });
    // DRAFT → SANCTIONED is not legal.
    await expect(origination.sanction(facility.facility_uuid)).rejects.toThrow(/Illegal transition/);
  });

  test('wrong authority is forbidden (farmer cannot sanction)', async () => {
    const user = await makeFarmer('9555500004');
    const { facility } = await kcc.originateFacility({ farmerId: user.id, activities: [{ code: 'DAIRY', units: 2 }] });
    await origination.submit(facility.facility_uuid);
    await origination.certify(facility.facility_uuid, { tieup: false });
    await origination.beginReview(facility.facility_uuid);
    await origination.forwardToBank(facility.facility_uuid);
    await expect(origination.transition(facility.facility_uuid, 'SANCTIONED', { actorRole: 'FARMER' }))
      .rejects.toThrow(/may not author/);
  });
});

describe('2b. Society certification (real cooperative-bank workflow)', () => {
  test('a non-member cannot originate a society KCC', async () => {
    const user = await db.User.create({ user_id: 'U-NM-' + uuid().slice(0, 6), mobile: '9555500020', first_name: 'NonMember' });
    await db.FarmerProfile.create({ farmer_id: user.id, profile_uuid: uuid() });
    await expect(kcc.originateFacility({ farmerId: user.id, activities: [{ code: 'DAIRY', units: 2 }] }))
      .rejects.toThrow(/society/i);
  });

  test('SUBMITTED → SOCIETY_CERTIFIED (ERP) with tie-up unlocks the ₹3-lakh limit', async () => {
    const user = await makeFarmer('9555500021');
    // Big enough to be collateral-BOUND at ₹2L but collateral-FREE at ₹3L.
    const { facility } = await kcc.originateFacility({
      farmerId: user.id, activities: [{ code: 'DAIRY', units: 2 }],
      investmentItems: [{ item: 'SHED', amount: 240000 }], // cmpl 29,956 + 240,000 = 269,956
    });
    expect(Number(facility.cmpl)).toBe(269956);
    expect(facility.collateral_free).toBe(false);           // > ₹2L base
    expect(Number(facility.collateral_free_limit_applied)).toBe(200000);

    await origination.submit(facility.facility_uuid);
    const certified = await origination.certify(facility.facility_uuid, {
      membershipRef: 'F-' + user.id, milkUnionRef: 'UCDF', cattleCount: 2, milkSupply: true, dbt: true,
      bankAccountRef: 'DCCB-123', tieup: true, certifiedBy: 'DCS-Secretary',
    });
    expect(certified.status).toBe('SOCIETY_CERTIFIED');
    expect(certified.tieup_certified).toBe(true);
    expect(Number(certified.collateral_free_limit_applied)).toBe(300000);
    expect(certified.collateral_free).toBe(true);           // ≤ ₹3L tie-up

    const cert = await db.KccSocietyCertification.findOne({ where: { facility_id: facility.id } });
    expect(cert.member_certified).toBe(true);
    expect(cert.dbt_to_account_certified).toBe(true);
  });

  test('certification arrives via the ERP (KCC_CERTIFICATION filedrop)', async () => {
    const user = await makeFarmer('9555500022');
    const { facility } = await kcc.originateFacility({ farmerId: user.id, activities: [{ code: 'DAIRY', units: 2 }] });
    await origination.submit(facility.facility_uuid);
    const { ingestFile } = require('../src/modules/coop/services/erpSyncService');
    const csv = ['facility_uuid,farmer_ref,union_ref,cattle_count,milk_supply,dbt,tieup,certified_by',
      `${facility.facility_uuid},F-${user.id},UCDF,2,true,true,true,DCS-Secretary`].join('\n');
    const res = await ingestFile({ fileName: 'KCC_CERTIFICATION_1.csv', kind: 'KCC_CERTIFICATION', buffer: Buffer.from(csv) });
    expect(res.rowsApplied).toBe(1);
    const f = await db.KccFacility.findByPk(facility.id);
    expect(f.status).toBe('SOCIETY_CERTIFIED');
  });
});

describe('2c. Auto-revision when an animal is sold', () => {
  test('selling an animal recomputes a DRAFT facility down; a sanctioned one is flagged not rewritten', async () => {
    const user = await makeFarmer('9555500030');
    const herd = await db.DairyHerdRegister.create({ register_uuid: uuid(), farmer_id: user.id, register_name: 'Shed' });
    const a1 = await db.DairyAnimal.create({ animal_uuid: uuid(), farmer_id: user.id, herd_register_id: herd.id, species: 'CATTLE', status: 'ACTIVE', animal_identification_number: '360000003001' });
    await db.DairyAnimal.create({ animal_uuid: uuid(), farmer_id: user.id, herd_register_id: herd.id, species: 'CATTLE', status: 'ACTIVE', animal_identification_number: '360000003002' });

    // DRAFT facility from the 2-animal herd.
    const { facility } = await kcc.originateFacility({ farmerId: user.id, activities: [{ code: 'DAIRY' }] });
    expect(Number(facility.cmpl)).toBe(29956); // 2 CB cows (Illustration 1B)

    // Sell one animal → auto-revise the DRAFT facility down to a 1-animal limit.
    await db.DairyAnimal.update({ status: 'SOLD' }, { where: { id: a1.id } });
    const res = await kcc.recomputeForFarmer(user.id, { reason: 'ANIMAL_SOLD' });
    expect(res.revised).toBe(true);
    const draftAfter = await db.KccFacility.findByPk(facility.id);
    expect(Number(draftAfter.cmpl)).toBe(15301); // 1 cow now
    const rows = await db.KccLimitSchedule.count({ where: { facility_id: facility.id } });
    expect(rows).toBe(6); // schedule rewritten

    // A SANCTIONED facility is NOT silently rewritten — only flagged for review.
    await db.KccFacility.update({ status: 'ACTIVE', cmpl: 29956 }, { where: { id: facility.id } });
    const res2 = await kcc.recomputeForFarmer(user.id, { reason: 'ANIMAL_SOLD' });
    expect(res2.revised).toBe(false);
    const activeAfter = await db.KccFacility.findByPk(facility.id);
    expect(Number(activeAfter.cmpl)).toBe(29956); // sanctioned number untouched
    const ev = await db.DomainEvent.findOne({ where: { event_type: 'kcc.facility.revision_due', aggregate_id: facility.facility_uuid } });
    expect(ev).not.toBeNull();
  });
});

describe('3. LT drawdown → register + insurance nudge', () => {
  test('animal drawdown disburses into the herd register and nudges insurance', async () => {
    const user = await makeFarmer('9555500005');
    const { facility } = await kcc.originateFacility({
      farmerId: user.id, activities: [{ code: 'DAIRY', units: 2 }],
      investmentItems: [{ item: 'ANIMAL', amount: 60000 }],
    });
    expect(Number(facility.lt_sublimit)).toBe(60000);
    await walkTo(facility.facility_uuid, 'SANCTIONED');

    const req = await drawdown.create(facility.facility_uuid, { item: 'ANIMAL', description: 'CB cow', amount: 60000 });
    await drawdown.submit(req.request_uuid);
    await drawdown.bankApprove(req.request_uuid);
    const herdBefore = await db.DairyAnimal.count({ where: { farmer_id: user.id } });
    const { request, linkedAnimal } = await drawdown.disburse(req.request_uuid);

    expect(request.status).toBe('DISBURSED');
    expect(linkedAnimal).not.toBeNull();
    expect(request.linked_animal_id).toBe(linkedAnimal.id);
    const herdAfter = await db.DairyAnimal.count({ where: { farmer_id: user.id } });
    expect(herdAfter).toBe(herdBefore + 1);

    const nudge = await db.DomainEvent.findOne({ where: { event_type: 'kcc.drawdown.insurance_nudge', aggregate_id: req.request_uuid } });
    expect(nudge).not.toBeNull();
  });
});

describe('4. LT ceiling guard', () => {
  test('a drawdown over LT headroom is rejected', async () => {
    const user = await makeFarmer('9555500006');
    const { facility } = await kcc.originateFacility({
      farmerId: user.id, activities: [{ code: 'DAIRY', units: 2 }],
      investmentItems: [{ item: 'SHED', amount: 40000 }],
    });
    await walkTo(facility.facility_uuid, 'SANCTIONED');
    await expect(drawdown.create(facility.facility_uuid, { item: 'EQUIPMENT', description: 'Chaff cutter', amount: 50000 }))
      .rejects.toThrow(/exceeds LT headroom/);
    // Within headroom is fine.
    const ok = await drawdown.create(facility.facility_uuid, { item: 'EQUIPMENT', description: 'Chaff cutter', amount: 40000 });
    expect(ok.status).toBe('DRAFT');
  });
});

describe('5. Drawing-power snapshot', () => {
  test('pulls milk receivables and caps at the ST sub-limit', async () => {
    const user = await makeFarmer('9555500007');
    const { facility } = await kcc.originateFacility({ farmerId: user.id, activities: [{ code: 'DAIRY', units: 2 }] });
    const stCap = Number(facility.st_sublimit); // 29,956

    // Explicit receivables above the cap → drawing power clamps to ST sub-limit.
    const snap = await drawingPower.buildSnapshot(facility.facility_uuid, { stocksValue: 20000, milkReceivables: 50000 });
    expect(Number(snap.drawing_power)).toBe(stCap);
    expect(Number(snap.milk_receivables)).toBe(50000);

    // Below the cap → drawing power is the raw sum.
    const snap2 = await drawingPower.buildSnapshot(facility.facility_uuid, { stocksValue: 5000, milkReceivables: 3000, otherReceivables: 1000 });
    expect(Number(snap2.drawing_power)).toBe(9000);

    const latest = await drawingPower.latest(facility.facility_uuid);
    expect(Number(latest.drawing_power)).toBe(9000);
  });
});
