/**
 * ciaStageSlaJob — periodic per-stage SLA sweep for Cattle Induction applications.
 * A plain function like slaClockTickJob/erpSyncJob: it flags stages sitting past
 * their configured TAT, escalates one level up, and surfaces the breach on the
 * UCDF dashboard exception panel (cia.stage.sla_breach). It NEVER changes an
 * application's decision — only alerts. Idempotent per (application, status).
 */
const logger = require('../shared/utils/logger');
const worker = require('../modules/cattle_induction/workers/ciaStageSlaWorker');

const runCiaStageSlaJob = async (asOf = new Date()) => {
  const res = await worker.run({ now: asOf });
  logger.info(`ciaStageSlaJob: ${JSON.stringify(res)}`);
  return res;
};

module.exports = { runCiaStageSlaJob };
