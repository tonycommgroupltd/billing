/** Parse VSOL V1600D EPON/GPON SNMP tables into OLT info + ONU list. */

const OLT_INFO_MAP = {
  '1.3.6.1.4.1.37950.1.1.5.10.12.5.1.0': 'hostname',
  '1.3.6.1.4.1.37950.1.1.5.10.12.5.4.0': 'firmware',
  '1.3.6.1.4.1.37950.1.1.5.10.12.5.5.0': 'hardware',
  '1.3.6.1.4.1.37950.1.1.5.10.12.5.7.0': 'mac',
  '1.3.6.1.4.1.37950.1.1.5.10.12.5.8.0': 'uptimeText',
  '1.3.6.1.4.1.37950.1.1.5.10.12.5.9.0': 'temperatureC',
  '1.3.6.1.4.1.37950.1.1.5.10.12.5.10.0': 'systemTime',
  '1.3.6.1.4.1.37950.1.1.5.10.12.5.11.0': 'serial',
  '1.3.6.1.4.1.37950.1.1.5.10.12.3.0': 'cpuLoad',
  '1.3.6.1.4.1.37950.1.1.5.10.12.4.0': 'memoryLoad',
  // GPON tree equivalents
  '1.3.6.1.4.1.37950.1.1.6.10.12.5.1.0': 'hostname',
  '1.3.6.1.4.1.37950.1.1.6.10.12.5.4.0': 'firmware',
  '1.3.6.1.4.1.37950.1.1.6.10.12.5.5.0': 'hardware',
  '1.3.6.1.4.1.37950.1.1.6.10.12.5.7.0': 'mac',
  '1.3.6.1.4.1.37950.1.1.6.10.12.5.8.0': 'uptimeText',
  '1.3.6.1.4.1.37950.1.1.6.10.12.5.9.0': 'temperatureC',
  '1.3.6.1.4.1.37950.1.1.6.10.12.5.10.0': 'systemTime',
  '1.3.6.1.4.1.37950.1.1.6.10.12.5.11.0': 'serial',
  '1.3.6.1.4.1.37950.1.1.6.10.12.3.0': 'cpuLoad',
  '1.3.6.1.4.1.37950.1.1.6.10.12.4.0': 'memoryLoad',
};

const LINE_STATUS = { 0: 'offline', 1: 'online' };
/** GPON gOnuStaInfoPhaseSta — 3 = working (online) on V1600G firmware. */
const GPON_PHASE_ONLINE = new Set([3]);
/** GPON gOnuStaInfoOmccSta — 1 = OMCC up. */
const GPON_OMCC_ONLINE = 1;

function parseDbm(raw) {
  if (!raw) return null;
  const m = String(raw).match(/\(([-\d.]+)\s*dBm\)/i);
  if (m) return Number(m[1]);
  const plain = String(raw).match(/(-?\d+(?:\.\d+)?)\s*dbm/i);
  return plain ? Number(plain[1]) : null;
}

function parseOidTail(oid, minParts = 2) {
  const parts = String(oid).split('.').map(Number);
  if (parts.length < minParts) return null;
  return parts.slice(-minParts);
}

function parseOltInfoRows(rows) {
  const info = {};
  for (const row of rows || []) {
    const key = OLT_INFO_MAP[row.oid];
    if (key) info[key] = row.value;
  }
  if (info.temperatureC) info.temperatureC = Number(info.temperatureC);
  if (info.cpuLoad) info.cpuLoad = Number(info.cpuLoad);
  if (info.memoryLoad) info.memoryLoad = Number(info.memoryLoad);
  return info;
}

/** onuAuthInfo2Table columns 1–17 at ...12.1.25.1.{col}.{pon}.{onu} */
function parseOnuAuthColumnRows(rows, columnId, { ponPortPrefix = 'EPON0/' } = {}) {
  const byKey = {};
  const col = Number(columnId);

  for (const row of rows || []) {
    const tail = parseOidTail(row.oid, 2);
    if (!tail) continue;
    const [pon, onu] = tail;
    const key = `${pon}.${onu}`;
    if (!byKey[key]) {
      byKey[key] = { pon, onu, ponPort: `${ponPortPrefix}${pon}`, onuId: onu };
    }
    const entry = byKey[key];
    const val = row.value;

    switch (col) {
      case 3:
        entry.description = val;
        break;
      case 4:
        entry.lineStatus = LINE_STATUS[Number(val)] || val;
        entry.online = Number(val) === 1;
        break;
      case 5:
        entry.mac = val;
        break;
      case 6:
        entry.onuType = val;
        break;
      case 9:
        entry.description = val;
        break;
      case 12:
        entry.rtt = Number(val);
        break;
      case 17:
        entry.distance = Number(val);
        break;
      case 18:
        entry.lastRegTime = val;
        break;
      case 19:
        entry.lastDeregTime = val;
        break;
      case 20:
        entry.aliveTime = val;
        break;
      default:
        break;
    }
  }

  return byKey;
}

/** GPON gOnuStaInfoTable at ...1.1.1.1.{col}.{pon}.{onu} */
function parseOnuStaColumnRows(rows, columnId, { ponPortPrefix = 'GPON0/' } = {}) {
  const byKey = {};
  const col = Number(columnId);

  for (const row of rows || []) {
    const tail = parseOidTail(row.oid, 2);
    if (!tail) continue;
    const [pon, onu] = tail;
    const key = `${pon}.${onu}`;
    if (!byKey[key]) {
      byKey[key] = { pon, onu, ponPort: `${ponPortPrefix}${pon}`, onuId: onu };
    }
    const entry = byKey[key];
    const num = Number(row.value);

    switch (col) {
      case 4:
        entry.omccSta = num;
        if (num === GPON_OMCC_ONLINE) {
          entry.online = true;
          entry.lineStatus = 'online';
        }
        break;
      case 5:
        entry.phaseSta = num;
        if (GPON_PHASE_ONLINE.has(num)) {
          entry.online = true;
          entry.lineStatus = 'online';
        } else if (entry.online == null) {
          entry.online = false;
          entry.lineStatus = 'offline';
        }
        break;
      default:
        break;
    }
  }

  return byKey;
}

function mergeOnuAuthMaps(maps) {
  const merged = {};
  for (const map of maps) {
    for (const [key, entry] of Object.entries(map)) {
      merged[key] = { ...(merged[key] || {}), ...entry };
    }
  }
  return Object.values(merged).sort((a, b) => a.pon - b.pon || a.onu - b.onu);
}

/** Legacy full-table parser (full walk often times out on MikroTik). */
function parseOnuAuthRows(rows) {
  const byKey = {};

  for (const row of rows || []) {
    const tail = parseOidTail(row.oid, 3);
    if (!tail) continue;
    const [col, pon, onu] = tail;
    const key = `${pon}.${onu}`;
    if (!byKey[key]) {
      byKey[key] = { pon, onu, ponPort: `EPON0/${pon}`, onuId: onu };
    }
    const entry = byKey[key];
    switch (col) {
      case 1:
        entry.pon = Number(row.value);
        break;
      case 2:
        entry.onu = Number(row.value);
        break;
      case 3:
        entry.llid = Number(row.value);
        break;
      case 4:
        entry.lineStatus = LINE_STATUS[Number(row.value)] || row.value;
        entry.online = Number(row.value) === 1;
        break;
      case 5:
        entry.mac = row.value;
        break;
      case 6:
        entry.onuType = row.value;
        break;
      case 9:
        entry.description = row.value;
        break;
      case 10:
        entry.loid = row.value;
        break;
      case 12:
        entry.rtt = Number(row.value);
        break;
      case 14:
        entry.statusCode = Number(row.value);
        break;
      case 15:
        entry.deregReason = Number(row.value);
        break;
      case 17:
        entry.distance = Number(row.value);
        break;
      case 18:
        entry.lastRegTime = row.value;
        break;
      case 19:
        entry.lastDeregTime = row.value;
        break;
      case 20:
        entry.aliveTime = row.value;
        break;
      default:
        break;
    }
  }

  return Object.values(byKey).sort((a, b) => a.pon - b.pon || a.onu - b.onu);
}

/** opmDiagInfoTable ...12.2.1.8.1.{col}.{pon}.{onu} */
/** RX power column walk: ...8.1.7.{pon}.{onu} */
function parseOnuOpticalRxRows(rows) {
  const byKey = {};
  for (const row of rows || []) {
    const tail = parseOidTail(row.oid, 2);
    if (!tail) continue;
    const [pon, onu] = tail;
    byKey[`${pon}.${onu}`] = {
      pon,
      onu,
      rxPower: row.value,
      rxPowerDbm: parseDbm(row.value),
    };
  }
  return byKey;
}

/** Full optical table: ...8.1.{col}.{pon}.{onu} */
function parseOnuOpticalRows(rows) {
  const byKey = {};

  for (const row of rows || []) {
    const tail = parseOidTail(row.oid, 3);
    if (!tail) continue;
    const [col, pon, onu] = tail;
    const key = `${pon}.${onu}`;
    if (!byKey[key]) byKey[key] = { pon, onu };
    const entry = byKey[key];
    switch (col) {
      case 3:
        entry.temperature = row.value;
        break;
      case 4:
        entry.voltage = row.value;
        break;
      case 5:
        entry.txBias = row.value;
        break;
      case 6:
        entry.txPower = row.value;
        entry.txPowerDbm = parseDbm(row.value);
        break;
      case 7:
        entry.rxPower = row.value;
        entry.rxPowerDbm = parseDbm(row.value);
        break;
      default:
        break;
    }
  }

  return byKey;
}

function mergeOnuList(authRows, opticalMap) {
  return authRows.map((onu) => {
    const opt = opticalMap[`${onu.pon}.${onu.onu}`] || {};
    return {
      ...onu,
      rxPower: opt.rxPower || null,
      rxPowerDbm: opt.rxPowerDbm ?? null,
      txPower: opt.txPower || null,
      txPowerDbm: opt.txPowerDbm ?? null,
      temperature: opt.temperature || null,
    };
  });
}

function summarizeOnuList(onus) {
  const online = onus.filter((o) => o.online).length;
  return {
    total: onus.length,
    online,
    offline: onus.length - online,
  };
}

module.exports = {
  parseOltInfoRows,
  parseOnuAuthRows,
  parseOnuAuthColumnRows,
  parseOnuStaColumnRows,
  mergeOnuAuthMaps,
  parseOnuOpticalRows,
  parseOnuOpticalRxRows,
  mergeOnuList,
  summarizeOnuList,
  parseDbm,
};
