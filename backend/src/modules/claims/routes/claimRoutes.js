/**
 * CLAIMS routes — three role-separated routers (mounted separately in app.js):
 *   claimsRouter       /api/v1/claims         farmer (JWT)
 *   claimsFieldRouter  /api/v1/claims/field   roleCheck SURVEYOR / VET
 *   claimsAdminRouter  /api/v1/admin/claims   roleCheck INSURER_OPS / GOV_VIEWER
 * Settle/reject live ONLY on the admin router — decisions are human (#10).
 */
const express = require('express');
const ctrl = require('../controllers/claimController');
const validate = require('../../../middleware/validate');
const { authenticate } = require('../../../middleware/auth');
const roleCheck = require('../../../middleware/roleCheck');
const v = require('../validators/claimValidator');

// ── Farmer ──
const claimsRouter = express.Router();
claimsRouter.use(authenticate);
claimsRouter.post('/', validate(v.intimateSchema), ctrl.intimate);
claimsRouter.get('/me', ctrl.listMine);
claimsRouter.get('/:claimUuid', validate(v.claimUuidParam, 'params'), ctrl.getClaim);
claimsRouter.get('/:claimUuid/verify', validate(v.claimUuidParam, 'params'), ctrl.verifyChain);
claimsRouter.post('/:claimUuid/evidence', validate(v.claimUuidParam, 'params'), validate(v.evidenceSchema), ctrl.addEvidence);
claimsRouter.post('/:claimUuid/submit-docs', validate(v.claimUuidParam, 'params'), ctrl.submitDocs);

// ── Field (SURVEYOR / VET) ──
const claimsFieldRouter = express.Router();
claimsFieldRouter.use(authenticate);
// Direct claim actions (still available).
claimsFieldRouter.post('/:claimUuid/survey', validate(v.claimUuidParam, 'params'), validate(v.reportSchema), roleCheck('SURVEYOR'), ctrl.recordSurvey);
claimsFieldRouter.post('/:claimUuid/postmortem', validate(v.claimUuidParam, 'params'), validate(v.reportSchema), roleCheck('VET'), ctrl.recordPostmortem);
// Queue-driven field workflow (the PWA surface).
claimsFieldRouter.get('/tasks', roleCheck('SURVEYOR', 'VET'), ctrl.myTasks);
claimsFieldRouter.post('/tasks/:taskUuid/enroute', validate(v.taskUuidParam, 'params'), roleCheck('SURVEYOR', 'VET'), ctrl.taskEnroute);
claimsFieldRouter.post('/tasks/:taskUuid/onsite', validate(v.taskUuidParam, 'params'), roleCheck('SURVEYOR', 'VET'), ctrl.taskOnsite);
claimsFieldRouter.post('/tasks/:taskUuid/submit', validate(v.taskUuidParam, 'params'), validate(v.reportSchema), roleCheck('SURVEYOR', 'VET'), ctrl.taskSubmit);
claimsFieldRouter.post('/tasks/:taskUuid/qc', validate(v.taskUuidParam, 'params'), roleCheck('INSURER_OPS'), ctrl.taskQc);
// VO honorarium ledger.
claimsFieldRouter.get('/honorarium', roleCheck('VET'), ctrl.honorarium);

// ── Admin (INSURER_OPS / GOV_VIEWER) — human decisions ──
const claimsAdminRouter = express.Router();
claimsAdminRouter.use(authenticate);
claimsAdminRouter.post('/:claimUuid/review', validate(v.claimUuidParam, 'params'), roleCheck('INSURER_OPS'), ctrl.beginReview);
claimsAdminRouter.post('/:claimUuid/settle', validate(v.claimUuidParam, 'params'), validate(v.settleSchema), roleCheck('INSURER_OPS'), ctrl.settle);
claimsAdminRouter.post('/:claimUuid/reject', validate(v.claimUuidParam, 'params'), validate(v.rejectSchema), roleCheck('INSURER_OPS'), ctrl.reject);

module.exports = { claimsRouter, claimsFieldRouter, claimsAdminRouter };
