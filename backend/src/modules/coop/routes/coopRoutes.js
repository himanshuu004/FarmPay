/**
 * COOP routes — mounted at /api/v1/coop. THE WEDGE surface.
 * The app authors only DRAFT→SUBMIT and RECEIPT_CONFIRM; all approvals are
 * ERP-side (no approve/reject endpoints exist here by design).
 */
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/coopController');
const validate = require('../../../middleware/validate');
const { authenticate } = require('../../../middleware/auth');
const v = require('../validators/coopValidator');

router.use(authenticate);

// Passbook wedge + eligibility.
router.get('/passbook', ctrl.getPassbook);
router.get('/eligibility', ctrl.getEligibility);
router.get('/join-society', ctrl.joinNudge);
router.post('/membership/link', validate(v.linkMembershipSchema), ctrl.linkMembership);

// Ordering (app-authored transitions only).
router.get('/catalog', ctrl.getCatalog);
router.get('/orders', ctrl.listOrders);
router.post('/orders', validate(v.createDraftSchema), ctrl.createDraft);
router.post('/orders/:orderUuid/submit', validate(v.orderUuidParam, 'params'), ctrl.submitOrder);
router.post('/orders/:orderUuid/receipt', validate(v.orderUuidParam, 'params'), ctrl.confirmReceipt);

module.exports = router;
