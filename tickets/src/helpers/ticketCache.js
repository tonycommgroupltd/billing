/**
 * Ticket Cache — localStorage-backed cache for instant ticket list loading.
 *
 * Strategy:
 *  1. On first load, show cached tickets immediately (stale-while-revalidate)
 *  2. Fetch fresh data from API in background
 *  3. Merge fresh data into view — user sees instant results and then a seamless update
 *
 * Cache keys are scoped per-user so multi-user devices don't leak data.
 */

const CACHE_KEY_PREFIX = 'tickets_cache_v2_';
const CACHE_META_PREFIX = 'tickets_meta_v2_';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes — after this, cache is "stale" but still usable

function getUserKey() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    return user.id || user.email || 'default';
  } catch {
    return 'default';
  }
}

function cacheKey(type = 'active') {
  return `${CACHE_KEY_PREFIX}${type}_${getUserKey()}`;
}

function metaKey(type = 'active') {
  return `${CACHE_META_PREFIX}${type}_${getUserKey()}`;
}

/**
 * Get cached tickets from localStorage.
 * Returns { tickets: Array, timestamp: number, stale: boolean } or null.
 */
export function getCachedTickets(type = 'active') {
  try {
    const raw = localStorage.getItem(cacheKey(type));
    const metaRaw = localStorage.getItem(metaKey(type));
    if (!raw) return null;

    const tickets = JSON.parse(raw);
    const meta = metaRaw ? JSON.parse(metaRaw) : {};
    const timestamp = meta.timestamp || 0;
    const stale = Date.now() - timestamp > CACHE_TTL;

    return { tickets, timestamp, stale, lastModified: meta.lastModified || null };
  } catch {
    return null;
  }
}

/**
 * Write tickets to the cache.
 * @param {Array} tickets
 * @param {string} type  — 'active' or 'archived'
 * @param {string|null} lastModified — Last-Modified header value for conditional requests
 */
export function setCachedTickets(tickets, type = 'active', lastModified = null) {
  try {
    localStorage.setItem(cacheKey(type), JSON.stringify(tickets));
    localStorage.setItem(metaKey(type), JSON.stringify({
      timestamp: Date.now(),
      count: tickets.length,
      lastModified
    }));
  } catch (e) {
    // localStorage full — clear old caches and retry once
    clearTicketCache();
    try {
      localStorage.setItem(cacheKey(type), JSON.stringify(tickets));
      localStorage.setItem(metaKey(type), JSON.stringify({
        timestamp: Date.now(),
        count: tickets.length,
        lastModified
      }));
    } catch {
      // Still failing — ignore, cache is optional
    }
  }
}

/**
 * Clear all ticket caches for the current user.
 */
export function clearTicketCache() {
  const userKey = getUserKey();
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith(CACHE_KEY_PREFIX) || key.startsWith(CACHE_META_PREFIX)) && key.endsWith(userKey)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
}

/**
 * Get the Last-Modified value from cache metadata (for conditional requests).
 */
export function getCachedLastModified(type = 'active') {
  try {
    const metaRaw = localStorage.getItem(metaKey(type));
    if (!metaRaw) return null;
    const meta = JSON.parse(metaRaw);
    return meta.lastModified || null;
  } catch {
    return null;
  }
}
