/**
 * CIA bank API service — the PRIMARY bank integration (DECIDED: bank = API).
 * Lands in CIA-2. Talks to the cooperative bank's LMS via the platform
 * integrations layer (add `src/integrations/coopbank/` alongside `erp/`, with
 * the same INTEGRATION_MODE discipline: live | mock, and graceful degrade to
 * bankFiledropService on outage).
 *
 * TODO(CIA-2): application submission · sanction pull · loan-account creation ·
 * disbursement confirmation · subsidy-receipt confirmation · seller-payment
 * confirmation · EMI schedule + overdue retrieval · reconciliation. Auth via
 * mTLS/OAuth (open question — confirm with bank). Unmatched/again-late responses
 * are quarantined, never auto-applied (mirror bankFiledropService discipline).
 *
 * EMI INITIATION lives here too (Convention 33): the app sends deduction
 * instructions to the bank/ERP — but ONLY for loans whose legal-authorisation +
 * tri-partite consent artefact is on file; otherwise reconcile in track-only mode.
 */
let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };
const STUB = (fn) => ({ __stub: true, service: 'bankApiService', fn });

module.exports = {
  submitApplications:  async (req) => STUB('submitApplications'),
  pullSanctions:       async (req) => STUB('pullSanctions'),
  confirmDisbursement: async (req) => STUB('confirmDisbursement'),
  retrieveEmiSchedule: async (req) => STUB('retrieveEmiSchedule'),
  initiateEmiDeduction:async (req) => STUB('initiateEmiDeduction'), // consent-gated (Convention 33)
  reconcile:           async (req) => STUB('reconcile'),
};
