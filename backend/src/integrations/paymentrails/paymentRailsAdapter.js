/**
 * Payment-rails Adapter — seller/farmer payout + penny-drop account verification.
 *
 * The rail/API that executes payouts and who initiates is open-question #9 (blocking),
 * so `live` fails loud until it is settled. Modules import ONLY `{ paymentRails }`.
 * Governed by PAYMENT_RAILS_MODE:
 *   mock — deterministic penny-drop + payout responses. Dev/demo. WIRED.
 *   live — real rail (target). Contract pending #9 → notReady.
 *
 * IMPORTANT: this adapter never MOVES money on its own — the CIA payment gate
 * (Convention 31) only ever RECOMMENDS a payout; execution requires the settled
 * rail + human authorisation. `payout()` here is the recommendation transport.
 *
 * @typedef {Object} PaymentRailsAdapter
 * @property {(args:{accountNumber:string,ifsc?:string,name:string})=>Promise<{verified:boolean,nameMatch:boolean,ref:string}>} pennyDrop
 * @property {(args:{payeeAccount:string,amount:number,reference:string})=>Promise<{accepted:boolean,payoutRef:string}>} payout
 */

const VALID_MODES = ['mock', 'live'];
let impl;
const mode = () => process.env.PAYMENT_RAILS_MODE || 'mock';

const get = () => {
  if (impl && impl.__mode === mode()) return impl;
  const m = mode();
  if (!VALID_MODES.includes(m)) {
    const e = new Error(`Invalid PAYMENT_RAILS_MODE "${m}" (expected one of ${VALID_MODES.join('|')})`);
    e.statusCode = 500; e.errorCode = 'PAYMENT_RAILS_MODE_INVALID';
    throw e;
  }
  impl = m === 'mock' ? require('./paymentRailsMockClient') : require('./paymentRailsLiveClient');
  impl.__mode = m;
  return impl;
};

module.exports = {
  getMode: () => mode(),
  pennyDrop: async (...a) => get().pennyDrop(...a),
  payout: async (...a) => get().payout(...a),
};
