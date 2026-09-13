const hpm = require('http-proxy-middleware');
// CRA may resolve 0.19 (default export); electron runtime uses v2 ({ createProxyMiddleware }).
const proxy = hpm.createProxyMiddleware || hpm;

// Shared by CRA setupProxy and the Electron local gateway.
// Production VPS — Laravel billing + tickets API (DNS: isp.tonycommgroupltd.com)
const PRODUCTION_TARGET =
  process.env.REACT_APP_PRODUCTION_PROXY_TARGET ||
  process.env.PRODUCTION_PROXY_TARGET ||
  'https://isp.tonycommgroupltd.com';
const PRODUCTION_HOST =
  process.env.REACT_APP_PRODUCTION_PROXY_HOST ||
  process.env.PRODUCTION_PROXY_HOST ||
  'isp.tonycommgroupltd.com';
const productionUsesIp = /^https?:\/\/\d{1,3}(\.\d{1,3}){3}/.test(PRODUCTION_TARGET);
const productionProxyReq = (proxyReq) => {
  if (productionUsesIp && PRODUCTION_HOST) {
    proxyReq.setHeader('Host', PRODUCTION_HOST);
  }
};
const STANDBY =
  process.env.STANDBY_PROXY_TARGET ||
  process.env.REACT_APP_STANDBY_PROXY_TARGET ||
  'http://102.0.15.254';
const TICKETS = PRODUCTION_TARGET;
const FINANCE_NODE =
  process.env.FINANCE_API_TARGET ||
  process.env.REACT_APP_FINANCE_API_TARGET ||
  'http://78.159.111.191:3500';
/** Staff Wi‑Fi + connection devices — app-api on finance node (:3500) unless overridden. */
const PORTAL_API =
  process.env.PORTAL_API_TARGET ||
  process.env.REACT_APP_PORTAL_API_TARGET ||
  FINANCE_NODE;
const AUTH_API =
  process.env.AUTH_API_TARGET ||
  process.env.REACT_APP_AUTH_API_TARGET ||
  'https://isp.tonycommgroupltd.com';
const AUTH_API_HOST =
  process.env.AUTH_API_HOST ||
  process.env.REACT_APP_AUTH_API_HOST ||
  'isp.tonycommgroupltd.com';

const common = { changeOrigin: true, logLevel: 'warn' };
const ticketsProxyTimeout = 120000;

const ticketsProxyHeaders = (proxyReq) => {
  proxyReq.setHeader('X-Requested-With', 'XMLHttpRequest');
  proxyReq.setHeader('Accept', 'application/json');
};

const financeProxyHeaders = (proxyReq) => {
  proxyReq.setHeader(
    'x-api-key',
    process.env.REACT_APP_NODE_API_KEY || 'tcom-api-key-2024'
  );
  proxyReq.setHeader('Accept', 'application/json');
};

module.exports = function setupProxyRoutes(app) {
  app.use(
    '/production-api',
    proxy({
      ...common,
      target: PRODUCTION_TARGET,
      secure: !productionUsesIp,
      pathRewrite: { '^/production-api': '/api' },
      proxyTimeout: 90000,
      timeout: 90000,
      onProxyReq: productionProxyReq,
      onError(err, req, res) {
        console.warn('[production-api] proxy error:', err.message);
        if (!res.headersSent) {
          res.writeHead(504, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              message: 'Production API gateway timeout. Contabo may be slow or unreachable.',
              error: err.message,
            })
          );
        }
      },
    })
  );

  app.use(
    '/standby-api',
    proxy({
      ...common,
      target: STANDBY,
      pathRewrite: { '^/standby-api': '/api' },
      proxyTimeout: 30000,
      timeout: 30000,
      onError(err, req, res) {
        console.warn('[standby-api] proxy error:', err.message);
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'text/plain' });
          res.end('Standby unreachable. Run: python scripts/dev_standby_tunnel.py');
        }
      },
    })
  );

  app.use(
    '/tickets-api',
    proxy({
      ...common,
      target: TICKETS,
      secure: !productionUsesIp,
      proxyTimeout: ticketsProxyTimeout,
      timeout: ticketsProxyTimeout,
      onProxyReq(proxyReq) {
        productionProxyReq(proxyReq);
        ticketsProxyHeaders(proxyReq);
      },
      onError(err, req, res) {
        console.warn('[tickets-api] proxy error:', err.message);
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Tickets API proxy error' }));
        }
      },
    })
  );

  // Portal app-api (staff Wi‑Fi on customer view, connection devices)
  app.use(
    '/portal-api',
    proxy({
      ...common,
      target: PORTAL_API,
      secure: false,
      pathRewrite: { '^/portal-api': '/api' },
      proxyTimeout: ticketsProxyTimeout,
      timeout: ticketsProxyTimeout,
      onProxyReq: financeProxyHeaders,
      onError(err, req, res) {
        console.warn('[portal-api] proxy error:', err.message);
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: false,
              error: 'Portal API unreachable — run: cd app-api && PORT=3501 npm start',
            })
          );
        }
      },
    })
  );

  // Node finance API (M-Pesa tracker, new customers, manual payments, reports)
  app.use(
    '/finance-api',
    proxy({
      ...common,
      target: FINANCE_NODE,
      secure: false,
      pathRewrite: { '^/finance-api': '/api' },
      proxyTimeout: ticketsProxyTimeout,
      timeout: ticketsProxyTimeout,
      onProxyReq: financeProxyHeaders,
      onError(err, req, res) {
        console.warn('[finance-api] proxy error:', err.message);
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Finance API unreachable' }));
        }
      },
    })
  );

  app.use(
    '/tr069-api',
    proxy({
      ...common,
      target: PRODUCTION_TARGET,
      secure: !productionUsesIp,
      onProxyReq: productionProxyReq,
    })
  );

  app.use(
    '/olt-api',
    proxy({
      ...common,
      target: PRODUCTION_TARGET,
      secure: !productionUsesIp,
      onProxyReq: productionProxyReq,
    })
  );

  app.use(
    '/socket.io',
    proxy({
      ...common,
      target: PRODUCTION_TARGET,
      secure: !productionUsesIp,
      ws: true,
      onProxyReq: productionProxyReq,
    })
  );

  app.use(
    '/vpn-api',
    proxy({
      ...common,
      target: STANDBY,
      pathRewrite: { '^/vpn-api': '/vpn-api' },
      proxyTimeout: 120000,
      timeout: 120000,
    })
  );

  app.use(
    '/auth-api',
    proxy({
      ...common,
      target: AUTH_API,
      pathRewrite: { '^/auth-api': '/api' },
      proxyTimeout: 30000,
      timeout: 30000,
      onProxyReq(proxyReq) {
        proxyReq.setHeader('Host', AUTH_API_HOST);
      },
      onError(err, req, res) {
        console.warn('[auth-api] proxy error:', err.message);
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Auth API unreachable', error: err.message }));
        }
      },
    })
  );

  app.use(
    '/standby-vpn-api',
    proxy({
      ...common,
      target: STANDBY,
      pathRewrite: { '^/standby-vpn-api': '/vpn-api' },
      proxyTimeout: 120000,
      timeout: 120000,
    })
  );
};
