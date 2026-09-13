require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { authMiddleware } = require('./middleware/auth');
const vpnRoutes = require('./routes/vpnRoutes');

const app = express();
const PORT = Number(process.env.PORT || 3004);

const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3001')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(helmet());
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    service: 'TonyComm VPN API',
    version: '1.0.0',
    endpoints: ['/health', '/hubs', '/hubs/:id/status', '/hubs/:id/wizard', '/peers'],
  });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'vpn-api' });
});

app.use('/', authMiddleware, vpnRoutes);

app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`TonyComm VPN API listening on http://localhost:${PORT}`);
});
