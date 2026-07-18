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
const multer = require('multer');
const router = express.Router();
const ctrl = require('../controllers/kccController');
const validate = require('../../../middleware/validate');
const { authenticate } = require('../../../middleware/auth');
const roleCheck = require('../../../middleware/roleCheck');
const v = require('../validators/kccValidator');

// memory storage — evidenceStorageService writes the raw buffer to disk
// unmodified (Convention 9: no resize/recompress on evidence photos).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image uploads allowed'));
  },
});

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
// Quotation-photo evidence — uploaded before the drawdown request exists;
// the returned url is then passed as quotationDocUrl below.
router.post('/facility/:facilityUuid/evidence', validate(v.facilityUuidParam, 'params'), upload.single('photo'), ctrl.uploadDrawdownEvidence);
router.get('/facility/:facilityUuid/evidence/:contentHash', validate(v.facilityUuidParam, 'params'), ctrl.getDrawdownEvidence);
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
