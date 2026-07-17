/**
 * ROOTS Dairy Module
 * Combines v1 legacy routes (herd/animal/health/production) and v2 financial
 * logbook routes (profile, cost/revenue events, breeding, treatment,
 * recurring, weekly summaries, hybrid P&L). v2 is mounted under /v2.
 */

const express = require('express');
const router = express.Router();

const dairyRoutes = require('./routes/dairyRoutes');
const dairyV2Routes = require('./routes/dairyV2Routes');

router.use('/v2', dairyV2Routes);
router.use('/', dairyRoutes);

module.exports = router;
