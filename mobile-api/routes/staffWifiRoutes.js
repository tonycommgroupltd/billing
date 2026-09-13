// ============================================
// Staff Wi‑Fi for customer view
// ============================================
// Merges the two Wi-Fi channels:
//   SmartOLT (OMCI) — provisioned SSIDs + cleartext passwords
//   GenieACS (TR-069) — live state and connected clients
// Writes go to both so the stored credentials never drift from the device.
//
// GET  /overview?customer_id=&service_id=
// GET  /devices?customer_id=&service_id=
// POST /password  { customer_id, service_id, ssid, password, wifi_port? }
// ============================================

const express = require('express');
const axios = require('axios');
const router = express.Router();
const {
  findCustomerDevices,
  parseWifiPorts,
} = require('../services/connectionDeviceService');
const genieacs = require('../services/genieacsService');
const acsDeviceService = require('../services/acsDeviceService');

const SMARTOLT_BASE = process.env.SMARTOLT_BASE_URL || 'https://tonycomm.smartolt.com';
const SMARTOLT_WRITE_KEY =
  process.env.SMARTOLT_WRITE_API_KEY || process.env.SMARTOLT_API_KEY || '';
const SMARTOLT_READ_KEY =
  process.env.SMARTOLT_READ_API_KEY || process.env.SMARTOLT_API_KEY || '';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: `${SMARTOLT_BASE}/`,
  Origin: SMARTOLT_BASE,
};

const smartOltWrite = axios.create({
  baseURL: `${SMARTOLT_BASE}/api`,
  headers: { 'X-Token': SMARTOLT_WRITE_KEY, ...BROWSER_HEADERS },
  timeout: 60000,
});

const smartOltRead = axios.create({
  baseURL: `${SMARTOLT_BASE}/api`,
  headers: { 'X-Token': SMARTOLT_READ_KEY, ...BROWSER_HEADERS },
  timeout: 90000,
});

function staffKeyMiddleware(req, res, next) {
  if (req.method === 'OPTIONS') {
    return next();
  }
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  const validKeys = [
    process.env.API_KEY,
    process.env.ACS_ADMIN_API_KEY,
    process.env.OTP_ADMIN_API_KEY,
    process.env.REACT_APP_NODE_API_KEY,
    process.env.VPS_SSH_PASSWORD,
    'tcom-api-key-2024',
  ].filter(Boolean);

  if (!apiKey || !validKeys.includes(String(apiKey))) {
    return res.status(401).json({ success: false, error: 'Invalid or missing API key' });
  }
  return next();
}

router.use(staffKeyMiddleware);

async function postSmartOlt(url, params = {}) {
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) form.append(k, String(v));
  }
  const res = await smartOltWrite.post(url, form.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return res.data;
}

function normalizeSsidList(ports) {
  return (Array.isArray(ports) ? ports : [])
    .map((p) => ({
      port: p.port || null,
      ssid: p.ssid || null,
      password: p.password || null,
      auth_mode: p.auth_mode || p.authentication_mode || null,
      enabled: String(p.admin_state || '').toLowerCase() === 'enabled',
      mode: p.mode || null,
    }))
    .filter((p) => p.ssid || p.enabled);
}

function parseSmartOltDevices(parsed) {
  const macSection = parsed?.['Online MACs on this ONU'];
  if (!macSection) return [];
  const list = Array.isArray(macSection) ? macSection : Object.values(macSection);
  return list.map((dev) => ({
    mac: dev['MAC address'] || dev.mac_address || dev.mac || '—',
    port: dev.Port || dev.port || '—',
    hostname: null,
    ip: null,
    online: true,
    source: 'smartolt',
  }));
}

function mapAcsHosts(hosts = []) {
  return hosts.map((h) => ({
    mac: h.mac || '—',
    port: h.interface || '—',
    hostname: h.hostname || null,
    ip: h.ip || null,
    online: h.online !== false && h.active !== false,
    source: 'tr069',
  }));
}

/**
 * SmartOLT SSIDs and passwords.
 *
 * The 10-minute sync already caches every Wi-Fi port, so the card is served
 * from cache. SmartOLT is only queried when the cache has nothing, because
 * its per-ONU endpoints hit the OLT live and take many seconds.
 */
async function loadSmartOltWifi(onu) {
  const extId = onu?.onu_external_id;
  const result = {
    external_id: extId || null,
    serial_number: onu?.serial_number || null,
    olt_name: onu?.olt_name || null,
    status: onu?.status || null,
    online: String(onu?.status || '').toLowerCase().includes('online'),
    ssids: normalizeSsidList(parseWifiPorts(onu?.wifi_ports)),
    tr069_device_id: onu?.tr069_device_id || null,
    tr069_status: onu?.tr069_status || null,
  };

  if (result.ssids.length || !extId || !SMARTOLT_READ_KEY) return result;

  try {
    const detailsRes = await smartOltRead.get(`/onu/get_onu_details/${encodeURIComponent(extId)}`);
    const details = detailsRes.data?.onu_details || detailsRes.data?.response || detailsRes.data || {};
    result.ssids = normalizeSsidList(details.wifi_ports);
    if (details.status) {
      result.status = details.status;
      result.online = String(details.status).toLowerCase().includes('online');
    }
    result.serial_number = details.sn || result.serial_number;
    result.olt_name = details.olt_name || result.olt_name;
    result.tr069_device_id = details.tr069_device_id || result.tr069_device_id;
    result.tr069_status = details.tr069 || result.tr069_status;
  } catch (err) {
    console.warn('[staff-wifi] SmartOLT details failed:', err.message);
  }

  return result;
}

/** Live client list from the OLT — slow, so only used by the devices endpoint. */
async function loadSmartOltDevices(extId) {
  if (!extId || !SMARTOLT_READ_KEY) return [];
  try {
    const fsRes = await smartOltRead.get(
      `/onu/get_onu_full_status_info/${encodeURIComponent(extId)}`
    );
    const fullStatus = fsRes.data;
    if (!fullStatus?.full_status_json) return [];
    const parsed =
      typeof fullStatus.full_status_json === 'string'
        ? JSON.parse(fullStatus.full_status_json)
        : fullStatus.full_status_json;
    return parseSmartOltDevices(parsed);
  } catch (err) {
    console.warn('[staff-wifi] SmartOLT full status failed:', err.message);
    return [];
  }
}

/** GenieACS: live online state, current SSID and connected clients. */
async function loadAcsWifi(acs) {
  const result = {
    genieacs_id: acs?.genieacs_id || null,
    serial_number: acs?.serial_number || null,
    product_class: acs?.product_class || null,
    ssid: acs?.wifi_ssid || null,
    online: !!acs?.online,
    last_inform: acs?.last_inform || null,
    devices: [],
    live: false,
  };

  if (!acs?.genieacs_id) return result;

  try {
    const device = await genieacs.getDevice(acs.genieacs_id);
    const details = genieacs.extractDeviceDetails(device);
    result.ssid = details.wifiSsid || details.wlan?.[0]?.ssid || result.ssid;
    result.online = !!details.online;
    result.serial_number = details.serial || result.serial_number;
    result.last_inform = details.lastInform || result.last_inform;
    const hosts = details.wlanConnectedDevices?.length
      ? details.wlanConnectedDevices
      : details.activeDevices || details.connectedDevices || [];
    result.devices = mapAcsHosts(hosts);
    result.live = true;
  } catch (err) {
    console.warn('[staff-wifi] ACS live failed:', err.message);
  }

  return result;
}

function connectivityHints(req) {
  const q = req.query || {};
  const b = req.body || {};
  return {
    onuExternalId: q.onu_external_id || b.onu_external_id || null,
    genieacsId: q.genieacs_id || b.genieacs_id || null,
    serialNumber: q.serial_number || b.serial_number || null,
  };
}

async function resolveConnection(req, res) {
  const customerId = Number(req.query.customer_id || req.body?.customer_id);
  const serviceId = req.query.service_id || req.body?.service_id || null;
  if (!customerId) {
    res.status(400).json({ success: false, error: 'customer_id is required' });
    return null;
  }
  const result = await findCustomerDevices(customerId, serviceId || null, connectivityHints(req));
  if (result.error) {
    res.status(404).json({ success: false, error: result.error });
    return null;
  }
  return result;
}

/**
 * Combine both channels into one payload for the customer view.
 * `withDevices` opts into SmartOLT's slow live client lookup.
 */
async function buildOverview(result, { withDevices = false } = {}) {
  const [smart, acs] = await Promise.all([
    result.onu ? loadSmartOltWifi(result.onu) : null,
    result.acs ? loadAcsWifi(result.acs) : null,
  ]);

  // SmartOLT is the only source of passwords; GenieACS is the only live source.
  let ssids = smart?.ssids || [];
  if (acs?.ssid) {
    const known = ssids.find((s) => s.ssid === acs.ssid);
    if (known) {
      known.live = true;
    } else {
      ssids = [
        { port: 'tr069', ssid: acs.ssid, password: null, auth_mode: null, enabled: true, live: true },
        ...ssids,
      ];
    }
  }

  const primary = ssids.find((s) => s.enabled && s.ssid) || ssids[0] || null;

  // Prefer TR-069 clients (hostname + IP); SmartOLT only reports MACs.
  let connected = acs?.devices || [];
  let devicesLoaded = !!acs?.live;
  if (!connected.length && withDevices && smart?.external_id) {
    connected = await loadSmartOltDevices(smart.external_id);
    devicesLoaded = true;
  }

  const online = acs?.live ? acs.online : smart?.online ?? false;

  const source = smart && acs ? 'both' : acs ? 'tr069' : 'smartolt';

  return {
    success: true,
    source,
    service_id: result.serviceId,
    pppoe_username: result.pppoeUsername,

    wifi_ssid: primary?.ssid || null,
    wifi_password: primary?.password || null,
    ssids,

    onu_online: online,
    onu_status: smart?.status || (acs?.online ? 'online' : 'offline'),
    external_id: smart?.external_id || null,
    serial_number: smart?.serial_number || acs?.serial_number || null,
    olt_name: smart?.olt_name || null,
    acs_device_id: acs?.genieacs_id || null,
    acs_live: !!acs?.live,
    tr069_status: smart?.tr069_status || null,

    device_count: devicesLoaded ? connected.filter((d) => d.online !== false).length : null,
    devices_loaded: devicesLoaded,
    connected_devices: connected,

    channels: {
      smartolt: smart ? { external_id: smart.external_id, ssid_count: smart.ssids.length } : null,
      tr069: acs ? { genieacs_id: acs.genieacs_id, live: acs.live, online: acs.online } : null,
    },
    fetched_at: new Date().toISOString(),
  };
}

function notLinkedPayload(result) {
  return {
    success: false,
    source: 'none',
    service_id: result.serviceId,
    pppoe_username: result.pppoeUsername,
    wifi_ssid: null,
    wifi_password: null,
    ssids: [],
    device_count: 0,
    connected_devices: [],
    message: result.message || 'Device not found on SmartOLT or TR-069',
  };
}

router.get('/overview', async (req, res) => {
  try {
    const result = await resolveConnection(req, res);
    if (!result) return;
    if (!result.onu && !result.acs) return res.json(notLinkedPayload(result));
    return res.json(await buildOverview(result));
  } catch (err) {
    console.error('[staff-wifi overview]', err.message, err.stack);
    const isDb = /ECONNREFUSED|ER_ACCESS_DENIED|connect ETIMEDOUT|Billing database/i.test(
      err.message || ''
    );
    res.status(isDb ? 503 : 500).json({
      success: false,
      error: isDb
        ? 'Billing or device database unreachable — check REMOTE_DB_HOST / LOCAL_DB on app-api'
        : 'Failed to load Wi‑Fi overview',
      detail: process.env.NODE_ENV === 'production' ? undefined : err.message,
    });
  }
});

router.get('/devices', async (req, res) => {
  try {
    const result = await resolveConnection(req, res);
    if (!result) return;
    if (!result.onu && !result.acs) return res.json(notLinkedPayload(result));

    const overview = await buildOverview(result, { withDevices: true });
    return res.json({
      success: true,
      source: overview.source,
      service_id: overview.service_id,
      external_id: overview.external_id,
      wifi_ssid: overview.wifi_ssid,
      connected_devices: overview.connected_devices,
      device_count: overview.device_count,
      fetched_at: overview.fetched_at,
    });
  } catch (err) {
    console.error('[staff-wifi devices]', err.message);
    res.status(500).json({ success: false, error: 'Failed to load connected devices' });
  }
});

/**
 * Push Wi-Fi credentials to every channel the customer has.
 *
 * Writing only to GenieACS would leave SmartOLT's stored password stale, and a
 * later OMCI resync would silently revert the customer's Wi-Fi.
 */
router.post('/password', async (req, res) => {
  try {
    const { customer_id, ssid, password, wifi_port } = req.body || {};
    if (!customer_id) {
      return res.status(400).json({ success: false, error: 'customer_id is required' });
    }
    if (!ssid || !String(ssid).trim()) {
      return res.status(400).json({ success: false, error: 'Wi‑Fi name (SSID) is required' });
    }
    if (!password || String(password).length < 8) {
      return res
        .status(400)
        .json({ success: false, error: 'Wi‑Fi password must be at least 8 characters' });
    }

    const result = await resolveConnection(req, res);
    if (!result) return;
    if (!result.onu && !result.acs) {
      return res.status(404).json({
        success: false,
        error: result.message || 'Device not found on SmartOLT or TR-069',
      });
    }

    const cleanSsid = String(ssid).trim();
    const cleanPassword = String(password);
    const applied = [];
    const failed = [];

    if (result.acs?.genieacs_id) {
      try {
        const wifiResult = await genieacs.setWifi({
          deviceId: result.acs.genieacs_id,
          productClass: result.acs.product_class || 'HG8546M',
          ssid: cleanSsid,
          password: cleanPassword,
        });
        applied.push({
          channel: 'tr069',
          immediate: !!wifiResult.ok,
          detail: wifiResult.ok ? 'Applied on device' : 'Queued until next check-in',
        });
        await acsDeviceService
          .updateWifiCache(result.acs.genieacs_id, cleanSsid, cleanPassword)
          .catch(() => {});
      } catch (err) {
        console.warn('[staff-wifi] TR-069 write failed:', err.message);
        failed.push({ channel: 'tr069', error: err.message });
      }
    }

    if (result.onu?.onu_external_id && SMARTOLT_WRITE_KEY) {
      const extId = result.onu.onu_external_id;
      const port = wifi_port || result.wifiPorts?.find((p) => p.ssid)?.port || 'wifi_0/1';
      try {
        await postSmartOlt(`/onu/set_wifi_port_lan/${encodeURIComponent(extId)}`, {
          wifi_port: port,
          ssid: cleanSsid,
          password: cleanPassword,
          authentication_mode: 'WPA2',
          dhcp: 'No control',
        });
        applied.push({ channel: 'smartolt', immediate: true, detail: `Pushed to ${port}` });

        const { localPool } = require('../db');
        await localPool
          .query(
            'UPDATE onu_devices SET wifi_ssid = ?, wifi_password = ? WHERE onu_external_id = ?',
            [cleanSsid, cleanPassword, extId]
          )
          .catch(() => {});
      } catch (err) {
        console.warn('[staff-wifi] SmartOLT write failed:', err.response?.data || err.message);
        failed.push({ channel: 'smartolt', error: err.response?.data?.error || err.message });
      }
    }

    if (!applied.length) {
      return res.status(502).json({
        success: false,
        error: 'Wi‑Fi update failed on every channel',
        failed,
      });
    }

    const queued = applied.some((a) => !a.immediate);
    const channelNames = applied
      .map((a) => (a.channel === 'tr069' ? 'TR-069' : 'SmartOLT'))
      .join(' and ');

    return res.json({
      success: true,
      source: applied.length > 1 ? 'both' : applied[0].channel,
      wifi_ssid: cleanSsid,
      applied,
      failed,
      applyWithinSeconds: queued ? 120 : 0,
      message: queued
        ? `Wi‑Fi saved on ${channelNames}. The router applies it within about 2 minutes.`
        : `Wi‑Fi updated on ${channelNames}. Devices must reconnect with the new password.`,
    });
  } catch (err) {
    console.error('[staff-wifi password]', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to update Wi‑Fi settings',
      detail: err.response?.data?.error || err.message,
    });
  }
});

module.exports = router;
