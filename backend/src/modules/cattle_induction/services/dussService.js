/**
 * CIA DUSS/district service — bulk inbox, scrutiny, deficiency memo, bank-batch +
 * prescribed-format generation (maker-checker), plus UCDF command dashboard,
 * reports and audit-log reads.
 *
 * The banker interface in v1 is a GENERATED DOCUMENT first (Convention 28): the
 * bank-wise packet. Maker prepares (scrutinise/deficiency), checker approves
 * (generate batch) — and the checker MUST differ from the scrutinising maker
 * (segregation of duties). The prescribed form template is pending open-question
 * #4, so the packet ships against a configurable placeholder format for now.
 * Subsidy calc + transfer records are CIA-2; dashboard/report/audit-log are Slice I.
 */
const crypto = require('crypto');
const { emitDomainEvent } = require('../../../shared/services/domainEvents');
const { APP, guardTransition } = require('../constants/ciaStatus');
const { resolveActor } = require('./context');
const { assertDifferentActor } = require('./segregation');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };
const err = (msg, code, status = 400) => { const e = new Error(msg); e.statusCode = status; e.errorCode = code; return e; };

const PLACEHOLDER_FORMAT = 'CIA_BANK_PACKET_PLACEHOLDER_v0'; // swap when open-question #4 lands

/** DUSS inbox — verified + in-scrutiny applications, own-union scoped when supplied. */
const inbox = async (req) => {
  const { CiaApplication } = getDb();
  const scope = (req.user && req.user.unionRef) || (req.query && req.query.unionRef) || null;
  const where = { status: [APP.FORWARDED_TO_DUSS, APP.UNDER_DUSS_SCRUTINY] };
  if (scope) where.union_ref = scope;
  const rows = await CiaApplication.findAll({ where, order: [['id', 'ASC']] });
  return rows.map((a) => ({ applicationUuid: a.application_uuid, farmerRef: a.farmer_ref, dcsRef: a.dcs_ref, unionRef: a.union_ref, status: a.status }));
};

/** Maker: record scrutiny → UNDER_DUSS_SCRUTINY (captures the maker for later SoD). */
const scrutinise = async (req) => {
  const actor = await resolveActor(req);
  if (!actor.appUserId) throw err('Unknown DUSS operator', 'CIA_ACTOR_UNKNOWN', 401);
  const { CiaApplication, sequelize } = getDb();
  const app = await CiaApplication.findOne({ where: { application_uuid: req.params.appUuid } });
  if (!app) throw err('Application not found', 'CIA_APP_NOT_FOUND', 404);
  if (app.status !== APP.FORWARDED_TO_DUSS) throw err(`Cannot scrutinise from ${app.status}`, 'CIA_APP_BAD_STATE', 409);

  return sequelize.transaction(async (t) => {
    guardTransition('application', app.status, APP.UNDER_DUSS_SCRUTINY);
    await app.update({ status: APP.UNDER_DUSS_SCRUTINY, scrutinised_by_user_id: actor.appUserId }, { transaction: t });
    await emitDomainEvent({
      eventType: 'cia.duss.scrutinised', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
      farmerId: null, payload: { maker: actor.appUserId, status: APP.UNDER_DUSS_SCRUTINY },
    }, { transaction: t });
    return { applicationUuid: app.application_uuid, status: APP.UNDER_DUSS_SCRUTINY };
  });
};

/** Maker: itemised deficiency memo → DOCUMENTS_INCOMPLETE (back to the farmer). */
const raiseDeficiency = async (req) => {
  const actor = await resolveActor(req);
  const { CiaApplication, sequelize } = getDb();
  const b = req.body || {};
  const app = await CiaApplication.findOne({ where: { application_uuid: req.params.appUuid } });
  if (!app) throw err('Application not found', 'CIA_APP_NOT_FOUND', 404);
  if (app.status !== APP.UNDER_DUSS_SCRUTINY) throw err(`Cannot raise a deficiency from ${app.status}`, 'CIA_APP_BAD_STATE', 409);

  const reason = (b.items || []).join('; ');
  return sequelize.transaction(async (t) => {
    guardTransition('application', app.status, APP.DOCUMENTS_INCOMPLETE);
    await app.update({ status: APP.DOCUMENTS_INCOMPLETE, reject_reason: reason }, { transaction: t });
    await emitDomainEvent({
      eventType: 'cia.deficiency.raised', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
      farmerId: null, payload: { by: actor.appUserId, items: b.items, remarks: b.remarks || null },
    }, { transaction: t });
    return { applicationUuid: app.application_uuid, status: APP.DOCUMENTS_INCOMPLETE, items: b.items };
  });
};

/**
 * Checker: generate a bank-wise packet over selected UNDER_DUSS_SCRUTINY apps.
 * Enforces segregation of duties (checker ≠ the maker who scrutinised each app),
 * writes a content-addressed placeholder packet, and moves each app to
 * SUBMITTED_TO_BANK. No money moves (that is CIA-2).
 */
const generateBankBatch = async (req) => {
  const actor = await resolveActor(req);
  if (!actor.appUserId) throw err('Unknown DUSS checker', 'CIA_ACTOR_UNKNOWN', 401);
  const b = req.body || {};
  const { CiaApplication, CiaBankBatch, sequelize } = getDb();

  const apps = await CiaApplication.findAll({ where: { application_uuid: b.applicationUuids } });
  if (apps.length !== b.applicationUuids.length) throw err('Some applications were not found', 'CIA_APP_NOT_FOUND', 404);
  for (const app of apps) {
    if (app.status !== APP.UNDER_DUSS_SCRUTINY) throw err(`Application ${app.application_uuid} is ${app.status}, not ready to batch`, 'CIA_APP_BAD_STATE', 409);
    // Segregation of duties: the checker cannot be the maker who scrutinised it.
    assertDifferentActor(app.scrutinised_by_user_id, actor.appUserId);
  }

  return sequelize.transaction(async (t) => {
    const appUuids = apps.map((a) => a.application_uuid);
    const packetDocRef = 's3://cia/packets/' + crypto.createHash('sha256').update(JSON.stringify({ bank: b.bankRef, apps: appUuids })).digest('hex').slice(0, 20);
    const batch = await CiaBankBatch.create({
      batch_uuid: crypto.randomUUID(),
      bank_ref: b.bankRef,
      union_ref: apps[0].union_ref || 'UNKNOWN',
      application_ids: appUuids,
      packet_doc_ref: packetDocRef,
      status: 'GENERATED',
      generated_by_user_id: actor.appUserId,
      generated_at: new Date(),
    }, { transaction: t });

    for (const app of apps) {
      guardTransition('application', app.status, APP.SUBMITTED_TO_BANK);
      await app.update({ status: APP.SUBMITTED_TO_BANK, bank_batch_id: batch.batch_uuid }, { transaction: t });
    }
    await emitDomainEvent({
      eventType: 'cia.bank_batch.generated', aggregateType: 'CiaBankBatch', aggregateId: batch.batch_uuid,
      farmerId: null, payload: { bankRef: b.bankRef, count: apps.length, checker: actor.appUserId, format: PLACEHOLDER_FORMAT },
    }, { transaction: t });

    return { batchUuid: batch.batch_uuid, bankRef: b.bankRef, packetDocRef, format: PLACEHOLDER_FORMAT, applicationCount: apps.length };
  });
};

/* ------------------------- UCDF read surfaces (Slice I) --------------------- */

/** Live counts across the lifecycle + funnel, from application status. Read-only. */
const commandDashboard = async (req) => {
  const { CiaApplication, CiaPurchase, DomainEvent, sequelize } = getDb();
  const rows = await CiaApplication.findAll({
    attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'n']],
    group: ['status'], raw: true,
  });
  const byStatus = Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
  const sum = (...ss) => ss.reduce((a, s) => a + (byStatus[s] || 0), 0);
  const totalApps = Object.values(byStatus).reduce((a, n) => a + n, 0);
  const cattleCaptured = await CiaPurchase.count();
  const slaBreaches = await DomainEvent.count({ where: { event_type: 'cia.stage.sla_breach' } });

  const tiles = {
    expressionsOfInterest: totalApps,
    pendingDcsReview: sum(APP.INTEREST_SUBMITTED, APP.PENDING_DCS_REVIEW),
    selectedByDcs: sum(APP.SELECTED_BY_DCS, APP.APPLICATION_PENDING, APP.DOCUMENTS_INCOMPLETE, APP.RETURNED_FOR_CORRECTION),
    pendingSupervisor: sum(APP.PENDING_SUPERVISOR_VERIFY),
    withDuss: sum(APP.FORWARDED_TO_DUSS, APP.UNDER_DUSS_SCRUTINY),
    submittedToBank: sum(APP.SUBMITTED_TO_BANK, APP.UNDER_BANK_APPRAISAL, APP.BANK_QUERY_RAISED),
    loanSanctioned: sum(APP.LOAN_SANCTIONED),
    cattleCaptured,
    returnedRejected: sum(APP.RETURNED_FOR_CORRECTION, APP.DOCUMENTS_INCOMPLETE, APP.NOT_SELECTED, APP.LOAN_REJECTED),
    slaBreaches,
  };
  const funnel = [
    { lab: 'EOI', n: totalApps },
    { lab: 'Selected', n: tiles.selectedByDcs + tiles.pendingSupervisor + tiles.withDuss + tiles.submittedToBank + tiles.loanSanctioned },
    { lab: 'Submitted to bank', n: tiles.submittedToBank + tiles.loanSanctioned },
    { lab: 'Sanctioned', n: tiles.loanSanctioned },
    { lab: 'Cattle captured', n: cattleCaptured },
  ];
  return { asOf: new Date(), tiles, funnel, statusCounts: byStatus, source: 'domain_events+status' };
};

/**
 * Named reports. Banker/gov consumption in v1 is GENERATED DOCUMENTS first
 * (Convention 28) with lossless export mapping (Convention 19), not live
 * dashboards — these return structured, exportable report payloads.
 */
const report = async (req) => {
  const { CiaApplication, sequelize } = getDb();
  const key = req.params && req.params.reportKey;

  if (key === 'status-by-dcs') {
    const rows = await CiaApplication.findAll({
      attributes: ['dcs_ref', 'status', [sequelize.fn('COUNT', sequelize.col('id')), 'n']],
      group: ['dcs_ref', 'status'], raw: true,
    });
    return { reportKey: key, rows: rows.map((r) => ({ dcsRef: r.dcs_ref, status: r.status, count: Number(r.n) })) };
  }

  // Bank-facing reconciliation packet: submitted → sanctioned → disbursed → paid + overdue.
  if (key === 'bank-reconciliation') {
    const { CiaSanction, CiaDisbursement, CiaSellerPayout, CiaBankBatch } = getDb();
    const num = (v) => Number(v || 0);
    const statusRows = await CiaApplication.findAll({ attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'n']], group: ['status'], raw: true });
    const byStatus = Object.fromEntries(statusRows.map((r) => [r.status, num(r.n)]));
    const sancRows = await CiaSanction.findAll({ where: { match_status: 'MATCHED' }, attributes: ['outcome', [sequelize.fn('COUNT', sequelize.col('id')), 'n'], [sequelize.fn('SUM', sequelize.col('sanctioned_amount')), 'amt']], group: ['outcome'], raw: true });
    const sanc = Object.fromEntries(sancRows.map((r) => [r.outcome, { count: num(r.n), amount: num(r.amt) }]));
    const disb = await CiaDisbursement.findOne({ attributes: [[sequelize.fn('COUNT', sequelize.col('id')), 'n'], [sequelize.fn('SUM', sequelize.col('amount')), 'amt']], raw: true });
    const pay = await CiaSellerPayout.findOne({ where: { status: 'PAID' }, attributes: [[sequelize.fn('COUNT', sequelize.col('id')), 'n'], [sequelize.fn('SUM', sequelize.col('amount')), 'amt']], raw: true });
    const batches = await CiaBankBatch.findAll({ attributes: ['bank_ref', [sequelize.fn('COUNT', sequelize.col('id')), 'n']], group: ['bank_ref'], raw: true });

    return {
      reportKey: key, generatedAt: new Date(), format: 'CIA_BANK_RECON_v0',
      totals: {
        submittedToBank: (byStatus.SUBMITTED_TO_BANK || 0) + (byStatus.UNDER_BANK_APPRAISAL || 0),
        sanctioned: (sanc.SANCTIONED && sanc.SANCTIONED.count) || byStatus.LOAN_SANCTIONED || 0,
        sanctionedAmount: (sanc.SANCTIONED && sanc.SANCTIONED.amount) || 0,
        rejected: (sanc.REJECTED && sanc.REJECTED.count) || byStatus.LOAN_REJECTED || 0,
        disbursedCount: num(disb && disb.n), disbursedAmount: num(disb && disb.amt),
        sellerPaid: num(pay && pay.n), sellerPaidAmount: num(pay && pay.amt),
        emiActive: byStatus.EMI_ACTIVE || 0, emiOverdue: byStatus.EMI_OVERDUE || 0,
      },
      byBank: batches.map((b) => ({ bankRef: b.bank_ref, batches: num(b.n) })),
    };
  }

  // Gov / scheme summary — Annexure-XX-style export (lossless mapping, Convention 19).
  if (key === 'scheme-annexure') {
    const { CiaSubsidyTransfer, CiaDisbursement, CiaAnimal } = getDb();
    const num = (v) => Number(v || 0);
    const statusRows = await CiaApplication.findAll({ attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'n']], group: ['status'], raw: true });
    const byStage = Object.fromEntries(statusRows.map((r) => [r.status, num(r.n)]));
    const total = statusRows.reduce((a, r) => a + num(r.n), 0);
    const subs = await CiaSubsidyTransfer.findOne({ attributes: [[sequelize.fn('COUNT', sequelize.col('id')), 'n'], [sequelize.fn('SUM', sequelize.col('amount')), 'amt']], raw: true });
    const disb = await CiaDisbursement.findOne({ attributes: [[sequelize.fn('COUNT', sequelize.col('id')), 'n'], [sequelize.fn('SUM', sequelize.col('amount')), 'amt']], raw: true });
    const breeds = await CiaAnimal.findAll({ attributes: ['breed', [sequelize.fn('COUNT', sequelize.col('id')), 'n']], group: ['breed'], raw: true });

    return {
      reportKey: key, generatedAt: new Date(), export: 'ANNEXURE_XX', format: 'CIA_SCHEME_ANNEXURE_v0',
      beneficiaries: { total, byStage },
      subsidy: { transfers: num(subs && subs.n), totalSubsidy: num(subs && subs.amt) },
      disbursement: { count: num(disb && disb.n), totalAmount: num(disb && disb.amt) },
      cattleInduction: { animals: breeds.reduce((a, b) => a + num(b.n), 0), byBreed: breeds.map((b) => ({ breed: b.breed, count: num(b.n) })) },
    };
  }

  throw err(`Unknown report "${key}"`, 'CIA_REPORT_UNKNOWN', 404);
};

/** Append-only audit log — read-only (AUDITOR). Optionally scoped to one application. */
const auditLog = async (req) => {
  const { DomainEvent } = getDb();
  const q = req.query || {};
  const where = { aggregate_type: ['CiaApplication', 'CiaBankBatch', 'CiaSchemeConfig'] };
  if (q.applicationUuid) { where.aggregate_type = 'CiaApplication'; where.aggregate_id = q.applicationUuid; }
  const limit = Math.min(Number(q.limit) || 100, 500);
  const rows = await DomainEvent.findAll({ where, order: [['occurred_at', 'DESC'], ['id', 'DESC']], limit });
  return rows.map((e) => ({ eventType: e.event_type, aggregateType: e.aggregate_type, aggregateId: e.aggregate_id, at: e.occurred_at, payload: e.payload }));
};

module.exports = {
  inbox, scrutinise, raiseDeficiency, generateBankBatch,
  commandDashboard, report, auditLog,
};
