/**
 * KCC routes — mounted at /api/v1/kcc. Composite KCC-AH: calculator, application
 * (11-state origination), limit dashboard, LT drawdown, drawing power, and the
 * renewal/application pack (the v1 banker interface).
 *
 * Farmer-authored surfaces need only authenticate; the post-submission lifecycle
 * hops and LT bank decisions are roleCheck('BANKER') — back-office records them
 * against the generated pack (there is no live-bank actor in v1).
 */
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/kccController');
const validate = require('../../../middleware/validate');
const { authenticate } = require('../../../middleware/auth');
const roleCheck = require('../../../middleware/roleCheck');
const v = require('../validators/kccValidator');

router.use(authenticate);

// Calculator + application.
router.post('/calculate', validate(v.calculateSchema), ctrl.calculate);
router.get('/eligibility', ctrl.eligibility); // TRUST co-op formality pillar + reason codes
router.post('/apply', validate(v.applySchema), ctrl.apply);
router.get('/facility', ctrl.getFacility); // limit dashboard (caller's latest)

// Farmer-authored lifecycle.
router.post('/facility/:facilityUuid/submit', validate(v.facilityUuidParam, 'params'), ctrl.submitApplication);
router.post('/facility/:facilityUuid/renew', validate(v.facilityUuidParam, 'params'), ctrl.renew);

// Bank/back-office lifecycle hops (roleCheck'd).
router.post('/facility/:facilityUuid/transition',
  validate(v.facilityUuidParam, 'params'), validate(v.transitionSchema),
  roleCheck('BANKER'), ctrl.transition);

// LT drawdown.
router.post('/facility/:facilityUuid/drawdowns', validate(v.facilityUuidParam, 'params'), validate(v.createDrawdownSchema), ctrl.createDrawdown);
router.get('/facility/:facilityUuid/drawdowns', validate(v.facilityUuidParam, 'params'), ctrl.listDrawdowns);
router.post('/drawdowns/:requestUuid/submit', validate(v.requestUuidParam, 'params'), ctrl.submitDrawdown);
router.post('/drawdowns/:requestUuid/approve', validate(v.requestUuidParam, 'params'), roleCheck('BANKER'), ctrl.bankApproveDrawdown);
router.post('/drawdowns/:requestUuid/disburse', validate(v.requestUuidParam, 'params'), roleCheck('BANKER'), ctrl.disburseDrawdown);
router.post('/drawdowns/:requestUuid/reject', validate(v.requestUuidParam, 'params'), validate(v.rejectSchema), ctrl.rejectDrawdown);

// Drawing power (¶16(4)).
router.post('/facility/:facilityUuid/drawing-power', validate(v.facilityUuidParam, 'params'), validate(v.drawingPowerSchema), ctrl.buildDrawingPower);
router.get('/facility/:facilityUuid/drawing-power', validate(v.facilityUuidParam, 'params'), ctrl.getDrawingPower);

// Renewal / application pack — the banker interface.
router.get('/facility/:facilityUuid/pack', validate(v.facilityUuidParam, 'params'), ctrl.getPack);
router.get('/facility/:facilityUuid/pack.html', validate(v.facilityUuidParam, 'params'), ctrl.getPackHtml);

module.exports = router;
