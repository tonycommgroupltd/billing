const dgram = require('dgram');
const syslogStore = require('./syslogStore');

let server = null;

/** Parse RFC3164-ish syslog: <pri>timestamp host msg */
function parseSyslogMessage(raw, sourceIp) {
  const text = raw.toString('utf8').replace(/\0/g, '').trim();
  let pri = null;
  let body = text;

  const priMatch = text.match(/^<(\d+)>(.*)$/s);
  if (priMatch) {
    pri = Number(priMatch[1]);
    body = priMatch[2].trim();
  }

  const severity = pri !== null ? pri % 8 : null;
  const facility = pri !== null ? Math.floor(pri / 8) : null;

  const levelNames = ['emerg', 'alert', 'crit', 'err', 'warning', 'notice', 'info', 'debug'];
  const level = severity !== null ? levelNames[severity] || String(severity) : null;

  // VSOL often: "Jul 11 03:09:03 epon-olt message..."
  let hostname = null;
  let message = body;
  const hostMatch = body.match(/^(\S+\s+\d+\s+\S+)\s+(\S+)\s+(.*)$/s);
  if (hostMatch) {
    hostname = hostMatch[2];
    message = hostMatch[3];
  } else {
    const simple = body.match(/^(\S+)\s+(.*)$/s);
    if (simple) {
      hostname = simple[1];
      message = simple[2];
    }
  }

  return {
    sourceIp,
    pri,
    facility,
    severity,
    level,
    hostname,
    message,
    raw: text.slice(0, 2000),
  };
}

function startSyslogReceiver() {
  if (process.env.SYSLOG_ENABLED === 'false') {
    console.log('[syslog] receiver disabled');
    return null;
  }

  const port = Number(process.env.SYSLOG_PORT || 5514);
  const host = process.env.SYSLOG_BIND || '0.0.0.0';

  server = dgram.createSocket('udp4');

  server.on('message', (msg, rinfo) => {
    const parsed = parseSyslogMessage(msg, rinfo.address);
    const entry = syslogStore.addLog(parsed);
    if (process.env.SYSLOG_VERBOSE === 'true') {
      console.log(`[syslog] ${rinfo.address} → ${entry.oltId || '?'} ${parsed.message?.slice(0, 120)}`);
    }
  });

  server.on('error', (err) => {
    console.error('[syslog] receiver error:', err.message);
  });

  server.bind(port, host, () => {
    console.log(`[syslog] listening UDP ${host}:${port}`);
  });

  return server;
}

function stopSyslogReceiver() {
  if (server) {
    server.close();
    server = null;
  }
}

module.exports = { startSyslogReceiver, stopSyslogReceiver, parseSyslogMessage };
