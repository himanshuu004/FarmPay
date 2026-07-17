/**
 * Rate Limiter Middleware
 * Redis-backed rate limiting using express-rate-limit + rate-limit-redis.
 * Provides default and route-specific limiters.
 */

const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const config = require('../config');
const { getRedisClient } = require('../config/redis');
const ERROR_CODES = require('../shared/constants/errorCodes');

/**
 * Creates a rate limiter with the given options.
 * Falls back to in-memory store if Redis is unavailable.
 * Disabled in test environment to avoid false failures.
 * @param {Object} [options]
 * @param {number} [options.windowMs] - Window in milliseconds
 * @param {number} [options.max] - Max requests per window
 * @returns {Function} Express rate-limit middleware
 */
const createLimiter = (options = {}) => {
  // Skip rate limiting in test environment
  if (config.env === 'test') {
    return (req, res, next) => next();
  }

  const windowMs = options.windowMs || config.rateLimit.windowMs;
  const max = options.max || config.rateLimit.maxRequests;

  const limiterOptions = {
    windowMs,
    max,
    standardHeaders: true,  // Return rate limit info in RateLimit-* headers
    legacyHeaders: false,   // Disable X-RateLimit-* headers
    message: {
      success: false,
      message: 'Too many requests, please try again later',
      errorCode: ERROR_CODES.RATE_LIMIT_EXCEEDED,
    },
    keyGenerator: (req) => {
      // Use user ID if authenticated, otherwise IP
      return req.user ? req.user.id : req.ip;
    },
  };

  // Use Redis store if available
  try {
    const redisClient = getRedisClient();
    limiterOptions.store = new RedisStore({
      sendCommand: (...args) => redisClient.call(...args),
      prefix: 'rl:',
    });
  } catch {
    // Falls back to built-in memory store
  }

  return rateLimit(limiterOptions);
};

/** Default API rate limiter: 100 req/min */
const defaultLimiter = createLimiter();

/** Auth routes limiter: 20 req/min (stricter to prevent brute force) */
const authLimiter = createLimiter({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.authMax,
});

/** OTP routes limiter: 5 req/min (very strict) */
const otpLimiter = createLimiter({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.otpMax,
});

module.exports = { defaultLimiter, authLimiter, otpLimiter, createLimiter };
