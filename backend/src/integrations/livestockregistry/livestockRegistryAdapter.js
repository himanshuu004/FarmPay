/**
 * Livestock-registry Adapter — ear-tag uniqueness lookup (NDDB/INAPH/state).
 *
 * The authoritative registry + API is open-question #7 (non-blocking): the interim
 * is our own DB uniqueness on cia_animals.ear_tag_no; this adapter adds the
 * cross-system check. Modules import ONLY `{ livestockRegistry }`. Governed by
 * REGISTRY_MODE:
 *   mock — deterministic; a tag containing "DUP" is reported on another loan. WIRED.
 *   live — real registry API. Pending #7 → notReady (do NOT block wrongly — the
 *          caller flags for post-verify rather than rejecting when live is down).
 *
 * @typedef {Object} LivestockRegistryAdapter
 * @property {(tag:string)=>Promise<{known:boolean,onOtherLoan:boolean}>} lookupEarTag
 */
const VALID_MODES = ['mock', 'live'];
let impl;
const mode = () => process.env.REGISTRY_MODE || 'mock';

const get = () => {
  if (impl && impl.__mode === mode()) return impl;
  const m = mode();
  if (!VALID_MODES.includes(m)) {
    const e = new Error(`Invalid REGISTRY_MODE "${m}" (expected one of ${VALID_MODES.join('|')})`);
    e.statusCode = 500; e.errorCode = 'REGISTRY_MODE_INVALID';
    throw e;
  }
  impl = m === 'mock' ? require('./livestockRegistryMockClient') : require('./livestockRegistryLiveClient');
  impl.__mode = m;
  return impl;
};

module.exports = {
  getMode: () => mode(),
  lookupEarTag: async (...a) => get().lookupEarTag(...a),
};
