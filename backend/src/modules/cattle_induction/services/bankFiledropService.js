/**
 * CIA bank file-drop service — the FALLBACK bank mode. DECIDED: the cooperative
 * bank integrates by API (bankApiService, the CIA-2 primary path); this file path
 * exists so a bank-API outage never halts the programme. The bank downloads the
 * generated packet and returns a sanction file; DUSS/bank upload it under
 * maker-checker.
 *
 * Maker STAGES a file → each row is matched to a SUBMITTED_TO_BANK application or
 * flagged UNMATCHED; rows dedupe by file_row_hash so re-uploading the same file is
 * idempotent. Checker CONFIRMS → matched rows apply (LOAN_SANCTIONED |
 * LOAN_REJECTED); UNMATCHED rows are QUARANTINED and never auto-applied. Status
 * only — no money moves in CIA-1. The checker must differ from the staging maker.
 */
const crypto = require('crypto');
const { emitDomainEvent } = require('../../../shared/services/domainEvents');
const { APP, guardTransition } = require('../constants/ciaStatus');
const { resolveActor } = require('./context');
const { assertDifferentActor } = require('./segregation');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };
const err = (msg, code, status = 400) => { const e = new Error(msg); e.statusCode = status; e.errorCode = code; return e; };
const rowHash = (fileRef, row) => crypto.createHash('sha256')
  .update([fileRef, row.applicationUuid, row.outcome, row.sanctionedAmount || '', row.loanAccount || ''].join('|')).digest('hex');

/** List the generated packets awaiting a bank response. */
const listPackets = async (req) => {
  const { CiaBankBatch } = getDb();
  const scope = (req.query && req.query.bankRef) || null;
  const where = scope ? { bank_ref: scope } : {};
  const rows = await CiaBankBatch.findAll({ where, order: [['id', 'DESC']] });
  return rows.map((b) => ({ batchUuid: b.batch_uuid, bankRef: b.bank_ref, unionRef: b.union_ref, applicationCount: (b.application_ids || []).length, packetDocRef: b.packet_doc_ref, status: b.status, generatedAt: b.generated_at }));
};

/** Maker: parse + stage a sanction file → matched/unmatched preview (idempotent). */
const stageSanctionFile = async (req) => {
  const actor = await resolveActor(req);
  if (!actor.appUserId) throw err('Unknown bank maker', 'CIA_ACTOR_UNKNOWN', 401);
  const { CiaBankBatch, CiaSanction, CiaApplication, sequelize } = getDb();
  const { batchUuid, fileRef, rows } = req.body || {};

  const batch = await CiaBankBatch.findOne({ where: { batch_uuid: batchUuid } });
  if (!batch) throw err('Bank batch not found', 'CIA_BATCH_NOT_FOUND', 404);

  const preview = [];
  await sequelize.transaction(async (t) => {
    for (const row of rows) {
      const hash = rowHash(fileRef, row);
      const dup = await CiaSanction.findOne({ where: { file_row_hash: hash }, transaction: t });
      if (dup) { preview.push({ applicationUuid: row.applicationUuid, matchStatus: dup.match_status, duplicate: true }); continue; }

      const app = await CiaApplication.findOne({ where: { application_uuid: row.applicationUuid }, transaction: t });
      const matched = app && app.status === APP.SUBMITTED_TO_BANK && app.bank_batch_id === batch.batch_uuid;
      await CiaSanction.create({
        batch_id: batch.id,
        application_id: matched ? app.id : null,
        raw_row: row,
        match_status: matched ? 'MATCHED' : 'UNMATCHED',
        outcome: row.outcome,
        sanctioned_amount: row.sanctionedAmount || null,
        loan_account: row.loanAccount || null,
        reject_reason: row.rejectReason || null,
        file_ref: fileRef,
        file_row_hash: hash,
        staged_by_user_id: actor.appUserId,
      }, { transaction: t });
      preview.push({ applicationUuid: row.applicationUuid, matchStatus: matched ? 'MATCHED' : 'UNMATCHED', outcome: row.outcome, duplicate: false });
    }
  });

  const fresh = preview.filter((p) => !p.duplicate);
  return {
    fileRef,
    staged: fresh.length,
    matched: fresh.filter((p) => p.matchStatus === 'MATCHED').length,
    unmatched: fresh.filter((p) => p.matchStatus === 'UNMATCHED').length,
    duplicates: preview.filter((p) => p.duplicate).length,
    preview,
  };
};

/** Checker: apply a staged file — matched rows only; unmatched → quarantined. */
const confirmSanctionFile = async (req) => {
  const actor = await resolveActor(req);
  if (!actor.appUserId) throw err('Unknown bank checker', 'CIA_ACTOR_UNKNOWN', 401);
  const { CiaSanction, CiaApplication, sequelize } = getDb();
  const { fileRef } = req.body || {};

  const staged = await CiaSanction.findAll({ where: { file_ref: fileRef, confirmed_at: null } });
  if (!staged.length) throw err('No staged rows for that file', 'CIA_SANCTION_NONE', 404);

  // Segregation of duties: the checker cannot be the maker who staged.
  for (const s of staged) assertDifferentActor(s.staged_by_user_id, actor.appUserId);

  let sanctioned = 0; let rejected = 0; let quarantined = 0;
  await sequelize.transaction(async (t) => {
    for (const s of staged) {
      if (s.match_status !== 'MATCHED') {
        await s.update({ match_status: 'QUARANTINED', confirmed_by_user_id: actor.appUserId, confirmed_at: new Date() }, { transaction: t });
        quarantined += 1;
        continue;
      }
      const app = await CiaApplication.findByPk(s.application_id, { transaction: t });
      const next = s.outcome === 'SANCTIONED' ? APP.LOAN_SANCTIONED : APP.LOAN_REJECTED;
      guardTransition('application', app.status, next);
      const patch = { status: next };
      if (s.outcome === 'SANCTIONED') { patch.sanctioned_amount = s.sanctioned_amount; patch.loan_account = s.loan_account; }
      else { patch.reject_reason = s.reject_reason; }
      await app.update(patch, { transaction: t });
      await s.update({ confirmed_by_user_id: actor.appUserId, confirmed_at: new Date() }, { transaction: t });
      if (s.outcome === 'SANCTIONED') sanctioned += 1; else rejected += 1;

      await emitDomainEvent({
        eventType: 'cia.sanction.confirmed', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
        farmerId: null, payload: { outcome: s.outcome, status: next, checker: actor.appUserId },
      }, { transaction: t });
    }
  });

  return { fileRef, applied: sanctioned + rejected, sanctioned, rejected, quarantined };
};

module.exports = { listPackets, stageSanctionFile, confirmSanctionFile };
