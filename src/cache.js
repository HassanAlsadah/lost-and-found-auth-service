const { createClient } = require('redis');
const logger = require('./logger');

let redisClient = null;
let redisConnected = false;

const connectRedis = async () => {
  try {
    redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: (retries) => {
          if (retries > 3) return false;
          return Math.min(retries * 500, 3000);
        }
      }
    });

    redisClient.on('connect', () => {
      redisConnected = true;
      logger.info('Redis cache connected');
    });

    redisClient.on('error', (err) => {
      redisConnected = false;
      logger.warn({ err: err.message }, 'Redis unavailable — running without cache');
    });

    await redisClient.connect();
  } catch (err) {
    redisConnected = false;
    logger.warn('Redis unavailable — running without cache');
  }
};

const safeGet = async (key) => {
  if (!redisConnected || !redisClient) return null;
  try { return await redisClient.get(key); } catch { return null; }
};

const safeSetEx = async (key, ttl, value) => {
  if (!redisConnected || !redisClient) return;
  try { await redisClient.setEx(key, ttl, value); } catch {}
};

const safeDel = async (key) => {
  if (!redisConnected || !redisClient) return;
  try { await redisClient.del(key); } catch {}
};

module.exports = { redisClient, connectRedis, redisConnected, safeGet, safeSetEx, safeDel };
