/**
 * slaClockTickJob — periodic SLA clock tick (§7.2). Accrues 12% p.a. penal
 * interest on every claim past its settlement deadline and escalates. A plain
 * function like erpSyncJob; it NEVER decides a claim — only accrues + alerts.
 */
const logger = require('../shared/utils/logger');
const slaClock = require('../modules/claims/services/slaClockService');

const runSlaClockTickJob = async (asOf = new Date()) => {
  const res = await slaClock.tick(asOf);
  logger.info(`slaClockTickJob: ${JSON.stringify(res)}`);
  return res;
};

module.exports = { runSlaClockTickJob };
