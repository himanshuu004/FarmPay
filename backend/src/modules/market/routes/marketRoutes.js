/**
 * MARKET routes — mounted at /api/v1/market. v1 rate boards: milk (fat/SNF),
 * feed prices, and the channel advisor. Read-only + a stateless estimate; all
 * authenticated (a farmer's realised rate is personal).
 */
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/marketController');
const validate = require('../../../middleware/validate');
const { authenticate } = require('../../../middleware/auth');
const v = require('../validators/marketValidator');

router.use(authenticate);

router.get('/milk-rates', ctrl.milkRates);
router.post('/milk-rates/estimate', validate(v.estimateSchema), ctrl.estimate);
router.get('/feed-prices', validate(v.feedQuery, 'query'), ctrl.feedPrices);
router.get('/channel-advisor', validate(v.advisorQuery, 'query'), ctrl.channelAdvisor);

module.exports = router;
