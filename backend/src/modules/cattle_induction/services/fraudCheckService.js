/**
 * CIA anti-fraud checks (CIA-3, SHADOW). Runs the preventive/detective controls
 * over a captured purchase and records exception flags for HUMAN review — it never
 * auto-rejects or blocks silently (Convention 32). The payment gate (Slice R) then
 * consults account_verified + within_geofence + the flags.
 *
 * Checks: seller penny-drop (→ account_verified; PAYEE_UNVERIFIED /
 * PAYEE_NAME_MISMATCH), geo-fence (→ within_geofence; GEOFENCE_BREACH), ear-tag
 * registry (REGISTRY_DUPLICATE, or REGISTRY_UNVERIFIED when the registry is down —
 * flag, don't wrongly reject), duplicate-photo hash (DUPLICATE_PHOTO).
 */
const { emitDomainEvent } = require('../../../shared/services/domainEvents');
const { paymentRails, livestockRegistry } = require('../../../integrations');
const { resolveActor } = require('./context');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };
const err = (msg, code, status = 400) => { const e = new Error(msg); e.statusCode = status; e.errorCode = code; return e; };

const toRad = (d) => (d * Math.PI) / 180;
const haversineKm = (aLat, aLng, bLat, bLng) => {
  const R = 6371;
  const dLat = toRad(bLat - aLat); const dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

/** Run all shadow checks for an application's captured purchase. Never blocks. */
const runChecks = async (req) => {
  const actor = await resolveActor(req);
  const { CiaApplication, CiaPurchase, CiaSeller, CiaAnimal, CiaSchemeConfig, sequelize } = getDb();
  const app = await CiaApplication.findOne({ where: { application_uuid: req.params.appUuid } });
  if (!app) throw err('Application not found', 'CIA_APP_NOT_FOUND', 404);
  const purchase = await CiaPurchase.findOne({ where: { application_id: app.id } });
  if (!purchase) throw err('No captured purchase', 'CIA_PURCHASE_NONE', 404);
  const seller = purchase.seller_id ? await CiaSeller.findByPk(purchase.seller_id) : null;
  const animal = purchase.animal_id ? await CiaAnimal.findByPk(purchase.animal_id) : null;
  const scheme = await CiaSchemeConfig.findOne({ where: { scheme_version: app.scheme_version } });
  const rules = (scheme && scheme.rules_json) || {};

  const flags = new Set(Array.isArray(purchase.exception_flags) ? purchase.exception_flags : []);
  let accountVerified = seller ? seller.account_verified : false;
  let withinGeofence = purchase.within_geofence;

  // 1) Seller penny-drop.
  if (seller) {
    try {
      const pd = await paymentRails.pennyDrop({ accountNumber: seller.bank_account, ifsc: seller.bank_ifsc, name: seller.name });
      accountVerified = pd.verified;
      if (!pd.verified) flags.add('PAYEE_UNVERIFIED');
      if (pd.verified && !pd.nameMatch) flags.add('PAYEE_NAME_MISMATCH');
    } catch (e) {
      flags.add('PAYEE_UNVERIFIED'); // rail down → cannot verify → flag, don't clear
    }
  }

  // 2) Geo-fence (config: rules_json.geoFence { lat, lng, radiusKm }).
  const gf = rules.geoFence;
  if (gf && purchase.purchase_lat != null && purchase.purchase_lng != null) {
    const distKm = haversineKm(Number(gf.lat), Number(gf.lng), Number(purchase.purchase_lat), Number(purchase.purchase_lng));
    withinGeofence = distKm <= Number(gf.radiusKm);
    if (!withinGeofence) flags.add('GEOFENCE_BREACH');
  }

  // 3) Ear-tag registry (cross-system; DB uniqueness already enforced at capture).
  if (animal) {
    try {
      const lk = await livestockRegistry.lookupEarTag(animal.ear_tag_no);
      if (lk.onOtherLoan) flags.add('REGISTRY_DUPLICATE');
    } catch (e) {
      flags.add('REGISTRY_UNVERIFIED'); // registry down → post-verify, never wrongful reject
    }
  }

  // 4) Duplicate-photo (exact content-hash overlap across other animals; a
  //    stand-in for perceptual-hash until the vision service lands).
  if (animal) {
    const mine = new Set([...(Array.isArray(animal.photo_refs) ? animal.photo_refs : []), animal.ear_tag_photo_ref].filter(Boolean));
    if (mine.size) {
      const others = await CiaAnimal.findAll({ where: { id: { [sequelize.Sequelize.Op.ne]: animal.id } }, attributes: ['photo_refs', 'ear_tag_photo_ref'] });
      const seen = new Set();
      for (const o of others) {
        for (const r of [...(Array.isArray(o.photo_refs) ? o.photo_refs : []), o.ear_tag_photo_ref].filter(Boolean)) seen.add(r);
      }
      if ([...mine].some((r) => seen.has(r))) flags.add('DUPLICATE_PHOTO');
    }
  }

  const flagList = [...flags];
  await sequelize.transaction(async (t) => {
    if (seller) await seller.update({ account_verified: accountVerified }, { transaction: t });
    await purchase.update({ within_geofence: withinGeofence, exception_flags: flagList }, { transaction: t });
    await emitDomainEvent({
      eventType: 'cia.fraud.checks', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
      farmerId: null, payload: { by: actor.appUserId, accountVerified, withinGeofence, flags: flagList, shadow: true },
    }, { transaction: t });
  });

  return { applicationUuid: app.application_uuid, accountVerified, withinGeofence, flags: flagList, shadow: true };
};

/* --------------------- exception panel (Slice S, shadow) ------------------- */
const { BLOCKING_FLAGS } = require('./paymentGateService');

/** List purchases carrying exception flags, with blocking classification + hold state. */
const listExceptions = async () => {
  const { CiaPurchase, CiaApplication, sequelize } = getDb();
  const rows = await CiaPurchase.findAll({
    where: sequelize.where(sequelize.fn('jsonb_array_length', sequelize.col('exception_flags')), { [sequelize.Sequelize.Op.gt]: 0 }),
    order: [['id', 'DESC']],
  });
  return Promise.all(rows.map(async (p) => {
    const app = await CiaApplication.findByPk(p.application_id);
    const flags = Array.isArray(p.exception_flags) ? p.exception_flags : [];
    const paymentHeld = flags.some((f) => BLOCKING_FLAGS.includes(f));
    return {
      applicationUuid: app ? app.application_uuid : null,
      farmerRef: app ? app.farmer_ref : null,
      purchaseStatus: p.status,
      paymentHeld,
      flags: flags.map((f) => ({ flag: f, blocking: BLOCKING_FLAGS.includes(f) })),
    };
  }));
};

/** Clear a flag with a reason (human review; append-only). Re-opens the gate when
 *  the last blocking flag is cleared. Nothing is deleted — the clear is recorded. */
const clearException = async (req) => {
  const actor = await resolveActor(req);
  if (!actor.appUserId) throw err('Unknown reviewer', 'CIA_ACTOR_UNKNOWN', 401);
  const { CiaApplication, CiaPurchase, sequelize } = getDb();
  const b = req.body || {};
  const app = await CiaApplication.findOne({ where: { application_uuid: req.params.appUuid } });
  if (!app) throw err('Application not found', 'CIA_APP_NOT_FOUND', 404);
  const purchase = await CiaPurchase.findOne({ where: { application_id: app.id } });
  if (!purchase) throw err('No purchase', 'CIA_PURCHASE_NONE', 404);
  const flags = Array.isArray(purchase.exception_flags) ? purchase.exception_flags : [];
  if (!flags.includes(b.flag)) throw err(`No open "${b.flag}" flag`, 'CIA_FLAG_NOT_FOUND', 404);

  const remaining = flags.filter((f) => f !== b.flag);
  const stillHeld = remaining.some((f) => BLOCKING_FLAGS.includes(f));
  return sequelize.transaction(async (t) => {
    await purchase.update({ exception_flags: remaining }, { transaction: t });
    await emitDomainEvent({
      eventType: 'cia.fraud.cleared', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
      farmerId: null, payload: { flag: b.flag, reason: b.reason, clearedBy: actor.appUserId, remaining, paymentHeld: stillHeld },
    }, { transaction: t });
    return { applicationUuid: app.application_uuid, cleared: b.flag, remaining, paymentHeld: stillHeld };
  });
};

module.exports = { runChecks, haversineKm, listExceptions, clearException };
