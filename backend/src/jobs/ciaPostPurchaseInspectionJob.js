/**
 * ciaPostPurchaseInspectionJob — schedules 7/30/90-day post-purchase inspections
 * for delivered animals (CIA-4). A plain function like the other CIA jobs: for
 * every purchase that has been delivered (delivered_at set) it ensures the
 * inspection rows exist (idempotent). Marking overdue SCHEDULED rows MISSED is a
 * later enhancement.
 */
const logger = require('../shared/utils/logger');
const inspectionService = require('../modules/cattle_induction/services/inspectionService');

let db;
const getDb = () => { if (!db) db = require('../shared/models'); return db; };

const runCiaPostPurchaseInspectionJob = async ({ days } = {}) => {
  const { CiaPurchase, CiaApplication } = getDb();
  const delivered = await CiaPurchase.findAll({ where: { delivered_at: { [getDb().Sequelize.Op.ne]: null } } });
  let scheduled = 0;
  for (const purchase of delivered) {
    const app = await CiaApplication.findByPk(purchase.application_id);
    if (!app) continue;
    // eslint-disable-next-line no-await-in-loop
    const r = await inspectionService.scheduleFor(app, purchase, { days });
    scheduled += r.scheduled;
  }
  logger.info(`ciaPostPurchaseInspectionJob: scheduled ${scheduled} inspections`);
  return { scheduled };
};

module.exports = { runCiaPostPurchaseInspectionJob };
