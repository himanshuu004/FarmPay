/**
 * POSP commission escrow (§7.5). The one thing the broken POSP layer never had:
 * a visible T+15 payout with a QC gate.
 *
 *   accrued → escrow_held → qc_passed → released → paid   (↘ disputed)
 *
 * QC/release/pay are back-office (INSURER_OPS) actions; accrual fires on a
 * POSP-channel policy issue.
 */
const crypto = require('crypto');
const { emitDomainEvent } = require('../../../shared/services/domainEvents');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const err = (msg, code, status = 400) => { const e = new Error(msg); e.statusCode = status; e.errorCode = code; return e; };

const PAYOUT_DAYS = 15;
const TRANSITIONS = {
  accrued: ['escrow_held', 'disputed'],
  escrow_held: ['qc_passed', 'disputed'],
  qc_passed: ['released', 'disputed'],
  released: ['paid'],
  disputed: ['escrow_held'], // resolved dispute rejoins the flow
  paid: [],
};

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

/** Accrue a POSP enrolment commission with the T+15 payout commitment. */
const accrue = async ({ pospId, policyId = null, claimId = null, amount, at = new Date() }, t = null) => {
  const { CommissionLedger } = getDb();
  const row = await CommissionLedger.create({
    commission_uuid: crypto.randomUUID(), posp_id: pospId, policy_id: policyId, claim_id: claimId,
    amount, state: 'accrued', payout_due_date: iso(addDays(at, PAYOUT_DAYS)),
  }, { transaction: t });
  await emitDomainEvent({ eventType: 'commission.accrued', aggregateType: 'CommissionLedger', aggregateId: row.commission_uuid, payload: { pospId, amount, payoutDue: row.payout_due_date } }, { transaction: t });
  return row;
};

const advance = async (commissionUuid, toState, { reason = null } = {}) => {
  const { CommissionLedger } = getDb();
  const row = await CommissionLedger.findOne({ where: { commission_uuid: commissionUuid } });
  if (!row) throw err('Commission not found', 'COMMISSION_NOT_FOUND', 404);
  if (!(TRANSITIONS[row.state] || []).includes(toState)) throw err(`Illegal commission transition ${row.state} → ${toState}`, 'COMMISSION_ILLEGAL');
  const patch = { state: toState };
  if (toState === 'released') patch.released_at = new Date();
  if (toState === 'paid') patch.paid_at = new Date();
  if (toState === 'disputed') patch.dispute_reason = reason;
  await row.update(patch);
  await emitDomainEvent({ eventType: `commission.${toState}`, aggregateType: 'CommissionLedger', aggregateId: row.commission_uuid, payload: { reason } });
  return row;
};

const listForPosp = async (pospId) => {
  const { CommissionLedger } = getDb();
  return CommissionLedger.findAll({ where: { posp_id: pospId }, order: [['created_at', 'DESC']] });
};

module.exports = { accrue, advance, listForPosp, PAYOUT_DAYS, TRANSITIONS };
