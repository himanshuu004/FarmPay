/**
 * CIA event → notification routing (PRD Part 11). Maps append-only domain_events
 * to farmer-facing notification templates. The outbox relay consumes this: any
 * event_type not listed here is relayed/stamped but produces no notification.
 *
 * Staff recipients (DCS/DUSS/bank/UCDF) are a documented follow-up — a role→user
 * assignment model does not exist yet (see context.js), so only farmer recipients
 * are wired here.
 */

const CIA_EVENT_NOTIFICATIONS = {
  'cia.application.eoi': { templateCode: 'CIA_EOI_RECEIVED', notifyFarmer: true },
  'cia.selection.recorded': { templateCode: 'CIA_DCS_DECISION', notifyFarmer: true },
  'cia.application.returned': { templateCode: 'CIA_APPLICATION_RETURNED', notifyFarmer: true },
  'cia.deficiency.raised': { templateCode: 'CIA_APPLICATION_INCOMPLETE', notifyFarmer: true },
  'cia.sanction.confirmed': { templateCode: 'CIA_LOAN_SANCTIONED', notifyFarmer: true },
  'cia.subsidy.transferred': { templateCode: 'CIA_SUBSIDY_TRANSFERRED', notifyFarmer: true },
  'cia.loan.disbursed': { templateCode: 'CIA_LOAN_DISBURSED', notifyFarmer: true },
  'cia.vet.certified': { templateCode: 'CIA_PURCHASE_APPROVED', notifyFarmer: true },
  'cia.vet.rejected': { templateCode: 'CIA_PURCHASE_REJECTED', notifyFarmer: true },
  'cia.insurance.cattle': { templateCode: 'CIA_INSURANCE_ISSUED', notifyFarmer: true },
  'cia.payment.paid': { templateCode: 'CIA_SELLER_PAID', notifyFarmer: true },
  'cia.emi.overdue': { templateCode: 'CIA_EMI_OVERDUE', notifyFarmer: true },
  'cia.emi.default': { templateCode: 'CIA_EMI_DEFAULT', notifyFarmer: true },
  'cia.loan.closed': { templateCode: 'CIA_LOAN_CLOSED', notifyFarmer: true },
  // Fires once the grievance module (PR #11) lands; harmless until then.
  'cia.grievance.resolved': { templateCode: 'CIA_GRIEVANCE_RESOLVED', notifyFarmer: true },
};

/**
 * Canonical RabbitMQ routing key for a CIA event, so the declared cia.stage.notify
 * / cia.emi.default topics finally carry traffic (a decoupling seam for a future
 * consumer; the relay dispatches inline regardless).
 */
const routingKeyFor = (eventType) => {
  if (eventType === 'cia.emi.default' || eventType === 'cia.emi.overdue') return 'cia.emi.default';
  if (eventType.startsWith('cia.')) return 'cia.stage.notify';
  return eventType;
};

module.exports = { CIA_EVENT_NOTIFICATIONS, routingKeyFor };
