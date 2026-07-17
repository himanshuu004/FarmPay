/**
 * Sequelize Database Configuration
 * Environment-based config for development, test, and production.
 * Features: Winston logging, retry logic, read replica support.
 *
 * Dialect: PostgreSQL 16 (+ pgvector + PostGIS). Migrated from MySQL in the
 * Allied KCC extraction — greenfield, so no data-migration cost. UTF-8 is the
 * Postgres default, so the old utf8mb4 charset/collate options are dropped.
 */

const config = require('./index');
const logger = require('../shared/utils/logger');

/**
 * Sequelize-compatible logging function that routes SQL queries through Winston.
 * @param {string} msg - SQL query string from Sequelize
 */
const sequelizeLogger = (msg) => {
  logger.debug(`[SQL] ${msg}`);
};

/**
 * Shared model definition options applied to all environments.
 */
const sharedDefine = {
  timestamps: true,
  underscored: true,
};

/**
 * Shared dialect options. Postgres needs none of MySQL's charset/typeCast
 * knobs; UTF-8 is native. Kept as an empty object so per-env spreads still work.
 */
const sharedDialectOptions = {};

/**
 * Retry configuration for transient connection failures.
 * Sequelize will retry connection up to `max` times with `match` error patterns.
 * Patterns are Postgres/socket-level (MySQL ER_* codes dropped).
 */
const retryConfig = {
  max: 5,
  match: [
    /ETIMEDOUT/,
    /ECONNREFUSED/,
    /ECONNRESET/,
    /Connection terminated unexpectedly/,
    /terminating connection due to/,
    /deadlock detected/,
  ],
};

const dbConfig = {
  development: {
    username: config.db.user,
    password: config.db.password,
    database: config.db.name,
    host: config.db.host,
    port: config.db.port,
    dialect: config.db.dialect,
    logging: config.db.logging ? sequelizeLogger : false,
    pool: {
      max: parseInt(process.env.DB_POOL_MAX, 10) || 20,
      min: parseInt(process.env.DB_POOL_MIN, 10) || 5,
      acquire: 30000,
      idle: 10000,
    },
    define: sharedDefine,
    dialectOptions: sharedDialectOptions,
    timezone: '+05:30', // IST
    retry: retryConfig,
  },

  test: {
    username: config.db.user,
    password: config.db.password,
    database: `${config.db.name}_test`,
    host: config.db.host,
    port: config.db.port,
    dialect: config.db.dialect,
    logging: false,
    pool: {
      max: 10,
      min: 2,
      acquire: 30000,
      idle: 10000,
    },
    define: sharedDefine,
    dialectOptions: sharedDialectOptions,
    timezone: '+05:30',
    retry: retryConfig,
  },

  production: {
    username: config.db.user,
    password: config.db.password,
    database: config.db.name,
    host: config.db.host,
    port: config.db.port,
    dialect: config.db.dialect,
    logging: false,
    pool: {
      max: parseInt(process.env.DB_POOL_MAX, 10) || 20,
      min: parseInt(process.env.DB_POOL_MIN, 10) || 5,
      acquire: 30000,
      idle: 10000,
    },
    define: sharedDefine,
    dialectOptions: {
      ...sharedDialectOptions,
      ssl: {
        require: true,
        rejectUnauthorized: true,
      },
    },
    timezone: '+05:30',
    retry: retryConfig,

    // Read replica support — enable by setting DB_READ_HOST in production
    // Sequelize will route SELECT queries to the read replica automatically
    ...(process.env.DB_READ_HOST && {
      replication: {
        read: [
          {
            host: process.env.DB_READ_HOST,
            port: parseInt(process.env.DB_READ_PORT, 10) || config.db.port,
            username: process.env.DB_READ_USER || config.db.user,
            password: process.env.DB_READ_PASSWORD || config.db.password,
          },
        ],
        write: {
          host: config.db.host,
          port: config.db.port,
          username: config.db.user,
          password: config.db.password,
        },
      },
    }),
  },
};

module.exports = dbConfig;
