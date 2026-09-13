/** Parse RouterOS /tool/snmp-walk rows into structured system info. */

const SYS_OIDS = {
  '1.3.6.1.2.1.1.1.0': 'description',
  '1.3.6.1.2.1.1.2.0': 'objectId',
  '1.3.6.1.2.1.1.3.0': 'uptimeTicks',
  '1.3.6.1.2.1.1.4.0': 'contact',
  '1.3.6.1.2.1.1.5.0': 'name',
  '1.3.6.1.2.1.1.6.0': 'location',
};

function normalizeRow(row) {
  const oid = row.oid || row.name || row['.oid'] || '';
  const value = row.value ?? row['.value'] ?? row.val ?? '';
  return { oid: String(oid), value: String(value) };
}

function parseSnmpRows(rows) {
  const system = {};
  const all = [];

  for (const row of rows || []) {
    if (row.after || row.ret) continue;
    const { oid, value } = normalizeRow(row);
    if (!oid) continue;
    all.push({ oid, value });

    const key = SYS_OIDS[oid];
    if (key) system[key] = value;
  }

  if (system.uptimeTicks) {
    const ticks = Number(system.uptimeTicks);
    if (Number.isFinite(ticks)) {
      const sec = Math.floor(ticks / 100);
      const d = Math.floor(sec / 86400);
      const h = Math.floor((sec % 86400) / 3600);
      const m = Math.floor((sec % 3600) / 60);
      system.uptimeFormatted = d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
    }
  }

  return { system, rowCount: all.length, sample: all.slice(0, 20) };
}

function buildOltSummary(pollResult, parsed) {
  const { olt, ok, error, ping, polledAt } = pollResult;
  return {
    id: olt.id,
    name: olt.name,
    host: olt.host,
    vendor: olt.vendor,
    model: olt.model,
    faibaPort: olt.faibaPort,
    community: '***',
    ok,
    online: ok,
    error: error || null,
    ping: ping ? { reachable: ping.reachable, packetLoss: ping.packetLoss } : null,
    system: parsed?.system || {},
    snmpRowCount: parsed?.rowCount || 0,
    polledAt,
  };
}

module.exports = {
  parseSnmpRows,
  buildOltSummary,
};
