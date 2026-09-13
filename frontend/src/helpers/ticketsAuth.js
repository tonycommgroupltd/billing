import { http } from './http';
import { getTicketsApiBase } from './ticketsApiBase';
import { getApiBase, isStandbyLaravelApi } from './apiBase';

const TICKETS_TOKEN_KEY = 'tickets_auth_token';
const EXCHANGE_FAILED_KEY = 'tickets_auth_exchange_failed';

let exchangeInFlight = null;
let exchangeFailedThisSession = false;
let exchangeWarnedThisSession = false;

function markExchangeFailed() {
  exchangeFailedThisSession = true;
  try {
    sessionStorage.setItem(EXCHANGE_FAILED_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

function shouldSkipExchangeAttempt() {
  if (exchangeFailedThisSession) return true;
  try {
    const ts = sessionStorage.getItem(EXCHANGE_FAILED_KEY);
    if (!ts) return false;
    // Retry after 4 hours unless user logs in again (cleared on login).
    return Date.now() - Number(ts) < 4 * 3600 * 1000;
  } catch {
    return false;
  }
}

function warnExchangeOnce(label, message) {
  if (exchangeWarnedThisSession) return;
  exchangeWarnedThisSession = true;
  console.warn(`[ticketsAuth] ${label}:`, message);
}

function skipTicketsAuthSync() {
  return process.env.REACT_APP_SKIP_TICKETS_AUTH_SYNC === 'true';
}

function looksLikeLaravelJwt(token) {
  return typeof token === 'string' && token.split('.').length === 3;
}

function isLaravelJwtExpired(token) {
  if (!looksLikeLaravelJwt(token)) return true;
  try {
    const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=');
    const payload = JSON.parse(window.atob(padded));
    return !payload?.exp || Number(payload.exp) <= Math.floor(Date.now() / 1000) + 30;
  } catch {
    return true;
  }
}

async function refreshLaravelSessionToken() {
  const currentToken = localStorage.getItem('token');
  if (!looksLikeLaravelJwt(currentToken)) return null;

  const response = await fetch(`${getApiBase()}/refresh-token`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${currentToken}`,
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
  });
  const data = await parseJsonResponse(response);
  if (!response.ok || !data?.access_token) {
    return null;
  }

  localStorage.setItem('token', data.access_token);
  if (data.tickets_token) {
    setTicketsAuthToken(data.tickets_token);
  }
  return data;
}

export function isBotProtectionResponse(response, bodyText = '') {
  const status = response?.status;
  const contentType = String(response?.headers?.get?.('content-type') || '').toLowerCase();
  const text = String(bodyText || '').toLowerCase();

  if (contentType.includes('text/html')) return true;
  if (text.includes('<html') || text.includes('<!doctype html')) return true;
  if (text.includes('imunify') || text.includes('cloudflare') || text.includes('captcha')) return true;
  if (text.includes('bot protection') || text.includes('access denied')) return true;
  if (status === 403 && !contentType.includes('json')) return true;

  return false;
}

export function resetTicketsAuthExchangeState() {
  exchangeFailedThisSession = false;
  exchangeWarnedThisSession = false;
  exchangeInFlight = null;
  try {
    sessionStorage.removeItem(EXCHANGE_FAILED_KEY);
  } catch {
    /* ignore */
  }
}

export function getTicketsAuthToken() {
  const dedicated = localStorage.getItem(TICKETS_TOKEN_KEY);
  if (dedicated && !looksLikeLaravelJwt(dedicated)) {
    return dedicated;
  }

  const legacy = localStorage.getItem('auth_token');
  if (legacy && !looksLikeLaravelJwt(legacy)) {
    return legacy;
  }

  return null;
}

export function setTicketsAuthToken(token) {
  if (token && !looksLikeLaravelJwt(token)) {
    localStorage.setItem(TICKETS_TOKEN_KEY, token);
    localStorage.setItem('auth_token', token);
    resetTicketsAuthExchangeState();
  }
}

export function clearTicketsAuth() {
  localStorage.removeItem(TICKETS_TOKEN_KEY);
  localStorage.removeItem('auth_token');
  resetTicketsAuthExchangeState();
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (isBotProtectionResponse(response, text)) {
    throw new Error(
      'Tickets API blocked by bot protection. Use /tickets-api proxy (same-origin) and log in again.'
    );
  }

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Tickets API returned invalid JSON (${response.status})`);
  }
}

/**
 * Exchange APP.TCOM Laravel JWT for a tickets token via cPanel API.
 */
export async function exchangeTicketsAuthViaCpanel() {
  const laravelToken = localStorage.getItem('token');
  if (!laravelToken || !looksLikeLaravelJwt(laravelToken)) {
    return null;
  }

  const response = await fetch(`${getTicketsApiBase()}/auth.php?action=exchange-laravel`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${laravelToken}`,
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    credentials: 'include',
  });

  const data = await parseJsonResponse(response);
  const ticketsToken = data?.tickets_token || data?.token;

  if (!response.ok || !data?.success || !ticketsToken) {
    throw new Error(data?.error || `cPanel exchange failed (${response.status})`);
  }

  setTicketsAuthToken(ticketsToken);
  return data;
}

/**
 * Fallback: Laravel VPS endpoint (needs TICKETS_DB_* on isp server).
 */
export async function exchangeTicketsAuthViaLaravelApi() {
  const laravelToken = localStorage.getItem('token');
  if (!laravelToken || !looksLikeLaravelJwt(laravelToken)) {
    return null;
  }

  const response = await http.get('/tickets-auth-token');
  const ticketsToken = response.data?.tickets_token;
  if (ticketsToken) {
    setTicketsAuthToken(ticketsToken);
    return response.data;
  }
  return null;
}

/**
 * Direct tickets login — same flow as frontend0 auth.php?action=login
 */
export async function loginToTicketsSystem(username, password) {
  const payload = new URLSearchParams({
    username: String(username || '').trim(),
    password: String(password || ''),
  });

  const response = await fetch(`${getTicketsApiBase()}/auth.php?action=login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    credentials: 'include',
    body: payload.toString(),
  });

  const data = await parseJsonResponse(response);

  if (!response.ok || !data?.success || !data?.token) {
    throw new Error(data?.error || `Tickets login failed (${response.status})`);
  }

  setTicketsAuthToken(data.token);
  return data;
}

/**
 * Exchange the active APP.TCOM session for a ticketing API token.
 */
export async function exchangeTicketsAuthFromLaravelSession({ force = false } = {}) {
  if (skipTicketsAuthSync()) {
    return null;
  }

  if (isStandbyLaravelApi()) {
    return null;
  }

  let laravelToken = localStorage.getItem('token');
  if (!laravelToken || !looksLikeLaravelJwt(laravelToken)) {
    return null;
  }

  if (isLaravelJwtExpired(laravelToken)) {
    try {
      const refreshed = await refreshLaravelSessionToken();
      if (!refreshed) return null;
      if (refreshed.tickets_token) {
        return {
          token: refreshed.tickets_token,
          tickets_token: refreshed.tickets_token,
          source: 'laravel-refresh',
        };
      }
      laravelToken = refreshed.access_token;
    } catch (error) {
      warnExchangeOnce('Laravel session refresh failed', error.message);
      return null;
    }
  }

  if (shouldSkipExchangeAttempt() && !force) {
    return null;
  }

  if (exchangeFailedThisSession && !force) {
    return null;
  }

  if (force) {
    resetTicketsAuthExchangeState();
  }

  if (exchangeInFlight) {
    return exchangeInFlight;
  }

  exchangeInFlight = (async () => {
    try {
      return await exchangeTicketsAuthViaCpanel();
    } catch (cpanelErr) {
      warnExchangeOnce('cPanel exchange failed', cpanelErr.message);
    }

    try {
      return await exchangeTicketsAuthViaLaravelApi();
    } catch (laravelErr) {
      warnExchangeOnce(
        'Laravel API exchange failed',
        laravelErr.response?.data?.error || laravelErr.message
      );
    }

    if (!force) {
      markExchangeFailed();
    }
    return null;
  })().finally(() => {
    exchangeInFlight = null;
  });

  return exchangeInFlight;
}

export async function syncTicketsAuthAfterLogin(username, password, ticketsTokenFromLogin = null) {
  if (skipTicketsAuthSync() || isStandbyLaravelApi()) {
    return null;
  }

  resetTicketsAuthExchangeState();

  if (ticketsTokenFromLogin && !looksLikeLaravelJwt(ticketsTokenFromLogin)) {
    setTicketsAuthToken(ticketsTokenFromLogin);
    return { token: ticketsTokenFromLogin, source: 'login' };
  }

  try {
    const exchanged = await exchangeTicketsAuthFromLaravelSession({ force: true });
    if (exchanged?.tickets_token || exchanged?.token) {
      return {
        token: exchanged.tickets_token || exchanged.token,
        source: exchanged.source || 'exchange',
      };
    }
  } catch (error) {
    console.warn('[ticketsAuth] Exchange after login failed:', error.message);
  }

  if (username && password) {
    try {
      const direct = await loginToTicketsSystem(username, password);
      return { token: direct.token, source: 'direct' };
    } catch (error) {
      console.warn('[ticketsAuth] Direct tickets login failed:', error.message);
    }
  }

  return null;
}

export async function ensureTicketsAuth({ force = false } = {}) {
  if (skipTicketsAuthSync() || isStandbyLaravelApi()) {
    return getTicketsAuthToken();
  }

  const existing = getTicketsAuthToken();
  if (existing && !force) {
    return existing;
  }

  if (force) {
    clearTicketsAuth();
    resetTicketsAuthExchangeState();
  }

  const exchanged = await exchangeTicketsAuthFromLaravelSession({ force });
  return exchanged?.tickets_token || exchanged?.token || getTicketsAuthToken();
}
