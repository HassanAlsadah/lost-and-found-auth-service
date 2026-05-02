const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { safeGet, safeSetEx, safeDel } = require('./cache');
const logger = require('./logger');

const router = express.Router();

router.post('/signup', async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'email, password, and name are required' });
    }

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const result = await db.query(
      'INSERT INTO users (email, password, name, phone) VALUES ($1, $2, $3, $4) RETURNING id, email, name, phone, created_at',
      [email, hashedPassword, name, phone || null]
    );

    const user = result.rows[0];
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    logger.info({ userId: user.id, email: user.email }, 'User registered');

    res.status(201).json({
      message: 'User registered successfully',
      user: { id: user.id, email: user.email, name: user.name, phone: user.phone, created_at: user.created_at },
      token
    });
  } catch (err) {
    logger.error({ err }, 'Signup failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    await safeSetEx(`session:${user.id}`, 86400, JSON.stringify({
      userId: user.id, email: user.email, loginAt: new Date().toISOString()
    }));

    logger.info({ userId: user.id }, 'User logged in');

    res.status(200).json({
      message: 'Login successful',
      user: { id: user.id, email: user.email, name: user.name, phone: user.phone },
      token
    });
  } catch (err) {
    logger.error({ err }, 'Login failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(400).json({ error: 'No token provided' });

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    await safeDel(`session:${decoded.userId}`);
    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) await safeSetEx(`blacklist:${token}`, ttl, 'true');

    logger.info({ userId: decoded.userId }, 'User logged out');
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (err) {
    logger.error({ err }, 'Logout failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token provided' });

    const token = authHeader.split(' ')[1];
    const isBlacklisted = await safeGet(`blacklist:${token}`);
    if (isBlacklisted) return res.status(401).json({ error: 'Token has been revoked' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await db.query(
      'SELECT id, email, name, phone, created_at FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.status(200).json({ user: result.rows[0] });
  } catch (err) {
    if (err.name === 'JsonWebTokenError') return res.status(401).json({ error: 'Invalid token' });
    logger.error({ err }, 'Get profile failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
