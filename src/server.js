// ============================================
// Factor 7: Port Binding — self-contained HTTP server
// Factor 9: Disposability — graceful shutdown on SIGTERM
// Factor 11: Logs — all output to stdout
// ============================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const authRoutes = require('./routes');
const { connectRedis, redisClient } = require('./cache');
const db = require('./db');
const logger = require('./logger');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3001;

// -----------------------------------------
// Middleware
// -----------------------------------------
app.use(helmet());                          // Security headers
app.use(cors());                            // Cross-origin
app.use(express.json());                    // Parse JSON bodies
app.use(morgan('combined', {               // HTTP request logs → stdout
  stream: { write: (msg) => logger.info(msg.trim()) }
}));

// Rate limiting (Factor 15: security)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 100                     // 100 requests per window
});
app.use(limiter);

// -----------------------------------------
// Factor 13: API First — Swagger docs
// -----------------------------------------
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Auth Service API',
      version: '1.0.0',
      description: 'Authentication microservice for Lost & Found platform'
    },
    servers: [{ url: `http://localhost:${PORT}` }]
  },
  apis: []
});
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// -----------------------------------------
// Routes
// -----------------------------------------
app.use('/auth', authRoutes);

// Health check (Factor 14: Telemetry)
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    const redisOk = redisClient.isOpen;
    res.status(200).json({
      status: 'healthy',
      service: 'auth-service',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      dependencies: {
        database: 'connected',
        cache: redisOk ? 'connected' : 'disconnected'
      }
    });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', error: err.message });
  }
});

// -----------------------------------------
// Start server
// -----------------------------------------
const startServer = async () => {
  try {
    await connectRedis();
    logger.info('Redis connected');

    const server = app.listen(PORT, () => {
      logger.info({ port: PORT }, 'Auth service is running');
    });

    // ============================================
    // Factor 9: Disposability — Graceful Shutdown
    // On SIGTERM: stop accepting new connections,
    // close DB pool, disconnect Redis, then exit
    // ============================================
    const shutdown = async (signal) => {
      logger.info({ signal }, 'Shutdown signal received');

      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          await redisClient.quit();
          logger.info('Redis disconnected');
        } catch (e) { /* ignore */ }

        try {
          await db.end();
          logger.info('Database pool closed');
        } catch (e) { /* ignore */ }

        logger.info('Graceful shutdown complete');
        process.exit(0);
      });

      // Force exit after 10 seconds if graceful fails
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (err) {
    logger.error({ err }, 'Failed to start auth service');
    process.exit(1);
  }
};

startServer();
