const snmpClient = require('./snmpClient');
const routerOs = require('./routerOsService');
const cache = require('./oltCache');
const {
  parseOltInfoRows,
  parseOnuAuthColumnRows,
  parseOnuStaColumnRows,
  mergeOnuAuthMaps,
  parseOnuOpticalRxRows,
  mergeOnuList,
  summarizeOnuList,
} = require('./vsolParseService');

function featureEnabled(olt, name) {
  return olt.features?.[name] !== false;
}

async function ensureReachable(olt) {
  const requirePing = olt.requirePing !== false && process.env.OLT_REQUIRE_PING !== 'false';
  const pingIface = olt.pingInterface || olt.faibaMgmtPort || null;
  const ping = await routerOs.pingHost(null, olt.host, pingIface).catch(() => ({
    reachable: false,
    packetLoss: '100',
  }));
  if (requirePing && !ping.reachable) {
    throw new Error(`OLT ${olt.host} unreachable (ping failed)`);
  }
  return ping;
}

async function pollOltInfo(olt, { force = false } = {}) {
  if (!featureEnabled(olt, 'oltInfo')) {
    return { ok: false, error: 'oltInfo disabled for this OLT', oltId: olt.id };
  }

  const cacheKey = `olt:${olt.id}:info`;
  if (!force) {
    const cached = cache.get(cacheKey);
    if (cached) return { ...cached, source: 'cache' };
  }

  const ping = await ensureReachable(olt).catch(() => ({ reachable: true, packetLoss: '0' }));
  const oids = olt.oids || {};
  const roots = [oids.oltInfo, oids.oltCpu, oids.oltMemory].filter(Boolean);
  const rows = [];

  for (const oid of roots) {
    const part = await snmpClient.snmpWalk(olt, oid);
    rows.push(...part);
  }

  const info = parseOltInfoRows(rows);
  const payload = {
    ok: true,
    oltId: olt.id,
    host: olt.host,
    model: olt.model,
    snmpProfile: olt.snmpProfile,
    info,
    ping,
    polledAt: new Date().toISOString(),
    source: 'live',
  };

  cache.set(cacheKey, payload, Number(olt.oltInfoCacheMs || 120000));
  return payload;
}

async function pollOnuList(olt, { force = false } = {}) {
  if (!featureEnabled(olt, 'onuList')) {
    return { ok: false, error: 'onuList disabled for this OLT', oltId: olt.id, items: [] };
  }

  const cacheKey = `olt:${olt.id}:onus`;
  if (!force) {
    const cached = cache.get(cacheKey);
    if (cached) return { ...cached, source: 'cache' };
  }

  const ping = await ensureReachable(olt).catch(() => ({ reachable: true, packetLoss: '0' }));
  const oids = olt.oids || {};
  const authBase = oids.onuAuthBase;
  const staBase = oids.onuStaBase;
  const columns = oids.onuAuthColumns || ['4', '5', '6', '9'];
  const staColumns = oids.onuStaColumns || [];
  const rxOid = oids.onuOpticalRx;
  const parseOpts = { ponPortPrefix: olt.ponPortPrefix || (olt.mibFamily === 'gpon' ? 'GPON0/' : 'EPON0/') };

  const authMaps = [];
  for (const col of columns) {
    const oid = `${authBase}.${col}`;
    const rows = await snmpClient.snmpWalk(olt, oid);
    authMaps.push(parseOnuAuthColumnRows(rows, col, parseOpts));
  }

  for (const col of staColumns) {
    if (!staBase) break;
    const oid = `${staBase}.${col}`;
    const rows = await snmpClient.snmpWalk(olt, oid);
    authMaps.push(parseOnuStaColumnRows(rows, col, parseOpts));
  }

  const auth = mergeOnuAuthMaps(authMaps);
  for (const onu of auth) {
    if (onu.online == null) {
      onu.online = false;
      onu.lineStatus = onu.lineStatus || 'offline';
    }
  }
  let opticalMap = {};
  if (rxOid) {
    try {
      const rxRows = await snmpClient.snmpWalk(olt, rxOid);
      opticalMap = parseOnuOpticalRxRows(rxRows);
    } catch (err) {
      console.warn(`[vsol] optical walk skipped for ${olt.id}: ${err.message}`);
    }
  }

  const items = mergeOnuList(auth, opticalMap);
  const stats = summarizeOnuList(items);

  const payload = {
    ok: true,
    oltId: olt.id,
    host: olt.host,
    snmpProfile: olt.snmpProfile,
    items,
    stats,
    ping,
    polledAt: new Date().toISOString(),
    source: 'live',
  };

  cache.set(cacheKey, payload, Number(olt.onuListCacheMs || 300000));
  return payload;
}

module.exports = {
  pollOltInfo,
  pollOnuList,
};
