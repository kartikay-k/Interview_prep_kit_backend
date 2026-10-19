const express = require('express');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const signSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

function signToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { email, password } = signSchema.parse(req.body);
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: { code: 'EMAIL_TAKEN', message: 'Email already registered' } });
    }
    const user = await User.create({ email, password });
    const token = signToken(user._id);
    res.status(201).json({ token, user: user.toSafeObject() });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.errors[0].message } });
    }
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = signSchema.parse(req.body);
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
    }
    const token = signToken(user._id);
    res.json({ token, user: user.toSafeObject() });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.errors[0].message } });
    }
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: { id: req.user._id, email: req.user.email } });
});

module.exports = router;
