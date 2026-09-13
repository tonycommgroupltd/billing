const dgram = require('dgram');
const trapStore = require('./trapStore');
const { parseSnmpTrap } = require('./trapParseService');
const { resolveOltBySourceIp } = require('./oltRegistry');

let server = null;

function startTrapReceiver() {
  if (process.env.SNMP_TRAP_ENABLED === 'false') {
    console.log('[trap] SNMP trap receiver disabled');
    return null;
  }

  const port = Number(process.env.SNMP_TRAP_PORT || 3162);
  const host = process.env.SNMP_TRAP_BIND || '0.0.0.0';

  server = dgram.createSocket('udp4');

  server.on('message', (msg, rinfo) => {
    const parsed = parseSnmpTrap(msg);
    const olt = resolveOltBySourceIp(rinfo.address);
    const trap = {
      id: `${Date.now()}-${rinfo.address}-${Math.random().toString(36).slice(2, 8)}`,
      receivedAt: new Date().toISOString(),
      sourceIp: rinfo.address,
      sourcePort: rinfo.port,
      oltId: olt?.id || null,
      oltName: olt?.name || null,
      ...parsed,
      rawHex: msg.slice(0, 256).toString('hex'),
    };
    trapStore.addTrap(trap);
    console.log(
      `[trap] ${rinfo.address}:${rinfo.port} ${parsed.summary}${olt ? ` → ${olt.name}` : ''}`
    );
  });

  server.on('error', (err) => {
    console.error('[trap] receiver error:', err.message);
  });

  server.bind(port, host, () => {
    console.log(`[trap] listening UDP ${host}:${port}`);
  });

  return server;
}

function stopTrapReceiver() {
  if (server) {
    server.close();
    server = null;
  }
}

module.exports = { startTrapReceiver, stopTrapReceiver };
