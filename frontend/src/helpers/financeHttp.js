import axios from 'axios';

/**
 * Node finance API (same host as tickets reports: 78.159.111.191:3500).
 * Dev/desktop: /finance-api is proxied by electron/proxyRoutes.js → /api on that host.
 */
const getFinanceApiBase = () => {
  try {
    if (process.env.REACT_APP_FINANCE_API_URL) {
      return process.env.REACT_APP_FINANCE_API_URL.replace(/\/$/, '');
    }
  } catch (e) {
    /* ignore */
  }
  return '/finance-api';
};

/** Staff Wi‑Fi + connection devices — app-api (finance node in prod; /portal-api proxy in dev). */
const getPortalApiBase = () => {
  try {
    if (process.env.REACT_APP_PORTAL_API_URL) {
      return process.env.REACT_APP_PORTAL_API_URL.replace(/\/$/, '');
    }
  } catch (e) {
    /* ignore */
  }
  return '/portal-api';
};

const attachNodeAuth = (config) => {
  const apiKey =
    (typeof process !== 'undefined' && process.env && process.env.REACT_APP_NODE_API_KEY) ||
    'tcom-api-key-2024';
  if (apiKey) {
    config.headers['x-api-key'] = apiKey;
  }
  const token = localStorage.getItem('token') || localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
};

const httpNode = axios.create({
  baseURL: getFinanceApiBase(),
  timeout: 120000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

/** Dedicated client for staff Wi‑Fi / connection routes (never finance-api). */
const httpPortal = axios.create({
  baseURL: getPortalApiBase(),
  timeout: 120000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

httpPortal.interceptors.request.use(attachNodeAuth);
httpNode.interceptors.request.use((config) => {
  const path = String(config.url || '');
  if (path.startsWith('/staff/')) {
    config.baseURL = getPortalApiBase();
  }
  return attachNodeAuth(config);
});

export { httpNode, httpPortal, getFinanceApiBase, getPortalApiBase };
