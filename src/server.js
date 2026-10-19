require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { connectDB } = require('./utils/db');

const authRoutes = require('./routes/auth');
const kitRoutes = require('./routes/kits');
const practiceRoutes = require('./routes/practice');

const app = express();

const corsOrigins = new Set([
  'http://localhost:3000',
  'https://interview-pre-kit-frontend-j2kxmz12p-kartikay-ks-projects.vercel.app',
]);
if (process.env.FRONTEND_URL) {
  for (const url of process.env.FRONTEND_URL.split(',')) {
    const trimmed = url.trim();
    if (trimmed) corsOrigins.add(trimmed);
  }
}

app.use(cors({
  origin(origin, callback) {
    if (!origin || corsOrigins.has(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: '2mb' }));

// Global rate limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/kits', kitRoutes);
app.use('/api/practice', practiceRoutes);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  const status = err.status || 500;
  res.status(status).json({
    error: { code: err.code || 'INTERNAL_ERROR', message: err.message || 'Something went wrong' }
  });
});

const PORT = process.env.PORT || 4000;

connectDB().then(() => {
  app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
}).catch(err => {
  console.error('Failed to connect to MongoDB:', err.message);
  process.exit(1);
});

module.exports = app;
