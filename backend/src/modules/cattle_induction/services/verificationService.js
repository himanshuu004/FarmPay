/**
 * CIA field verification service — Route Supervisor (in-app; Convention 30).
 * OFFLINE-FIRST: task queue, verification submit (geo + live photos), idempotent
 * batch sync with server-wins conflict + farmer notification (Convention 26).
 *
 * Per the authoritative CIA state machine (CLAUDE.md) the supervisor has exactly
 * two outcomes at PENDING_SUPERVISOR_VERIFY:
 *   APPROVED → FORWARDED_TO_DUSS   ·   RETURNED → RETURNED_FOR_CORRECTION
 * (there is no supervisor-reject transition — Return, with a reason, is the
 * mechanism). Vet examination is CIA-3.
 *
 * Reuses the shared offline foundation: SyncQueueItem is the idempotency ledger
 * (op_uuid unique → replay is a DUPLICATE no-op) and the server-wins discipline
 * from offlineSyncService; evidence (media) keeps EXIF/GPS lossless.
 */
const { emitDomainEvent } = require('../../../shared/services/domainEvents');
const { APP, guardTransition } = require('../constants/ciaStatus');
const { resolveActor } = require('./context');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };
const err = (msg, code, status = 400) => { const e = new Error(msg); e.statusCode = status; e.errorCode = code; return e; };

const RESULT_TO_STATUS = {
  APPROVED: APP.FORWARDED_TO_DUSS,
  RETURNED: APP.RETURNED_FOR_CORRECTION,
};

const hasLatLng = (g) => g && typeof g.lat === 'number' && typeof g.lng === 'number';

/** Re-validate a verification payload server-side (Convention 25/32) — the offline
 *  path bypasses the HTTP Joi layer, so the invariants are enforced here too. */
const validatePayload = (p) => {
  if (!RESULT_TO_STATUS[p.result]) throw err('Supervisor decision must be APPROVED or RETURNED', 'CIA_VERIFY_RESULT_INVALID', 422);
  if (!hasLatLng(p.shedGeo) || !hasLatLng(p.residenceGeo)) throw err('Shed and residence geo-tags are required', 'CIA_VERIFY_GEO_REQUIRED', 422);
  if (!Array.isArray(p.mediaRefs) || p.mediaRefs.length < 1) throw err('At least one live photo is required', 'CIA_VERIFY_MEDIA_REQUIRED', 422);
  if (p.result === 'RETURNED' && !(p.remarks && p.remarks.trim())) throw err('A reason is required to return', 'CIA_VERIFY_REMARKS_REQUIRED', 422);
};

/**
 * Core apply — shared by the online submit and the offline sync replay. Creates
 * (or replaces) the single verification record and transitions the application.
 * MUST run inside a transaction.
 */
const applyVerification = async (p, actor, t, { capturedOffline = false } = {}) => {
  validatePayload(p);
  const { CiaApplication, CiaFieldVerification } = getDb();
  const app = await CiaApplication.findOne({ where: { application_uuid: p.appUuid }, transaction: t });
  if (!app) throw err('Application not found', 'CIA_APP_NOT_FOUND', 404);
  if (app.status !== APP.PENDING_SUPERVISOR_VERIFY) {
    // Server has moved on (e.g. already forwarded) → this op conflicts.
    throw err(`Application is ${app.status}, not awaiting verification`, 'CIA_VERIFY_CONFLICT', 409);
  }

  const checks = p.checks || {};
  const existing = await CiaFieldVerification.findOne({ where: { application_id: app.id }, transaction: t });
  const row = existing || CiaFieldVerification.build({ application_id: app.id });
  row.supervisor_user_id = actor.appUserId;
  row.result = p.result;
  row.remarks = p.remarks || null;
  row.identity_ok = checks.identity_ok != null ? checks.identity_ok : null;
  row.membership_ok = checks.membership_ok != null ? checks.membership_ok : null;
  row.milk_pouring_ok = checks.milk_pouring_ok != null ? checks.milk_pouring_ok : null;
  row.existing_cattle_note = checks.existing_cattle_note || null;
  row.shed_lat = p.shedGeo.lat; row.shed_lng = p.shedGeo.lng;
  row.residence_lat = p.residenceGeo.lat; row.residence_lng = p.residenceGeo.lng;
  row.media_refs = p.mediaRefs;          // [{ref,hash,exif}] — lossless, content-addressed
  row.captured_offline = capturedOffline;
  row.verified_at = new Date();
  row.synced_at = new Date();
  await row.save({ transaction: t });

  const next = RESULT_TO_STATUS[p.result];
  guardTransition('application', app.status, next);
  const patch = { status: next };
  if (p.result === 'RETURNED') patch.reject_reason = p.remarks;
  await app.update(patch, { transaction: t });

  await emitDomainEvent({
    eventType: 'cia.verification.submitted', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
    farmerId: null,
    payload: { result: p.result, status: next, supervisorUserId: actor.appUserId, capturedOffline },
  }, { transaction: t });

  return { applicationUuid: app.application_uuid, result: p.result, status: next };
};

/* --------------------------------- surface --------------------------------- */

/** Assigned task queue: applications awaiting field verification. */
/** Best-effort ERP farmer name lookup — never blocks the task list on ERP being degraded. */
const farmerNameFor = async (farmerRef) => {
  try {
    const { erp } = require('../../../integrations');
    const f = await erp.getFarmerMaster(farmerRef);
    return f ? f.name : null;
  } catch (_e) {
    return null;
  }
};

/**
 * Role-appropriate, display-ready task queue for the Field PWA. Unlike the
 * original supervisor-only version, this returns a `kind`-discriminated list
 * so the client can render three real screens (verify / vetExam / inspection)
 * from one endpoint instead of three thin, farmerRef-only rows:
 *   ROUTE_SUPERVISOR → verify + inspection tasks
 *   VET               → vetExam + inspection tasks
 * `dcsRef` scopes to the caller's own society (from the JWT context or an
 * explicit ?dcsRef= override for staff not yet geo-scoped — see context.js).
 */
const myTasks = async (req) => {
  const { CiaApplication, CiaPurchase, CiaAnimal, CiaPostPurchaseInspection } = getDb();
  const scope = (req.user && req.user.dcsRef) || (req.query && req.query.dcsRef) || null;
  const role = req.user && req.user.role;
  const tasks = [];

  if (role !== 'VET') {
    const where = { status: APP.PENDING_SUPERVISOR_VERIFY };
    if (scope) where.dcs_ref = scope;
    const rows = await CiaApplication.findAll({ where, order: [['submitted_at', 'ASC']] });
    for (const a of rows) {
      tasks.push({
        kind: 'verify',
        applicationUuid: a.application_uuid,
        farmerRef: a.farmer_ref,
        farmerName: await farmerNameFor(a.farmer_ref),
        dcsRef: a.dcs_ref,
        requestedCattleCount: a.requested_cattle_count,
        preferredBreed: a.preferred_breed,
        status: a.status,
        submittedAt: a.submitted_at,
      });
    }
  }

  if (role !== 'ROUTE_SUPERVISOR') {
    const purchases = await CiaPurchase.findAll({
      where: { status: ['PURCHASE_INITIATED', 'VET_VERIFICATION_PENDING'] },
      include: [
        { model: CiaApplication, as: 'application' },
        { model: CiaAnimal, as: 'animal' },
      ],
      order: [['initiated_at', 'ASC']],
    });
    for (const p of purchases) {
      const a = p.application;
      if (!a || (scope && a.dcs_ref !== scope)) continue;
      tasks.push({
        kind: 'vetExam',
        applicationUuid: a.application_uuid,
        farmerRef: a.farmer_ref,
        farmerName: await farmerNameFor(a.farmer_ref),
        dcsRef: a.dcs_ref,
        purchaseStatus: p.status,
        earTagNo: p.animal ? p.animal.ear_tag_no : null,
        species: p.animal ? p.animal.species : null,
        breed: p.animal ? p.animal.breed : null,
        initiatedAt: p.initiated_at,
      });
    }
  }

  const inspections = await CiaPostPurchaseInspection.findAll({
    where: { status: 'SCHEDULED' },
    include: [
      { model: CiaApplication, as: 'application' },
      { model: CiaPurchase, as: 'purchase', include: [{ model: CiaAnimal, as: 'animal' }] },
    ],
    order: [['due_date', 'ASC']],
  });
  for (const i of inspections) {
    const a = i.application;
    if (!a || (scope && a.dcs_ref !== scope)) continue;
    const animal = i.purchase && i.purchase.animal;
    tasks.push({
      kind: 'inspection',
      applicationUuid: a.application_uuid,
      farmerRef: a.farmer_ref,
      farmerName: await farmerNameFor(a.farmer_ref),
      dcsRef: a.dcs_ref,
      dueDay: i.due_day,
      dueDate: i.due_date,
      overdue: new Date(i.due_date) < new Date(),
      earTagNo: animal ? animal.ear_tag_no : null,
    });
  }

  return tasks;
};

/** Online submit (single verification). */
const submit = async (req) => {
  const actor = await resolveActor(req);
  if (!actor.appUserId) throw err('Unknown supervisor', 'CIA_ACTOR_UNKNOWN', 401);
  const p = { appUuid: req.params.appUuid, ...(req.body || {}) };
  const { sequelize } = getDb();
  return sequelize.transaction((t) => applyVerification(p, actor, t, { capturedOffline: Boolean(p.capturedOffline) }));
};

/**
 * Offline batch sync. Each op is idempotent by op_uuid (replay = DUPLICATE), and
 * server-wins on conflict (the application already moved on) — the loser is
 * recorded so the app can notify the farmer.
 * body: { deviceId, ops: [{ opUuid, clientTs, appUuid, result, remarks, shedGeo, residenceGeo, mediaRefs, checks }] }
 */
const sync = async (req) => {
  const actor = await resolveActor(req);
  if (!actor.appUserId) throw err('Unknown supervisor', 'CIA_ACTOR_UNKNOWN', 401);
  const { SyncQueueItem, sequelize } = getDb();
  const deviceId = req.body && req.body.deviceId;
  const ops = (req.body && req.body.ops) || [];
  const results = [];

  for (const op of ops) {
    // Idempotency: this op already landed?
    const existing = await SyncQueueItem.findOne({ where: { op_uuid: op.opUuid } });
    if (existing) { results.push({ opUuid: op.opUuid, status: 'DUPLICATE' }); continue; }

    const t = await sequelize.transaction();
    try {
      const item = await SyncQueueItem.create({
        op_uuid: op.opUuid, user_id: actor.appUserId, device_id: deviceId,
        entity_type: 'CiaFieldVerification', entity_ref: op.appUuid,
        action: 'CREATE', payload: op, client_ts: op.clientTs || new Date(), status: 'RECEIVED',
      }, { transaction: t });

      const applied = await applyVerification(op, actor, t, { capturedOffline: true });
      await item.update({ status: 'APPLIED', applied_at: new Date() }, { transaction: t });
      await t.commit();
      results.push({ opUuid: op.opUuid, status: 'APPLIED', applicationUuid: applied.applicationUuid, applicationStatus: applied.status });
    } catch (e) {
      await t.rollback();
      // Server-wins conflict vs a genuine failure.
      const status = e.errorCode === 'CIA_VERIFY_CONFLICT' ? 'CONFLICT' : 'FAILED';
      await SyncQueueItem.create({
        op_uuid: op.opUuid, user_id: actor.appUserId, device_id: deviceId,
        entity_type: 'CiaFieldVerification', entity_ref: op.appUuid, action: 'CREATE',
        payload: op, client_ts: op.clientTs || new Date(), status,
        conflict_detail: status === 'CONFLICT' ? { reason: e.message } : null,
        error_detail: status === 'FAILED' ? e.message : null,
      }).catch(() => {});
      results.push({ opUuid: op.opUuid, status, reason: e.message });
    }
  }
  return { synced: results };
};

module.exports = { myTasks, submit, sync, applyVerification };
