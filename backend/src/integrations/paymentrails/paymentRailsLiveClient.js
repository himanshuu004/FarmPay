/**
 * Live payment-rails client — PLACEHOLDER. The rail/API and who initiates payouts
 * is open-question #9 (blocking), so every method fails loud rather than moving
 * money. Implement against the settled rail when it lands; nothing else changes.
 */
const notReady = (method) => {
  const e = new Error(`paymentRails.${method} not available — payout rail pending (open-question #9). Use PAYMENT_RAILS_MODE=mock for dev.`);
  e.statusCode = 503; e.errorCode = 'PAYMENT_RAILS_NOT_READY';
  return e;
};
module.exports = {
  pennyDrop: async () => { throw notReady('pennyDrop'); },
  payout: async () => { throw notReady('payout'); },
};
