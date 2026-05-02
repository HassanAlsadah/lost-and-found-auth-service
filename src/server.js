require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const authRoutes = require('./routes');
const { connectRedis } = require('./cache');
const db = require('./db');
const logger = require('./logger');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3001;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined', {
  stream: { write: (msg) => logger.info(msg.trim()) }
}));

app.use('/auth', authRoutes);

app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.status(200).json({
      status: 'healthy',
      service: 'auth-service',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', error: err.message });
  }
});

const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Auth service is running');
});

connectRedis().catch(() => logger.warn('Redis not available'));

const shutdown = async (signal) => {
  logger.info({ signal }, 'Shutdown signal received');
  server.close(async () => {
    try { await db.end(); } catch (e) {}
    logger.info('Graceful shutdown complete');
    process.exit(0);
  });
  setTimeout(() => { process.exit(1); }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
