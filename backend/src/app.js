/**
 * Allied KCC — Express application entry point.
 *
 * Lean by design: mounts only the modules that are live this phase. Add routers
 * to MOUNTS as each module comes online (auth, farmer, kcc, kavach, …).
 * Start with: node backend/src/app.js
 */
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');

const config = require('./config');
const logger = require('./shared/utils/logger');
const requestId = require('./middleware/requestId');
const errorHandler = require('./middleware/errorHandler');
const { testConnection } = require('./shared/models');

const app = express();
app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true, allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Language'] }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());
app.use(requestId);
if (config.env !== 'test') app.use(morgan('tiny', { stream: { write: (m) => logger.info(m.trim()) } }));

// Health check.
app.get('/health', (req, res) => res.json({ status: 'ok', app: config.appName, env: config.env }));

// ── Live module routers (extend per phase) ──────────────────────────
const MOUNTS = [
  ['/api/v1/auth', require('./modules/auth/routes/authRoutes')], // MPIN+OTP auth (Phase 0) — the token-issuing surface
  // Phase-0 extracted platform modules (wired + runtime-smoke-verified).
  ['/api/v1/farmer', require('./modules/farmer/routes/farmerRoutes')],
  ['/api/v1/farmer', require('./modules/farmer/routes/farmerSoilHealthCardRoutes')],
  ['/api/v1/agents', require('./modules/farmer/routes/agentRoutes')],
  ['/api/v1/livestock', require('./modules/livestock/routes/dairyV2Routes')], // generalized dairy (v2)
  ['/api/v1/location', require('./modules/location/routes/locationRoutes')],
  ['/api/v1/pop', require('./modules/pop/routes/popRoutes')],
  ['/api/v1/compliance', require('./modules/compliance/routes/complianceRoutes')],
  ['/api/v1/coop', require('./modules/coop/routes/coopRoutes')], // THE WEDGE (Phase 1)
  ['/api/v1/kcc', require('./modules/kcc/routes/kccRoutes')],    // Limit Engine + origination (Phase 2)
  ['/api/v1/kavach', require('./modules/kavach/routes/kavachRoutes')], // Pashu Suraksha insurance (Phase 3)
  ['/api/v1/claims', require('./modules/claims/routes/claimRoutes').claimsRouter],            // CLAIMS farmer (Phase 3)
  ['/api/v1/claims/field', require('./modules/claims/routes/claimRoutes').claimsFieldRouter], // CLAIMS field roles
  ['/api/v1/admin/claims', require('./modules/claims/routes/claimRoutes').claimsAdminRouter], // CLAIMS admin
  ['/api/v1/identity', require('./modules/identity/routes/identityRoutes')], // Muzzle biometrics (Phase 3, AI-1 shadow)
  ['/api/v1/grievances', require('./modules/claims/routes/grievanceRoutes')], // Grievance (Phase 3, field roles)
  ['/api/v1/market', require('./modules/market/routes/marketRoutes')],     // Rate boards: milk/feed/channel (v1)
  ['/api/v1/advisory', require('./modules/advisory/routes/advisoryRoutes')], // Dairy advisory rule packs (v1)
  // CIA — Cattle Induction Application (CIA-1 MVP: application + capture, no money movement).
  ['/api/v1/cattle-induction', require('./modules/cattle_induction/routes/ciaRoutes').farmerRouter],       // farmer surface (JWT)
  ['/api/v1/cattle-induction/field', require('./modules/cattle_induction/routes/ciaRoutes').fieldRouter],  // roleCheck ROUTE_SUPERVISOR / VET
  ['/api/v1/cattle-induction/dcs', require('./modules/cattle_induction/routes/ciaRoutes').dcsRouter],      // roleCheck DCS_SECRETARY / DCS_BOARD
  ['/api/v1/cattle-induction/duss', require('./modules/cattle_induction/routes/ciaRoutes').dussRouter],    // roleCheck DUSS_* (maker-checker)
  ['/api/v1/cattle-induction/bank', require('./modules/cattle_induction/routes/ciaRoutes').bankRouter],    // roleCheck BANK_* (maker-checker)
  ['/api/v1/admin/cattle-induction', require('./modules/cattle_induction/routes/ciaRoutes').adminRouter],  // roleCheck UCDF_* / AUDITOR / GOV_VIEWER
];
for (const [path, router] of MOUNTS) app.use(path, router);

app.use(errorHandler);

// Only listen when run directly (supertest imports the app object).
if (require.main === module) {
  const port = config.port;
  testConnection()
    .then(() => app.listen(port, () => logger.info(`Allied KCC listening on :${port}`)))
    .catch((e) => { logger.error('Startup failed:', e.message); process.exit(1); });
}

module.exports = app;
