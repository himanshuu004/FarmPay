/**
 * CIA insurance service (CIA-3) — transit + cattle policies via KAVACH.
 *
 * Transit policy must exist BEFORE movement; the cattle policy is issued on
 * arrival and its effective date can never precede arrival (no backdated /
 * post-purchase cover — Convention 32). Both set payment-gate inputs
 * (transit_insured / cattle_insured); the cattle policy is assigned to the bank.
 *
 *   purchase: PURCHASE_APPROVED → TRANSIT_IN_PROGRESS → CATTLE_DELIVERED → INSURANCE_PENDING
 */
const crypto = require('crypto');
const { emitDomainEvent } = require('../../../shared/services/domainEvents');
const { PURCHASE, guardTransition } = require('../constants/ciaStatus');
const { resolveActor } = require('./context');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };
const err = (msg, code, status = 400) => { const e = new Error(msg); e.statusCode = status; e.errorCode = code; return e; };
const policyNo = (kind, purchaseUuid) => `${kind}-${crypto.createHash('sha256').update(kind + purchaseUuid).digest('hex').slice(0, 10).toUpperCase()}`;

const loadOwned = async (appUuid, actor) => {
  const { CiaApplication, CiaPurchase } = getDb();
  const app = await CiaApplication.findOne({ where: { application_uuid: appUuid } });
  if (!app) throw err('Application not found', 'CIA_APP_NOT_FOUND', 404);
  if (!actor.farmerRef || app.farmer_ref !== actor.farmerRef) throw err('Not your application', 'CIA_APP_FORBIDDEN', 403);
  const purchase = await CiaPurchase.findOne({ where: { application_id: app.id } });
  if (!purchase) throw err('No captured purchase', 'CIA_PURCHASE_NONE', 404);
  return { app, purchase };
};

/** Transit policy — required before movement. PURCHASE_APPROVED → TRANSIT_IN_PROGRESS. */
const issueTransit = async (req) => {
  const actor = await resolveActor(req);
  const { app, purchase } = await loadOwned(req.params.appUuid, actor);
  if (purchase.status !== PURCHASE.PURCHASE_APPROVED) throw err(`Cannot insure transit from ${purchase.status}`, 'CIA_PURCHASE_BAD_STATE', 409);
  const { CiaInsuranceLink, CiaTransport, sequelize } = getDb();
  const b = req.body || {};
  const pn = policyNo('TRN', purchase.purchase_uuid);

  return sequelize.transaction(async (t) => {
    await CiaInsuranceLink.create({
      link_uuid: crypto.randomUUID(), application_id: app.id, purchase_id: purchase.id,
      policy_type: 'TRANSIT', policy_no: pn, sum_insured: b.sumInsured || null,
      effective_date: new Date(), assigned_to_bank: false, insurer_ref: b.insurerRef || 'KAVACH',
    }, { transaction: t });
    const transport = await CiaTransport.findOne({ where: { purchase_id: purchase.id }, transaction: t });
    if (transport) await transport.update({ transit_policy_no: pn, transit_started_at: new Date() }, { transaction: t });
    guardTransition('purchase', purchase.status, PURCHASE.TRANSIT_IN_PROGRESS);
    await purchase.update({ status: PURCHASE.TRANSIT_IN_PROGRESS, transit_insured: true }, { transaction: t });
    await emitDomainEvent({
      eventType: 'cia.insurance.transit', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
      farmerId: actor.appUserId, payload: { policyNo: pn, status: PURCHASE.TRANSIT_IN_PROGRESS },
    }, { transaction: t });
    return { applicationUuid: app.application_uuid, transitInsured: true, transitPolicyNo: pn, purchaseStatus: PURCHASE.TRANSIT_IN_PROGRESS };
  });
};

/** Arrival — farmer confirms receipt. TRANSIT_IN_PROGRESS → CATTLE_DELIVERED. */
const confirmArrival = async (req) => {
  const actor = await resolveActor(req);
  const { app, purchase } = await loadOwned(req.params.appUuid, actor);
  if (purchase.status !== PURCHASE.TRANSIT_IN_PROGRESS) throw err(`Cannot confirm arrival from ${purchase.status}`, 'CIA_PURCHASE_BAD_STATE', 409);
  if (!purchase.transit_insured) throw err('Transit policy required before arrival', 'CIA_TRANSIT_REQUIRED', 409);
  const { CiaTransport, sequelize } = getDb();
  const b = req.body || {};

  return sequelize.transaction(async (t) => {
    const now = new Date();
    await purchase.update({ status: PURCHASE.CATTLE_DELIVERED, delivered_at: now, farmer_acknowledged: true }, { transaction: t });
    if (b.destinationGeo) {
      const transport = await CiaTransport.findOne({ where: { purchase_id: purchase.id }, transaction: t });
      if (transport) await transport.update({ destination_lat: b.destinationGeo.lat, destination_lng: b.destinationGeo.lng, delivered_at: now }, { transaction: t });
    }
    guardTransition('purchase', PURCHASE.TRANSIT_IN_PROGRESS, PURCHASE.CATTLE_DELIVERED);
    await emitDomainEvent({
      eventType: 'cia.cattle.delivered', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
      farmerId: actor.appUserId, payload: { deliveredAt: now, status: PURCHASE.CATTLE_DELIVERED },
    }, { transaction: t });
    return { applicationUuid: app.application_uuid, purchaseStatus: PURCHASE.CATTLE_DELIVERED, deliveredAt: now };
  });
};

/** Cattle policy — effective date ≥ arrival (no backdating). CATTLE_DELIVERED → INSURANCE_PENDING. */
const issueCattle = async (req) => {
  const actor = await resolveActor(req);
  const { app, purchase } = await loadOwned(req.params.appUuid, actor);
  if (purchase.status !== PURCHASE.CATTLE_DELIVERED) throw err(`Cannot insure cattle from ${purchase.status}`, 'CIA_PURCHASE_BAD_STATE', 409);
  const b = req.body || {};
  const arrival = purchase.delivered_at ? new Date(purchase.delivered_at) : null;
  const effective = new Date(b.effectiveDate);
  if (arrival && effective < new Date(arrival.toISOString().slice(0, 10))) {
    throw err('Cattle policy effective date cannot precede arrival (no backdated cover)', 'CIA_INSURANCE_BACKDATED', 422);
  }
  const { CiaInsuranceLink, CiaAnimal, InsurancePlan, InsurancePolicy, PolicyAsset, sequelize } = getDb();
  const pn = policyNo('CTL', purchase.purchase_uuid);
  const animal = purchase.animal_id ? await CiaAnimal.findByPk(purchase.animal_id) : null;
  const sumInsured = Number(b.sumInsured || (animal && animal.approved_purchase_price) || 0);

  return sequelize.transaction(async (t) => {
    // Deep reuse: issue a real KAVACH InsurancePolicy + PolicyAsset so the CIA-4
    // claim engine (SLA clock, 12% penal interest, hash-chain, 4-doc) works off it.
    const [plan] = await InsurancePlan.findOrCreate({
      where: { plan_code: 'NLM-CIA-CATTLE-UK' },
      defaults: { plan_uuid: crypto.randomUUID(), plan_code: 'NLM-CIA-CATTLE-UK', name: 'Aanchal Cattle Induction (NLM, Uttarakhand)', scheme: 'NLM', species: 'CATTLE', term_months: 36, farmer_share_pct: 15, govt_share_pct: 85, waiting_period_days: 21, region: 'HIM' },
      transaction: t,
    });
    const eff = new Date(b.effectiveDate);
    const end = new Date(eff); end.setMonth(end.getMonth() + Number(plan.term_months || 36));
    const waiting = new Date(eff); waiting.setDate(waiting.getDate() + Number(plan.waiting_period_days || 21));
    const premiumTotal = Math.round(sumInsured * 0.11);           // 3-yr NLM cap (config)
    const premiumFarmer = Math.round(premiumTotal * (Number(plan.farmer_share_pct) / 100));

    const policy = await InsurancePolicy.create({
      policy_uuid: crypto.randomUUID(), farmer_id: actor.appUserId, plan_id: plan.id,
      policy_number: pn, insurer_name: b.insurerRef || 'KAVACH', sum_insured: sumInsured,
      premium_total: premiumTotal, premium_farmer: premiumFarmer,
      start_date: b.effectiveDate, end_date: end.toISOString().slice(0, 10), waiting_until: waiting.toISOString().slice(0, 10),
      status: 'active', assigned_to_bank: true,
    }, { transaction: t });
    const asset = await PolicyAsset.create({
      policy_id: policy.id, asset_type: 'dairy_animal', tag_uid: animal ? animal.ear_tag_no : null,
      species: 'CATTLE', valuation: sumInsured,
    }, { transaction: t });

    await CiaInsuranceLink.create({
      link_uuid: crypto.randomUUID(), application_id: app.id, purchase_id: purchase.id,
      policy_type: 'CATTLE', policy_no: pn, sum_insured: sumInsured || null,
      effective_date: b.effectiveDate, assigned_to_bank: true, insurer_ref: b.insurerRef || 'KAVACH',
      insurance_policy_uuid: policy.policy_uuid, insurance_policy_asset_id: asset.id,
    }, { transaction: t });
    guardTransition('purchase', purchase.status, PURCHASE.INSURANCE_PENDING);
    await purchase.update({ status: PURCHASE.INSURANCE_PENDING, cattle_insured: true, cattle_policy_no: pn }, { transaction: t });
    await emitDomainEvent({
      eventType: 'cia.insurance.cattle', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
      farmerId: actor.appUserId, payload: { policyNo: pn, policyUuid: policy.policy_uuid, effectiveDate: b.effectiveDate, assignedToBank: true, status: PURCHASE.INSURANCE_PENDING },
    }, { transaction: t });
    return { applicationUuid: app.application_uuid, cattleInsured: true, cattlePolicyNo: pn, policyUuid: policy.policy_uuid, assignedToBank: true, purchaseStatus: PURCHASE.INSURANCE_PENDING };
  });
};

module.exports = { issueTransit, confirmArrival, issueCattle };
