require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { testConnection } = require('./db');
const { authMiddleware } = require('./middleware/auth');
const tr069Routes = require('./routes/tr069Routes');

const app = express();
const PORT = Number(process.env.PORT || 3002);

const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3001')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    service: 'TonyComm TR-069 API',
    version: '1.0.0',
    endpoints: ['/health', '/stats', '/devices', '/devices/:id', '/devices/:id/live'],
  });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'tr069-api' });
});

app.use('/', authMiddleware, tr069Routes);

app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, async () => {
  console.log(`TonyComm TR-069 API listening on http://localhost:${PORT}`);
  await testConnection();
});
