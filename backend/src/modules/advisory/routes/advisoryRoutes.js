/**
 * ADVISORY routes — mounted at /api/v1/advisory. The dairy advisory feed
 * (vaccination, mastitis, heat stress, breeding, dry-off). All authenticated;
 * every advisory is personal to the caller's herd. The farmer disposes.
 */
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/advisoryController');
const validate = require('../../../middleware/validate');
const { authenticate } = require('../../../middleware/auth');
const v = require('../validators/advisoryValidator');

router.use(authenticate);

router.get('/feed', validate(v.feedQuery, 'query'), ctrl.feed);
router.post('/generate', validate(v.generateSchema), ctrl.generate);
router.post('/items/:itemUuid/done', validate(v.itemUuidParam, 'params'), ctrl.markDone);
router.post('/items/:itemUuid/dismiss', validate(v.itemUuidParam, 'params'), ctrl.dismiss);

module.exports = router;
