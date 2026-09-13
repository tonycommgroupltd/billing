// ============================================
// TCOM API — Express Server
// ============================================

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { testConnections } = require('./db');
const authRoutes = require('./routes/authRoutes');
const customerRoutes = require('./routes/customerRoutes');
const chatRoutes = require('./routes/chatRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const planRoutes = require('./routes/planRoutes');
const mpesaRoutes = require('./routes/mpesaRoutes');
const loyaltyRoutes = require('./routes/loyaltyRoutes');
const connectionRoutes = require('./routes/connectionRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const splynxRoutes = require('./routes/splynxRoutes');
const financeRoutes = require('./routes/financeRoutes');
const reportsManagementRoutes = require('./routes/reportsManagementRoutes');
const backupSyncRoutes = require('./routes/backupSyncRoutes');
const { startOnuSync } = require('./jobs/onuSync');
const { startAcsSync } = require('./jobs/acsSync');
const { startInvoiceReminder } = require('./jobs/invoiceReminder');
const { startDailySnapshot } = require('./jobs/dailySnapshot');
let kraRoutes = null;
let startKraSyncWorkers = null;

try {
  kraRoutes = require('./routes/kraRoutes');
} catch (err) {
  console.warn('[startup] KRA routes unavailable:', err.message);
}

try {
  ({ startKraSyncWorkers } = require('./jobs/kraSyncWorker'));
} catch (err) {
  console.warn('[startup] KRA workers unavailable:', err.message);
}

const app = express();
const PORT = process.env.PORT || 3001;

// --------------- Middleware ---------------
// Helmet only on /api — bare-IP captive portal is HTTP; HSTS/COOP break asset loads
const apiHelmet = helmet();
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return apiHelmet(req, res, next);
  }
  next();
});
const allowedOrigins = [
  'https://app.tonycommgroupltd.com',
  'https://isp.tonycommgroupltd.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'X-Requested-With', 'Accept'],
  maxAge: 86400,
}));
app.use(express.json());

// Rate limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,                   // 30 attempts per window
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// --------------- Routes ---------------
app.get('/api/health', async (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// Expired PPPoE captive portal API
const portalDir = path.join(__dirname, '..', 'portal');
const backofficeDir = path.join(__dirname, '..', 'backoffice');
const acsUiDir = fs.existsSync(path.join(__dirname, 'acs-ui', 'dist'))
  ? path.join(__dirname, 'acs-ui', 'dist')
  : path.join(__dirname, '..', 'acs-ui', 'dist');
app.use('/api/portal', require('./routes/portalRoutes'));

app.use('/api/auth', authLimiter, authRoutes);

// Public endpoint: packages for new customers (no auth required)
app.get('/api/plans/packages', async (req, res) => {
  try {
    const { remotePool } = require('./db');
    const [rows] = await remotePool.query(
      `SELECT price,
              MAX(CAST(REGEXP_REPLACE(title, '[^0-9]', '') AS UNSIGNED)) AS speed
       FROM plans
       WHERE price > 0 AND deleted_at IS NULL
         AND title LIKE 'Internet - Main %'
         AND title NOT LIKE 'Internet - Main2%'
       GROUP BY price
       ORDER BY price`
    );
    res.json(rows.map(r => ({ speed: Number(r.speed), price: Number(r.price) })));
  } catch (err) {
    console.error('[packages]', err.message);
    res.status(500).json({ error: 'Failed to load packages' });
  }
});

app.use('/api/customer', customerRoutes);
app.use('/api/billing', customerRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/mpesa', mpesaRoutes);
app.use('/api/loyalty', loyaltyRoutes);
app.use('/api/connection', connectionRoutes);
app.use('/api/staff/wifi', require('./routes/staffWifiRoutes'));
app.use('/api/notifications', notificationRoutes);
app.use('/api/splynx', splynxRoutes);
app.use('/api/expired-accounts', require('./routes/expiredAccountsRoutes'));
app.use('/api/finance', financeRoutes);
if (kraRoutes) {
  app.use('/api/kra', kraRoutes);
}
app.use('/api/reports-management', reportsManagementRoutes);
app.use('/api/backup-sync', backupSyncRoutes);
app.use('/api/otp-admin', require('./routes/otpAdminRoutes'));
// GenieACS staff UI (React build) — optional; do not block finance/staff Wi-Fi if ACS deps missing
try {
  app.use('/api/acs', require('./routes/acsRoutes'));
} catch (err) {
  console.warn('[startup] ACS routes unavailable:', err.message);
}

// Legacy endpoint aliasing - redirect to finance routes
app.get('/api/finance-dashboard-stats', (req, res) => res.redirect(307, '/api/finance/dashboard-stats' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '')));
app.get('/api/list-invoices', (req, res) => res.redirect(307, '/api/finance/invoices' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '')));
app.get('/api/view-invoices/:id', (req, res) => res.redirect(307, `/api/finance/invoices/${req.params.id}`));
app.get('/api/list-payments', (req, res) => res.redirect(307, '/api/finance/payments' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '')));
app.get('/api/list-mpesa', (req, res) => res.redirect(307, '/api/finance/mpesa' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '')));

// Captive portal static site at / (legacy /portal → /)
app.get('/portal', (req, res) => {
  const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(301, '/' + q);
});
// Reminder pay page + assets under /pay (matches isp.tonycommgroupltd.com/pay/)
app.use('/pay', express.static(portalDir, { index: false }));
app.get('/pay', (req, res) => {
  res.sendFile(path.join(portalDir, 'pay.html'));
});
app.get('/pay/', (req, res) => {
  res.sendFile(path.join(portalDir, 'pay.html'));
});
app.use('/portal/', express.static(portalDir, { index: false }));

// OTP support back-office (staff)
app.use('/backoffice', express.static(backofficeDir, { index: 'index.html' }));
app.get('/backoffice', (req, res) => {
  res.sendFile(path.join(backofficeDir, 'index.html'));
});

// GenieACS staff UI (React build)
app.use('/acs', express.static(acsUiDir, { index: false }));
app.get('/acs', (req, res) => {
  res.sendFile(path.join(acsUiDir, 'index.html'));
});
app.get('/acs/*', (req, res) => {
  res.sendFile(path.join(acsUiDir, 'index.html'));
});

app.use(express.static(portalDir, { index: 'index.html' }));
app.get('/', (req, res) => {
  res.sendFile(path.join(portalDir, 'index.html'));
});

// --------------- Error Handler ---------------
app.use((err, req, res, next) => {
  console.error('[UNHANDLED ERROR]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// --------------- Start ---------------
async function start() {
  console.log('\n🚀 TCOM API starting...\n');
  console.log('  Testing database connections...');
  await testConnections();
  console.log('');

  try {
    const { ensureMobileAdminSchema } = require('./services/otpSupportService');
    await ensureMobileAdminSchema();
    console.log('  ✓ Mobile admin schema ready (auth logs + session audit)');
  } catch (err) {
    console.warn('  ⚠ Mobile admin schema:', err.message);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`  ✓ API server listening on port ${PORT}`);
    console.log(`  ✓ Expired portal: http://localhost:${PORT}/`);
    console.log(`  ✓ OTP back-office: http://localhost:${PORT}/backoffice`);
    console.log(`  ✓ ACS console:      http://localhost:${PORT}/acs`);
    console.log(`  ✓ Health check: http://localhost:${PORT}/api/health`);
    console.log(`  ✓ Auth routes:  http://localhost:${PORT}/api/auth/*\n`);
  });

  // Start ONU sync job (SmartOLT → local onu_devices every 10 min)
  startOnuSync();
  startAcsSync();

  // Start invoice reminder job (daily check)
  startInvoiceReminder();

  // Start daily snapshot job (captures expiring accounts at midnight)
  startDailySnapshot();

  // Start KRA sync & reconciliation workers (outbox replay + nightly reconciliation)
  if (startKraSyncWorkers) {
    startKraSyncWorkers();
  }
}

start().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
