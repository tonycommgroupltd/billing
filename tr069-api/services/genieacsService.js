/**
 * GenieACS NBI client — Inform-first remote CPE management.
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const NBI_BASE = (process.env.GENIEACS_NBI_URL || 'http://102.0.15.254:7557').replace(/\/$/, '');
const APPLY_TIMEOUT_MS = Number(process.env.GENIEACS_APPLY_TIMEOUT_MS || 120000);
const POLL_MS = Number(process.env.GENIEACS_INFORM_POLL_MS || 5000);
const MODELS_DIR = path.join(__dirname, '../models');

const nbi = axios.create({ baseURL: NBI_BASE, timeout: 30000 });

function loadModel(productClass) {
  const pc = String(productClass || '').toLowerCase();
  const candidates = [`${pc}.json`, `huawei-${pc}.json`, `zte-${pc}.json`];
  for (const name of candidates) {
    const file = path.join(MODELS_DIR, name);
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  return null;
}

function encodeQuery(obj) {
  return encodeURIComponent(JSON.stringify(obj));
}

async function getDevice(deviceId) {
  const q = encodeQuery({ _id: deviceId });
  const { data } = await nbi.get(`/devices/?query=${q}`);
  if (!data?.length) throw new Error(`GenieACS device not found: ${deviceId}`);
  return data[0];
}

async function queueTask(deviceId, task) {
  const { data } = await nbi.post(`/devices/${encodeURIComponent(deviceId)}/tasks`, task);
  return data;
}

function paramValue(device, paramPath) {
  const parts = paramPath.split('.');
  let node = device;
  for (const p of parts) {
    if (!node || typeof node !== 'object') return undefined;
    node = node[p];
  }
  if (node && typeof node === 'object' && '_value' in node) return node._value;
  return undefined;
}

function getNode(device, nodePath) {
  const parts = nodePath.split('.');
  let node = device;
  for (const p of parts) {
    if (!node || typeof node !== 'object') return undefined;
    node = node[p];
  }
  return node;
}

function val(obj, key) {
  const n = obj?.[key];
  if (n && typeof n === 'object' && '_value' in n) return n._value;
  return undefined;
}

function firstValue(device, paths) {
  for (const p of paths) {
    const v = paramValue(device, p);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

function formatUptime(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s < 0) return undefined;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function parseBool(v) {
  if (v === true || v === 1 || v === '1' || v === 'true') return true;
  if (v === false || v === 0 || v === '0' || v === 'false') return false;
  return undefined;
}

function extractWlanBands(device, model) {
  const root = getNode(device, model?.parameters?.wlan?.root
    || 'InternetGatewayDevice.LANDevice.1.WLANConfiguration');
  if (!root || typeof root !== 'object') return [];

  const vBssid = paramValue(device, 'VirtualParameters.wlanBssid');
  const vChannel = paramValue(device, 'VirtualParameters.wlanChannel');
  const vSecurity = paramValue(device, 'VirtualParameters.wlanSecurity');

  return Object.keys(root)
    .filter((k) => /^\d+$/.test(k))
    .map((k) => {
      const w = root[k];
      const idx = Number(k);
      return {
        index: idx,
        ssid: val(w, 'SSID'),
        enable: val(w, 'Enable'),
        channel: val(w, 'Channel') ?? (idx === 1 ? vChannel : undefined),
        status: val(w, 'Status') ?? (val(w, 'Enable') === true ? 'Up' : undefined),
        standard: val(w, 'Standard'),
        beaconType: val(w, 'BeaconType') ?? (idx === 1 ? vSecurity : undefined),
        bssid: val(w, 'BSSID') ?? (idx === 1 ? vBssid : undefined),
      };
    })
    .filter((w) => w.ssid || w.enable !== undefined);
}

function normalizeMac(mac) {
  return String(mac || '').toLowerCase().replace(/[^a-f0-9]/g, '');
}

function mergeHostEntry(existing, incoming) {
  if (!existing) return incoming;
  const pick = (a, b) => (a != null && a !== '' ? a : b);
  const active = incoming.active === true ? true : existing.active;
  return {
    hostname: pick(incoming.hostname, existing.hostname),
    mac: pick(incoming.mac, existing.mac),
    ip: pick(incoming.ip, existing.ip),
    active,
    online: active === true,
    offline: active === false,
    interface: pick(incoming.interface, existing.interface),
    leaseRemaining: pick(incoming.leaseRemaining, existing.leaseRemaining),
    addressSource: pick(incoming.addressSource, existing.addressSource),
  };
}

function extractConnectedHosts(device) {
  const root = getNode(device, 'InternetGatewayDevice.LANDevice.1.Hosts.Host');
  if (!root || typeof root !== 'object') return [];

  const byMac = new Map();

  for (const k of Object.keys(root).filter((key) => /^\d+$/.test(key))) {
    const h = root[k];
    const mac = val(h, 'MACAddress') || val(h, 'PhysAddress');
    if (!mac) continue;

    const macKey = normalizeMac(mac);
    const activeRaw = val(h, 'Active');
    const active = parseBool(activeRaw);
    const iface = val(h, 'Layer2Interface') || val(h, 'InterfaceType') || val(h, 'Layer1Interface');
    const entry = {
      hostname: val(h, 'HostName') || val(h, 'Hostname'),
      mac,
      ip: val(h, 'IPAddress'),
      active: active ?? null,
      online: active === true,
      offline: active === false,
      interface: iface,
      leaseRemaining: val(h, 'LeaseTimeRemaining'),
      addressSource: val(h, 'AddressSource'),
    };

    byMac.set(macKey, mergeHostEntry(byMac.get(macKey), entry));
  }

  return Array.from(byMac.values())
    .sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      return String(a.hostname || a.ip || '').localeCompare(String(b.hostname || b.ip || ''));
    });
}

function extractLanPorts(device, model) {
  const root = getNode(device, model?.parameters?.lanPorts?.root
    || 'InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig');
  const expected = model?.parameters?.lanPorts?.portCount || 4;
  if (!root || typeof root !== 'object') {
    return Array.from({ length: expected }, (_, i) => ({
      port: i + 1,
      status: null,
      linkUp: null,
    }));
  }

  const ports = Object.keys(root)
    .filter((k) => /^\d+$/.test(k))
    .map((k) => {
      const eth = root[k];
      const status = val(eth, 'Status');
      const detection = val(eth, 'X_HW_DetectionStatus');
      const linkUp = status === 'Up' || status === 'Connected' || detection === 1;
      return {
        port: Number(k),
        mac: val(eth, 'MACAddress'),
        status: status || (linkUp ? 'Up' : detection === 0 ? 'NoLink' : null),
        linkUp: status ? linkUp : (detection === 1 ? true : detection === 0 ? false : null),
        enable: val(eth, 'Enable'),
        speed: val(eth, 'X_HW_Speed') || val(eth, 'MaxBitRate'),
        duplex: val(eth, 'X_HW_DuplexMode') || val(eth, 'DuplexMode'),
        detectionStatus: detection,
      };
    })
    .sort((a, b) => a.port - b.port);

  if (ports.length >= expected) return ports;

  const seen = new Set(ports.map((p) => p.port));
  for (let i = 1; i <= expected; i += 1) {
    if (!seen.has(i)) ports.push({ port: i, status: null, linkUp: null });
  }
  return ports.sort((a, b) => a.port - b.port);
}

function classifyOptical(rxDbm) {
  const rx = Number(rxDbm);
  if (!Number.isFinite(rx)) {
    return { health: 'unknown', label: 'No reading', severity: 'neutral' };
  }
  if (rx <= -28) {
    return { health: 'critical', label: 'Critical — weak signal', severity: 'critical' };
  }
  if (rx <= -26) {
    return { health: 'warning', label: 'Warning — borderline', severity: 'warning' };
  }
  if (rx >= -10) {
    return { health: 'overload', label: 'Too strong', severity: 'warning' };
  }
  return { health: 'good', label: 'Good', severity: 'good' };
}

function extractOptical(device, model) {
  const o = model?.parameters?.optical || {};
  const rx = firstValue(device, [
    'VirtualParameters.opticalRxPower',
    o.rxPower,
    o.rxPowerAlt,
  ]);
  const tx = firstValue(device, [
    'VirtualParameters.opticalTxPower',
    o.txPower,
    o.txPowerAlt,
  ]);
  const rxNum = rx != null && rx !== '' ? Number(rx) : null;
  const classification = classifyOptical(rxNum);
  return {
    rxPower: rxNum,
    txPower: tx != null && tx !== '' ? Number(tx) : null,
    rxPowerDbm: rxNum != null ? `${rxNum} dBm` : null,
    txPowerDbm: tx != null && tx !== '' ? `${tx} dBm` : null,
    ...classification,
  };
}

function extractWanConnections(device) {
  const wcdRoot = getNode(device, 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice');
  if (!wcdRoot || typeof wcdRoot !== 'object') return [];

  const vMac = paramValue(device, 'VirtualParameters.wanMac');
  const connections = [];

  for (const wcdKey of Object.keys(wcdRoot).filter((k) => /^\d+$/.test(k))) {
    const wcd = wcdRoot[wcdKey];

    const pppRoot = wcd.WANPPPConnection;
    if (pppRoot && typeof pppRoot === 'object') {
      for (const pppKey of Object.keys(pppRoot).filter((k) => /^\d+$/.test(k))) {
        const p = pppRoot[pppKey];
        connections.push({
          type: 'PPPoE',
          name: val(p, 'Name') || `PPP ${wcdKey}.${pppKey}`,
          enable: val(p, 'Enable'),
          username: val(p, 'Username') || paramValue(device, 'VirtualParameters.pppUsername'),
          connectionStatus: val(p, 'ConnectionStatus'),
          externalIp: val(p, 'ExternalIPAddress'),
          gateway: val(p, 'RemoteIPAddress') || val(p, 'DefaultGateway'),
          mac: val(p, 'MACAddress') || vMac,
          uptime: val(p, 'Uptime'),
          connectionType: val(p, 'ConnectionType'),
          vlan: val(p, 'X_HW_VLAN'),
          lastError: val(p, 'LastConnectionError'),
        });
      }
    }

    const ipRoot = wcd.WANIPConnection;
    if (ipRoot && typeof ipRoot === 'object') {
      for (const ipKey of Object.keys(ipRoot).filter((k) => /^\d+$/.test(k))) {
        const p = ipRoot[ipKey];
        connections.push({
          type: 'IP',
          name: val(p, 'Name') || `IP ${wcdKey}.${ipKey}`,
          enable: val(p, 'Enable'),
          connectionStatus: val(p, 'ConnectionStatus'),
          externalIp: val(p, 'ExternalIPAddress'),
          subnetMask: val(p, 'SubnetMask'),
          gateway: val(p, 'DefaultGateway'),
          mac: val(p, 'MACAddress'),
          uptime: val(p, 'Uptime'),
          addressingType: val(p, 'AddressingType'),
        });
      }
    }
  }

  return connections;
}

/**
 * Some ONUs (e.g. HG8546 with the internet WAN on WANConnectionDevice.2)
 * don't expose PPPoE under the conventional ...WANConnectionDevice.1 path.
 * Find the best PPP connection wherever it lives.
 */
function findPrimaryPppNode(device) {
  const wcdRoot = getNode(device, 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice');
  if (!wcdRoot || typeof wcdRoot !== 'object') return null;

  const isMgmt = (node) => {
    const label = `${val(node, 'Name') || ''} ${val(node, 'X_HW_SERVICELIST') || ''}`;
    return /tr[-_]?069|mgmt|manage/i.test(label);
  };

  let best = null;
  let bestScore = -1;
  for (const wcdKey of Object.keys(wcdRoot).filter((k) => /^\d+$/.test(k))) {
    const pppRoot = wcdRoot[wcdKey].WANPPPConnection;
    if (!pppRoot || typeof pppRoot !== 'object') continue;
    for (const pppKey of Object.keys(pppRoot).filter((k) => /^\d+$/.test(k))) {
      const node = pppRoot[pppKey];
      const label = `${val(node, 'Name') || ''} ${val(node, 'X_HW_SERVICELIST') || ''}`;
      let score = 0;
      if (val(node, 'ExternalIPAddress')) score += 1;
      if (val(node, 'Username')) score += 2;
      if (/internet/i.test(label)) score += 4;
      if (isMgmt(node)) score -= 8; // never prefer the TR-069 management WAN
      if (score > bestScore) {
        bestScore = score;
        best = {
          node,
          path: `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${wcdKey}.WANPPPConnection.${pppKey}`,
        };
      }
    }
  }
  return best;
}

function isDiscoveryDevice(device) {
  const id = String(device._id || '');
  const serial = String(device._deviceId?._SerialNumber || '');
  return id.startsWith('DISCOVERYSERVICE') || serial.startsWith('DISCOVERYSERVICE');
}

function extractDeviceSummary(device) {
  const productClass = device._deviceId?._ProductClass || 'HG8546M';
  const model = loadModel(productClass) || loadModel('huawei-hg8546m');
  const p = model?.parameters || {};

  const pppoePaths = [
    'VirtualParameters.pppUsername',
    p.pppoe?.username,
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username',
  ].filter(Boolean);

  const wanMacPaths = [
    'VirtualParameters.wanMac',
    p.pppoe?.mac,
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.MACAddress',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.MACAddress',
    'InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.1.MACAddress',
  ].filter(Boolean);

  const primaryPpp = findPrimaryPppNode(device);

  return {
    deviceId: device._id,
    serial: device._deviceId?._SerialNumber,
    manufacturer: device._deviceId?._Manufacturer,
    productClass,
    lastInform: device._lastInform,
    online: device._lastInform
      && Date.now() - new Date(device._lastInform).getTime() < 5 * 60 * 1000,
    wifiSsid: p.wifi ? firstValue(device, [p.wifi.ssid]) : undefined,
    pppoeUsername: firstValue(device, pppoePaths) ?? (primaryPpp ? val(primaryPpp.node, 'Username') : undefined),
    wanMac: firstValue(device, wanMacPaths) ?? (primaryPpp ? val(primaryPpp.node, 'MACAddress') : undefined),
    uptime: p.device ? paramValue(device, p.device.uptime) : undefined,
    software: p.device ? paramValue(device, p.device.software) : undefined,
    connectionRequestUrl: p.management
      ? paramValue(device, p.management.connectionRequestUrl)
      : paramValue(device, 'InternetGatewayDevice.ManagementServer.ConnectionRequestURL'),
    acsUrl: p.management
      ? paramValue(device, p.management.acsUrl)
      : paramValue(device, 'InternetGatewayDevice.ManagementServer.URL'),
    informInterval: p.management
      ? paramValue(device, p.management.informInterval)
      : paramValue(device, 'InternetGatewayDevice.ManagementServer.PeriodicInformInterval'),
    tags: device._tags || [],
  };
}

function mapSummaryToRow(summary) {
  return {
    genieacs_id: summary.deviceId,
    serial_number: summary.serial,
    product_class: summary.productClass,
    manufacturer: summary.manufacturer,
    pppoe_username: summary.pppoeUsername,
    wan_mac: summary.wanMac || null,
    wifi_ssid: summary.wifiSsid,
    software_version: summary.software,
    connection_request_url: summary.connectionRequestUrl,
    last_inform: summary.lastInform,
    online: summary.online ? 1 : 0,
  };
}

async function listAllDevices({ excludeDiscovery = true } = {}) {
  const { data } = await nbi.get('/devices/');
  const list = Array.isArray(data) ? data : [];
  if (!excludeDiscovery) return list;
  return list.filter((d) => !isDiscoveryDevice(d));
}

async function listDeviceRows({ excludeDiscovery = true } = {}) {
  const devices = await listAllDevices({ excludeDiscovery });
  return devices.map((d) => mapSummaryToRow(extractDeviceSummary(d)));
}

async function listFaults(deviceId, limit = 20) {
  const query = deviceId ? { device: deviceId } : {};
  const q = encodeQuery(query);
  const { data } = await nbi.get(`/faults/?query=${q}`);
  const list = Array.isArray(data) ? data : [];
  return list.slice(-limit).reverse();
}

function extractPppoeSummary(device, model) {
  const p = model?.parameters?.pppoe || {};
  const vparamUser = paramValue(device, 'VirtualParameters.pppUsername');
  const vparamPass = paramValue(device, 'VirtualParameters.pppPassword');
  const vparamEnable = paramValue(device, 'VirtualParameters.pppEnabled');
  const vparamMac = paramValue(device, 'VirtualParameters.wanMac');
  const deviceUptime = paramValue(device, 'VirtualParameters.deviceUptime')
    || paramValue(device, model?.parameters?.device?.uptime);

  // Fixed model paths first; fall back to whichever WANConnectionDevice.N
  // actually carries the PPP connection (e.g. HG8546 uses .2).
  const ppp = findPrimaryPppNode(device);
  const pppNode = ppp?.node;

  const connectionStatus = paramValue(device, p.connectionStatus)
    ?? (pppNode ? val(pppNode, 'ConnectionStatus') : undefined);
  const pppUptime = paramValue(device, p.uptime)
    ?? (pppNode ? val(pppNode, 'Uptime') : undefined);
  const uptimeSec = pppUptime ?? deviceUptime;

  let enable = parseBool(paramValue(device, p.enable));
  if (enable === undefined && pppNode) enable = parseBool(val(pppNode, 'Enable'));
  if (enable === undefined) enable = parseBool(vparamEnable);
  if (enable === undefined && connectionStatus === 'Connected') enable = true;

  const username = vparamUser || paramValue(device, p.username)
    || (pppNode ? val(pppNode, 'Username') : undefined);
  const password = vparamPass || paramValue(device, p.password)
    || (pppNode ? val(pppNode, 'Password') : undefined);

  return {
    username,
    password,
    enable,
    connectionStatus,
    externalIp: paramValue(device, p.externalIp)
      ?? (pppNode ? val(pppNode, 'ExternalIPAddress') : undefined),
    gateway: firstValue(device, [
      'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.DefaultGateway',
      'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.RemoteIPAddress',
    ]) ?? (pppNode ? (val(pppNode, 'DefaultGateway') || val(pppNode, 'RemoteIPAddress')) : undefined),
    mac: paramValue(device, p.mac) || vparamMac
      || (pppNode ? val(pppNode, 'MACAddress') : undefined),
    uptime: uptimeSec,
    uptimeFormatted: formatUptime(uptimeSec),
    connectionType: paramValue(device, p.connectionType)
      ?? (pppNode ? val(pppNode, 'ConnectionType') : undefined),
    deviceUptime,
    source: vparamUser ? 'virtualParameter' : (paramValue(device, p.username) ? 'wanPath' : (ppp ? ppp.path : 'wanPath')),
    passwordReadable: !!password,
  };
}

function extractDeviceDetails(device) {
  const productClass = device._deviceId?._ProductClass || 'HG8546M';
  const model = loadModel(productClass) || loadModel('huawei-hg8546m');
  const summary = extractDeviceSummary(device);
  const hosts = extractConnectedHosts(device);
  const lanPorts = extractLanPorts(device, model);
  const wlan = extractWlanBands(device, model);
  const wan = extractWanConnections(device);
  const pppoe = extractPppoeSummary(device, model);
  const optical = extractOptical(device, model);

  const activeHosts = hosts.filter((h) => h.online);
  const offlineHosts = hosts.filter((h) => h.offline);

  const wlanHosts = hosts.filter((h) => {
    const iface = String(h.interface || '').toLowerCase();
    return iface.includes('wlan') || iface.includes('wifi') || iface.includes('802.11');
  });
  const lanHosts = hosts.filter((h) => !wlanHosts.includes(h));

  return {
    ...summary,
    pppoe,
    wan,
    wlan,
    lanPorts,
    connectedDevices: hosts,
    activeDevices: activeHosts,
    offlineDevices: offlineHosts,
    wlanConnectedDevices: wlanHosts.length ? wlanHosts : activeHosts,
    lanConnectedDevices: lanHosts,
    optical,
    hostCount: hosts.length,
    activeHostCount: activeHosts.length,
    offlineHostCount: offlineHosts.length,
    lanPortCount: lanPorts.length,
    lanPortsUp: lanPorts.filter((p) => p.linkUp === true).length,
  };
}

async function setParameters(deviceId, parameterValues) {
  return queueTask(deviceId, { name: 'setParameterValues', parameterValues });
}

async function setWifi({ deviceId, productClass = 'HG8546M', ssid, password, wlanIndex = 1 }) {
  const model = loadModel(productClass) || loadModel('huawei-hg8546m');
  if (!model) throw new Error(`No model map for ${productClass}`);

  const wlan = wlanIndex === 2 ? model.parameters.wlan2 : model.parameters.wifi;
  const values = [
    [wlan.enable, true, 'xsd:boolean'],
    [wlan.ssid, ssid, 'xsd:string'],
  ];
  if (password) {
    values.push([wlan.password, password, 'xsd:string']);
    if (model.wifiDefaults?.beaconTypeWhenWpa2 && model.parameters.wifi.beaconType) {
      values.push([model.parameters.wifi.beaconType, model.wifiDefaults.beaconTypeWhenWpa2, 'xsd:string']);
    }
  }

  const task = await setParameters(deviceId, values);
  return { mode: 'inform', task, applyWithinSeconds: 120 };
}

async function setPppoe({ deviceId, productClass = 'HG8546M', username, password }) {
  const model = loadModel(productClass) || loadModel('huawei-hg8546m');
  if (!model) throw new Error(`No model map for ${productClass}`);

  if (!username) throw new Error('PPPoE username is required');
  if (!password || password.length < 6) {
    throw new Error('PPPoE password must be at least 6 characters');
  }

  const p = model.parameters.pppoe;

  // Target the PPP connection the device actually exposes (HG8546 uses
  // WANConnectionDevice.2) — fall back to the model's fixed paths.
  let base = null;
  try {
    const device = await getDevice(deviceId);
    const ppp = findPrimaryPppNode(device);
    if (ppp) base = ppp.path;
  } catch (_) { /* fall back to model paths */ }

  const values = base
    ? [
      [`${base}.Enable`, true, 'xsd:boolean'],
      [`${base}.Username`, username, 'xsd:string'],
      [`${base}.Password`, password, 'xsd:string'],
    ]
    : [
      [p.enable, true, 'xsd:boolean'],
      [p.username, username, 'xsd:string'],
      [p.password, password, 'xsd:string'],
    ];

  const task = await setParameters(deviceId, values);
  return {
    mode: 'inform',
    task,
    applyWithinSeconds: 120,
    message: 'PPPoE credentials queued — applies on next Inform (~30s)',
  };
}

async function reboot(deviceId) {
  return queueTask(deviceId, { name: 'reboot' });
}

async function refreshObject(deviceId, objectName) {
  return queueTask(deviceId, { name: 'refreshObject', objectName });
}

module.exports = {
  NBI_BASE,
  getDevice,
  extractDeviceSummary,
  extractDeviceDetails,
  mapSummaryToRow,
  listAllDevices,
  listDeviceRows,
  listFaults,
  setWifi,
  setPppoe,
  reboot,
  refreshObject,
  isDiscoveryDevice,
};
