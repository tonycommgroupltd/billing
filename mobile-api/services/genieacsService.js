/**
 * GenieACS NBI client — Inform-first remote CPE management.
 * All tasks queue on next Inform (no connection_request) — scales to 1000+ ONUs
 * behind distributed MikroTik sites without per-ONU routing.
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const NBI_BASE = (process.env.GENIEACS_NBI_URL || 'http://102.0.15.254:7557').replace(/\/$/, '');
const APPLY_TIMEOUT_MS = Number(process.env.GENIEACS_APPLY_TIMEOUT_MS || 120000);
const POLL_MS = Number(process.env.GENIEACS_INFORM_POLL_MS || 5000);
const MODELS_DIR = [
  path.join(__dirname, '../deploy/genieacs/models'),
  path.join(__dirname, '../../deploy/genieacs/models'),
].find((p) => fs.existsSync(p)) || path.join(__dirname, '../../deploy/genieacs/models');

const nbi = axios.create({ baseURL: NBI_BASE, timeout: 30000 });

function loadModel(productClass) {
  const pc = String(productClass || '').toLowerCase();
  const candidates = [
    `${pc}.json`,
    `huawei-${pc}.json`,
    `zte-${pc}.json`,
  ];
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

async function findDeviceBySerial(serialNumber) {
  const q = encodeQuery({ 'DeviceID.SerialNumber': serialNumber });
  const { data } = await nbi.get(`/devices/?query=${q}`);
  return data[0] || null;
}

async function findDeviceByPppoe(username) {
  const q = encodeQuery({
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username': username,
  });
  const { data } = await nbi.get(`/devices/?query=${q}`);
  return data[0] || null;
}

/** Queue task — never uses connection_request (fleet-safe). */
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

function getNode(device, path) {
  const parts = path.split('.');
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

function extractPppoeSummary(device, model) {
  const p = model?.parameters?.pppoe || {};
  const vparamUser = paramValue(device, 'VirtualParameters.pppUsername');
  const vparamPass = paramValue(device, 'VirtualParameters.pppPassword');
  const vparamEnable = paramValue(device, 'VirtualParameters.pppEnabled');
  const vparamMac = paramValue(device, 'VirtualParameters.wanMac');
  const deviceUptime = paramValue(device, 'VirtualParameters.deviceUptime')
    || paramValue(device, model?.parameters?.device?.uptime);

  const connectionStatus = paramValue(device, p.connectionStatus);
  const pppUptime = paramValue(device, p.uptime);
  const uptimeSec = pppUptime ?? deviceUptime;

  let enable = parseBool(paramValue(device, p.enable));
  if (enable === undefined) enable = parseBool(vparamEnable);
  if (enable === undefined && connectionStatus === 'Connected') enable = true;

  return {
    username: vparamUser || paramValue(device, p.username),
    password: vparamPass || paramValue(device, p.password),
    enable,
    connectionStatus,
    externalIp: paramValue(device, p.externalIp),
    gateway: firstValue(device, [
      'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.DefaultGateway',
      'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.RemoteIPAddress',
    ]),
    mac: paramValue(device, p.mac) || vparamMac,
    uptime: uptimeSec,
    uptimeFormatted: formatUptime(uptimeSec),
    connectionType: paramValue(device, p.connectionType),
    deviceUptime: deviceUptime,
    source: vparamUser ? 'virtualParameter' : 'wanPath',
    passwordReadable: !!(vparamPass || paramValue(device, p.password)),
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
  const unknownHosts = hosts.filter((h) => h.active == null);

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
    unknownDevices: unknownHosts,
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForParam(deviceId, paramPath, expected, timeoutMs = APPLY_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const device = await getDevice(deviceId);
    const current = paramValue(device, paramPath);
    if (current === expected) {
      return { ok: true, value: current, lastInform: device._lastInform };
    }
    await sleep(POLL_MS);
  }
  const device = await getDevice(deviceId);
  return {
    ok: false,
    value: paramValue(device, paramPath),
    lastInform: device._lastInform,
    message: 'Timeout waiting for ONU Inform cycle',
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
  const result = await waitForParam(deviceId, wlan.ssid, ssid);
  return {
    mode: 'inform',
    task,
    applyWithinSeconds: 120,
    ...result,
  };
}

async function setWifiEnabled({ deviceId, productClass = 'HG8546M', enabled, wlanIndex = 1 }) {
  const model = loadModel(productClass) || loadModel('huawei-hg8546m');
  if (!model) throw new Error(`No model map for ${productClass}`);

  const wlan = wlanIndex === 2 ? model.parameters.wlan2 : model.parameters.wifi;
  const want = !!enabled;
  const task = await setParameters(deviceId, [[wlan.enable, want, 'xsd:boolean']]);
  const result = await waitForParam(deviceId, wlan.enable, want);
  return {
    mode: 'inform',
    task,
    applyWithinSeconds: 120,
    wifiEnabled: want,
    ...result,
  };
}

function readWifiEnabled(device, productClass = 'HG8546M', wlanIndex = 1) {
  const model = loadModel(productClass) || loadModel('huawei-hg8546m');
  if (!model) return null;
  const wlan = wlanIndex === 2 ? model.parameters.wlan2 : model.parameters.wifi;
  const raw = paramValue(device, wlan.enable);
  if (raw === true || raw === 1 || raw === '1' || String(raw).toLowerCase() === 'true') return true;
  if (raw === false || raw === 0 || raw === '0' || String(raw).toLowerCase() === 'false') return false;
  return null;
}

async function setPppoe({ deviceId, productClass = 'HG8546M', username, password }) {
  const model = loadModel(productClass) || loadModel('huawei-hg8546m');
  if (!model) throw new Error(`No model map for ${productClass}`);

  if (!username) throw new Error('PPPoE username is required');
  if (!password || password.length < 6) {
    throw new Error('PPPoE password must be at least 6 characters');
  }

  const p = model.parameters.pppoe;
  const values = [
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

async function getDeviceStatus(deviceId) {
  const device = await getDevice(deviceId);
  return extractDeviceSummary(device);
}

function extractDeviceSummary(device) {
  const productClass = device._deviceId?._ProductClass || 'HG8546M';
  const model = loadModel(productClass) || loadModel('huawei-hg8546m');
  const p = model?.parameters || {};

  return {
    deviceId: device._id,
    serial: device._deviceId?._SerialNumber,
    manufacturer: device._deviceId?._Manufacturer,
    productClass,
    lastInform: device._lastInform,
    online: device._lastInform
      && Date.now() - new Date(device._lastInform).getTime() < 5 * 60 * 1000,
    wifiSsid: p.wifi ? paramValue(device, p.wifi.ssid) : undefined,
    wifiEnabled: readWifiEnabled(device, productClass),
    pppoeUsername: p.pppoe ? paramValue(device, p.pppoe.username) : undefined,
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

async function listAllDevices() {
  const { data } = await nbi.get('/devices/');
  return Array.isArray(data) ? data : [];
}

async function listFaults(deviceId, limit = 20) {
  const query = deviceId ? { device: deviceId } : {};
  const q = encodeQuery(query);
  const { data } = await nbi.get(`/faults/?query=${q}`);
  const list = Array.isArray(data) ? data : [];
  return list.slice(-limit).reverse();
}

function listModelFiles() {
  if (!fs.existsSync(MODELS_DIR)) return [];
  return fs.readdirSync(MODELS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const full = JSON.parse(fs.readFileSync(path.join(MODELS_DIR, f), 'utf8'));
      return {
        file: f,
        productClass: full.productClass,
        manufacturer: full.manufacturer,
        remoteActions: full.remoteActions || {},
      };
    });
}

module.exports = {
  NBI_BASE,
  loadModel,
  getDevice,
  findDeviceBySerial,
  findDeviceByPppoe,
  queueTask,
  setParameters,
  setWifi,
  setWifiEnabled,
  readWifiEnabled,
  setPppoe,
  reboot,
  refreshObject,
  getDeviceStatus,
  extractDeviceSummary,
  extractDeviceDetails,
  listAllDevices,
  listFaults,
  listModelFiles,
  waitForParam,
  paramValue,
};
