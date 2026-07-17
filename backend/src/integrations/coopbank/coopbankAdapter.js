/**
 * Cooperative-bank Adapter — the single seam for CIA bank integration.
 *
 * DECIDED (open-question #2): the cooperative bank integrates by API (primary);
 * the file path (Slice G sanction-file, Slice J disbursement, Slice K EMI ingest)
 * is retained as the degraded fallback. Modules import ONLY `{ coopbank }` and
 * call this interface; how the bytes move is governed by COOPBANK_MODE:
 *
 *   mock     — deterministic responses. Dev/demo. WIRED.
 *   filedrop — the fallback: packets/returns move as files (the Slice G/J/K flow).
 *   live     — request/response bank API (target state). Contract pending #2 →
 *              fails loud (notReady) rather than silently faking a bank action.
 *
 * @typedef {Object} CoopbankAdapter
 * @property {(args:{batchUuid:string,bankRef:string,applications:object[]})=>Promise<{accepted:boolean,packetRef:string}>} submitSanctionPacket
 * @property {(args:{batchUuid:string})=>Promise<Array>} getSanctionStatus
 * @property {(args:{bankRef:string,since?:string})=>Promise<Array>} getDisbursements
 * @property {(args:{applicationUuid:string})=>Promise<Array>} getEmiSchedule
 * @property {(args:{applicationUuid:string,cycle?:string})=>Promise<Array>} getDeductions
 * @property {(args:{applicationUuid:string,installmentNo:number,amount:number,consentRef:string})=>Promise<{accepted:boolean,deductionRef:string}>} initiateEmiDeduction
 */

const VALID_MODES = ['mock', 'filedrop', 'live'];

let impl;
const mode = () => process.env.COOPBANK_MODE || 'mock';

const get = () => {
  if (impl && impl.__mode === mode()) return impl;
  const m = mode();
  if (!VALID_MODES.includes(m)) {
    const e = new Error(`Invalid COOPBANK_MODE "${m}" (expected one of ${VALID_MODES.join('|')})`);
    e.statusCode = 500; e.errorCode = 'COOPBANK_MODE_INVALID';
    throw e;
  }
  switch (m) {
    case 'mock': impl = require('./coopbankMockClient'); break;
    // filedrop is the in-app Slice G/J/K flow; the adapter's API methods are not
    // the transport in that mode. live awaits the real contract (#2).
    case 'filedrop':
    case 'live':
    default: impl = require('./coopbankLiveClient'); break;
  }
  impl.__mode = m;
  return impl;
};

const getMode = () => mode();

// async wrappers so a mode-resolution error surfaces as a rejected promise
// (not a synchronous throw) — callers can always rely on `await`/`.rejects`.
module.exports = {
  getMode,
  submitSanctionPacket: async (...a) => get().submitSanctionPacket(...a),
  getSanctionStatus: async (...a) => get().getSanctionStatus(...a),
  getDisbursements: async (...a) => get().getDisbursements(...a),
  getEmiSchedule: async (...a) => get().getEmiSchedule(...a),
  getDeductions: async (...a) => get().getDeductions(...a),
  initiateEmiDeduction: async (...a) => get().initiateEmiDeduction(...a),
};
