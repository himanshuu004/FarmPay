/**
 * seedCia — drives ONE CIA application for the demo farmer (9000000001) all the way
 * to EMI_ACTIVE, so the cattle-induction screens show populated data:
 *   • cia-loan     — sanction ₹62,000 → subsidy → disbursement
 *   • cia-purchase — animal (ear tag), seller, transit + cattle insurance, seller paid
 *   • cia-emi      — 6-instalment schedule reconciled → paid / partial / overdue / due
 *   • cia-claim    — a filed claim on the cattle policy (track view)
 *   • cia-status   — EMI_ACTIVE lifecycle timeline
 *
 * Run after seedDemo, against the dev DB:
 *   NODE_ENV=development DB_NAME=allied_kcc_dev DB_PORT=5432 node scripts/seedCia.js
 * Skips if the farmer already has a CIA application (idempotent-ish).
 */
const crypto = require('crypto');
const db = require('../backend/src/shared/models');
const insurance = require('../backend/src/modules/cattle_induction/services/insuranceService');
const emi = require('../backend/src/modules/cattle_induction/services/emiService');
const claim = require('../backend/src/modules/cattle_induction/services/claimIntegrationService');
const { APP, PURCHASE } = require('../backend/src/modules/cattle_induction/constants/ciaStatus');

const uuid = () => crypto.randomUUID();
const daysAgo = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d; };
const iso = (d) => d.toISOString().slice(0, 10);

(async () => {
  await db.testConnection();
  const user = await db.User.findOne({ where: { mobile: '+919000000001' } });
  if (!user) throw new Error('demo user not found — run scripts/seedDemo.js first');
  const mem = await db.CoopMembership.findOne({ where: { user_id: user.id } });
  if (!mem) throw new Error('demo coop membership not found — run scripts/seedDemo.js first');
  const farmerRef = mem.farmer_ref, dcsRef = mem.society_ref;

  const existing = await db.CiaApplication.findOne({ where: { farmer_ref: farmerRef } });
  if (existing) {
    console.log(`  CIA application already exists for ${farmerRef}: ${existing.application_uuid} (${existing.status}) — skipping`);
    await db.sequelize.close(); process.exit(0);
  }

  const req = (appUuid, body = {}) => ({ user: { id: user.user_id, role: 'FARMER' }, params: { appUuid }, body, query: {} });

  // 1. Application — carry the sanction + loan mapping (start at PURCHASE_INITIATED). ──
  const app = await db.CiaApplication.create({
    application_uuid: uuid(), farmer_ref: farmerRef, dcs_ref: dcsRef, union_ref: 'DUSS-DEHRADUN',
    scheme_version: 'CIA_UK_2026_v1', status: 'PURCHASE_INITIATED',
    requested_cattle_count: 1, preferred_breed: 'HF crossbred',
    sanctioned_amount: 62000, loan_account: 'SBIN0001234-7781', milk_account_ref: farmerRef,
    eoi_at: daysAgo(75), submitted_at: daysAgo(64),
  });
  const appUuid = app.application_uuid;
  console.log(`  created application ${appUuid}`);

  // 2. Purchase chain — animal + seller + purchase (vet-approved) + transport. ──
  const animal = await db.CiaAnimal.create({
    animal_uuid: uuid(), ear_tag_no: '360000000201', ear_tag_photo_ref: 'demo://cia/tag.jpg',
    species: 'CATTLE', breed: 'HF crossbred', sex: 'FEMALE',
    photo_refs: ['demo://cia/a1.jpg', 'demo://cia/a2.jpg'], approved_purchase_price: 60000,
  });
  const seller = await db.CiaSeller.create({
    seller_uuid: uuid(), name: 'Balbir Singh', id_proof_ref: 'demo://cia/id.jpg',
    bank_account: 'PUNB0Sxxxx-556677', account_verified: true, photo_ref: 'demo://cia/sph.jpg',
    relationship_to_buyer: 'unrelated (known trader)',
  });
  const purchase = await db.CiaPurchase.create({
    purchase_uuid: uuid(), application_id: app.id, animal_id: animal.id, seller_id: seller.id,
    status: PURCHASE.PURCHASE_APPROVED, vet_certified: true,
    purchase_lat: 30.20, purchase_lng: 78.10, within_geofence: true, farmer_acknowledged: false, initiated_at: daysAgo(52),
  });
  await db.CiaTransport.create({
    purchase_id: purchase.id, vehicle_reg_no: 'UK07AB1234', driver_name: 'Rakesh',
    bill_ref: 'demo://cia/bill.jpg', challan_ref: 'demo://cia/challan.jpg', origin_lat: 30.20, origin_lng: 78.10,
  });

  // 3. Insurance via the real services (creates a KAVACH policy the claim rides on). ──
  await insurance.issueTransit(req(appUuid, { sumInsured: 60000 }));
  await insurance.confirmArrival(req(appUuid, { destinationGeo: { lat: 30.32, lng: 78.03 } }));
  await purchase.reload();
  await purchase.update({ delivered_at: daysAgo(46) });   // backdate so the cattle policy clears its 21-day wait
  await insurance.issueCattle(req(appUuid, { effectiveDate: iso(daysAgo(46)), sumInsured: 60000 }));
  console.log('  issued transit + cattle insurance (KAVACH policy)');

  // 4. Money movement — seller paid, loan active, subsidy + disbursement records. ──
  await purchase.reload();
  await purchase.update({ status: PURCHASE.SELLER_PAID });
  await app.update({ status: APP.EMI_ACTIVE });
  await db.CiaSubsidyTransfer.create({ transfer_uuid: uuid(), application_id: app.id, amount: 31000, transfer_ref: 'PFMS-SUB-0001', bank_ref: 'COOPBANK-DDN', recorded_by_user_id: user.id, recorded_at: daysAgo(50) });
  await db.CiaDisbursement.create({ disbursement_uuid: uuid(), application_id: app.id, loan_account: 'SBIN0001234-7781', amount: 24800, disbursement_ref: 'DISB-0001', recorded_by_user_id: user.id, recorded_at: daysAgo(48) });
  await db.CiaSellerPayout.create({ payout_uuid: uuid(), application_id: app.id, purchase_id: purchase.id, seller_id: seller.id, payee_account: seller.bank_account, amount: 60000, status: 'PAID', payout_ref: 'PAYOUT-0001', recommended_by_user_id: user.id, recommended_at: daysAgo(47), confirmed_by_user_id: user.id, paid_at: daysAgo(46) });
  console.log('  recorded subsidy + disbursement + seller payout');

  // 5. EMI schedule (6 × ₹2,150) → reconcile a settlement file → ledger. ──
  const sched = [
    { n: 1, due: iso(daysAgo(70)) }, { n: 2, due: iso(daysAgo(40)) }, { n: 3, due: iso(daysAgo(10)) },
    { n: 4, due: iso(daysAgo(-20)) }, { n: 5, due: iso(daysAgo(-50)) }, { n: 6, due: iso(daysAgo(-80)) },
  ];
  for (const r of sched) {
    await db.CiaEmiSchedule.create({ schedule_uuid: uuid(), application_id: app.id, installment_no: r.n, emi_due: 2150, due_date: r.due, status: 'SCHEDULED', file_row_hash: uuid().replace(/-/g, '') });
  }
  const deductions = [
    { installmentNo: 1, amountDeducted: 2150, amountRemitted: 2150 }, // PAID
    { installmentNo: 2, amountDeducted: 2150, amountRemitted: 2150 }, // PAID
    // instalment 3 (past due, nothing deducted) → OVERDUE; 4-6 future → DUE
  ];
  await emi.reconcile({ applicationUuid: appUuid, deductions, asOf: new Date(), sourceRef: 'settle-demo' });
  console.log('  seeded 6-instalment EMI schedule + reconciled ledger (2 paid, 1 overdue, 3 due)');

  // 6. A filed claim so cia-claim shows the track view (best-effort). ──
  try {
    const c = await claim.reportDeath(req(appUuid, { peril: 'Sudden illness', deathDate: iso(daysAgo(3)), sumClaimed: 60000 }));
    console.log(`  filed cattle claim ${c.claimUuid} (${c.status})`);
  } catch (e) {
    console.log(`  claim not filed (${e.message}) — cia-claim will show the report form`);
  }

  console.log(`\n✅ CIA demo application seeded → ${appUuid} (EMI_ACTIVE). Login 9000000001 / 4926.\n`);
  await db.sequelize.close(); process.exit(0);
})().catch((e) => { console.error('seedCia failed:', e.message); console.error(e.stack); process.exit(1); });
