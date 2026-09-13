const trapStore = require('./trapStore');

const ONLINE_MS = Number(process.env.TRAP_ONLINE_WINDOW_MS || 900000); // 15 min

function buildTrapSummary(olt) {
  const last = trapStore.lastTrapForOlt(olt.id) || trapStore.lastTrapFromIp(olt.host);
  const lastAt = last?.receivedAt || null;
  const ageMs = lastAt ? Date.now() - new Date(lastAt).getTime() : null;
  const ok = ageMs !== null && ageMs <= ONLINE_MS;
  const recent = trapStore.listTraps({ limit: 10, oltId: olt.id });

  return {
    id: olt.id,
    name: olt.name,
    host: olt.host,
    vendor: olt.vendor,
    model: olt.model,
    faibaPort: olt.faibaPort,
    monitorMode: 'trap',
    ok,
    online: ok,
    error: ok ? null : lastAt
      ? `No trap in last ${Math.round(ONLINE_MS / 60000)} min (last: ${new Date(lastAt).toLocaleString()})`
      : 'No traps yet — configure HIOSO inband 192.168.8.100 and trap host 192.168.8.1',
    lastTrapAt: lastAt,
    lastTrapSummary: last?.summary || null,
    trapCount: recent.length,
    polledAt: lastAt || new Date().toISOString(),
    trapSetup: {
      trapHost: process.env.FAIBA_TRAP_IP || '192.168.8.1',
      inbandIp: olt.host,
      trapPort: 162,
    },
  };
}

module.exports = { buildTrapSummary, ONLINE_MS };
