/**
 * Identity routes — mounted at /api/v1/identity (JWT). Farmer enrols/erases their
 * own muzzle gallery; SURVEYOR/VET run the advisory claim match; SURVEYOR works
 * the shadow-mode review queue. The muzzle model never auto-decides.
 */
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/identityController');
const validate = require('../../../middleware/validate');
const { authenticate } = require('../../../middleware/auth');
const roleCheck = require('../../../middleware/roleCheck');
const v = require('../validators/identityValidator');

router.use(authenticate);

// Farmer — enrol / list / erase (right-to-erasure).
router.post('/biometrics', validate(v.enrolSchema), ctrl.enrol);
router.get('/biometrics/me', ctrl.listMine);
router.delete('/biometrics/:biometricUuid', validate(v.biometricUuidParam, 'params'), ctrl.erase);

// Field — advisory claim muzzle match.
router.post('/match', validate(v.matchSchema), roleCheck('SURVEYOR', 'VET'), ctrl.matchForClaim);

// Shadow-mode review queue (SURVEYOR disposes).
router.get('/review-queue', roleCheck('SURVEYOR'), ctrl.reviewQueue);
router.post('/review/:taskUuid', validate(v.taskUuidParam, 'params'), validate(v.resolveSchema), roleCheck('SURVEYOR'), ctrl.resolveReview);

module.exports = router;
