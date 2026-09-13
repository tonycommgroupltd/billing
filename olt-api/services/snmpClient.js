const snmp = require('net-snmp');
const routerOs = require('./routerOsService');

const DEFAULT_TIMEOUT = Number(process.env.SNMP_TIMEOUT_MS || 20000);
const DEFAULT_RETRIES = Number(process.env.SNMP_RETRIES || 1);

function formatValue(value) {
  if (value === null || value === undefined) return '';
  if (Buffer.isBuffer(value)) {
    const hex = value.toString('hex');
    if (hex.length === 12) {
      return hex.match(/.{2}/g).join(':');
    }
    return value.toString('utf8').replace(/\0/g, '').trim() || hex;
  }
  if (typeof value === 'object' && value.type !== undefined) return String(value);
  return String(value);
}

function closeSession(session) {
  try {
    if (session && typeof session.close === 'function') session.close();
  } catch (_) {
    /* already closed */
  }
}

function walkDirect(host, community, oid, timeoutMs = DEFAULT_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const rows = [];
    let finished = false;

    const session = snmp.createSession(host, community, {
      timeout: timeoutMs,
      retries: DEFAULT_RETRIES,
      version: snmp.Version2c,
    });

    const finish = (err, result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      closeSession(session);
      if (err) reject(err);
      else resolve(result ?? rows);
    };

    const timer = setTimeout(() => {
      finish(new Error(`SNMP walk timeout (${timeoutMs}ms) for ${oid}`));
    }, timeoutMs + 5000);

    session.subtree(
      oid,
      (varbinds) => {
        for (const vb of varbinds) {
          if (snmp.isVarbindError(vb)) continue;
          rows.push({
            oid: vb.oid,
            type: vb.type,
            value: formatValue(vb.value),
          });
        }
      },
      (err) => finish(err)
    );
  });
}

async function snmpWalk(olt, oid) {
  const transport = olt.snmpTransport || process.env.SNMP_TRANSPORT || 'routeros';
  const host = olt.host;
  const community = olt.community || 'public';
  const timeoutMs = Number(olt.snmpTimeoutMs || process.env.SNMP_WALK_TIMEOUT_MS || 180000);

  if (transport === 'routeros') {
    return routerOs.snmpWalk(null, { host, community, oid });
  }

  try {
    return await walkDirect(host, community, oid, timeoutMs);
  } catch (directErr) {
    console.warn(`[snmp] direct walk failed ${host} ${oid}: ${directErr.message}; trying RouterOS`);
    return routerOs.snmpWalk(null, { host, community, oid });
  }
}

module.exports = {
  snmpWalk,
  walkDirect,
  formatValue,
};
