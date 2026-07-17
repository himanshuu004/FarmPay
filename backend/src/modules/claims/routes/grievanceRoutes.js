/**
 * Grievance routes — /api/v1/grievances (farmer) + admin transitions
 * (INSURER_OPS). The 15-day disposal clock is enforced by grievanceAgeingJob.
 */
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/grievanceController');
const validate = require('../../../middleware/validate');
const { authenticate } = require('../../../middleware/auth');
const roleCheck = require('../../../middleware/roleCheck');
const v = require('../validators/claimValidator');

router.use(authenticate);
router.post('/', validate(v.grievanceSchema), ctrl.file);
router.get('/me', ctrl.listMine);
router.post('/:ticketUuid/transition', validate(v.ticketUuidParam, 'params'), validate(v.grievanceTransitionSchema), roleCheck('INSURER_OPS', 'GP_BDO'), ctrl.transition);

module.exports = router;
