/**
 * Farmer Module
 * Exports composite farmer router (profile, onboarding, SHC) and agent router.
 */

const express = require('express');

const farmerProfileRoutes = require('./routes/farmerRoutes');
const farmerSoilHealthCardRoutes = require('./routes/farmerSoilHealthCardRoutes');
const agentRoutes = require('./routes/agentRoutes');

const farmerRoutes = express.Router();
farmerRoutes.use('/', farmerProfileRoutes);
farmerRoutes.use('/', farmerSoilHealthCardRoutes);

module.exports = { farmerRoutes, agentRoutes };
