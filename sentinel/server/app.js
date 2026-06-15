'use strict';
// app.js — Express app exportable (Vercel serverless + start.js local)
// Le fichier index.js original est conserve pour le demarrage local.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const authRouter = require('./auth/routes');
const { getCookie } = require('./auth/session-cookie');
const { getSession } = require('./auth/session-store');

const app = express();
const BASE = process.env.BASE_PATH || '/sentinel';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('combined'));
app.use(express.json());
app.use(cors({ origin: false }));

// Health check - public
app.get(`${BASE}/health`, (_req, res) => {
  res.json({ status: 'ok', service: 'sentinel' });
});

// Auth routes - public
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
app.use(`${BASE}/auth/login`, loginLimiter);
app.use(`${BASE}/auth`, authRouter);

function isBypass() {
  return process.env.SENTINEL_DEV_AUTH_BYPASS === 'true' && process.env.NODE_ENV !== 'production';
}

// Auth guard
app.use(`${BASE}`, (req, res, next) => {
  if (req.path.startsWith('/auth/') || req.path === '/health') return next();

  if (isBypass()) {
    req.session = { email: 'dev@cad42.local', displayName: 'Dev User', role: 'app:sentinel:admin' };
    return next();
  }

  const sid = getCookie(req);
  const session = getSession(sid);

  if (!session) {
    const isApiOrFetch = req.path.startsWith('/api/') || req.headers.accept?.includes('application/json');
    if (isApiOrFetch) {
      return res.status(401).json({ error: 'Session requise', code: 'UNAUTHORIZED' });
    }
    return res.redirect(`${BASE}/auth/login`);
  }

  req.session = session;
  next();
});

// API routers
app.use(`${BASE}/api/cache`, require('./api/cache'));
app.use(`${BASE}/api/status`, require('./api/status'));
app.use(`${BASE}/api/kpis`, require('./api/kpis'));
app.use(`${BASE}/api/urgences`, require('./api/urgences'));
app.use(`${BASE}/api/snapshots`, require('./api/snapshots'));
app.use(`${BASE}/api/trackers`, require('./api/trackers'));
app.use(`${BASE}/api/projects`, require('./api/projects'));
app.use(`${BASE}/api/alert-history`, require('./api/alerts').historyRouter);
app.use(`${BASE}/api/alert-status`, require('./api/alerts').statusRouter);
app.use(`${BASE}/api/rules`, require('./api/rules'));

// Serve frontend static (production / local)
const distDir = path.join(__dirname, '..', 'frontend', 'dist');
app.use(`${BASE}`, express.static(distDir));

// SPA fallback
app.get(`${BASE}/*`, (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

// Init DB + cache en mode non-serverless (local ou Docker)
if (process.env.VERCEL !== '1') {
  const { getDb } = require('./db/mongo');
  const { startScheduler } = require('./scheduler/index');
  const { startCache } = require('./db/cache');

  (async () => {
    try {
      const db = await getDb();
      startCache();
      startScheduler(db);
    } catch (err) {
      console.error(JSON.stringify({ ts: new Date().toISOString(), event: 'startup_db_error', detail: err.message }));
    }
  })();
}

module.exports = app;
