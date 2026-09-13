const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../config/olts.json');
const PROFILES_PATH = path.join(__dirname, '../config/oltProfiles.json');

function loadProfiles() {
  return JSON.parse(fs.readFileSync(PROFILES_PATH, 'utf8'));
}

function loadAllOlts() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

/** Merge snmpProfile defaults with per-OLT overrides (each OLT managed separately). */
function resolveOlt(olt) {
  if (!olt) return null;
  const profiles = loadProfiles();
  const profile = olt.snmpProfile ? profiles[olt.snmpProfile] || {} : {};
  return {
    ...profile,
    ...olt,
    oids: { ...(profile.oids || {}), ...(olt.oids || {}) },
    features: { ...(profile.features || {}), ...(olt.features || {}) },
    label: olt.name,
    profileLabel: profile.label || olt.snmpProfile || null,
  };
}

function loadOlts() {
  return loadAllOlts().filter((o) => o.enabled !== false).map(resolveOlt);
}

function getOltById(id) {
  const raw = loadAllOlts().find((o) => o.id === id) || null;
  return resolveOlt(raw);
}

function resolveOltBySourceIp(ip) {
  return loadOlts().find((o) => o.host === ip || o.outbandHost === ip) || null;
}

function getTrapSetup() {
  const faibaMgmtIp = process.env.FAIBA_MGMT_IP || '192.168.0.1';
  const oltMgmtIp = process.env.HIOSO_MGMT_IP || '192.168.0.88';
  const faibaMgmtPort = process.env.FAIBA_MGMT_PORT || 'ether13';
  const vpsHost = process.env.TRAP_PUBLIC_HOST || '100.42.182.120';
  const trapPort = Number(process.env.SNMP_TRAP_PORT || 3162);
  const syslogPort = Number(process.env.SYSLOG_PORT || 5514);

  return {
    mode: 'oob-mgmt',
    description:
      'Each OLT has its own snmpProfile in config/olts.json. VSOL: SNMP poll + syslog to VPS. HIOSO: traps.',
    vps: {
      host: vpsHost,
      trapPort,
      syslogPort,
    },
    physical: {
      customerUplink: 'HIOSO uplink GE → Faiba ether4 (bridge1, switch mode — do not change)',
      mgmtCable: 'HIOSO mgmt/AUX port → Faiba ether13 (or mini switch: mgmt → switch → PC + ether13)',
    },
    olt: {
      mgmtIp: oltMgmtIp,
      mgmtMask: '255.255.255.0',
      trapHost: faibaMgmtIp,
      trapPort: 162,
      readCommunity: 'SNMPREAD',
      webUi: `http://${oltMgmtIp}`,
      revertNote: 'In web UI set Management IP back to 192.168.0.88 (not 192.168.8.100 on mgmt page)',
    },
    faiba2: {
      mgmtPort: faibaMgmtPort,
      mgmtIp: `${faibaMgmtIp}/24`,
      customerPort: 'ether4',
      natRule: `dst-nat UDP ${faibaMgmtIp}:162 → ${vpsHost}:${trapPort}`,
    },
    vsolSyslogCli: `syslog server ip ${vpsHost} port ${syslogPort}`,
    steps: [
      `Cable OLT mgmt port to Faiba ${faibaMgmtPort} (or use 5-port mini switch).`,
      `On OLT web UI: IP = ${oltMgmtIp}, gateway = ${faibaMgmtIp}. SNMP trap host = ${faibaMgmtIp}.`,
      `VSOL: syslog server ip ${vpsHost} port ${syslogPort}`,
      'Do NOT change switch mode or port aggregation.',
    ],
    reference: 'https://adminolt.com/en/documentacion/articulo/configuracion-en-routerboard-mikrotik-para-olt-hioso-epon-204/',
  };
}

module.exports = {
  loadProfiles,
  loadAllOlts,
  resolveOlt,
  loadOlts,
  getOltById,
  resolveOltBySourceIp,
  getTrapSetup,
};
