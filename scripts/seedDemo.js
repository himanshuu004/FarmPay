/**
 * seedDemo — provisions ONE demo farmer with a known login and representative
 * data across every module, so the app screens show real content on first open.
 *
 *   Login:  mobile 9000000001   MPIN 4926
 *
 * Idempotent: re-running refreshes reference seeds + advisories and leaves the
 * demo farmer's data in place. Run against the dev DB:
 *   NODE_ENV=development node scripts/seedDemo.js
 */
const crypto = require('crypto');
const db = require('../backend/src/shared/models');
const { hashPassword } = require('../backend/src/shared/utils/encryptionHelper');
const { seedKccReference } = require('../backend/src/modules/kcc/services/kccSeed');
const { seedKavachReference } = require('../backend/src/modules/kavach/services/kavachSeed');
const { seedMarketReference } = require('../backend/src/modules/market/services/marketSeed');
const { seedAdvisoryReference } = require('../backend/src/modules/advisory/services/advisorySeed');
const kccLimit = require('../backend/src/modules/kcc/services/kccLimitService');
const origination = require('../backend/src/modules/kcc/services/kccOriginationService');
const drawingPower = require('../backend/src/modules/kcc/services/kccDrawingPowerService');
const advisoryEngine = require('../backend/src/modules/advisory/services/advisoryEngine');

const uuid = () => crypto.randomUUID();
const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return iso(d); };
const daysAhead = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return iso(d); };

const MOBILE = '+919000000001';

(async () => {
  await db.testConnection();

  // ── Reference config (idempotent) ──
  await seedKccReference();
  await seedKavachReference({ region: 'HIM' });
  await seedMarketReference();
  await seedAdvisoryReference();

  // ── Demo farmer (upsert) ──
  let user = await db.User.findOne({ where: { mobile: MOBILE } });
  if (!user) {
    user = await db.User.create({
      user_id: 'U-DEMO-0001', mobile: MOBILE, first_name: 'Ramesh', last_name: 'Rawat',
      mpin_hash: await hashPassword('4926'), is_active: true, is_mobile_verified: true,
    });
    console.log('  created demo user');
  } else {
    await user.update({ mpin_hash: await hashPassword('4926'), is_active: true, is_mobile_verified: true });
    console.log('  demo user exists — MPIN reset to 1234');
  }
  await db.FarmerProfile.findOrCreate({ where: { farmer_id: user.id }, defaults: { profile_uuid: uuid() } });

  const already = await db.DairyAnimal.count({ where: { farmer_id: user.id } });
  if (already === 0) {
    // ── Herd + animals ──
    const herd = await db.DairyHerdRegister.create({ register_uuid: uuid(), farmer_id: user.id, register_name: 'Rawat dairy shed' });
    const mk = (over) => db.DairyAnimal.create({ animal_uuid: uuid(), farmer_id: user.id, herd_register_id: herd.id, species: 'CATTLE', gender: 'FEMALE', ...over });
    const a1 = await mk({ name: 'Gauri', breed: 'Cross-bred', tag_number: '360000000101', animal_identification_number: '360000000101', current_market_value: 45000 });
    const a2 = await mk({ name: 'Kamdhenu', breed: 'Cross-bred', tag_number: '360000000102', animal_identification_number: '360000000102', current_market_value: 42000 });
    await mk({ name: 'Ganga', species: 'BUFFALO', breed: 'Murrah', tag_number: '360000000103', animal_identification_number: '360000000103', current_market_value: 60000 });

    // ── Milk logs (last 10 days) — Gauri drops sharply on the last day (mastitis signal) ──
    for (let i = 10; i >= 1; i--) {
      const drop = i === 1 ? 6.0 : 10.0;
      await db.DairyMilkProductionLog.create({ animal_id: a1.id, production_date: daysAgo(i), morning_milk_liters: drop / 2, evening_milk_liters: drop / 2, total_daily_milk: drop, milk_sold_liters: drop, milk_price_per_liter: 40 });
      await db.DairyMilkProductionLog.create({ animal_id: a2.id, production_date: daysAgo(i), morning_milk_liters: 4.5, evening_milk_liters: 4.5, total_daily_milk: 9.0, milk_sold_liters: 9.0, milk_price_per_liter: 40 });
    }

    // ── A recent treatment + a breeding event (drives advisories) ──
    await db.DairyTreatmentEvent.create({ event_uuid: uuid(), farmer_id: user.id, animal_id: a1.animal_uuid, treatment_date: daysAgo(4), treatment_type: 'MASTITIS', condition: 'Clinical mastitis LF quarter' });
    await db.DairyBreedingEvent.create({ event_uuid: uuid(), farmer_id: user.id, animal_id: a2.animal_uuid, service_type: 'AI', ai_date: daysAgo(230), pregnancy_confirmed: 'YES', expected_calving_date: daysAhead(35) });
    console.log('  seeded herd (3 animals) + milk logs + treatment + breeding');

    // ── Co-op wedge: membership + passbook snapshot + feed catalog ──
    await db.CoopMembership.create({ membership_uuid: uuid(), farmer_ref: 'F-DEMO', society_ref: 'SOC-DEMO', user_id: user.id, link_status: 'LINKED' });
    await db.CoopMilkSnapshot.create({ snapshot_uuid: uuid(), farmer_ref: 'F-DEMO', society_ref: 'SOC-DEMO', period: iso(new Date()).slice(0, 7), litres: 540, value: 21600, avg_fat_pct: 6.5, avg_snf_pct: 9.0, outstanding: 14000, as_of_date: iso(new Date()) });
    const feed = [
      { sku: 'FEED-CATTLE-50', name: 'Cattle feed 50kg', category: 'FEED', unit: 'bag', mrp: 1300, subsidised_price: 1150 },
      { sku: 'MIN-MIX-1', name: 'Mineral mixture 1kg', category: 'MINERAL', unit: 'pack', mrp: 120, subsidised_price: 95 },
      { sku: 'FODDER-SEED-BERSEEM', name: 'Berseem fodder seed 5kg', category: 'FODDER_SEED', unit: 'pack', mrp: 700, subsidised_price: 560 },
    ];
    for (const f of feed) await db.CoopInputItem.findOrCreate({ where: { sku: f.sku }, defaults: { item_uuid: uuid(), source_mode: 'mock', ...f } });
    console.log('  seeded co-op membership + passbook + feed catalog');

    // ── KCC: originate → certify (tie-up) → sanction → activate + drawing power ──
    // OFF by default so the demo farmer starts with NO facility and you can walk
    // the whole application workflow live (calculate → apply → submit). Set
    // SEED_KCC=1 to pre-provision an ACTIVE facility instead.
    if (process.env.SEED_KCC === '1') {
    const { facility } = await kccLimit.originateFacility({ farmerId: user.id, activities: [{ code: 'DAIRY' }] });
    const fu = facility.facility_uuid;
    await origination.submit(fu);
    await origination.certify(fu, { membershipRef: 'F-DEMO', milkUnionRef: 'UCDF', cattleCount: 3, tieup: true, certifiedBy: 'DCS-Secretary' });
    await origination.beginReview(fu);
    await origination.forwardToBank(fu);
    await origination.sanction(fu);
    await origination.disburse(fu);
    await origination.activate(fu);
    await drawingPower.buildSnapshot(fu, { stocksValue: 12000, milkReceivables: 14000 });
    console.log('  seeded KCC facility (ACTIVE) + drawing-power snapshot');
    }

    // ── Insurance: an active Pashu Suraksha policy covering Gauri ──
    const plan = await db.InsurancePlan.findOne({ where: { plan_code: 'NLM-CATTLE-3YR-UK' } });
    if (plan) {
      const sumInsured = 45000, premiumTotal = 4950, premiumFarmer = 742.5; // 11% of SI, 15% farmer share
      const proposal = await db.InsuranceProposal.create({ proposal_uuid: uuid(), farmer_id: user.id, plan_id: plan.id, asset_type: 'dairy_animal', asset_ref_id: a1.id, channel: 'self', sum_insured: sumInsured, premium_farmer: premiumFarmer, premium_total: premiumTotal, status: 'POLICY_ISSUED' });
      const policy = await db.InsurancePolicy.create({ policy_uuid: uuid(), proposal_id: proposal.id, farmer_id: user.id, plan_id: plan.id, policy_number: 'PSK-DEMO-0001', insurer_name: 'Oriental Insurance', sum_insured: sumInsured, premium_total: premiumTotal, premium_farmer: premiumFarmer, start_date: daysAgo(20), end_date: daysAhead(36 * 30 - 20), waiting_until: daysAhead(1), status: 'active', premium_debit_confirmed: true, financed_on_kcc: true, assigned_to_bank: true, policy_doc_url: 'demo://vault/PSK-DEMO-0001.pdf' });
      await db.PolicyAsset.create({ policy_id: policy.id, asset_type: 'dairy_animal', asset_ref_id: a1.id, tag_uid: '360000000101', valuation: sumInsured, enrol_photo_owner_url: 'demo://photo/owner.jpg', enrol_photo_tag_url: 'demo://photo/tag.jpg' });
      if (db.PremiumLedger) {
        await db.PremiumLedger.create({ policy_id: policy.id, entry_type: 'farmer_debit', amount: premiumFarmer, status: 'confirmed', reference: 'KCC-DEBIT-001', occurred_at: new Date() });
        await db.PremiumLedger.create({ policy_id: policy.id, entry_type: 'subsidy_central', amount: (premiumTotal - premiumFarmer) * 0.9, status: 'confirmed', reference: 'PFMS-001', occurred_at: new Date() });
      }
      console.log('  seeded active insurance policy + asset + premium trail');
    }
  } else {
    console.log(`  demo farmer already has ${already} animals — skipping data creation`);
  }

  // ── Advisories (with weather so heat-stress shows too) ──
  const adv = await advisoryEngine.generateForFarmer(user.id, { weather: { tempC: 37, rhPct: 68 } });
  console.log(`  advisories: ${JSON.stringify(adv)}`);

  console.log('\n✅ Demo ready.  Login →  mobile 9000000001   MPIN 4926\n');
  await db.sequelize.close();
})().catch((e) => { console.error('seedDemo failed:', e.message); process.exit(1); });
