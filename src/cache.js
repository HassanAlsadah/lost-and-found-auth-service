// ============================================
// Factor 4: Backing Services
// Cache is an attached resource via REDIS_URL
// Factor 6: Processes — session state in Redis, not RAM
// ============================================

const { createClient } = require('redis');
const logger = require('./logger');

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('connect', () => {
  logger.info('Redis cache connected');
});

redisClient.on('error', (err) => {
  logger.error({ err }, 'Redis connection error');
});

const connectRedis = async () => {
  await redisClient.connect();
};

module.exports = { redisClient, connectRedis };
