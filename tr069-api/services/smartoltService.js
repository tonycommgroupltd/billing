/**
 * SmartOLT read-only client with cached ONU index (get_all_onus_details).
 *
 * Rate limits (SmartOLT):
 *   - get_all_onus_details: max 15/hour — we cache ≥60 min and hard-cap at 8/hour
 *     from this service so Contabo + this API cannot burn the shared budget.
 *   - Account: 1000 calls/hour, 10/sec
 * Prefer per-ONU endpoints (get_onu_details, get_onu_signal) for live work.
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = (process.env.SMARTOLT_BASE_URL || 'https://tonycomm.smartolt.com').replace(/\/$/, '');
const API_KEY = process.env.SMARTOLT_READ_API_KEY || process.env.SMARTOLT_API_KEY || '';
const CACHE_TTL_MS = Number(process.env.SMARTOLT_CACHE_TTL_MS || 60 * 60 * 1000);
const CACHE_FILE = path.join(__dirname, '../cache/smartolt-onus.json');
const BUDGET_FILE = path.join(__dirname, '../cache/smartolt-all-onus-budget.json');
const HOURLY_BUDGET = Number(process.env.SMARTOLT_ALL_ONUS_HOURLY_BUDGET || 8);
const MIN_REQUEST_GAP_MS = 200;

let lastRequestTime = 0;
let memoryCache = { fetchedAt: 0, byPppoe: new Map() };

const client = axios.create({
  baseURL: `${BASE_URL}/api`,
  headers: {
    'X-Token': API_KEY,
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
    Referer: `${BASE_URL}/`,
    Origin: BASE_URL,
  },
  timeout: 120000,
});

function normPppoe(v) {
  return String(v || '')
    .trim()
    .toLowerCase();
}

async function throttle() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_GAP_MS) {
    await new Promise((r) => setTimeout(r, MIN_REQUEST_GAP_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

function indexOnus(onus) {
  const byPppoe = new Map();
  for (const onu of onus) {
    if (!onu || typeof onu !== 'object') continue;
    const keys = [onu.name, onu.username, onu.pppoe_username].map(normPppoe).filter(Boolean);
    for (const key of keys) {
      if (!byPppoe.has(key)) byPppoe.set(key, onu);
    }
  }
  return byPppoe;
}

function loadFileCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    if (!raw?.fetchedAt || !Array.isArray(raw.onus)) return null;
    if (Date.now() - raw.fetchedAt > CACHE_TTL_MS) return null;
    return raw;
  } catch {
    return null;
  }
}

function saveFileCache(onus) {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(
      CACHE_FILE,
      JSON.stringify({ fetchedAt: Date.now(), onus }),
      'utf8'
    );
  } catch (err) {
    console.warn('[smartolt] cache write failed:', err.message);
  }
}

function loadBudget() {
  try {
    if (!fs.existsSync(BUDGET_FILE)) return { hour: '', count: 0 };
    return JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8'));
  } catch {
    return { hour: '', count: 0 };
  }
}

function currentHourKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-${d.getUTCHours()}`;
}

function assertAndConsumeBudget() {
  const hour = currentHourKey();
  const budget = loadBudget();
  const count = budget.hour === hour ? Number(budget.count || 0) : 0;
  if (count >= HOURLY_BUDGET) {
    throw new Error(
      `SmartOLT get_all_onus_details budget exhausted (${HOURLY_BUDGET}/hour from tr069-api). Using stale cache if available.`
    );
  }
  try {
    fs.mkdirSync(path.dirname(BUDGET_FILE), { recursive: true });
    fs.writeFileSync(BUDGET_FILE, JSON.stringify({ hour, count: count + 1 }), 'utf8');
  } catch (err) {
    console.warn('[smartolt] budget write failed:', err.message);
  }
}

async function refreshCache() {
  if (!API_KEY) {
    throw new Error('SMARTOLT_READ_API_KEY not configured');
  }

  assertAndConsumeBudget();
  await throttle();
  const { data } = await client.get('/onu/get_all_onus_details');
  if (!data?.status) {
    throw new Error(data?.error || data?.message || 'SmartOLT get_all_onus_details failed');
  }

  const onus = Array.isArray(data.onus) ? data.onus : [];
  memoryCache = { fetchedAt: Date.now(), byPppoe: indexOnus(onus) };
  saveFileCache(onus);
  console.log(`[smartolt] cache refreshed — ${onus.length} ONUs`);
  return onus.length;
}

async function ensureCache() {
  if (memoryCache.fetchedAt && Date.now() - memoryCache.fetchedAt < CACHE_TTL_MS) {
    return memoryCache.byPppoe;
  }

  const file = loadFileCache();
  if (file) {
    memoryCache = { fetchedAt: file.fetchedAt, byPppoe: indexOnus(file.onus) };
    return memoryCache.byPppoe;
  }

  try {
    await refreshCache();
  } catch (err) {
    // Prefer a stale file over failing connectivity checks when budget is gone.
    try {
      if (fs.existsSync(CACHE_FILE)) {
        const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        if (Array.isArray(raw?.onus)) {
          console.warn('[smartolt] using stale cache:', err.message);
          memoryCache = { fetchedAt: raw.fetchedAt || Date.now(), byPppoe: indexOnus(raw.onus) };
          return memoryCache.byPppoe;
        }
      }
    } catch {
      // fall through
    }
    throw err;
  }
  return memoryCache.byPppoe;
}

async function findOnuByPppoe(pppoeUsername) {
  if (!API_KEY) return null;
  const key = normPppoe(pppoeUsername);
  if (!key) return null;

  const index = await ensureCache();
  return index.get(key) || null;
}

async function fetchOnuSignal(externalId) {
  if (!API_KEY || !externalId) return null;
  await throttle();
  const { data } = await client.get(`/onu/get_onu_signal/${encodeURIComponent(externalId)}`);
  if (!data?.status) return null;
  return data;
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return null;
  const normalized = String(dateStr).includes('T') ? dateStr : String(dateStr).replace(' ', 'T');
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return null;
  const ms = Date.now() - d.getTime();
  if (ms < 60000) return 'just now';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function isSmartOltOnline(status) {
  const s = String(status || '').toLowerCase();
  return s.includes('online') || s.includes('active') || s.includes('working');
}

function buildStatusLabel(prefix, online, timeAgo) {
  if (online) {
    return `${prefix} = ONLINE NOW`;
  }
  if (timeAgo) {
    return `${prefix} = OFFLINE (${timeAgo})`;
  }
  return `${prefix} = OFFLINE`;
}

function buildSmartOltStatus(onu, signalData) {
  const online = isSmartOltOnline(onu?.status);
  const statusChangedAgo = formatTimeAgo(onu?.last_status_change);
  const label = buildStatusLabel('SMARTOLT', online, statusChangedAgo);

  let signal = signalData?.onu_signal_value || null;
  if (!signal && signalData?.onu_signal_1490) {
    signal = signalData.onu_signal_1490;
  }
  if (!signal && onu?.signal_1490) {
    signal = `${onu.signal_1490} dBm`;
  }

  return {
    source: 'smartolt',
    label,
    online,
    lastSeen: onu?.last_status_change || null,
    lastSeenAgo: online ? 'now' : statusChangedAgo,
    statusSince: statusChangedAgo,
    signal: signal || null,
    signalLevel: signalData?.onu_signal || onu?.signal || null,
    oltName: onu?.olt_name || null,
    onuExternalId: onu?.unique_external_id || null,
    onuStatus: onu?.status || null,
    sn: onu?.sn || null,
  };
}

module.exports = {
  findOnuByPppoe,
  fetchOnuSignal,
  buildSmartOltStatus,
  buildStatusLabel,
  formatTimeAgo,
  isSmartOltOnline,
  refreshCache,
  configured: () => !!API_KEY,
};
