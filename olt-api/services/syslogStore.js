const fs = require('fs');
const path = require('path');

const MAX_LOGS = Number(process.env.SYSLOG_STORE_MAX || 2000);
const DATA_DIR = path.join(__dirname, '../data');
const LOG_FILE = path.join(DATA_DIR, 'syslogs.json');

const logs = [];
let loaded = false;

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    if (fs.existsSync(LOG_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
      if (Array.isArray(parsed)) logs.push(...parsed.slice(-MAX_LOGS));
    }
  } catch (err) {
    console.warn('[syslogStore] load failed:', err.message);
  }
}

function persist() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs.slice(-MAX_LOGS), null, 0));
  } catch (err) {
    console.warn('[syslogStore] persist failed:', err.message);
  }
}

function resolveOltId(sourceIp, syslogTag, hostname) {
  try {
    const { loadAllOlts, resolveOlt } = require('./oltRegistry');
    const olts = loadAllOlts().map(resolveOlt);
    if (syslogTag) {
      const byTag = olts.find((o) => o.syslogTag === syslogTag);
      if (byTag) return byTag.id;
    }
    if (hostname) {
      const hostKey = hostname.toLowerCase();
      const byHostname = olts.find((o) => (o.syslogHostname || '').toLowerCase() === hostKey);
      if (byHostname) return byHostname.id;
    }
    if (sourceIp) {
      const byIp = olts.find(
        (o) => o.host === sourceIp
          || (Array.isArray(o.syslogSourceIps) && o.syslogSourceIps.includes(sourceIp)),
      );
      if (byIp) return byIp.id;
    }
    return null;
  } catch {
    return null;
  }
}

function addLog(entry) {
  ensureLoaded();
  const row = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    receivedAt: new Date().toISOString(),
    ...entry,
  };
  if (!row.oltId && (row.sourceIp || row.syslogTag || row.hostname)) {
    row.oltId = resolveOltId(row.sourceIp, row.syslogTag, row.hostname);
  }
  logs.unshift(row);
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
  persist();
  return row;
}

function listLogs({ limit = 100, oltId, sourceIp, level, search } = {}) {
  ensureLoaded();
  let rows = logs;
  if (oltId) rows = rows.filter((l) => l.oltId === oltId);
  if (sourceIp) rows = rows.filter((l) => l.sourceIp === sourceIp);
  if (level) rows = rows.filter((l) => (l.level || '').toLowerCase() === level.toLowerCase());
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter((l) => (l.message || '').toLowerCase().includes(q));
  }
  return rows.slice(0, limit);
}

function stats(oltId) {
  ensureLoaded();
  const rows = oltId ? logs.filter((l) => l.oltId === oltId) : logs;
  return { total: rows.length, lastAt: rows[0]?.receivedAt || null };
}

module.exports = {
  addLog,
  listLogs,
  stats,
};
