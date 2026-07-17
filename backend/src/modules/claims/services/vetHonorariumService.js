/**
 * Vet honorarium ledger (§5.2). Accrues ₹50 per enrolment exam and ₹125 per
 * post-mortem, tracked by quarter: accrued → claimed → paid. Amounts are passed
 * in (config #5), not hardcoded here.
 */
const crypto = require('crypto');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const err = (msg, code, status = 400) => { const e = new Error(msg); e.statusCode = status; e.errorCode = code; return e; };

const quarterOf = (d = new Date()) => `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;

const accrue = async ({ vetId, kind, amount, claimId = null, proposalId = null, at = new Date() }) => {
  const { VetHonorariumLedger } = getDb();
  return VetHonorariumLedger.create({
    ledger_uuid: crypto.randomUUID(), vet_id: vetId, kind, amount,
    claim_id: claimId, proposal_id: proposalId, quarter: quarterOf(at), status: 'accrued', accrued_at: at,
  });
};

const listForVet = async (vetId, { quarter = null } = {}) => {
  const { VetHonorariumLedger } = getDb();
  const where = { vet_id: vetId };
  if (quarter) where.quarter = quarter;
  const rows = await VetHonorariumLedger.findAll({ where, order: [['accrued_at', 'DESC']] });
  const totals = rows.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + Number(r.amount); return a; }, {});
  return { rows, totals };
};

const markPaid = async (ledgerUuid) => {
  const { VetHonorariumLedger } = getDb();
  const row = await VetHonorariumLedger.findOne({ where: { ledger_uuid: ledgerUuid } });
  if (!row) throw err('Honorarium entry not found', 'HONORARIUM_NOT_FOUND', 404);
  await row.update({ status: 'paid', paid_at: new Date() });
  return row;
};

module.exports = { accrue, listForVet, markPaid, quarterOf };
