/**
 * renewalSweepJob — nightly renewal engine tick (§7.4). Order matters:
 *   1. sweep            — create journeys for policies entering the lead window
 *   2. auto-renewals    — clone the opt-ins whose due date arrived
 *   3. reminders        — fan out to the still-pending journeys (cadence)
 *   4. lapse            — mark past-due, un-renewed, non-opted-out journeys lapsed
 * A plain function (like erpSyncJob) so it's callable from a scheduler or a test.
 */
const logger = require('../shared/utils/logger');
const renewal = require('../modules/kavach/services/renewalService');

const runRenewalSweepJob = async (asOf = new Date(), { channel = 'sms' } = {}) => {
  const swept = await renewal.sweep(asOf);
  const auto = await renewal.processAutoRenewals(asOf);
  const reminded = await renewal.sendDueReminders(asOf, channel);
  const lapsed = await renewal.lapseOverdue(asOf);
  const summary = { ...swept, ...auto, ...reminded, ...lapsed };
  logger.info(`renewalSweepJob: ${JSON.stringify(summary)}`);
  return summary;
};

module.exports = { runRenewalSweepJob };
