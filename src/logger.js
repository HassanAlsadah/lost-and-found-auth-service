// ============================================
// Factor 11: Logs
// Logs are treated as event streams
// Written to stdout as structured JSON
// No log files on the local filesystem
// ============================================

const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' 
    ? { target: 'pino-pretty' } 
    : undefined,
  base: {
    service: 'auth-service',       // identifies which service emitted the log
    version: process.env.npm_package_version || '1.0.0'
  },
  timestamp: pino.stdTimeFunctions.isoTime
});

module.exports = logger;
