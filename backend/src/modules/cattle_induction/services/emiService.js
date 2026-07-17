/**
 * CIA EMI service (CIA-2) — bank EMI-schedule ingest + the farmer EMI view.
 *
 * The schedule is ingested from the bank via filedrop, idempotent by
 * file_row_hash (re-uploading the same file dedupes) — the same discipline as the
 * sanction file. A schedule can only be ingested for a DISBURSED loan. The
 * deduction ledger (due↔deducted↔remitted, partial/overdue/default) and the
 * consent-gated initiate/track split land in the next slice.
 */
const crypto = require('crypto');
const { emitDomainEvent } = require('../../../shared/services/domainEvents');
const { coopbank } = require('../../../integrations');
const { resolveActor } = require('./context');
const { APP, guardTransition } = require('../constants/ciaStatus');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };
const err = (msg, code, status = 400) => { const e = new Error(msg); e.statusCode = status; e.errorCode = code; return e; };
const rowHash = (fileRef, r) => crypto.createHash('sha256').update([fileRef, r.applicationUuid, r.installmentNo].join('|')).digest('hex');

/** Bank maker: ingest EMI-schedule rows (idempotent). Requires a disbursed loan. */
const ingestSchedule = async (req) => {
  const actor = await resolveActor(req);
  if (!actor.appUserId) throw err('Unknown bank maker', 'CIA_ACTOR_UNKNOWN', 401);
  const { CiaApplication, CiaDisbursement, CiaEmiSchedule, sequelize } = getDb();
  const { fileRef, rows } = req.body || {};

  let ingested = 0; let duplicates = 0; const skipped = [];
  await sequelize.transaction(async (t) => {
    for (const r of rows) {
      const hash = rowHash(fileRef, r);
      const dup = await CiaEmiSchedule.findOne({ where: { file_row_hash: hash }, transaction: t });
      if (dup) { duplicates += 1; continue; }

      const app = await CiaApplication.findOne({ where: { application_uuid: r.applicationUuid }, transaction: t });
      const disbursed = app && await CiaDisbursement.findOne({ where: { application_id: app.id }, transaction: t });
      if (!disbursed) { skipped.push({ applicationUuid: r.applicationUuid, reason: 'not disbursed' }); continue; }

      await CiaEmiSchedule.create({
        schedule_uuid: crypto.randomUUID(), application_id: app.id,
        installment_no: r.installmentNo, emi_due: r.emiDue, due_date: r.dueDate,
        status: 'SCHEDULED', file_ref: fileRef, file_row_hash: hash,
      }, { transaction: t });
      ingested += 1;
    }
    if (ingested) {
      await emitDomainEvent({
        eventType: 'cia.emi.schedule_ingested', aggregateType: 'CiaEmiSchedule', aggregateId: fileRef,
        farmerId: null, payload: { fileRef, ingested, duplicates },
      }, { transaction: t });
    }
  });
  return { fileRef, ingested, duplicates, skipped };
};

/* ------------------------- reconciliation (Slice L) ------------------------ */
const DEFAULT_EMI_CFG = { graceDays: 5, defaultAfterDays: 90, deductionPriority: ['emi', 'feed', 'insurance', 'other'], allowPrepaymentCarry: false };
const addDays = (d, n) => new Date(new Date(d).getTime() + n * 24 * 60 * 60 * 1000);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Merge the pinned scheme's rules_json.emiConfig over the code defaults (Convention 5). */
const resolveEmiCfg = async (app) => {
  const scheme = app.scheme_version ? await require('./schemeConfigService').getByVersion(app.scheme_version).catch(() => null) : null;
  return { ...DEFAULT_EMI_CFG, ...((scheme && scheme.rules_json && scheme.rules_json.emiConfig) || {}) };
};

/** Classify one installment from due vs covered (config: grace + default bucket).
 *  An installment whose due date falls within an active moratorium window is shielded
 *  from ageing (MORATORIUM), never OVERDUE/DEFAULT. */
const classify = (emiDue, deducted, dueDate, asOf, cfg, moratoriumUntil = null) => {
  if (deducted >= emiDue) return 'PAID';
  if (moratoriumUntil && new Date(dueDate) <= new Date(moratoriumUntil)) return 'MORATORIUM';
  if (deducted > 0) return 'PARTIAL';
  if (asOf <= addDays(dueDate, cfg.graceDays)) return 'DUE';
  if (asOf > addDays(dueDate, cfg.defaultAfterDays)) return 'DEFAULT';
  return 'OVERDUE';
};

/** Consent gate (Convention 33): initiate only with an ACTIVE consent artefact.
 *  app.emi_consent_ref is the denormalised pointer (set on record, cleared on revoke). */
const getDeductionMode = (app) => (app.emi_consent_ref ? 'INITIATE' : 'TRACK');

/** The latest ACTIVE consent for an application, or null. */
const getActiveConsent = async (app) => {
  const { CiaEmiConsent } = getDb();
  return CiaEmiConsent.findOne({ where: { application_id: app.id, status: 'ACTIVE' }, order: [['id', 'DESC']] });
};

/**
 * Close a live loan (EMI_ACTIVE/EMI_OVERDUE → LOAN_CLOSED) once it is fully repaid
 * or fully cleared by a claim settlement. There is no direct EMI_OVERDUE→LOAN_CLOSED
 * edge, so hop via EMI_ACTIVE. Shared by reconcile (full repayment) and the claim
 * bridge. Runs inside the caller's transaction; returns true iff it closed the loan.
 */
const closeLoanIfCleared = async (app, { reason, extraPayload = {} } = {}, t) => {
  if (app.status !== APP.EMI_ACTIVE && app.status !== APP.EMI_OVERDUE) return false;
  if (app.status === APP.EMI_OVERDUE) {
    guardTransition('application', app.status, APP.EMI_ACTIVE);
    await app.update({ status: APP.EMI_ACTIVE }, { transaction: t });
  }
  guardTransition('application', app.status, APP.LOAN_CLOSED);
  await app.update({ status: APP.LOAN_CLOSED }, { transaction: t });
  await emitDomainEvent({
    eventType: 'cia.loan.closed', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
    farmerId: null, payload: { reason, ...extraPayload },
  }, { transaction: t });
  return true;
};

/**
 * Apply insurance-claim settlement proceeds to the EMI ledger, oldest installment
 * first, recording them on claim_adjusted (durable — reconcile preserves it). Keeps
 * the ledger complete (one row per schedule installment) so getEmi's outstanding sum
 * stays correct. Runs inside the caller's transaction. Deterministic, never a model.
 */
const applyClaimProceeds = async ({ app, amount, sourceRef, asOf = new Date() }, t) => {
  const { CiaEmiSchedule, CiaEmiLedger } = getDb();
  const cfg = await resolveEmiCfg(app);
  const schedule = await CiaEmiSchedule.findAll({ where: { application_id: app.id }, order: [['installment_no', 'ASC']], transaction: t });
  let remaining = round2(amount);
  let outstandingAfter = 0;
  for (const s of schedule) {
    const emiDue = Number(s.emi_due);
    const existing = await CiaEmiLedger.findOne({ where: { application_id: app.id, installment_no: s.installment_no }, transaction: t });
    const row = existing || CiaEmiLedger.build({ ledger_uuid: crypto.randomUUID(), application_id: app.id, installment_no: s.installment_no, emi_due: emiDue });
    const deducted = Number(row.amount_deducted || 0);
    const claimAdj = Number(row.claim_adjusted || 0);
    const owed = Math.max(0, round2(emiDue - deducted - claimAdj));
    const apply = Math.min(remaining, owed);
    if (apply > 0) { row.claim_adjusted = round2(claimAdj + apply); if (sourceRef) row.source_ref = sourceRef; remaining = round2(remaining - apply); }
    const covered = round2(deducted + Number(row.claim_adjusted || 0));
    row.emi_due = emiDue;
    row.pending_amount = Math.max(0, round2(emiDue - covered));
    row.status = classify(emiDue, covered, s.due_date, asOf, cfg);
    row.reconciled_at = asOf;
    await row.save({ transaction: t });
    outstandingAfter = round2(outstandingAfter + Number(row.pending_amount));
  }
  return { appliedToLedger: round2(round2(amount) - remaining), outstandingAfter, fullyCleared: schedule.length > 0 && outstandingAfter === 0 };
};

/** Farmer: record the tri-partite EMI-deduction consent → flips mode to INITIATE. */
const recordConsent = async (req) => {
  const actor = await resolveActor(req);
  const { CiaApplication, CiaEmiConsent, sequelize } = getDb();
  const b = req.body || {};
  const app = await CiaApplication.findOne({ where: { application_uuid: req.params.appUuid } });
  if (!app) throw err('Application not found', 'CIA_APP_NOT_FOUND', 404);
  if (!actor.farmerRef || app.farmer_ref !== actor.farmerRef) throw err('Not your application', 'CIA_APP_FORBIDDEN', 403);

  return sequelize.transaction(async (t) => {
    // Supersede any existing active consent (keep history).
    await CiaEmiConsent.update({ status: 'REVOKED', revoked_at: new Date() }, { where: { application_id: app.id, status: 'ACTIVE' }, transaction: t });
    const consent = await CiaEmiConsent.create({
      consent_uuid: crypto.randomUUID(), application_id: app.id,
      farmer_ref: app.farmer_ref, society_ref: app.dcs_ref, bank_ref: b.bankRef || null,
      authorisation_ref: b.authorisationRef, channel: b.channel || 'app',
      purpose: 'emi_deduction', status: 'ACTIVE', consented_at: new Date(), recorded_by_user_id: actor.appUserId,
    }, { transaction: t });
    await app.update({ emi_consent_ref: consent.consent_uuid }, { transaction: t });
    await emitDomainEvent({
      eventType: 'cia.emi.consent_recorded', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
      farmerId: actor.appUserId, payload: { consentUuid: consent.consent_uuid, purpose: 'emi_deduction' },
    }, { transaction: t });
    return { applicationUuid: app.application_uuid, consentUuid: consent.consent_uuid, emiMode: 'INITIATE' };
  });
};

/** Farmer: revoke consent → mode falls back to TRACK. */
const revokeConsent = async (req) => {
  const actor = await resolveActor(req);
  const { CiaApplication, CiaEmiConsent, sequelize } = getDb();
  const app = await CiaApplication.findOne({ where: { application_uuid: req.params.appUuid } });
  if (!app) throw err('Application not found', 'CIA_APP_NOT_FOUND', 404);
  if (!actor.farmerRef || app.farmer_ref !== actor.farmerRef) throw err('Not your application', 'CIA_APP_FORBIDDEN', 403);
  const active = await getActiveConsent(app);
  if (!active) throw err('No active consent to revoke', 'CIA_CONSENT_NONE', 404);

  return sequelize.transaction(async (t) => {
    await active.update({ status: 'REVOKED', revoked_at: new Date() }, { transaction: t });
    await app.update({ emi_consent_ref: null }, { transaction: t });
    await emitDomainEvent({
      eventType: 'cia.emi.consent_revoked', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
      farmerId: actor.appUserId, payload: { consentUuid: active.consent_uuid },
    }, { transaction: t });
    return { applicationUuid: app.application_uuid, emiMode: 'TRACK' };
  });
};

/**
 * Initiate a milk-payment deduction — permitted ONLY with an ACTIVE consent
 * (else track-only). With consent it calls the cooperative-bank adapter: mock
 * accepts and returns a deduction ref; live fails loud (COOPBANK_NOT_READY) until
 * the contract lands (#2). Never a silent auto-deduction.
 */
const initiateDeduction = async (app, { installmentNo, amount } = {}) => {
  if (getDeductionMode(app) !== 'INITIATE') {
    throw err('No tri-partite consent on file — deduction is track-only', 'CIA_CONSENT_REQUIRED', 403);
  }
  return coopbank.initiateEmiDeduction({ applicationUuid: app.application_uuid, installmentNo, amount, consentRef: app.emi_consent_ref });
};

/**
 * Reconcile ERP milk-payment deductions against the schedule (track mode).
 * deductions: [{ installmentNo, amountDeducted, amountRemitted }]. Idempotent —
 * re-reconciling updates the ledger rows in place.
 */
const reconcile = async ({ applicationUuid, deductions = [], asOf = new Date(), sourceRef = null }) => {
  const { CiaApplication, CiaEmiSchedule, CiaEmiLedger, sequelize } = getDb();
  const app = await CiaApplication.findOne({ where: { application_uuid: applicationUuid } });
  if (!app) throw err('Application not found', 'CIA_APP_NOT_FOUND', 404);
  const cfg = await resolveEmiCfg(app);

  const schedule = await CiaEmiSchedule.findAll({ where: { application_id: app.id }, order: [['installment_no', 'ASC']] });
  const byNo = Object.fromEntries(deductions.map((d) => [d.installmentNo, d]));

  const byStatus = {};
  const statusByNo = {};
  const reversals = [];
  let carryIn = 0; // running prepayment surplus carried to the next installment (config-gated)
  await sequelize.transaction(async (t) => {
    for (const s of schedule) {
      const d = byNo[s.installment_no] || { amountDeducted: 0, amountRemitted: 0 };
      const emiDue = Number(s.emi_due);
      const deducted = Number(d.amountDeducted || 0);
      const remitted = Number(d.amountRemitted || 0);
      const reversed = Number(d.amountReversed || 0);          // bank reversal / excessive-deduction refund
      const netDeducted = Math.max(0, round2(deducted - reversed));

      const existing = await CiaEmiLedger.findOne({ where: { application_id: app.id, installment_no: s.installment_no }, transaction: t });
      const claimAdj = existing ? Number(existing.claim_adjusted || 0) : 0; // preserve claim proceeds across sweeps
      const carriedApplied = cfg.allowPrepaymentCarry ? carryIn : 0;        // surplus from earlier installments
      const covered = round2(netDeducted + claimAdj + carriedApplied);
      carryIn = cfg.allowPrepaymentCarry ? Math.max(0, round2(covered - emiDue)) : 0; // overpayment → next installment
      const pending = Math.max(0, round2(emiDue - covered));
      const status = classify(emiDue, covered, s.due_date, asOf, cfg, app.moratorium_until);
      byStatus[status] = (byStatus[status] || 0) + 1;
      statusByNo[s.installment_no] = status;
      if (reversed > 0) reversals.push({ installmentNo: s.installment_no, reversed });

      const row = existing || CiaEmiLedger.build({ ledger_uuid: crypto.randomUUID(), application_id: app.id, installment_no: s.installment_no });
      row.emi_due = emiDue; row.amount_deducted = deducted; row.amount_remitted = remitted; row.reversed_amount = reversed; row.carried_amount = carriedApplied;
      row.pending_amount = pending; row.status = status; row.reconciled_at = asOf; row.source_ref = sourceRef;
      // Never reset row.claim_adjusted — a built row defaults to 0; an existing row keeps its value.
      await row.save({ transaction: t });
      // Keep the schedule row's status coarse-synced for quick reads.
      await s.update({ status }, { transaction: t });
    }

    // Drive the application lifecycle from the reconciled ledger — only for a live
    // loan (EMI_ACTIVE/EMI_OVERDUE) so pre-repayment reconciles are untouched.
    // No auto-rejection: a DEFAULT only raises a human-facing alert (Convention 21).
    if (app.status === APP.EMI_ACTIVE || app.status === APP.EMI_OVERDUE) {
      const statuses = schedule.map((s) => statusByNo[s.installment_no]);
      const allPaid = statuses.length > 0 && statuses.every((st) => st === 'PAID');
      const anyBad = statuses.some((st) => st === 'OVERDUE' || st === 'DEFAULT');
      const anyDefault = statuses.some((st) => st === 'DEFAULT');
      if (allPaid) {
        await closeLoanIfCleared(app, { reason: 'fully_repaid' }, t);
      } else if (anyBad && app.status === APP.EMI_ACTIVE) {
        guardTransition('application', app.status, APP.EMI_OVERDUE);
        await app.update({ status: APP.EMI_OVERDUE }, { transaction: t });
        await emitDomainEvent({ eventType: 'cia.emi.overdue', aggregateType: 'CiaApplication', aggregateId: app.application_uuid, farmerId: null, payload: { byStatus } }, { transaction: t });
      } else if (!anyBad && app.status === APP.EMI_OVERDUE) {
        guardTransition('application', app.status, APP.EMI_ACTIVE);
        await app.update({ status: APP.EMI_ACTIVE }, { transaction: t });
        await emitDomainEvent({ eventType: 'cia.emi.recovered', aggregateType: 'CiaApplication', aggregateId: app.application_uuid, farmerId: null, payload: { byStatus } }, { transaction: t });
      }
      if (anyDefault) {
        const defaulted = schedule.filter((s) => statusByNo[s.installment_no] === 'DEFAULT').map((s) => s.installment_no);
        await emitDomainEvent({ eventType: 'cia.emi.default', aggregateType: 'CiaApplication', aggregateId: app.application_uuid, farmerId: null, payload: { installments: defaulted, byStatus } }, { transaction: t });
      }
    }

    // Reversals/refunds are auditable (Convention 21 — recorded, not silently absorbed).
    if (reversals.length) {
      await emitDomainEvent({ eventType: 'cia.emi.reversed', aggregateType: 'CiaApplication', aggregateId: app.application_uuid, farmerId: null, payload: { reversals } }, { transaction: t });
    }
    await emitDomainEvent({
      eventType: 'cia.emi.reconciled', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
      farmerId: null, payload: { mode: getDeductionMode(app), byStatus, deductionPriority: cfg.deductionPriority, asOf },
    }, { transaction: t });
  });
  return { applicationUuid, mode: getDeductionMode(app), reconciled: schedule.length, byStatus, applicationStatus: app.status };
};

/** Farmer (owner-scoped): the EMI schedule + loan↔milk map + reconciled ledger. */
const getEmi = async (req) => {
  const actor = await resolveActor(req);
  const { CiaApplication, CiaEmiSchedule } = getDb();
  const app = await CiaApplication.findOne({ where: { application_uuid: req.params.appUuid } });
  if (!app) throw err('Application not found', 'CIA_APP_NOT_FOUND', 404);
  if (!actor.farmerRef || app.farmer_ref !== actor.farmerRef) throw err('Not your application', 'CIA_APP_FORBIDDEN', 403);
  const cfg = await resolveEmiCfg(app);

  const rows = await CiaEmiSchedule.findAll({ where: { application_id: app.id }, order: [['installment_no', 'ASC']] });
  const { CiaEmiLedger } = getDb();
  const ledgerRows = await CiaEmiLedger.findAll({ where: { application_id: app.id }, order: [['installment_no', 'ASC']] });
  const ledger = ledgerRows.map((r) => ({
    installmentNo: r.installment_no, emiDue: Number(r.emi_due), amountDeducted: Number(r.amount_deducted),
    amountRemitted: Number(r.amount_remitted), pending: Number(r.pending_amount), status: r.status,
  }));
  // Once a ledger exists, its pending sum is authoritative (0 = fully repaid/cleared);
  // fall back to the gross schedule only before the first reconcile. (A bare `|| sum`
  // would wrongly report the gross schedule whenever outstanding is legitimately 0.)
  const outstanding = ledgerRows.length > 0
    ? ledger.reduce((s, l) => s + l.pending, 0)
    : rows.reduce((s, r) => s + Number(r.emi_due), 0);
  const next = ledger.find((l) => l.status === 'DUE' || l.status === 'OVERDUE')
    || rows.map((r) => ({ installmentNo: r.installment_no, emiDue: Number(r.emi_due), dueDate: r.due_date })).find((r) => r);

  return {
    applicationUuid: app.application_uuid,
    loanAccount: app.loan_account,
    milkAccountRef: app.milk_account_ref,
    mode: getDeductionMode(app),           // TRACK unless a consent artefact is on file
    consentOnFile: Boolean(app.emi_consent_ref),
    deductionPriority: cfg.deductionPriority, // apportionment order vs feed/insurance/other (config)
    moratoriumUntil: app.moratorium_until,    // installments due on/before this are shielded from ageing
    installments: rows.length,
    outstanding: Math.round(outstanding * 100) / 100,
    nextEmi: next ? { installmentNo: next.installmentNo, amount: next.emiDue } : null,
    schedule: rows.map((r) => ({ installmentNo: r.installment_no, dueDate: r.due_date, emiDue: Number(r.emi_due), status: r.status })),
    ledger,
  };
};

/**
 * Farmer (owner-scoped): the no-dues certificate for a fully-repaid loan (Convention 28
 * generated-document). Composes append-only facts — the cia.loan.closed event date and
 * the ledger total; no side effects. 409 CIA_LOAN_NOT_CLOSED unless the loan is closed.
 */
const getNoDuesCertificate = async (req) => {
  const actor = await resolveActor(req);
  const { CiaApplication, CiaEmiLedger, DomainEvent } = getDb();
  const app = await CiaApplication.findOne({ where: { application_uuid: req.params.appUuid } });
  if (!app) throw err('Application not found', 'CIA_APP_NOT_FOUND', 404);
  if (!actor.farmerRef || app.farmer_ref !== actor.farmerRef) throw err('Not your application', 'CIA_APP_FORBIDDEN', 403);
  if (app.status !== APP.LOAN_CLOSED) throw err('Loan is not closed — no-dues certificate unavailable', 'CIA_LOAN_NOT_CLOSED', 409);
  const closedEvent = await DomainEvent.findOne({ where: { event_type: 'cia.loan.closed', aggregate_id: app.application_uuid }, order: [['id', 'DESC']] });
  const ledgerRows = await CiaEmiLedger.findAll({ where: { application_id: app.id } });
  const totalRepaid = round2(ledgerRows.reduce((s, r) => s + Number(r.emi_due), 0));
  return {
    certificateNo: 'NDC-' + app.application_uuid.slice(0, 8).toUpperCase(),
    applicationUuid: app.application_uuid,
    loanAccount: app.loan_account,
    farmerRef: app.farmer_ref,
    closedAt: closedEvent ? closedEvent.occurred_at : null,
    totalRepaid,
    statement: 'No dues outstanding',
  };
};

/**
 * DUSS/UCDF: re-map the milk-payment account when a farmer shifts society (PRD 2.4).
 * Decouples milk_account_ref from farmer_ref so recovery follows the farmer's new
 * society feed. Only for a loan in repayment; append-only event; no auto-action.
 */
const remapMilkAccount = async (req) => {
  const actor = await resolveActor(req);
  if (!actor.appUserId) throw err('Unknown officer', 'CIA_ACTOR_UNKNOWN', 401);
  const { CiaApplication, sequelize } = getDb();
  const b = req.body || {};
  const app = await CiaApplication.findOne({ where: { application_uuid: req.params.appUuid } });
  if (!app) throw err('Application not found', 'CIA_APP_NOT_FOUND', 404);
  if (app.status !== APP.EMI_ACTIVE && app.status !== APP.EMI_OVERDUE) throw err('Milk account can only be re-mapped for a loan in repayment', 'CIA_APP_BAD_STATE', 409);
  const prev = app.milk_account_ref;
  return sequelize.transaction(async (t) => {
    const patch = { milk_account_ref: b.newMilkAccountRef };
    if (b.newDcsRef) patch.dcs_ref = b.newDcsRef;
    await app.update(patch, { transaction: t });
    await emitDomainEvent({
      eventType: 'cia.emi.milk_account_remapped', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
      farmerId: null, payload: { from: prev, to: b.newMilkAccountRef, newDcsRef: b.newDcsRef || null, reason: b.reason, by: actor.appUserId },
    }, { transaction: t });
    return { applicationUuid: app.application_uuid, milkAccountRef: b.newMilkAccountRef, dcsRef: patch.dcs_ref || app.dcs_ref };
  });
};

/**
 * DUSS/UCDF: set a repayment moratorium until a date (PRD §7.5). Installments due on
 * or before it are shielded from ageing (MORATORIUM) at the next reconcile. Only for a
 * loan in repayment; append-only event; no auto-action.
 */
const setMoratorium = async (req) => {
  const actor = await resolveActor(req);
  if (!actor.appUserId) throw err('Unknown officer', 'CIA_ACTOR_UNKNOWN', 401);
  const { CiaApplication, sequelize } = getDb();
  const b = req.body || {};
  const app = await CiaApplication.findOne({ where: { application_uuid: req.params.appUuid } });
  if (!app) throw err('Application not found', 'CIA_APP_NOT_FOUND', 404);
  if (app.status !== APP.EMI_ACTIVE && app.status !== APP.EMI_OVERDUE) throw err('Moratorium applies only to a loan in repayment', 'CIA_APP_BAD_STATE', 409);
  return sequelize.transaction(async (t) => {
    await app.update({ moratorium_until: b.untilDate }, { transaction: t });
    await emitDomainEvent({
      eventType: 'cia.emi.moratorium_set', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
      farmerId: null, payload: { untilDate: b.untilDate, reason: b.reason, by: actor.appUserId },
    }, { transaction: t });
    return { applicationUuid: app.application_uuid, moratoriumUntil: b.untilDate };
  });
};

/**
 * Bank (checker): restructure a loan (PRD §7.5; authors the encoded LOAN_RESTRUCTURED
 * transition). Replaces the current schedule with a new one and re-amortises: the old
 * schedule + its derived ledger are superseded (snapshotted into the event for audit —
 * ledger/schedule are not the append-only outbox, Convention 8), a fresh schedule is
 * written at an incremented version, and the loan hops EMI_ACTIVE/EMI_OVERDUE →
 * LOAN_RESTRUCTURED → EMI_ACTIVE. Only for a loan in repayment; no auto-action.
 */
const restructureLoan = async (req) => {
  const actor = await resolveActor(req);
  if (!actor.appUserId) throw err('Unknown officer', 'CIA_ACTOR_UNKNOWN', 401);
  const { CiaApplication, CiaEmiSchedule, CiaEmiLedger, sequelize } = getDb();
  const b = req.body || {};
  const app = await CiaApplication.findOne({ where: { application_uuid: req.params.appUuid } });
  if (!app) throw err('Application not found', 'CIA_APP_NOT_FOUND', 404);
  if (app.status !== APP.EMI_ACTIVE && app.status !== APP.EMI_OVERDUE) throw err('Only a loan in repayment can be restructured', 'CIA_APP_BAD_STATE', 409);
  const oldSchedule = await CiaEmiSchedule.findAll({ where: { application_id: app.id }, order: [['installment_no', 'ASC']] });
  const prevVersion = oldSchedule.length ? Math.max(...oldSchedule.map((s) => Number(s.schedule_version || 1))) : 0;
  const newVersion = prevVersion + 1;
  const snapshot = oldSchedule.map((s) => ({ installmentNo: s.installment_no, emiDue: Number(s.emi_due), dueDate: s.due_date, version: Number(s.schedule_version || 1) }));

  return sequelize.transaction(async (t) => {
    await CiaEmiLedger.destroy({ where: { application_id: app.id }, transaction: t });
    await CiaEmiSchedule.destroy({ where: { application_id: app.id }, transaction: t });
    for (const r of b.rows) {
      // eslint-disable-next-line no-await-in-loop
      await CiaEmiSchedule.create({
        schedule_uuid: crypto.randomUUID(), application_id: app.id, installment_no: r.installmentNo,
        emi_due: r.emiDue, due_date: r.dueDate, status: 'SCHEDULED', schedule_version: newVersion,
        file_ref: b.restructureRef, file_row_hash: crypto.randomUUID().replace(/-/g, ''),
      }, { transaction: t });
    }
    guardTransition('application', app.status, APP.LOAN_RESTRUCTURED);
    await app.update({ status: APP.LOAN_RESTRUCTURED }, { transaction: t });
    guardTransition('application', APP.LOAN_RESTRUCTURED, APP.EMI_ACTIVE);
    await app.update({ status: APP.EMI_ACTIVE, restructured_at: new Date(), restructure_ref: b.restructureRef }, { transaction: t });
    await emitDomainEvent({
      eventType: 'cia.emi.restructured', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
      farmerId: null, payload: { restructureRef: b.restructureRef, reason: b.reason, scheduleVersion: newVersion, supersededSchedule: snapshot, newInstallments: b.rows.length, by: actor.appUserId },
    }, { transaction: t });
    return { applicationUuid: app.application_uuid, status: APP.EMI_ACTIVE, scheduleVersion: newVersion, installments: b.rows.length };
  });
};

module.exports = { ingestSchedule, reconcile, getEmi, getDeductionMode, getActiveConsent, recordConsent, revokeConsent, initiateDeduction, applyClaimProceeds, closeLoanIfCleared, getNoDuesCertificate, remapMilkAccount, setMoratorium, restructureLoan };
