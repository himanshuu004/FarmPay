/**
 * KAVACH renewal engine (§7.4 — highest ROI). Nightly the sweep upserts a
 * renewal_journeys row for every policy entering the lead window, fans out
 * reminders on a cadence, auto-renews the opt-ins on due date, and lapses the
 * rest. The one-tap renew CLONES the policy + assets from stored data — zero
 * re-documentation (attacks the re-paper pain).
 *
 *   pending → reminded → renewed | lapsed | opted_out
 *
 * Renewal is opt-in only (CLAUDE.md); the clone re-prices the premium through
 * the deterministic engine (#20) but never asks the farmer to re-document.
 */
const crypto = require('crypto');
const { Op } = require('sequelize');
const { computeNlmPremium } = require('./premiumQuoteEngine');
const { emitDomainEvent } = require('../../../shared/services/domainEvents');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const err = (msg, code, status = 400) => { const e = new Error(msg); e.statusCode = status; e.errorCode = code; return e; };

const LEAD_DAYS = 30;                 // lead window before end_date (config)
const REMINDER_CADENCE_DAYS = [30, 15, 7, 1];
const ACTIVE_JOURNEY = ['pending', 'reminded'];

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const daysBetween = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);

/** Upsert renewal_journeys for policies entering the lead window. */
const sweep = async (asOf = new Date()) => {
  const { InsurancePolicy, RenewalJourney } = getDb();
  const windowEnd = iso(addDays(asOf, LEAD_DAYS));
  const policies = await InsurancePolicy.findAll({
    where: { status: 'active', end_date: { [Op.between]: [iso(asOf), windowEnd] } },
  });
  let created = 0;
  for (const p of policies) {
    const [, made] = await RenewalJourney.findOrCreate({
      where: { policy_id: p.id },
      defaults: { journey_uuid: crypto.randomUUID(), policy_id: p.id, farmer_id: p.farmer_id, due_date: p.end_date, status: 'pending' },
    });
    if (made) created += 1;
  }
  return { swept: policies.length, created };
};

/** Send one reminder to an active journey (best-effort notification). */
const remind = async (journey, channel = 'sms', asOf = new Date()) => {
  await journey.update({ status: 'reminded', reminder_count: journey.reminder_count + 1, last_reminder_at: asOf, channel_last: channel });
  await emitDomainEvent({
    eventType: 'kavach.renewal.reminded', aggregateType: 'RenewalJourney', aggregateId: journey.journey_uuid,
    farmerId: journey.farmer_id, payload: { channel, dueDate: journey.due_date, count: journey.reminder_count },
  });
  try {
    const notifier = require('../../../shared/services/notificationService');
    if (notifier && notifier.sendNotification) {
      await notifier.sendNotification({ userId: journey.farmer_id, title: 'Your Pashu Suraksha cover is due for renewal', body: `Renew by ${journey.due_date} to keep your animal covered.`, channels: [channel] });
    }
  } catch { /* reminders are best-effort */ }
  return journey;
};

/** Fan out reminders to journeys due within the lead window (one per run/day). */
const sendDueReminders = async (asOf = new Date(), channel = 'sms') => {
  const { RenewalJourney } = getDb();
  const journeys = await RenewalJourney.findAll({ where: { status: { [Op.in]: ACTIVE_JOURNEY } } });
  let sent = 0;
  for (const j of journeys) {
    const dtd = daysBetween(j.due_date, asOf);
    if (dtd < 0 || dtd > LEAD_DAYS) continue;
    // Don't re-remind on the same day.
    if (j.last_reminder_at && iso(new Date(j.last_reminder_at)) === iso(asOf)) continue;
    await remind(j, channel, asOf);
    sent += 1;
  }
  return { sent };
};

/**
 * One-tap renew — clone the policy + assets into the next term. Zero
 * re-documentation: reuses stored SI, tag, photos, asset link; re-prices premium
 * via the engine. New term is seamless (starts at the old policy's end_date).
 */
const renew = async (policyUuid, { ownerFarmerId = null, actorRole = 'FARMER' } = {}) => {
  const database = getDb();
  const { InsurancePolicy, InsurancePlan, PolicyAsset, PremiumLedger, RenewalJourney } = database;
  return database.sequelize.transaction(async (t) => {
    const old = await InsurancePolicy.findOne({ where: { policy_uuid: policyUuid }, transaction: t });
    if (!old) throw err('Policy not found', 'KAVACH_POLICY_NOT_FOUND', 404);
    if (ownerFarmerId != null && old.farmer_id !== ownerFarmerId) throw err('Not your policy', 'KAVACH_POLICY_FORBIDDEN', 403);
    if (old.status !== 'active') throw err(`Cannot renew a ${old.status} policy`, 'KAVACH_POLICY_NOT_RENEWABLE');

    const plan = await InsurancePlan.findByPk(old.plan_id, { transaction: t });
    const q = computeNlmPremium({ species: plan.species, marketValue: Number(old.sum_insured), termMonths: plan.term_months, region: plan.region });

    const start = new Date(old.end_date);        // seamless continuation
    const end = new Date(start); end.setMonth(end.getMonth() + plan.term_months);
    // Continuous cover → no fresh 21-day waiting on renewal.
    const newPolicy = await InsurancePolicy.create({
      policy_uuid: crypto.randomUUID(), proposal_id: old.proposal_id, farmer_id: old.farmer_id, plan_id: old.plan_id,
      insurer_name: old.insurer_name, sum_insured: old.sum_insured, premium_total: q.premiumTotal, premium_farmer: q.farmerShare,
      start_date: iso(start), end_date: iso(end), waiting_until: iso(start), status: 'active',
      premium_debit_confirmed: true, financed_on_kcc: old.financed_on_kcc, assigned_to_bank: old.assigned_to_bank,
      kcc_facility_uuid: old.kcc_facility_uuid, transferred_from_policy_id: old.id,
    }, { transaction: t });

    const assets = await PolicyAsset.findAll({ where: { policy_id: old.id, is_active: true }, transaction: t });
    for (const a of assets) {
      await PolicyAsset.create({
        policy_id: newPolicy.id, asset_type: a.asset_type, asset_ref_id: a.asset_ref_id,
        tag_uid: a.tag_uid, species: a.species, valuation: a.valuation,
        enrol_photo_owner_url: a.enrol_photo_owner_url, enrol_photo_tag_url: a.enrol_photo_tag_url,
      }, { transaction: t });
    }
    const now = new Date();
    await PremiumLedger.create({ policy_id: newPolicy.id, entry_type: old.financed_on_kcc ? 'financed_kcc' : 'farmer_debit', amount: q.farmerShare, status: 'confirmed', occurred_at: now }, { transaction: t });
    await PremiumLedger.create({ policy_id: newPolicy.id, entry_type: 'subsidy_central', amount: q.govtCentre, status: 'pending', occurred_at: now }, { transaction: t });
    await PremiumLedger.create({ policy_id: newPolicy.id, entry_type: 'subsidy_state', amount: q.govtState, status: 'pending', occurred_at: now }, { transaction: t });

    // Close the journey (create one if renew was called directly, outside a sweep).
    const [journey] = await RenewalJourney.findOrCreate({
      where: { policy_id: old.id },
      defaults: { journey_uuid: crypto.randomUUID(), policy_id: old.id, farmer_id: old.farmer_id, due_date: old.end_date, status: 'pending' },
      transaction: t,
    });
    await journey.update({ status: 'renewed', renewed_policy_id: newPolicy.id }, { transaction: t });

    await emitDomainEvent({
      eventType: 'kavach.policy.renewed', aggregateType: 'InsurancePolicy', aggregateId: newPolicy.policy_uuid,
      farmerId: old.farmer_id, payload: { fromPolicy: old.policy_uuid, actorRole, premiumFarmer: q.farmerShare },
    }, { transaction: t });

    return { oldPolicy: old, newPolicy, journey };
  });
};

/** Auto-renew the opt-ins whose due date has arrived (opt-in respected). */
const processAutoRenewals = async (asOf = new Date()) => {
  const { RenewalJourney, InsurancePolicy } = getDb();
  const journeys = await RenewalJourney.findAll({ where: { status: { [Op.in]: ACTIVE_JOURNEY }, auto_renew_opt_in: true } });
  let renewed = 0;
  for (const j of journeys) {
    if (daysBetween(j.due_date, asOf) > 0) continue; // not yet due
    const policy = await InsurancePolicy.findByPk(j.policy_id);
    if (!policy || policy.status !== 'active') continue;
    await renew(policy.policy_uuid, { actorRole: 'SYSTEM' });
    renewed += 1;
  }
  return { renewed };
};

/** Lapse journeys whose due date passed without renewal or opt-out. */
const lapseOverdue = async (asOf = new Date()) => {
  const { RenewalJourney, InsurancePolicy } = getDb();
  const journeys = await RenewalJourney.findAll({ where: { status: { [Op.in]: ACTIVE_JOURNEY } } });
  let lapsed = 0;
  for (const j of journeys) {
    if (daysBetween(j.due_date, asOf) >= 0) continue; // due date not yet passed
    await j.update({ status: 'lapsed' });
    const policy = await InsurancePolicy.findByPk(j.policy_id);
    if (policy && policy.status === 'active') await policy.update({ status: 'lapsed' });
    await emitDomainEvent({ eventType: 'kavach.renewal.lapsed', aggregateType: 'RenewalJourney', aggregateId: j.journey_uuid, farmerId: j.farmer_id, payload: { dueDate: j.due_date } });
    lapsed += 1;
  }
  return { lapsed };
};

const optIn = async (journeyUuid, ownerFarmerId = null) => {
  const j = await findJourney(journeyUuid, ownerFarmerId);
  await j.update({ auto_renew_opt_in: true });
  return j;
};
const optOut = async (journeyUuid, ownerFarmerId = null) => {
  const j = await findJourney(journeyUuid, ownerFarmerId);
  if (!ACTIVE_JOURNEY.includes(j.status)) throw err(`Cannot opt out of a ${j.status} renewal`, 'KAVACH_RENEWAL_BAD_STATE');
  await j.update({ status: 'opted_out', auto_renew_opt_in: false });
  await emitDomainEvent({ eventType: 'kavach.renewal.opted_out', aggregateType: 'RenewalJourney', aggregateId: j.journey_uuid, farmerId: j.farmer_id, payload: {} });
  return j;
};

const findJourney = async (journeyUuid, ownerFarmerId = null) => {
  const { RenewalJourney } = getDb();
  const j = await RenewalJourney.findOne({ where: { journey_uuid: journeyUuid } });
  if (!j) throw err('Renewal journey not found', 'KAVACH_RENEWAL_NOT_FOUND', 404);
  if (ownerFarmerId != null && j.farmer_id !== ownerFarmerId) throw err('Not your renewal', 'KAVACH_RENEWAL_FORBIDDEN', 403);
  return j;
};

const listDueForFarmer = async (farmerId) => {
  const { RenewalJourney } = getDb();
  return RenewalJourney.findAll({ where: { farmer_id: farmerId, status: { [Op.in]: ACTIVE_JOURNEY } }, order: [['due_date', 'ASC']] });
};

module.exports = {
  sweep, remind, sendDueReminders, renew, processAutoRenewals, lapseOverdue,
  optIn, optOut, findJourney, listDueForFarmer,
  LEAD_DAYS, REMINDER_CADENCE_DAYS,
};
