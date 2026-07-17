/**
 * ciaEmiReconcileJob — reconciles milk-payment deductions against each disbursed
 * loan's EMI schedule (CIA-2, track mode). A plain function like erpSyncJob: it
 * pulls the ERP settlement deductions per application and calls
 * emiService.reconcile, which classifies due↔deducted↔remitted↔pending. It only
 * TRACKS; initiation stays consent-gated (Convention 33).
 *
 * The deduction source is passed in (from the ERP settlement feed); with no feed
 * wired yet the sweep still ages the schedule (marks DUE/OVERDUE by date).
 */
const logger = require('../shared/utils/logger');
const emiService = require('../modules/cattle_induction/services/emiService');

let db;
const getDb = () => { if (!db) db = require('../shared/models'); return db; };

const runCiaEmiReconcileJob = async ({ asOf = new Date(), deductionsByApp = {} } = {}) => {
  const { CiaEmiSchedule, CiaApplication } = getDb();
  // Applications that have an EMI schedule = disbursed loans in repayment.
  const scheduled = await CiaEmiSchedule.findAll({ attributes: ['application_id'], group: ['application_id'] });
  const results = [];
  for (const s of scheduled) {
    const app = await CiaApplication.findByPk(s.application_id);
    if (!app) continue;
    const deductions = deductionsByApp[app.application_uuid] || [];
    // eslint-disable-next-line no-await-in-loop
    results.push(await emiService.reconcile({ applicationUuid: app.application_uuid, deductions, asOf, sourceRef: 'erp-settlement' }));
  }
  logger.info(`ciaEmiReconcileJob: reconciled ${results.length} loans`);
  return { reconciledLoans: results.length, results };
};

module.exports = { runCiaEmiReconcileJob };
