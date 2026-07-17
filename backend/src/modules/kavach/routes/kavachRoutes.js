/**
 * KAVACH routes — mounted at /api/v1/kavach (JWT). Farmer surfaces need only
 * authenticate; the VET examination/valuation and INSURER_OPS payment/issuance
 * steps are roleCheck'd (no live insurer system in v1 — ops is back-office).
 */
const express = require('express');
const multer = require('multer');
const router = express.Router();
const ctrl = require('../controllers/kavachController');
const validate = require('../../../middleware/validate');
const { authenticate } = require('../../../middleware/auth');
const roleCheck = require('../../../middleware/roleCheck');
const v = require('../validators/kavachValidator');

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

// Catalog + quote + assets.
router.get('/plans', ctrl.listPlans);
router.post('/quote', validate(v.quoteSchema), ctrl.quote);
router.get('/assets/me', ctrl.assetsMe);

// Proposals — farmer-authored.
router.post('/proposals', validate(v.createProposalSchema), ctrl.createProposal);
router.get('/proposals/me', ctrl.listProposals);
router.get('/proposals/:proposalUuid', validate(v.proposalUuidParam, 'params'), ctrl.getProposal);
router.post('/proposals/:proposalUuid/photo', validate(v.proposalUuidParam, 'params'), upload.single('photo'), ctrl.uploadPhoto);
router.get('/proposals/:proposalUuid/photo/:contentHash', validate(v.proposalUuidParam, 'params'), ctrl.getPhoto);
router.post('/proposals/:proposalUuid/tag', validate(v.proposalUuidParam, 'params'), validate(v.tagSchema), ctrl.tag);

// Proposals — VET lifecycle.
router.post('/proposals/:proposalUuid/examine', validate(v.proposalUuidParam, 'params'), roleCheck('VET'), ctrl.examine);
router.post('/proposals/:proposalUuid/value', validate(v.proposalUuidParam, 'params'), validate(v.valueSchema), roleCheck('VET'), ctrl.value);

// Proposals — INSURER_OPS lifecycle (premium via KCC, issuance).
router.post('/proposals/:proposalUuid/pay', validate(v.proposalUuidParam, 'params'), validate(v.paySchema), roleCheck('INSURER_OPS'), ctrl.pay);
router.post('/proposals/:proposalUuid/issue', validate(v.proposalUuidParam, 'params'), validate(v.issueSchema), roleCheck('INSURER_OPS'), ctrl.issue);
router.post('/proposals/:proposalUuid/reject', validate(v.proposalUuidParam, 'params'), validate(v.rejectSchema), roleCheck('VET', 'INSURER_OPS'), ctrl.reject);

// Policies.
router.get('/policies/me', ctrl.policiesMe);
router.get('/policies/:policyUuid', validate(v.policyUuidParam, 'params'), ctrl.getPolicy);

// POSP commission escrow (POSP reads own; INSURER_OPS advances the escrow).
router.get('/commissions/me', roleCheck('POSP'), ctrl.myCommissions);
router.post('/commissions/:commissionUuid/advance', validate(v.commissionUuidParam, 'params'), validate(v.commissionAdvanceSchema), roleCheck('INSURER_OPS'), ctrl.advanceCommission);

// Renewals (farmer-owned; opt-in only).
router.get('/renewals/due', ctrl.renewalsDue);
router.post('/renewals/:policyUuid/renew', validate(v.policyUuidParam, 'params'), ctrl.renew);
router.post('/renewals/:journeyUuid/opt-in', validate(v.journeyUuidParam, 'params'), ctrl.optInRenewal);
router.post('/renewals/:journeyUuid/opt-out', validate(v.journeyUuidParam, 'params'), ctrl.optOutRenewal);

module.exports = router;
