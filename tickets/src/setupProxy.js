const { createProxyMiddleware } = require('http-proxy-middleware');

const phpApiLocal = process.env.REACT_APP_PHP_API_LOCAL || 'http://127.0.0.1:8080';
const phpProxyTimeout = 120000;
const useLocalPhp = process.env.REACT_APP_PHP_USE_LOCAL === 'true';

// Production VPS — Laravel billing + tickets API (isp.tonycommgroupltd.com)
const VPS_TARGET =
  process.env.REACT_APP_VPS_PROXY_TARGET ||
  process.env.REACT_APP_PRODUCTION_API ||
  'https://isp.tonycommgroupltd.com';
const VPS_HOST =
  process.env.REACT_APP_VPS_PROXY_HOST || 'isp.tonycommgroupltd.com';
const productionUsesIp = /^https?:\/\/\d{1,3}(\.\d{1,3}){3}/.test(VPS_TARGET);

const vpsProxyReq = (proxyReq) => {
  if (productionUsesIp && VPS_HOST) {
    proxyReq.setHeader('Host', VPS_HOST);
  }
  proxyReq.setHeader('X-Requested-With', 'XMLHttpRequest');
  proxyReq.setHeader('Accept', 'application/json');
};

const vpsTicketsProxy = {
  target: VPS_TARGET,
  changeOrigin: true,
  secure: false,
  pathRewrite: { '^/api': '/tickets-api' },
  proxyTimeout: phpProxyTimeout,
  timeout: phpProxyTimeout,
  logLevel: 'warn',
  on: { proxyReq: vpsProxyReq },
};

const vpsLaravelSmsProxy = {
  target: VPS_TARGET,
  changeOrigin: true,
  secure: false,
  pathRewrite: { '^/api': '/api/v1' },
  proxyTimeout: phpProxyTimeout,
  timeout: phpProxyTimeout,
  logLevel: 'warn',
  on: { proxyReq: vpsProxyReq },
};

const isSplynxOutboxPath = (pathname) =>
  pathname.startsWith('/api/list-messages') ||
  pathname.startsWith('/api/view-messages') ||
  pathname.startsWith('/api/resend-sms') ||
  /^\/api\/messages\/\d+/.test(pathname);

const isNodeApiPath = (pathname) =>
  pathname.startsWith('/api/reports-management') ||
  pathname.startsWith('/api/finance') ||
  pathname.startsWith('/api/backup-sync') ||
  pathname.startsWith('/api/kra/workflow');

const isLocalPhpPath = (pathname) =>
  pathname.startsWith('/api') &&
  !isNodeApiPath(pathname) &&
  !isSplynxOutboxPath(pathname);

const localPhpProxy = {
  target: phpApiLocal,
  changeOrigin: true,
  pathRewrite: { '^/api': '' },
  proxyTimeout: phpProxyTimeout,
  timeout: phpProxyTimeout,
  logLevel: 'warn',
};

module.exports = function (app) {
  // Laravel SMS outbox on main API (/api/v1/*)
  app.use(
    createProxyMiddleware({
      pathFilter: isSplynxOutboxPath,
      ...vpsLaravelSmsProxy,
    })
  );

  // Local PHP for bulk-sms.php (when file is served locally)
  app.use(
    createProxyMiddleware({
      pathFilter: (pathname) => pathname.startsWith('/api/bulk-sms.php'),
      ...localPhpProxy,
    })
  );

  // KRA eTIMS VSCU proxy — local Virtual FD on developer PC
  app.use(
    '/api/kra-etims',
    createProxyMiddleware({
      target: phpApiLocal,
      changeOrigin: true,
      pathRewrite: (path) => `/kra-etims${path === '/' ? '' : path}`,
      proxyTimeout: phpProxyTimeout,
      timeout: phpProxyTimeout,
      logLevel: 'warn',
    })
  );

  if (useLocalPhp) {
    app.use(
      createProxyMiddleware({
        pathFilter: isLocalPhpPath,
        ...localPhpProxy,
      })
    );
    app.use(
      '/uploads',
      createProxyMiddleware({
        target: phpApiLocal,
        changeOrigin: true,
      })
    );
  }

  app.use(
    createProxyMiddleware({
      pathFilter: '/api/reports-management/**',
      target: 'http://78.159.111.191:3500',
      changeOrigin: true,
      secure: false,
      on: {
        proxyReq: (proxyReq) => {
          proxyReq.setHeader('x-api-key', 'tcom-api-key-2024');
        },
      },
    })
  );

  app.use(
    '/api/finance',
    createProxyMiddleware({
      target: 'http://78.159.111.191:3500',
      changeOrigin: true,
      secure: false,
      on: {
        proxyReq: (proxyReq) => {
          proxyReq.setHeader('x-api-key', 'tcom-api-key-2024');
        },
      },
    })
  );

  app.use(
    '/api/backup-sync',
    createProxyMiddleware({
      target: 'http://78.159.111.191:3500',
      changeOrigin: true,
      secure: false,
      on: {
        proxyReq: (proxyReq) => {
          proxyReq.setHeader('x-api-key', 'tcom-api-key-2024');
        },
      },
    })
  );

  app.use(
    '/api/kra/workflow',
    createProxyMiddleware({
      target: 'http://78.159.111.191:3500',
      changeOrigin: true,
      secure: false,
      on: {
        proxyReq: (proxyReq) => {
          proxyReq.setHeader('x-api-key', 'tcom-api-key-2024');
        },
      },
    })
  );

  // Tickets PHP API on VPS (/tickets-api/*)
  if (!useLocalPhp) {
    app.use('/api', createProxyMiddleware(vpsTicketsProxy));
  }

  // Socket.IO on VPS (same Host header when using IP)
  app.use(
    '/socket.io',
    createProxyMiddleware({
      target: VPS_TARGET,
      changeOrigin: true,
      secure: false,
      ws: true,
      on: { proxyReq: vpsProxyReq },
    })
  );
};
