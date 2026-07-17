/**
 * Mock payment-rails client — deterministic penny-drop + payout for dev/demo.
 * Convention: an account whose number contains "BADACCT" fails penny-drop, and a
 * name containing "MISMATCH" returns nameMatch:false — so fraud paths are testable.
 */
const crypto = require('crypto');
const ref = (p, ...parts) => `${p}-${crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 10).toUpperCase()}`;

const pennyDrop = async ({ accountNumber, ifsc = '', name = '' }) => {
  if (!accountNumber) { const e = new Error('accountNumber required'); e.statusCode = 400; e.errorCode = 'PENNY_DROP_BAD_INPUT'; throw e; }
  const verified = !String(accountNumber).includes('BADACCT');
  const nameMatch = verified && !String(name).toUpperCase().includes('MISMATCH');
  return { verified, nameMatch, ref: ref('PD', accountNumber, ifsc) };
};

const payout = async ({ payeeAccount, amount, reference }) => {
  if (!payeeAccount || !(amount > 0)) { const e = new Error('payeeAccount + positive amount required'); e.statusCode = 400; e.errorCode = 'PAYOUT_BAD_INPUT'; throw e; }
  return { accepted: true, payoutRef: ref('PO', payeeAccount, amount, reference) };
};

module.exports = { pennyDrop, payout };
