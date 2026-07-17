/**
 * CIA application service — scheme publish, eligibility pre-screen, EOI, draft,
 * document upload, submit, status. CIA-1 (MVP). No money movement here.
 *
 * Every status change routes through the CIA state machine (constants/ciaStatus)
 * and writes the domain_events outbox in the same transaction. Eligibility is
 * NON-BINDING (never a sanction). Scheme params come from cia_scheme_configs
 * (config, never code) via schemeConfigService.
 */
const crypto = require('crypto');
const { emitDomainEvent } = require('../../../shared/services/domainEvents');
const { erp } = require('../../../integrations');
const { APP, guardTransition } = require('../constants/ciaStatus');
const { resolveActor } = require('./context');
const schemeConfigService = require('./schemeConfigService');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };
const err = (msg, code, status = 400) => { const e = new Error(msg); e.statusCode = status; e.errorCode = code; return e; };

// Application rows in one of these statuses are "open" (an in-flight cycle).
const OPEN_STATUSES = Object.values(APP).filter(
  (s) => ![APP.NOT_SELECTED, APP.LOAN_REJECTED, APP.APPLICATION_CLOSED].includes(s),
);
// The farmer may fill/edit the application + documents in these statuses.
const FILLABLE_STATUSES = [APP.APPLICATION_PENDING, APP.DOCUMENTS_INCOMPLETE, APP.RETURNED_FOR_CORRECTION];

const toDto = (a) => ({
  applicationUuid: a.application_uuid,
  status: a.status,
  schemeVersion: a.scheme_version,
  dcsRef: a.dcs_ref,
  requestedCattleCount: a.requested_cattle_count,
  preferredBreed: a.preferred_breed,
  eoiAt: a.eoi_at,
  submittedAt: a.submitted_at,
  rejectReason: a.reject_reason,
});

/* --------------------------------- scheme ---------------------------------- */
const getPublishedScheme = async () => schemeConfigService.getPublishedScheme();

/** Every scheme open at the member's society (multiple can run at once), each with its
 *  own terms + a best-effort per-scheme likelyEligible for this farmer. */
const listSchemes = async (req) => {
  const actor = await resolveActor(req);
  return schemeConfigService.listSchemes({ farmerRef: actor.farmerRef });
};

/** One scheme's full detail by version (published + active only). */
const getSchemeDetail = async (req) => {
  const row = await schemeConfigService.getByVersion(req.params.schemeVersion);
  if (!row.is_published || !row.is_active) { const e = new Error('Scheme not available'); e.statusCode = 404; e.errorCode = 'CIA_SCHEME_UNKNOWN'; throw e; }
  return { schemeVersion: row.scheme_version, title: row.title, rules: row.rules_json, documentChecklist: row.doc_checklist, publishedAt: row.published_at };
};

const checkEligibility = async (req) => {
  const actor = await resolveActor(req);
  const schemeVersion = req.query && req.query.scheme; // optional — falls back to the latest published
  return schemeConfigService.checkEligibility({ farmerRef: actor.farmerRef, dcsRef: actor.dcsRef, schemeVersion });
};

/* ---------------------------------- EOI ★ ---------------------------------- */
/**
 * Express interest. Society membership is a precondition (CLAUDE.md CIA state
 * machine). Idempotent: an existing OPEN application for the same farmer+scheme
 * is returned rather than duplicated.
 */
const expressInterest = async (req) => {
  const actor = await resolveActor(req);
  if (!actor.farmerRef) throw err('Dairy-society membership is required to apply', 'CIA_MEMBERSHIP_REQUIRED', 403);

  // Pin a published scheme version (client may request one; it must be published).
  const requested = req.body && req.body.schemeVersion;
  let pinned;
  if (requested) {
    const row = await schemeConfigService.getByVersion(requested);
    if (!row.is_published) throw err(`Scheme ${requested} is not published`, 'CIA_SCHEME_UNPUBLISHED', 400);
    pinned = row.scheme_version;
  } else {
    pinned = (await schemeConfigService.getPublishedScheme()).schemeVersion;
  }

  const { CiaApplication, CoopMembership, sequelize } = getDb();
  const membership = await CoopMembership.findOne({ where: { farmer_ref: actor.farmerRef } });

  const existing = await CiaApplication.findOne({
    where: { farmer_ref: actor.farmerRef, scheme_version: pinned, status: OPEN_STATUSES },
  });
  if (existing) return { ...toDto(existing), alreadyExists: true };

  return sequelize.transaction(async (t) => {
    const app = await CiaApplication.create({
      application_uuid: crypto.randomUUID(),
      farmer_ref: actor.farmerRef,
      dcs_ref: actor.dcsRef || (membership && membership.society_ref),
      union_ref: membership ? membership.union_ref : null,
      user_id: actor.appUserId,
      scheme_version: pinned,
      status: APP.INTEREST_SUBMITTED,   // ★ farmer-authored initial
      eoi_at: new Date(),
    }, { transaction: t });

    // Route to the DCS Secretary's review queue.
    guardTransition('application', APP.INTEREST_SUBMITTED, APP.PENDING_DCS_REVIEW);
    await app.update({ status: APP.PENDING_DCS_REVIEW }, { transaction: t });

    await emitDomainEvent({
      eventType: 'cia.application.eoi', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
      farmerId: actor.appUserId,
      payload: { farmerRef: actor.farmerRef, schemeVersion: pinned, dcsRef: app.dcs_ref, status: APP.PENDING_DCS_REVIEW },
    }, { transaction: t });

    return { ...toDto(app), alreadyExists: false };
  });
};

const listForFarmer = async (req) => {
  const actor = await resolveActor(req);
  if (!actor.farmerRef) return [];
  const { CiaApplication } = getDb();
  const rows = await CiaApplication.findAll({ where: { farmer_ref: actor.farmerRef }, order: [['id', 'DESC']] });
  return rows.map(toDto);
};

/* ---------------------- application + documents (Slice B) ------------------ */
/** Load an application by uuid and assert the caller owns it. */
const loadOwned = async (appUuid, actor, { mustBeFillable = false } = {}) => {
  const { CiaApplication } = getDb();
  const app = await CiaApplication.findOne({ where: { application_uuid: appUuid } });
  if (!app) throw err('Application not found', 'CIA_APP_NOT_FOUND', 404);
  if (!actor.farmerRef || app.farmer_ref !== actor.farmerRef) throw err('Not your application', 'CIA_APP_FORBIDDEN', 403);
  if (mustBeFillable && !FILLABLE_STATUSES.includes(app.status)) {
    throw err(`Application cannot be edited from ${app.status}`, 'CIA_APP_NOT_FILLABLE', 409);
  }
  return app;
};

/** Compute mandatory-checklist completion for an application against its pinned scheme. */
const checklistStatus = async (app) => {
  const scheme = await schemeConfigService.getByVersion(app.scheme_version);
  const checklist = scheme.doc_checklist || [];
  const mandatoryKeys = checklist.filter((d) => (d.required || 'MANDATORY') === 'MANDATORY').map((d) => d.key);
  const { CiaDocument } = getDb();
  const docs = await CiaDocument.findAll({ where: { application_id: app.id, is_active: true } });
  const have = new Set(docs.map((d) => d.checklist_key));
  const missing = mandatoryKeys.filter((k) => !have.has(k));
  return { checklist, mandatoryKeys, capturedKeys: [...have], missing, complete: missing.length === 0 };
};

/**
 * Open/fill the farmer's application. In the single-row model the row already
 * exists from EOI; after DCS selection it is APPLICATION_PENDING. This merges
 * ERP pre-fill and persists the farmer's requested cattle count / breed.
 */
const createDraft = async (req) => {
  const actor = await resolveActor(req);
  if (!actor.farmerRef) throw err('Dairy-society membership is required', 'CIA_MEMBERSHIP_REQUIRED', 403);
  const { CiaApplication } = getDb();
  const app = await CiaApplication.findOne({
    where: { farmer_ref: actor.farmerRef, status: FILLABLE_STATUSES },
    order: [['id', 'DESC']],
  });
  if (!app) throw err('No application awaiting your details — you must be selected by your DCS first', 'CIA_NO_FILLABLE_APP', 409);

  const b = req.body || {};
  const patch = {};
  if (b.requestedCattleCount != null) patch.requested_cattle_count = b.requestedCattleCount;
  if (b.preferredBreed != null) patch.preferred_breed = b.preferredBreed;
  if (Object.keys(patch).length) await app.update(patch);

  // ERP pre-fill (editable-with-flag on the client; server just supplies values).
  let prefill = null;
  try { prefill = await erp.getFarmerMaster(actor.farmerRef); } catch (_e) { /* ERP degraded — form still opens */ }

  const status = await checklistStatus(app);
  return {
    ...toDto(app),
    prefill: prefill ? { name: prefill.name, mobile: prefill.mobile, dcsRef: prefill.societyRef, bankAccount: prefill.bankAccount, source: 'ERP' } : null,
    documentChecklist: status.checklist,
    documents: { captured: status.capturedKeys, missingMandatory: status.missing },
  };
};

/** Camera-first document upload — content-addressed, per checklist key (re-upload replaces). */
const uploadDocument = async (req) => {
  const actor = await resolveActor(req);
  const app = await loadOwned(req.params.appUuid, actor, { mustBeFillable: true });
  const b = req.body || {};

  const scheme = await schemeConfigService.getByVersion(app.scheme_version);
  const keys = (scheme.doc_checklist || []).map((d) => d.key);
  if (!keys.includes(b.checklistKey)) throw err(`Unknown checklist item "${b.checklistKey}"`, 'CIA_DOC_KEY_UNKNOWN', 400);

  const { CiaDocument, sequelize } = getDb();
  const saved = await sequelize.transaction(async (t) => {
    const existing = await CiaDocument.findOne({ where: { application_id: app.id, checklist_key: b.checklistKey }, transaction: t });
    const row = existing || CiaDocument.build({ document_uuid: crypto.randomUUID(), application_id: app.id, checklist_key: b.checklistKey });
    row.doc_ref = b.docRef;
    row.content_hash = b.contentHash;
    row.mime_type = b.mimeType || null;
    row.capture_meta = b.captureMeta || null;
    row.uploaded_by_user_id = actor.appUserId;
    row.is_active = true;
    await row.save({ transaction: t });
    await emitDomainEvent({
      eventType: 'cia.document.uploaded', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
      farmerId: actor.appUserId,
      payload: { checklistKey: b.checklistKey, contentHash: b.contentHash, replaced: Boolean(existing) },
    }, { transaction: t });
    return row;
  });

  const status = await checklistStatus(app);
  return { checklistKey: saved.checklist_key, uploaded: true, missingMandatory: status.missing, checklistComplete: status.complete };
};

/**
 * Submit ★ — blocked until every MANDATORY document is present. On success:
 * APPLICATION_PENDING | DOCUMENTS_INCOMPLETE | RETURNED_FOR_CORRECTION →
 * PENDING_SUPERVISOR_VERIFY (hands off to the route supervisor).
 */
const submit = async (req) => {
  const actor = await resolveActor(req);
  const app = await loadOwned(req.params.appUuid, actor, { mustBeFillable: true });

  const status = await checklistStatus(app);
  if (!status.complete) {
    const e = err('Complete the mandatory documents before submitting', 'CIA_CHECKLIST_INCOMPLETE', 422);
    e.details = { missingMandatory: status.missing };
    throw e;
  }

  const { sequelize } = getDb();
  return sequelize.transaction(async (t) => {
    guardTransition('application', app.status, APP.PENDING_SUPERVISOR_VERIFY);
    await app.update({ status: APP.PENDING_SUPERVISOR_VERIFY, submitted_at: new Date() }, { transaction: t });
    await emitDomainEvent({
      eventType: 'cia.application.submitted', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
      farmerId: actor.appUserId,
      payload: { farmerRef: app.farmer_ref, schemeVersion: app.scheme_version, status: APP.PENDING_SUPERVISOR_VERIFY },
    }, { transaction: t });
    return toDto(app);
  });
};

/* ------------------------------- status (Slice C) -------------------------- */
// Plain-language "what happens next" per status (farmer-facing).
const NEXT_STEP = {
  [APP.INTEREST_SUBMITTED]: 'Your society has your interest — the DCS will review it.',
  [APP.PENDING_DCS_REVIEW]: 'The DCS board will decide on your selection.',
  [APP.SELECTED_BY_DCS]: 'You are selected — complete your application and documents.',
  [APP.APPLICATION_PENDING]: 'Complete your application and upload the required documents.',
  [APP.DOCUMENTS_INCOMPLETE]: 'Some documents are missing — add them and resubmit.',
  [APP.PENDING_SUPERVISOR_VERIFY]: 'A route supervisor will visit to verify your details.',
  [APP.RETURNED_FOR_CORRECTION]: 'Your application was returned — fix the noted item and resubmit.',
  [APP.FORWARDED_TO_DUSS]: 'Forwarded to the district union (DUSS) for scrutiny.',
  [APP.UNDER_DUSS_SCRUTINY]: 'DUSS is scrutinising your application.',
  [APP.SUBMITTED_TO_BANK]: 'Your application packet is with the bank.',
  [APP.UNDER_BANK_APPRAISAL]: 'The bank is appraising your application.',
  [APP.BANK_QUERY_RAISED]: 'The bank has a query — please respond.',
  [APP.LOAN_SANCTIONED]: 'Your loan is sanctioned — next steps will follow.',
  [APP.LOAN_REJECTED]: 'Your application was not sanctioned.',
  [APP.NOT_SELECTED]: 'You were not selected this cycle — you may re-apply.',
};

/** Owner-scoped status timeline, derived from the append-only domain_events outbox. */
const getStatus = async (req) => {
  const actor = await resolveActor(req);
  const app = await loadOwned(req.params.appUuid, actor);
  const { DomainEvent } = getDb();
  const events = await DomainEvent.findAll({
    where: { aggregate_type: 'CiaApplication', aggregate_id: app.application_uuid },
    order: [['occurred_at', 'ASC'], ['id', 'ASC']],
  });
  const timeline = events.map((e) => ({ eventType: e.event_type, at: e.occurred_at, status: e.payload && e.payload.status ? e.payload.status : null }));
  const returnedFor = [APP.RETURNED_FOR_CORRECTION, APP.DOCUMENTS_INCOMPLETE].includes(app.status) && app.reject_reason
    ? { reason: app.reject_reason }
    : null;

  // Financials (CIA-2) — present once sanctioned; records mirror bank-authored events.
  const { CiaSubsidyTransfer, CiaDisbursement } = getDb();
  let financials = null;
  if (app.sanctioned_amount) {
    try { financials = await require('./financialService').computeSubsidy(app); } catch (_e) { /* scheme gone */ }
  }
  const st = await CiaSubsidyTransfer.findOne({ where: { application_id: app.id } });
  const disb = await CiaDisbursement.findOne({ where: { application_id: app.id } });

  return {
    applicationUuid: app.application_uuid,
    status: app.status,
    asOf: new Date(),                 // honest server freshness; client shows last-synced
    nextStep: NEXT_STEP[app.status] || null,
    returnedFor,
    financials,
    subsidyTransfer: st ? { ref: st.transfer_ref, amount: Number(st.amount), recordedAt: st.recorded_at } : null,
    disbursement: disb ? { loanAccount: disb.loan_account, amount: Number(disb.amount), ref: disb.disbursement_ref, recordedAt: disb.recorded_at } : null,
    purchaseUnlocked: app.status === APP.CATTLE_PURCHASE_PENDING,
    timeline,
  };
};

/* ------------------------------ admin config ------------------------------- */
const getConfig = async (req) => schemeConfigService.getConfig({ schemeVersion: req.query && req.query.schemeVersion });
const updateConfig = async (req) => {
  const actor = await resolveActor(req);
  const b = req.body || {};
  const row = await schemeConfigService.publishConfig(
    { schemeVersion: b.schemeVersion, title: b.title, rulesJson: b.rulesJson, docChecklist: b.docChecklist },
    actor,
  );
  return { schemeVersion: row.scheme_version, isPublished: row.is_published, publishedAt: row.published_at };
};

module.exports = {
  getPublishedScheme,
  listSchemes,          // multi-scheme: all active schemes for the member
  getSchemeDetail,      // one scheme by version
  checkEligibility,
  expressInterest,      // ★ Slice A
  listForFarmer,        // Slice A
  createDraft,          // Slice B — open/fill application (ERP pre-fill)
  uploadDocument,       // Slice B — camera-first, content-addressed
  submit,               // ★ Slice B — mandatory-gated → PENDING_SUPERVISOR_VERIFY
  getStatus,            // Slice C — owner-scoped timeline from domain_events
  getConfig,            // Slice 0 (admin)
  updateConfig,         // Slice 0 (admin publish)
  // exported for tests + sibling services
  checklistStatus, FILLABLE_STATUSES,
};
