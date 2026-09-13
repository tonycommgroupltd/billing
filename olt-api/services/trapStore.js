const fs = require('fs');
const path = require('path');

const MAX_TRAPS = Number(process.env.TRAP_STORE_MAX || 500);
const DATA_DIR = path.join(__dirname, '../data');
const TRAP_FILE = path.join(DATA_DIR, 'traps.json');

const traps = [];
let loaded = false;

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    if (fs.existsSync(TRAP_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(TRAP_FILE, 'utf8'));
      if (Array.isArray(parsed)) traps.push(...parsed.slice(-MAX_TRAPS));
    }
  } catch (err) {
    console.warn('[trapStore] load failed:', err.message);
  }
}

function persist() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(TRAP_FILE, JSON.stringify(traps.slice(-MAX_TRAPS), null, 0));
  } catch (err) {
    console.warn('[trapStore] persist failed:', err.message);
  }
}

function addTrap(trap) {
  ensureLoaded();
  traps.unshift(trap);
  if (traps.length > MAX_TRAPS) traps.length = MAX_TRAPS;
  persist();
  return trap;
}

function listTraps({ limit = 50, sourceIp, oltId } = {}) {
  ensureLoaded();
  let rows = traps;
  if (sourceIp) rows = rows.filter((t) => t.sourceIp === sourceIp);
  if (oltId) rows = rows.filter((t) => t.oltId === oltId);
  return rows.slice(0, limit);
}

function lastTrapForOlt(oltId) {
  ensureLoaded();
  return traps.find((t) => t.oltId === oltId) || null;
}

function lastTrapFromIp(sourceIp) {
  ensureLoaded();
  return traps.find((t) => t.sourceIp === sourceIp) || null;
}

function stats() {
  ensureLoaded();
  const byOlt = {};
  for (const t of traps) {
    const key = t.oltId || t.sourceIp || 'unknown';
    if (!byOlt[key]) byOlt[key] = { count: 0, lastAt: null, sourceIp: t.sourceIp };
    byOlt[key].count += 1;
    if (!byOlt[key].lastAt) byOlt[key].lastAt = t.receivedAt;
  }
  return { total: traps.length, byOlt };
}

function clearTraps() {
  traps.length = 0;
  persist();
}

module.exports = {
  addTrap,
  listTraps,
  lastTrapForOlt,
  lastTrapFromIp,
  stats,
  clearTraps,
};
