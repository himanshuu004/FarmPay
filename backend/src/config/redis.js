/**
 * Redis Client Configuration
 * Singleton ioredis client with retry strategy, key prefix, default TTL,
 * and graceful shutdown support.
 */

const Redis = require('ioredis');
const config = require('./index');
const logger = require('../shared/utils/logger');

/** Default TTL for cached keys: 1 hour (in seconds) */
const DEFAULT_TTL = parseInt(process.env.REDIS_DEFAULT_TTL, 10) || 3600;

/** Maximum reconnect attempts before giving up */
const MAX_RECONNECT_ATTEMPTS = 20;

let redisClient = null;

/**
 * Creates and returns the Redis client singleton.
 * Uses exponential backoff with jitter for reconnection.
 * @returns {Redis} ioredis client instance
 */
const getRedisClient = () => {
  if (redisClient) return redisClient;

  redisClient = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    db: config.redis.db,
    keyPrefix: 'fp:',
    retryStrategy(times) {
      if (times > MAX_RECONNECT_ATTEMPTS) {
        logger.error(`Redis: exceeded ${MAX_RECONNECT_ATTEMPTS} reconnect attempts, giving up`);
        return null; // Stop retrying
      }
      // Exponential backoff with jitter: 50ms base, max 3 seconds
      const baseDelay = Math.min(times * 50, 3000);
      const jitter = Math.floor(Math.random() * 100);
      const delay = baseDelay + jitter;
      logger.warn(`Redis reconnect attempt ${times}/${MAX_RECONNECT_ATTEMPTS}, retrying in ${delay}ms`);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
    connectTimeout: 10000,
    // Auto-reconnect on connection drop
    enableOfflineQueue: true,
  });

  redisClient.on('connect', () => {
    logger.info('Redis client connected');
  });

  redisClient.on('ready', () => {
    logger.info('Redis client ready');
  });

  redisClient.on('error', (err) => {
    logger.error(`Redis client error: ${err.message}`);
  });

  redisClient.on('close', () => {
    logger.warn('Redis connection closed');
  });

  redisClient.on('reconnecting', (delay) => {
    logger.info(`Redis reconnecting in ${delay}ms`);
  });

  redisClient.on('end', () => {
    logger.warn('Redis connection ended — no more reconnect attempts');
  });

  return redisClient;
};

/**
 * Sets a key with the default TTL.
 * Convenience wrapper around client.setex().
 * @param {string} key - Cache key (prefix is added automatically)
 * @param {string|number|Buffer} value - Value to cache
 * @param {number} [ttl] - TTL in seconds (defaults to DEFAULT_TTL)
 * @returns {Promise<string>} Redis response ("OK")
 */
const setWithTTL = async (key, value, ttl = DEFAULT_TTL) => {
  const client = getRedisClient();
  return client.setex(key, ttl, typeof value === 'object' ? JSON.stringify(value) : value);
};

/**
 * Gets a key and parses JSON if possible.
 * @param {string} key - Cache key
 * @returns {Promise<*>} Parsed value or raw string
 */
const getKey = async (key) => {
  const client = getRedisClient();
  const value = await client.get(key);
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

/**
 * Deletes one or more keys.
 * @param {...string} keys - Keys to delete
 * @returns {Promise<number>} Number of keys removed
 */
const deleteKeys = async (...keys) => {
  const client = getRedisClient();
  return client.del(...keys);
};

/**
 * Gracefully disconnects the Redis client.
 */
const closeRedisConnection = async () => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis connection closed gracefully');
  }
};

module.exports = {
  getRedisClient,
  closeRedisConnection,
  setWithTTL,
  getKey,
  deleteKeys,
  DEFAULT_TTL,
};
