/**
 * Aanchal ERP Adapter — the single seam the rest of the platform depends on.
 *
 * The whole codebase imports ONLY `{ erp }` (see integrations/index.js) and
 * calls this interface. How the data actually arrives is governed by
 * INTEGRATION_MODE, switchable per deployment without touching module code:
 *
 *   mock     — deterministic seed archetypes (F1001…). Dev/demo. WIRED.
 *   filedrop — daily CSV/XLSX batches ingested into local mirror tables
 *              (the degraded launch mode). Reads served from the mirror.
 *   webhook  — ERP pushes deltas into the same mirror tables.
 *   live     — request/response ERP API (target state).
 *
 * filedrop/webhook/live all serve reads from the local ERP mirror once the
 * ingest path (erpSyncJob) and mirror tables land in Stage F. Until then they
 * fail loud rather than silently returning empty data.
 *
 * @typedef {Object} MilkSummary
 * @property {string} farmerRef
 * @property {number} months
 * @property {number} totalLitres
 * @property {number} totalValue
 * @property {number} avgMonthlyValue
 * @property {number} lastMonthValue
 * @property {number} supplyConsistency
 * @property {Array<{month:string, litres:number, value:number, avgFatPct:number}>} monthly
 *
 * @typedef {Object} ErpAdapter
 * @property {(farmerRef:string, months?:number)=>Promise<MilkSummary>} getMilkSummary
 * @property {(farmerRef:string)=>Promise<number>} getOutstandingInputBalance
 * @property {(farmerRef:string)=>Promise<Object>} getFarmerMaster
 * @property {(societyRef:string)=>Promise<Object[]>} getSocietyMembers
 * @property {(mobile:string)=>Promise<Object|null>} findByMobile
 */

const config = require('../../config');

const VALID_MODES = ['mock', 'filedrop', 'webhook', 'live'];

let impl;

/** Resolve (and memoise) the client implementation for the active mode. */
const get = () => {
  if (impl) return impl;

  const mode = config.integrationMode;
  if (!VALID_MODES.includes(mode)) {
    const e = new Error(`Invalid INTEGRATION_MODE "${mode}" (expected one of ${VALID_MODES.join('|')})`);
    e.statusCode = 500;
    e.errorCode = 'ERP_MODE_INVALID';
    throw e;
  }

  switch (mode) {
    case 'mock':
      impl = require('./erpMockClient');
      break;
    // filedrop, webhook and live all read from the local ERP mirror that the
    // ingest jobs populate. The mirror-backed client lands in Stage F.
    case 'filedrop':
    case 'webhook':
    case 'live':
      impl = require('./erpMirrorClient');
      break;
    default:
      break;
  }
  return impl;
};

/** The active integration mode (mock|filedrop|webhook|live). */
const getMode = () => config.integrationMode;

module.exports = {
  getMode,
  getMilkSummary: (...a) => get().getMilkSummary(...a),
  getOutstandingInputBalance: (...a) => get().getOutstandingInputBalance(...a),
  getFarmerMaster: (...a) => get().getFarmerMaster(...a),
  getSocietyMembers: (...a) => get().getSocietyMembers(...a),
  findByMobile: (...a) => get().findByMobile(...a),
};
