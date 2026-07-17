/**
 * Cross-phase integration — proves the P0 → P1 → P2 workflow seams connect and
 * are green in ONE end-to-end flow (not just per-phase in isolation):
 *
 *   P0 filedrop ingest ─▶ P1 coop mirror + membership link ─▶ P1 passbook/70%
 *        └─ P0 livestock register ─▶ P2 Limit Engine units (live)
 *        └─ P1 milk payables ─▶ P2 drawing-power (¶16(4)) + TRUST pillar
 *        └─ P2 renewal pack surfaces the same co-op receivables
 *
 * The key seam under test is the drawing-power milk pull: buildSnapshot is called
 * with NO explicit milkReceivables, so it must resolve them through
 * facility.farmer_id → CoopMembership.user_id → CoopMilkSnapshot (the filedropped
 * outstanding). That path is otherwise unexercised.
 */
const crypto = require('crypto');
const db = require('../src/shared/models');
const { ingestFile } = require('../src/modules/coop/services/erpSyncService');
const membershipService = require('../src/modules/coop/services/membershipService');
const passbookService = require('../src/modules/coop/services/passbookService');
const { seedKccReference } = require('../src/modules/kcc/services/kccSeed');
const kcc = require('../src/modules/kcc/services/kccLimitService');
const origination = require('../src/modules/kcc/services/kccOriginationService');
const drawingPower = require('../src/modules/kcc/services/kccDrawingPowerService');
const trust = require('../src/modules/trust/services/trustService');
const renewalPack = require('../src/modules/kcc/services/renewalPackService');

const uuid = () => crypto.randomUUID();
const OUTSTANDING = 10000; // below the ST sub-limit so drawing power == the pulled value

let user, facilityUuid;

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
  await seedKccReference();

  // ── P0: the farmer + a 2-animal herd register (units live from here) ──
  user = await db.User.create({ user_id: 'U-INT-' + uuid().slice(0, 6), mobile: '+919000077777', first_name: 'Integration' });
  await db.FarmerProfile.create({ farmer_id: user.id, profile_uuid: uuid() });
  const herd = await db.DairyHerdRegister.create({ register_uuid: uuid(), farmer_id: user.id, register_name: 'Shed' });
  await db.DairyAnimal.create({ animal_uuid: uuid(), farmer_id: user.id, herd_register_id: herd.id, animal_identification_number: '360000077701' });
  await db.DairyAnimal.create({ animal_uuid: uuid(), farmer_id: user.id, herd_register_id: herd.id, animal_identification_number: '360000077702' });
});
afterAll(async () => { await db.sequelize.close(); });

describe('P0 filedrop → P1 mirror + link → passbook', () => {
  test('member master + milk summary ingest, then a verified link', async () => {
    // P0/P1 filedrop: member master (mobile matches the user) + milk summary.
    const memberCsv = ['farmer_ref,society_ref,member_name,mobile', 'F-INT,SOC-I,Integration,9000077777'].join('\n');
    const milkCsv = ['farmer_ref,society_ref,period,litres,value,outstanding,as_of_date', `F-INT,SOC-I,2026-06,200,7200,${OUTSTANDING},2026-07-04`].join('\n');
    expect((await ingestFile({ fileName: 'MEMBER_MASTER_1.csv', kind: 'MEMBER_MASTER', buffer: Buffer.from(memberCsv) })).status).toBe('APPLIED');
    expect((await ingestFile({ fileName: 'MILK_SUMMARY_1.csv', kind: 'MILK_SUMMARY', buffer: Buffer.from(milkCsv) })).status).toBe('APPLIED');

    // P1 link — verified against the filedropped mobile (the Phase-1 auth fix).
    const membership = await membershipService.linkUser(user.id, 'F-INT', { callerMobile: user.mobile });
    expect(membership.link_status).toBe('LINKED');

    // P1 passbook reflects the filedropped payables + 70% meter.
    const pb = await passbookService.getPassbook('F-INT', 'SOC-I');
    expect(pb.outstandingPayables).toBe(OUTSTANDING);
    expect(pb.availableOrderLimit).toBe(0.70 * OUTSTANDING); // 7000
  });
});

describe('P0 register → P2 engine; P1 payables → P2 drawing-power + TRUST', () => {
  test('units resolve live from the herd register (P0 → P2)', async () => {
    const { facility, result } = await kcc.originateFacility({ farmerId: user.id, activities: [{ code: 'DAIRY' }] }); // no units → from register
    expect(result.yearly[0].wcActivities[0].units).toBe(2); // 2 animals
    expect(Number(facility.cmpl)).toBe(29956);
    facilityUuid = facility.facility_uuid;
    // walk to SANCTIONED so drawdowns/DP are meaningful (society-certified first)
    await origination.submit(facilityUuid);
    await origination.certify(facilityUuid, { membershipRef: 'F-INT', tieup: true });
    await origination.beginReview(facilityUuid);
    await origination.forwardToBank(facilityUuid);
    await origination.sanction(facilityUuid);
  });

  test('drawing-power PULLS the filedropped milk payables (P1 → P2, ¶16(4))', async () => {
    // No explicit milkReceivables → must resolve via membership → milk snapshot.
    const snap = await drawingPower.buildSnapshot(facilityUuid, { stocksValue: 0 });
    expect(Number(snap.milk_receivables)).toBe(OUTSTANDING);   // the pull worked
    expect(Number(snap.drawing_power)).toBe(OUTSTANDING);      // 10000 < ST cap 29956
  });

  test('TRUST co-op pillar reflects the same payables (P1 → P2)', async () => {
    const score = await trust.computeScore(user.id);
    expect(score.evidence.outstandingPayables).toBe(OUTSTANDING);
    expect(score.reasonCodes.map((r) => r.code)).toContain('COOP_RECEIVABLES');
  });

  test('renewal pack surfaces the pulled co-op receivables (P2 banker interface)', async () => {
    const pack = await renewalPack.buildPack(facilityUuid);
    expect(pack.drawingPower.milkReceivables).toBe(OUTSTANDING);
    expect(pack.facility.cmpl).toBe(29956);
  });
});
