/**
 * Live / filedrop cooperative-bank client — PLACEHOLDER.
 *
 * The real bank API contract (auth, endpoints, reconciliation fields) is
 * open-question #2 and not settled yet, so every method fails loud rather than
 * silently faking a bank action. In `filedrop` mode the sanction/disbursement/EMI
 * data moves through the in-app file flow (Slice G/J/K), not these API methods.
 *
 * When the contract lands, implement these against it (mTLS/OAuth per #2); the
 * rest of the platform needs no change — it only depends on the adapter seam.
 */
const notReady = (method) => {
  const e = new Error(`coopbank.${method} not available — bank API contract pending (open-question #2). Use COOPBANK_MODE=mock for dev, or the filedrop flow.`);
  e.statusCode = 503;
  e.errorCode = 'COOPBANK_NOT_READY';
  return e;
};

module.exports = {
  submitSanctionPacket: async () => { throw notReady('submitSanctionPacket'); },
  getSanctionStatus: async () => { throw notReady('getSanctionStatus'); },
  getDisbursements: async () => { throw notReady('getDisbursements'); },
  getEmiSchedule: async () => { throw notReady('getEmiSchedule'); },
  getDeductions: async () => { throw notReady('getDeductions'); },
  initiateEmiDeduction: async () => { throw notReady('initiateEmiDeduction'); },
};
