/**
 * Sequelize Instance & Model Loader — Allied KCC
 *
 * Rebuilt during the FarmerPay → Allied KCC extraction. FarmerPay's original
 * loader hard-required ~300 models across every module (crop, fishery, pulse,
 * sentinel, vyapar, drishti, bank, admin, …), most of which are out of scope
 * here. Instead of an ever-growing explicit list, this loader scans:
 *
 *   1. the shared platform models in this directory, and
 *   2. the models/ folder of each module in MODULE_ALLOWLIST.
 *
 * To bring a module online in a later phase, add its name to MODULE_ALLOWLIST.
 * Nothing else changes. Associations that point at not-yet-loaded modules must
 * guard with `if (models.X)` (see livestock/DairyLinkedLoanUtilization).
 */

const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');
const config = require('../../config');
const logger = require('../utils/logger');

const env = config.env || 'development';
const dbConfig = require('../../config/database')[env];

const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  {
    host: dbConfig.host,
    port: dbConfig.port,
    dialect: dbConfig.dialect,
    logging: dbConfig.logging || false,
    pool: dbConfig.pool,
    define: dbConfig.define,
    dialectOptions: dbConfig.dialectOptions,
    timezone: dbConfig.timezone,
  }
);

// ── Which modules are live. Extend per build phase. ──────────────────
// Phase 0 (extraction): platform core + livestock ERP + co-op wedge scaffold.
// Later: kcc, trust (P2) · kavach, claims, identity (P3) · assistant, etc.
const MODULE_ALLOWLIST = [
  'auth',
  'location',
  'compliance',
  'farmer',
  'pop',
  'livestock',
  'coop',
  'kcc',
  'kavach',
  'claims',
  'identity',
  'market',
  'advisory',
  'cattle_induction', // CIA — Cattle Induction Application (CIA-1 MVP models)
];

// Model files to skip even inside an allowed module (deferred features whose
// tables/associations belong to a later phase).
const MODEL_SKIPLIST = new Set([
  'FpoMembership.js',    // FPO channel — Phase 4
  'FpoTransaction.js',   // FPO channel — Phase 4
]);

const modulesDir = path.resolve(__dirname, '../../modules');
const db = { sequelize, Sequelize };

/** Recursively collect *.js model files under a directory. */
const collectModelFiles = (dir) => {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectModelFiles(full));
    } else if (entry.name.endsWith('.js') && !MODEL_SKIPLIST.has(entry.name)) {
      out.push(full);
    }
  }
  return out;
};

/** Register a model file; keyed by the model's own name. */
const registerModelFile = (file) => {
  const defined = require(file)(sequelize, Sequelize.DataTypes);
  if (defined && defined.name) {
    db[defined.name] = defined;
  }
};

// 1. Shared platform models (this directory, excluding index.js).
for (const name of fs.readdirSync(__dirname)) {
  if (name === 'index.js' || !name.endsWith('.js')) continue;
  registerModelFile(path.join(__dirname, name));
}

// 2. Allow-listed module models.
for (const mod of MODULE_ALLOWLIST) {
  for (const file of collectModelFiles(path.join(modulesDir, mod, 'models'))) {
    registerModelFile(file);
  }
}

// 3. Wire associations (each model guards its own cross-module refs).
Object.values(db).forEach((model) => {
  if (model && typeof model.associate === 'function') {
    model.associate(db);
  }
});

logger.info(`Model loader: ${Object.keys(db).length - 2} models registered from [${MODULE_ALLOWLIST.join(', ')}]`);

/**
 * Tests the database connection.
 * @returns {Promise<void>}
 */
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    logger.info('Database connection established successfully');
  } catch (err) {
    logger.error('Unable to connect to the database:', err.message);
    throw err;
  }
};

db.testConnection = testConnection;

module.exports = db;
