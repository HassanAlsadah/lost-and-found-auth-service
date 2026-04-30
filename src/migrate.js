// ============================================
// Factor 12: Admin Processes
// Run migrations in the same environment as the app
// Command: node src/migrate.js
// Or in Docker: docker run auth-service npm run migrate
// ============================================

require('dotenv').config();
const db = require('./db');
const logger = require('./logger');

const migrate = async () => {
  try {
    logger.info('Running database migration for auth-service...');

    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Index for fast email lookups
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)
    `);

    logger.info('Migration completed successfully');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Migration failed');
    process.exit(1);
  }
};

migrate();
