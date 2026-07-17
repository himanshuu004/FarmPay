/**
 * Winston Logger
 * Centralized logging with daily rotate files and console output.
 */

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

// Read env directly to avoid circular dependency with config
const LOG_LEVEL = process.env.LOG_LEVEL || 'debug';
const LOG_DIR = process.env.LOG_DIR || 'logs';
const LOG_MAX_SIZE = process.env.LOG_MAX_SIZE || '20m';
const LOG_MAX_FILES = process.env.LOG_MAX_FILES || '14d';
const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Custom log format: timestamp [level] message + metadata
 */
const logFormat = winston.format.printf(({ timestamp, level, message, requestId, ...meta }) => {
  const reqId = requestId ? ` [${requestId}]` : '';
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} [${level.toUpperCase()}]${reqId} ${message}${metaStr}`;
});

/**
 * Daily rotate transport for combined logs
 */
const combinedTransport = new DailyRotateFile({
  filename: path.join(LOG_DIR, 'combined-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: LOG_MAX_SIZE,
  maxFiles: LOG_MAX_FILES,
  zippedArchive: true,
});

/**
 * Daily rotate transport for error-only logs
 */
const errorTransport = new DailyRotateFile({
  filename: path.join(LOG_DIR, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: LOG_MAX_SIZE,
  maxFiles: LOG_MAX_FILES,
  level: 'error',
  zippedArchive: true,
});

const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    logFormat
  ),
  defaultMeta: { service: 'farmerpay' },
  transports: [combinedTransport, errorTransport],
  exitOnError: false,
});

// Console output in development
if (NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        logFormat
      ),
    })
  );
}

module.exports = logger;
