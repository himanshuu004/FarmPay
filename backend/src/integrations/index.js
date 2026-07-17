/**
 * Integration adapters barrel. Modules import ONLY from here:
 *   const { erp } = require('../../integrations');
 *
 * Allied KCC exposes the Aanchal ERP adapter (the co-op wedge). FarmerPay's
 * bank/ and accountAggregator/ adapters are intentionally NOT re-exported —
 * Account Aggregator is out of scope, and Finacle prefill lands in Phase 2.
 */
module.exports = {
  erp: require('./erp/erpAdapter'),
  // Cooperative-bank adapter (CIA): API primary (mock wired), filedrop fallback,
  // live pending the contract (open-question #2). Governed by COOPBANK_MODE.
  coopbank: require('./coopbank/coopbankAdapter'),
  // Payment rails (CIA-3 penny-drop + payout; pending #9). PAYMENT_RAILS_MODE.
  paymentRails: require('./paymentrails/paymentRailsAdapter'),
  // Livestock registry (CIA-3 ear-tag uniqueness; pending #7). REGISTRY_MODE.
  livestockRegistry: require('./livestockregistry/livestockRegistryAdapter'),
  // Vision / muzzle embeddings (CIA-4 re-ID shadow; ai-services). VISION_MODE.
  vision: require('./vision/visionAdapter'),
};
