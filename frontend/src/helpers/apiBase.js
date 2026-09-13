/**
 * API high-availability routing: Auto | Production | Standby
 */

export const API_MODE_KEY = 'tcomm_api_mode';
export const API_BASE_OVERRIDE_KEY = 'tcomm_api_base';

export const MODES = {
  AUTO: 'auto',
  PRODUCTION: 'production',
  STANDBY: 'standby',
};

export const PRIMARY =
  process.env.REACT_APP_API_URL || 'https://isp.tonycommgroupltd.com/api/v1';
export const FALLBACK =
  process.env.REACT_APP_API_URL_FALLBACK || 'http://acs.tcom.co.ke/api/v1';

/** Standby builds: login via production API until standby JWT/DB is fully aligned. */
export const AUTH_API =
  process.env.REACT_APP_AUTH_API_URL || '';

export const VPN_PRIMARY =
  process.env.REACT_APP_VPN_API_URL || '/standby-vpn-api';
export const VPN_FALLBACK =
  process.env.REACT_APP_VPN_API_URL_FALLBACK || '';
export const VPN_BASE_SESSION_KEY = 'tcomm_vpn_api_base';

/**
 * Let's Encrypt on the standby hub is issued for acs.tcom.co.ke only.
 * Browsers reject https://102.0.15.254 with ERR_CERT_COMMON_NAME_INVALID.
 */
export function sanitizeApiBase(url) {
  if (!url || typeof url !== 'string') return url;
  return url
    .replace(/^https:\/\/102\.0\.15\.254(?::443)?(?=\/|$)/i, 'https://acs.tcom.co.ke')
    .replace(/^http:\/\/102\.0\.15\.254(?::80)?\/api\/v1/i, 'https://acs.tcom.co.ke/api/v1');
}

export function getApiMode() {
  const def = String(process.env.REACT_APP_DEFAULT_API_MODE || MODES.AUTO).toLowerCase();
  // Outage builds pin standby so stale localStorage cannot send staff back to Contabo.
  if (def === MODES.STANDBY) return MODES.STANDBY;
  const stored = localStorage.getItem(API_MODE_KEY);
  if (stored) return stored;
  if (def === MODES.PRODUCTION) return def;
  return MODES.AUTO;
}

/** When true, do not sticky-failover or auto-recover to Contabo (outage / forced standby). */
export function isForcedStandby() {
  if (getApiMode() === MODES.STANDBY) return true;
  return String(process.env.REACT_APP_DEFAULT_API_MODE || '').toLowerCase() === MODES.STANDBY;
}

/** True when Laravel API calls target the standby hub (not Contabo). */
export function isStandbyLaravelApi() {
  const mode = getApiMode();
  if (mode === MODES.STANDBY) return true;
  const base = getApiBase().toLowerCase();
  return base.includes('/standby-api') || base.includes('102.0.15.254') || base.includes('acs.tcom.co.ke');
}

/** Microservices that only run on production VPS — standby JWT will not validate. */
export function isProductionOnlyMicroserviceUrl(url = '') {
  const u = String(url).toLowerCase();
  return (
    u.includes('/olt-api') ||
    u.includes('/tr069-api') ||
    u.includes('isp.tonycommgroupltd.com/olt-api') ||
    u.includes('isp.tonycommgroupltd.com/tr069-api')
  );
}

export function setApiMode(mode) {
  if (Object.values(MODES).includes(mode)) {
    localStorage.setItem(API_MODE_KEY, mode);
    // Override / sticky failover live in sessionStorage (not localStorage).
    sessionStorage.removeItem(API_BASE_OVERRIDE_KEY);
    sessionStorage.removeItem('tcomm_api_base');
  }
}

/** Optional separate login hub (defaults to same base as data API). */
export function getAuthApiBase() {
  if (AUTH_API) return sanitizeApiBase(AUTH_API);
  return getApiBase();
}

export function getApiBase() {
  const mode = getApiMode();

  // Explicit mode must never bounce to the other hub.
  if (mode === MODES.PRODUCTION) {
    sessionStorage.removeItem('tcomm_api_base');
    sessionStorage.removeItem(API_BASE_OVERRIDE_KEY);
    return PRIMARY;
  }
  if (mode === MODES.STANDBY) {
    sessionStorage.removeItem('tcomm_api_base');
    return sanitizeApiBase(
      sessionStorage.getItem(API_BASE_OVERRIDE_KEY) || PRIMARY
    );
  }

  const override = sessionStorage.getItem(API_BASE_OVERRIDE_KEY);
  if (override) {
    const cleaned = sanitizeApiBase(override);
    if (cleaned !== override) {
      sessionStorage.setItem(API_BASE_OVERRIDE_KEY, cleaned);
    }
    return cleaned;
  }

  const auto = sessionStorage.getItem('tcomm_api_base');
  if (auto) {
    const cleaned = sanitizeApiBase(auto);
    if (cleaned !== auto) {
      sessionStorage.setItem('tcomm_api_base', cleaned);
    }
    return cleaned;
  }
  return PRIMARY || FALLBACK;
}

/** True when Auto mode has sticky-failed over to standby. */
export function hasStickyStandbyFallback() {
  if (getApiMode() !== MODES.AUTO) return false;
  const base = (
    sessionStorage.getItem(API_BASE_OVERRIDE_KEY) ||
    sessionStorage.getItem('tcomm_api_base') ||
    ''
  ).toLowerCase();
  return (
    base.includes('acs.tcom.co.ke') ||
    base.includes('102.0.15.254') ||
    base.includes('/standby-api')
  );
}

/**
 * If Auto mode is stuck on standby, clear sticky failover and retry Contabo.
 * No fake /login probe (that caused noisy 401 console errors).
 * If Contabo is still down, normal AUTO failover will engage again on the next request.
 */
export async function recoverToProductionIfHealthy() {
  if (isForcedStandby()) return false;
  if (getApiMode() === MODES.STANDBY) return false;
  if (getApiMode() === MODES.PRODUCTION) {
    clearAutoFallback();
    return true;
  }
  if (!hasStickyStandbyFallback()) return false;

  clearAutoFallback();
  return true;
}

export function setApiBaseOverride(url) {
  if (url) sessionStorage.setItem(API_BASE_OVERRIDE_KEY, sanitizeApiBase(url));
  else sessionStorage.removeItem(API_BASE_OVERRIDE_KEY);
}

export function clearAutoFallback() {
  sessionStorage.removeItem('tcomm_api_base');
  sessionStorage.removeItem(API_BASE_OVERRIDE_KEY);
  sessionStorage.removeItem(VPN_BASE_SESSION_KEY);
}

export function getVpnApiBase() {
  const stored = sessionStorage.getItem(VPN_BASE_SESSION_KEY);
  if (stored && stored !== '/vpn-api') return stored;
  return VPN_PRIMARY;
}

export function attachVpnApiFallback(client) {
  client.interceptors.request.use((config) => {
    config.baseURL = getVpnApiBase();
    return config;
  });

  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      const config = error.config || {};
      if (!VPN_FALLBACK || getApiMode() !== MODES.AUTO) return Promise.reject(error);
      if (config.__vpnFailoverRetried || !isNetworkFailure(error)) {
        return Promise.reject(error);
      }
      if (getVpnApiBase() === VPN_FALLBACK) return Promise.reject(error);

      sessionStorage.setItem(VPN_BASE_SESSION_KEY, VPN_FALLBACK);
      console.warn(`[vpn-api] Standby unreachable — trying fallback: ${VPN_FALLBACK}`);

      config.__vpnFailoverRetried = true;
      config.baseURL = VPN_FALLBACK;
      return client.request(config);
    }
  );

  return client;
}

export function isNetworkFailure(error) {
  if (error.response) return false;
  const code = error.code || '';
  const msg = (error.message || '').toLowerCase();
  return (
    code === 'ERR_NETWORK' ||
    code === 'ECONNABORTED' ||
    msg.includes('network error') ||
    msg.includes('timeout')
  );
}

/** Upstream dead / overloaded — treat like network failure for AUTO failover. */
export function isGatewayFailure(error) {
  const status = error?.response?.status;
  return status === 502 || status === 503 || status === 504;
}

export function isApiUnreachable(error) {
  return isNetworkFailure(error) || isGatewayFailure(error);
}

/** HA / PPP bypass must stay on the server that owns sync state — no standby failover. */
export function isEmergencyBypassRequest(config) {
  const url = `${config?.baseURL || ''}${config?.url || ''}`;
  return url.includes('/emergency-bypass/');
}

/**
 * SmartOLT authorization only exists on Contabo. Standby has no /smartolt routes,
 * so a timeout must not sticky-failover the whole session there.
 */
export function isSmartOltRequest(config) {
  const url = `${config?.baseURL || ''}${config?.url || ''}`;
  return url.includes('/smartolt/');
}

export function stripApiBasePrefix(url) {
  if (!url || typeof url !== 'string') return url;

  const prefixes = [
    '/production-api/v1',
    '/standby-api/v1',
    '/auth-api/v1',
    PRIMARY,
    FALLBACK,
    'https://isp.tonycommgroupltd.com/api/v1',
    'https://acs.tcom.co.ke/api/v1',
    'https://102.0.15.254/api/v1',
    'http://102.0.15.254/api/v1',
  ]
    .filter(Boolean)
    .map((p) => p.replace(/\/$/, ''));

  let path = url;
  for (const prefix of prefixes) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      path = path.slice(prefix.length) || '/';
      break;
    }
  }

  return path.startsWith('/') ? path : `/${path}`;
}

export function attachApiFallback(client) {
  client.interceptors.request.use((config) => {
    // SmartOLT lives only on Contabo — never send these to a sticky standby base.
    if (isSmartOltRequest(config) || String(config.url || '').includes('/smartolt/')) {
      config.baseURL = sanitizeApiBase(PRIMARY);
    } else {
      config.baseURL = getApiBase();
    }
    if (config.url) {
      config.url = stripApiBasePrefix(config.url);
    }
    return config;
  });

  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      const config = error.config || {};
      if (getApiMode() !== MODES.AUTO) return Promise.reject(error);
      if (isEmergencyBypassRequest(config)) return Promise.reject(error);
      if (isSmartOltRequest(config)) return Promise.reject(error);
      if (config.__failoverRetried || !isApiUnreachable(error) || !FALLBACK) {
        return Promise.reject(error);
      }
      if (getApiBase() === FALLBACK || sanitizeApiBase(getApiBase()) === sanitizeApiBase(FALLBACK)) {
        return Promise.reject(error);
      }

      const standbyBase = sanitizeApiBase(FALLBACK);
      sessionStorage.setItem('tcomm_api_base', standbyBase);
      console.warn(`[api] Production unreachable (${error.response?.status || error.code || 'network'}) — using standby: ${standbyBase}`);

      config.__failoverRetried = true;
      config.baseURL = standbyBase;
      if (config.url) {
        config.url = stripApiBasePrefix(config.url);
      }
      return client.request(config);
    }
  );

  return client;
}

/**
 * Reachability check for HA UI. Uses GET /health (2xx) — never POST /login
 * with dummy credentials (browsers log every 401 in the console).
 */
export async function probeApi(baseUrl, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const base = String(baseUrl || '').replace(/\/$/, '');
  try {
    const resp = await fetch(`${base}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);
    return { ok: resp.ok, status: resp.status, url: baseUrl };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, status: 0, url: baseUrl, error: err.message };
  }
}
