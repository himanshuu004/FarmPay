/**
 * Mock cooperative-bank client — deterministic API responses for dev/demo.
 * Refs are derived from the inputs (no clock/random) so tests are stable.
 */
const crypto = require('crypto');
const ref = (prefix, ...parts) => `${prefix}-${crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 10).toUpperCase()}`;

/** Accept a DUSS packet over the API (vs the filedrop packet download). */
const submitSanctionPacket = async ({ batchUuid, bankRef, applications = [] }) => ({
  accepted: true, packetRef: ref('PKT', bankRef, batchUuid), count: applications.length,
});

/** Return the bank's sanction decision per application (vs the sanction file). */
const getSanctionStatus = async ({ batchUuid }) => ([
  { applicationUuid: `${batchUuid}:app1`, outcome: 'SANCTIONED', sanctionedAmount: 62000, loanAccount: ref('AC', batchUuid, '1') },
]);

const getDisbursements = async ({ bankRef }) => ([
  { applicationUuid: `${bankRef}:app1`, loanAccount: ref('AC', bankRef, '1'), amount: 24800, ref: ref('DISB', bankRef) },
]);

const getEmiSchedule = async ({ applicationUuid }) =>
  Array.from({ length: 12 }, (_, i) => ({ installmentNo: i + 1, emiDue: 2150, dueDate: `2026-${String(8 + (i % 5)).padStart(2, '0')}-01` }));

const getDeductions = async ({ applicationUuid }) => ([
  { installmentNo: 1, amountDeducted: 2150, amountRemitted: 2150 },
]);

/** The initiate transport — mock accepts and returns a deduction reference. */
const initiateEmiDeduction = async ({ applicationUuid, installmentNo, amount, consentRef }) => {
  if (!consentRef) { const e = new Error('consentRef required to initiate'); e.statusCode = 400; e.errorCode = 'COOPBANK_CONSENT_REQUIRED'; throw e; }
  return { accepted: true, deductionRef: ref('DED', applicationUuid, installmentNo, amount) };
};

module.exports = {
  submitSanctionPacket, getSanctionStatus, getDisbursements, getEmiSchedule, getDeductions, initiateEmiDeduction,
};
