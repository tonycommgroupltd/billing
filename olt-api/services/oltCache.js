const cache = new Map();

function getTtl() {
  return Number(process.env.OLT_CACHE_TTL_MS || 120000);
}

function get(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function set(key, value, ttlMs) {
  const ttl = Number(ttlMs || getTtl());
  cache.set(key, { value, expires: Date.now() + ttl });
}

function clear(key) {
  if (key) cache.delete(key);
  else cache.clear();
}

module.exports = { get, set, clear };
