require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { authMiddleware } = require('./middleware/auth');
const oltRoutes = require('./routes/oltRoutes');
const trapRoutes = require('./routes/trapRoutes');
const { startTrapReceiver } = require('./services/trapReceiver');
const { startSyslogReceiver } = require('./services/syslogReceiver');

const app = express();
const PORT = Number(process.env.PORT || 3003);

const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3001')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    service: 'TonyComm OLT API',
    version: '1.0.0',
    gateway: process.env.ROUTEROS_HOST || '102.0.26.60',
    endpoints: ['/health', '/gateway', '/olts', '/traps', '/setup'],
  });
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'olt-api',
    trapReceiver: process.env.SNMP_TRAP_ENABLED !== 'false',
    trapPort: Number(process.env.SNMP_TRAP_PORT || 3162),
    syslogReceiver: process.env.SYSLOG_ENABLED !== 'false',
    syslogPort: Number(process.env.SYSLOG_PORT || 5514),
  });
});

app.use('/', authMiddleware, trapRoutes);
app.use('/', authMiddleware, oltRoutes);

app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`TonyComm OLT API listening on http://localhost:${PORT}`);
  console.log(`  Faiba 2 gateway: ${process.env.ROUTEROS_HOST || '102.0.26.60'}`);
  startTrapReceiver();
  startSyslogReceiver();
});
