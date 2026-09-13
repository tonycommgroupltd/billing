const { execFile } = require('child_process');
const path = require('path');
const { promisify } = require('util');
const { loadOlts, getOltById } = require('./oltRegistry');

const execFileAsync = promisify(execFile);
const PHP_BIN = process.env.ROUTEROS_PHP_BIN || 'php';
const PHP_SCRIPT = path.join(__dirname, 'routerOsCli.php');
const USE_PHP = process.env.ROUTEROS_USE_PHP !== 'false';

async function rosPhp(action, params = {}) {
  const { stdout } = await execFileAsync(
    PHP_BIN,
    [PHP_SCRIPT, action, JSON.stringify(params)],
    { timeout: Number(process.env.ROUTEROS_TIMEOUT || 300) * 1000 + 10000, maxBuffer: 16 * 1024 * 1024 }
  );
  const parsed = JSON.parse(stdout.trim());
  if (!parsed.ok) throw new Error(parsed.error || 'RouterOS PHP bridge failed');
  return parsed;
}

async function pingHost(_api, host, iface) {
  if (USE_PHP) {
    const r = await rosPhp('ping', { host, interface: iface || undefined, count: 2 });
    return { reachable: r.reachable, packetLoss: r.packetLoss, raw: r.raw };
  }
  throw new Error('node-routeros disabled; set ROUTEROS_USE_PHP=true on VPS');
}

async function snmpWalk(_api, { host, community, oid }) {
  if (USE_PHP) {
    const r = await rosPhp('snmpWalk', { host, community, oid });
    return r.rows;
  }
  throw new Error('node-routeros disabled');
}

async function getRouterResource() {
  const r = await rosPhp('resource');
  return r.data;
}

async function withRouterOS(fn) {
  return fn(null);
}

async function pollOltSnmp(olt) {
  const oid = olt.systemOid || '1.3.6.1.2.1.1';
  const requirePing = olt.requirePing !== false && process.env.OLT_REQUIRE_PING !== 'false';
  const pingIface = olt.pingInterface || olt.faibaMgmtPort || null;

  try {
    const ping = await pingHost(null, olt.host, pingIface);

    if (requirePing && !ping.reachable) {
      return {
        olt,
        ok: false,
        error: `OLT ${olt.host} unreachable from Faiba 2 (ping failed)`,
        ping,
        polledAt: new Date().toISOString(),
      };
    }

    const rows = await snmpWalk(null, {
      host: olt.host,
      community: olt.community,
      oid,
    });

    if (!Array.isArray(rows) || rows.length === 0 || rows.some((r) => r && r.after)) {
      throw new Error('SNMP walk returned no data (enable SNMP on OLT and allow UDP 161 from 192.168.8.1)');
    }

    return { olt, ok: true, ping, snmpRows: rows, polledAt: new Date().toISOString() };
  } catch (err) {
    const ping = await pingHost(null, olt.host, pingIface).catch(() => ({ reachable: false, packetLoss: '100' }));
    return {
      olt,
      ok: false,
      error: err.message,
      ping,
      polledAt: new Date().toISOString(),
    };
  }
}

module.exports = {
  loadOlts,
  getOltById,
  withRouterOS,
  pingHost,
  snmpWalk,
  getRouterResource,
  pollOltSnmp,
};
