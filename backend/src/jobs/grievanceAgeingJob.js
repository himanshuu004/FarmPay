/**
 * grievanceAgeingJob — escalates grievances that breach the 15-day disposal
 * clock (OG 30.6.5). Plain function like erpSyncJob.
 */
const logger = require('../shared/utils/logger');
const grievance = require('../modules/claims/services/grievanceService');
const ciaGrievance = require('../modules/cattle_induction/services/ciaGrievanceService');

const runGrievanceAgeingJob = async (asOf = new Date()) => {
  const claims = await grievance.ageAndEscalate(asOf);
  const cia = await ciaGrievance.ageAndEscalate(asOf); // CIA grievances (PRD Part 14B ladder)
  const res = { escalated: claims.escalated + cia.escalated, claims, cia };
  logger.info(`grievanceAgeingJob: ${JSON.stringify(res)}`);
  return res;
};

module.exports = { runGrievanceAgeingJob };
