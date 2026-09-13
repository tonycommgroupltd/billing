// ============================================
// TCOM API — Connection Routes
// ============================================
// GET  /service         — Get user's ONU / connection info
// POST /wifi-password   — Change WiFi SSID & password
// GET  /wifi-status     — WiFi on/off (parental control)
// POST /wifi-control    — Enable or disable WiFi
// POST /pppoe-password  — Change PPPoE password
//
// All ONU lookups use the cached onu_devices table
// (synced from SmartOLT every 10 min). Only the actual
// password-change POST hits SmartOLT (1 API call each).
// ============================================

const express = require('express');
const axios = require('axios');
const router = express.Router();
const { localPool, remotePool } = require('../db');
const { authMiddleware } = require('../auth');
const { findUserConnection } = require('../services/connectionDeviceService');
const genieacs = require('../services/genieacsService');
const acsDeviceService = require('../services/acsDeviceService');

let wifiParentalTableReady = false;
async function ensureWifiParentalTable() {
  if (wifiParentalTableReady) return;
  await localPool.query(`
    CREATE TABLE IF NOT EXISTS wifi_parental_state (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      customer_id BIGINT UNSIGNED NOT NULL,
      service_id BIGINT UNSIGNED NOT NULL,
      device_key VARCHAR(128) NOT NULL,
      wifi_enabled TINYINT(1) NOT NULL DEFAULT 1,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_customer_service (customer_id, service_id),
      KEY idx_device (device_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  wifiParentalTableReady = true;
}

// SmartOLT config
const SMARTOLT_BASE      = process.env.SMARTOLT_BASE_URL       || 'https://tonycomm.smartolt.com';
const SMARTOLT_WRITE_KEY = process.env.SMARTOLT_WRITE_API_KEY  || process.env.SMARTOLT_API_KEY || '';
const SMARTOLT_READ_KEY  = process.env.SMARTOLT_READ_API_KEY   || process.env.SMARTOLT_API_KEY || '';

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': `${SMARTOLT_BASE}/`,
  'Origin': SMARTOLT_BASE,
};

// Client for write operations (password changes)
const smartOlt = axios.create({
  baseURL: `${SMARTOLT_BASE}/api`,
  headers: { 'X-Token': SMARTOLT_WRITE_KEY, ...BROWSER_HEADERS },
  timeout: 60000,
});

// Client for read operations (full status queries) — separate rate limit
const smartOltRead = axios.create({
  baseURL: `${SMARTOLT_BASE}/api`,
  headers: { 'X-Token': SMARTOLT_READ_KEY, ...BROWSER_HEADERS },
  timeout: 60000,
});

// Legacy alias used below
const SMARTOLT_KEY = SMARTOLT_WRITE_KEY;

// POST with URL-encoded form data (SmartOLT expects this)
async function postSmartOlt(url, params = {}) {
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) form.append(k, String(v));
  }
  console.log(`[SMARTOLT POST] ${url} params:`, JSON.stringify(params));
  const res = await smartOlt.post(url, form.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  console.log(`[SMARTOLT POST] ${url} response:`, JSON.stringify(res.data));
  return res.data;
}

/** @deprecated use findUserConnection — kept as alias */
async function findUserOnu(customerId, serviceId = null) {
  return findUserConnection(customerId, serviceId);
}

function formatAcsForService(acs) {
  return {
    externalId: acs.genieacs_id,
    name: acs.serial_number || acs.genieacs_id,
    serialNumber: acs.serial_number,
    status: acs.online ? 'online' : 'offline',
    adminStatus: null,
    wifiSsid: acs.wifi_ssid,
    wifiPassword: acs.wifi_password,
    wifiMode: 'acs',
    onuType: acs.product_class,
    oltName: null,
    zone: null,
    speedProfile: null,
    lastSynced: acs.last_synced,
    source: 'acs',
  };
}

// ==================================================
// GET /api/connection/service — Connection info
// ==================================================
router.get('/service', authMiddleware, async (req, res) => {
  try {
    const serviceId = req.query.serviceId || null;
    const result = await findUserOnu(req.user.customerId, serviceId);

    if (result.error) {
      return res.status(404).json({ error: result.error });
    }

    const onu = result.onu;
    const acs = result.acs;
    res.json({
      pppoeUsername: result.pppoeUsername,
      source: result.source || null,
      onuFound: !!(onu || acs),
      syncHasRun: result.syncHasRun ?? true,
      message: result.message || null,
      onu: onu ? {
        externalId: onu.onu_external_id,
        name: onu.name,
        serialNumber: onu.serial_number,
        status: onu.status,
        adminStatus: onu.admin_status,
        wifiSsid: onu.wifi_ssid,
        wifiPassword: onu.wifi_password,
        wifiMode: onu.wifi_mode,
        onuType: onu.onu_type,
        oltName: onu.olt_name,
        zone: onu.zone,
        speedProfile: onu.speed_profile,
        lastSynced: onu.last_synced,
        source: 'smartolt',
      } : acs ? formatAcsForService(acs) : null,
    });

  } catch (err) {
    console.error('[CONNECTION/SERVICE ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function parseWifiEnabledFromPorts(wifiPorts) {
  if (!wifiPorts?.length) return null;
  const port = wifiPorts.find((p) => p.ssid) || wifiPorts[0];
  const state = String(port.admin_state || port.status || port.state || '').toLowerCase();
  if (state.includes('enable') || state === 'up' || state === 'active') return true;
  if (state.includes('disable') || state === 'down' || state === 'inactive') return false;
  return null;
}

async function readCachedWifiState(customerId, serviceId) {
  try {
    await ensureWifiParentalTable();
    const [[row]] = await localPool.query(
      'SELECT wifi_enabled FROM wifi_parental_state WHERE customer_id = ? AND service_id = ? LIMIT 1',
      [customerId, serviceId]
    );
    if (!row) return null;
    return !!row.wifi_enabled;
  } catch {
    return null;
  }
}

async function saveCachedWifiState(customerId, serviceId, deviceKey, wifiEnabled) {
  try {
    await ensureWifiParentalTable();
    await localPool.query(
      `INSERT INTO wifi_parental_state (customer_id, service_id, device_key, wifi_enabled)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE device_key = VALUES(device_key), wifi_enabled = VALUES(wifi_enabled)`,
      [customerId, serviceId, deviceKey, wifiEnabled ? 1 : 0]
    );
  } catch (err) {
    console.warn('[WIFI-CONTROL] cache update skipped:', err.message);
  }
}

async function fetchSmartOltWifiPorts(extId) {
  try {
    const detRes = await smartOltRead.get(`/onu/get_onu_details/${extId}`);
    const d = detRes.data;
    const details = d?.onu_details || d?.response || d;
    return details?.wifi_ports || [];
  } catch (e) {
    console.warn(`[WIFI-STATUS] SmartOLT details failed for ${extId}:`, e.message);
    return [];
  }
}

// ==================================================
// GET /api/connection/wifi-status — Parental WiFi state
// ==================================================
router.get('/wifi-status', authMiddleware, async (req, res) => {
  try {
    const serviceId = req.query.serviceId || null;
    const result = await findUserOnu(req.user.customerId, serviceId);
    if (result.error) return res.status(404).json({ error: result.error });

    const resolvedServiceId = serviceId || result.serviceId || null;
    let wifiEnabled = null;
    let ssid = null;
    let source = null;
    let deviceKey = null;

    if (result.acs) {
      source = 'acs';
      deviceKey = result.acs.genieacs_id;
      ssid = result.acs.wifi_ssid;
      try {
        const live = await genieacs.getDevice(result.acs.genieacs_id);
        wifiEnabled = genieacs.readWifiEnabled(live, result.acs.product_class || 'HG8546M');
        const liveSsid = genieacs.extractDeviceSummary(live).wifiSsid;
        if (liveSsid) ssid = liveSsid;
      } catch (e) {
        console.warn('[WIFI-STATUS ACS]', e.message);
      }
    } else if (result.onu) {
      source = 'smartolt';
      deviceKey = result.onu.onu_external_id;
      ssid = result.onu.wifi_ssid;
      const ports = await fetchSmartOltWifiPorts(deviceKey);
      wifiEnabled = parseWifiEnabledFromPorts(ports);
    }

    if (wifiEnabled === null && resolvedServiceId) {
      wifiEnabled = await readCachedWifiState(req.user.customerId, resolvedServiceId);
    }
    if (wifiEnabled === null) wifiEnabled = true;

    const canControl = !!(result.acs || result.onu);

    res.json({
      canControl,
      wifiEnabled,
      ssid,
      source,
      onuFound: canControl,
      message: canControl
        ? null
        : (result.message || 'Your router is not managed remotely. Use the router admin panel to turn WiFi off.'),
    });
  } catch (err) {
    console.error('[WIFI-STATUS ERROR]', err);
    res.status(500).json({ error: 'Failed to read WiFi status' });
  }
});

// ==================================================
// POST /api/connection/wifi-control — Enable / disable WiFi
// Body: { enabled: true|false, serviceId? }
// ==================================================
router.post('/wifi-control', authMiddleware, async (req, res) => {
  try {
    const { enabled, serviceId } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled (boolean) is required' });
    }

    const result = await findUserOnu(req.user.customerId, serviceId || null);
    if (result.error) return res.status(404).json({ error: result.error });

    const resolvedServiceId = serviceId || result.serviceId;
    if (!resolvedServiceId) {
      return res.status(400).json({ error: 'serviceId is required' });
    }

    if (result.acs) {
      const control = await genieacs.setWifiEnabled({
        deviceId: result.acs.genieacs_id,
        productClass: result.acs.product_class || 'HG8546M',
        enabled,
      });
      await saveCachedWifiState(
        req.user.customerId, resolvedServiceId, result.acs.genieacs_id, enabled
      );
      console.log(`[WIFI-CONTROL ACS] customer ${req.user.customerId} ${enabled ? 'ON' : 'OFF'}`);
      return res.json({
        success: true,
        wifiEnabled: enabled,
        source: 'acs',
        mode: 'inform',
        applyWithinSeconds: 120,
        applied: control.ok,
        message: enabled
          ? (control.ok
            ? 'WiFi is on. Devices can connect again.'
            : 'WiFi enable queued — applies within about 2 minutes.')
          : (control.ok
            ? 'WiFi is off. Wireless devices will disconnect.'
            : 'WiFi disable queued — applies within about 2 minutes.'),
      });
    }

    if (!result.onu) {
      return res.status(404).json({
        error: result.message || 'Your device is not managed remotely. Use the router admin panel.',
      });
    }

    if (!SMARTOLT_KEY) {
      return res.status(503).json({ error: 'SmartOLT integration not configured' });
    }

    const extId = result.onu.onu_external_id;
    const path = enabled ? `/onu/enable_wifi/${extId}` : `/onu/disable_wifi/${extId}`;
    await postSmartOlt(path);

    await saveCachedWifiState(req.user.customerId, resolvedServiceId, extId, enabled);

    console.log(`[WIFI-CONTROL] customer ${req.user.customerId} ONU ${extId} → ${enabled ? 'ON' : 'OFF'}`);

    res.json({
      success: true,
      wifiEnabled: enabled,
      source: 'smartolt',
      message: enabled
        ? 'WiFi turned on. Devices can connect again within a few minutes.'
        : 'WiFi turned off. All wireless devices will be disconnected.',
    });
  } catch (err) {
    console.error('[WIFI-CONTROL ERROR]', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to update WiFi. Please try again.' });
  }
});

// ==================================================
// POST /api/connection/wifi-password — Change WiFi
// ==================================================
router.post('/wifi-password', authMiddleware, async (req, res) => {
  try {
    console.log(`[WIFI-PASSWORD] Request from customer ${req.user.customerId}:`, JSON.stringify(req.body));
    const { ssid, newPassword, serviceId } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'WiFi password must be at least 8 characters' });
    }
    if (!ssid || ssid.trim().length === 0) {
      return res.status(400).json({ error: 'WiFi name (SSID) is required' });
    }

    const result = await findUserOnu(req.user.customerId, serviceId || null);
    if (result.error) return res.status(404).json({ error: result.error });

    if (result.acs) {
      const wifiResult = await genieacs.setWifi({
        deviceId: result.acs.genieacs_id,
        productClass: result.acs.product_class || 'HG8546M',
        ssid: ssid.trim(),
        password: newPassword,
      });
      await acsDeviceService.updateWifiCache(result.acs.genieacs_id, ssid.trim(), newPassword);
      console.log(`[WIFI CHANGE ACS] Customer ${req.user.customerId} ${result.acs.genieacs_id}`);
      return res.json({
        success: true,
        source: 'acs',
        mode: 'inform',
        applyWithinSeconds: 120,
        applied: wifiResult.ok,
        message: wifiResult.ok
          ? 'WiFi settings updated successfully.'
          : 'WiFi change queued — will apply within about 2 minutes when your router checks in.',
        ssid: ssid.trim(),
      });
    }

    if (!result.onu) {
      return res.status(404).json({ error: result.message || 'Your device has not been synced yet. Please try again in a few minutes.' });
    }

    if (!SMARTOLT_KEY) {
      return res.status(503).json({ error: 'SmartOLT integration not configured' });
    }

    const extId = result.onu.onu_external_id;

    const smartResult = await postSmartOlt(`/onu/set_wifi_port_lan/${extId}`, {
      wifi_port: 'wifi_0/1',
      ssid: ssid.trim(),
      password: newPassword,
      authentication_mode: 'WPA2',
      dhcp: 'No control',
    });

    // Update our cache
    await localPool.query(
      'UPDATE onu_devices SET wifi_ssid = ?, wifi_password = ? WHERE onu_external_id = ?',
      [ssid.trim(), newPassword, extId]
    );

    console.log(`[WIFI CHANGE] Customer ${req.user.customerId} ONU ${extId} — SSID: ${ssid.trim()}`);

    res.json({
      success: true,
      message: 'WiFi settings updated successfully. All devices will need to reconnect with the new credentials.',
      ssid: ssid.trim(),
    });

  } catch (err) {
    console.error('[WIFI-PASSWORD ERROR]', err.response?.data || err.message);
    if (err.response?.status === 404) {
      return res.status(404).json({ error: 'ONU not found on SmartOLT. Contact support.' });
    }
    res.status(500).json({ error: 'Failed to update WiFi settings. Please try again later.' });
  }
});

// ==================================================
// POST /api/connection/pppoe-password — Change PPPoE
// ==================================================
router.post('/pppoe-password', authMiddleware, async (req, res) => {
  try {
    const { newPassword, serviceId } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const result = await findUserOnu(req.user.customerId, serviceId || null);
    if (result.error) return res.status(404).json({ error: result.error });

    if (result.acs) {
      await genieacs.setPppoe({
        deviceId: result.acs.genieacs_id,
        productClass: result.acs.product_class || 'HG8546M',
        username: result.pppoeUsername,
        password: newPassword,
      });
      try {
        await remotePool.query(
          'UPDATE services SET mikrotik_password = ? WHERE customer_id = ? AND mikrotik_name = ?',
          [newPassword, req.user.customerId, result.pppoeUsername]
        );
      } catch (dbErr) {
        console.warn('[PPPOE ACS] Remote DB update failed:', dbErr.message);
      }
      console.log(`[PPPOE CHANGE ACS] Customer ${req.user.customerId} ${result.acs.genieacs_id}`);
      return res.json({
        success: true,
        source: 'acs',
        mode: 'inform',
        applyWithinSeconds: 120,
        message: 'PPPoE password queued — will apply within about 2 minutes when your router checks in.',
      });
    }

    if (!result.onu) {
      return res.status(404).json({ error: result.message || 'Your device has not been synced yet. Please try again in a few minutes.' });
    }

    if (!SMARTOLT_KEY) {
      return res.status(503).json({ error: 'SmartOLT integration not configured' });
    }

    const extId = result.onu.onu_external_id;

    const smartResult = await postSmartOlt(`/onu/set_onu_wan_mode_pppoe/${extId}`, {
      username: result.pppoeUsername,
      password: newPassword,
    });

    // Update our cache
    await localPool.query(
      'UPDATE onu_devices SET pppoe_password = ? WHERE onu_external_id = ?',
      [newPassword, extId]
    );

    // Also update the remote services table (mikrotik_password)
    try {
      await remotePool.query(
        'UPDATE services SET mikrotik_password = ? WHERE customer_id = ? AND mikrotik_name = ?',
        [newPassword, req.user.customerId, result.pppoeUsername]
      );
    } catch (dbErr) {
      console.warn('[PPPOE] Remote DB update failed (non-critical):', dbErr.message);
    }

    console.log(`[PPPOE CHANGE] Customer ${req.user.customerId} ONU ${extId}`);

    res.json({
      success: true,
      message: 'PPPoE password changed successfully. Your router will reconnect automatically within a few minutes.',
    });

  } catch (err) {
    console.error('[PPPOE-PASSWORD ERROR]', err.response?.data || err.message);
    if (err.response?.status === 404) {
      return res.status(404).json({ error: 'ONU not found on SmartOLT. Contact support.' });
    }
    res.status(500).json({ error: 'Failed to change PPPoE password. Please try again later.' });
  }
});

// ==================================================
// GET /api/connection/onu-details — Full ONU details
// Uses READ key. Returns details + signal + full status
// (connected devices, LAN ports, WAN interfaces, optical)
// Same data the frontend OnuDetail.jsx shows, but the
// mobile user can only CHANGE WiFi SSID & password.
// ==================================================
router.get('/onu-details', authMiddleware, async (req, res) => {
  try {
    const serviceId = req.query.serviceId || null;
    const result = await findUserOnu(req.user.customerId, serviceId);
    if (result.error) return res.status(404).json({ error: result.error });

    if (result.acs) {
      let live = null;
      try {
        live = await genieacs.getDeviceStatus(result.acs.genieacs_id);
      } catch (e) {
        console.warn('[ONU-DETAILS ACS] live fetch failed:', e.message);
      }
      return res.json({
        onuFound: true,
        source: 'acs',
        syncHasRun: true,
        pppoeUsername: result.pppoeUsername,
        onu: {
          externalId: result.acs.genieacs_id,
          name: result.acs.serial_number || result.acs.genieacs_id,
          serialNumber: result.acs.serial_number,
          status: live?.online ? 'online' : (result.acs.online ? 'online' : 'offline'),
          onuType: result.acs.product_class,
          wifiSsid: live?.wifiSsid || result.acs.wifi_ssid,
          wifiPassword: result.acs.wifi_password,
          pppoeUsername: live?.pppoeUsername || result.pppoeUsername,
          softwareVersion: live?.software || result.acs.software_version,
          lastInform: live?.lastInform || result.acs.last_inform,
          lastSynced: result.acs.last_synced,
          connectionRequestUrl: live?.connectionRequestUrl || result.acs.connection_request_url,
        },
        signal: null,
        opticalStatus: null,
        connectedDevices: [],
        wanInterfaces: [],
        lanPorts: [],
      });
    }

    if (!result.onu) {
      return res.json({
        onuFound: false,
        syncHasRun: result.syncHasRun ?? false,
        pppoeUsername: result.pppoeUsername,
        message: result.message || null,
      });
    }

    const extId = result.onu.onu_external_id;
    const READ_KEY = process.env.SMARTOLT_READ_API_KEY || process.env.SMARTOLT_API_KEY || '';

    if (!READ_KEY) {
      // Return cached DB data only
      return res.json({
        onuFound: true,
        syncHasRun: true,
        pppoeUsername: result.pppoeUsername,
        onu: formatOnuFromDb(result.onu),
        details: null,
        signal: null,
        fullStatus: null,
      });
    }

    // --- Fetch live data from SmartOLT (read-only key) ---
    const delay = ms => new Promise(r => setTimeout(r, ms));

    // 1) ONU details
    let details = null;
    try {
      const detRes = await smartOltRead.get(`/onu/get_onu_details/${extId}`);
      const d = detRes.data;
      details = d?.onu_details || d?.response || d;
    } catch (e) {
      console.warn(`[ONU-DETAILS] Details fetch failed for ${extId}:`, e.message);
    }

    await delay(3000);

    // 2) Signal
    let signal = null;
    try {
      const sigRes = await smartOltRead.get(`/onu/get_onu_signal/${extId}`);
      signal = sigRes.data;
    } catch (e) {
      console.warn(`[ONU-DETAILS] Signal fetch failed for ${extId}:`, e.message);
    }

    await delay(3000);

    // 3) Full status (connected devices, LAN, WAN, optical)
    let fullStatus = null;
    try {
      const fsRes = await smartOltRead.get(`/onu/get_onu_full_status_info/${extId}`);
      fullStatus = fsRes.data;
    } catch (e) {
      console.warn(`[ONU-DETAILS] Full status fetch failed for ${extId}:`, e.message);
    }

    // Parse full_status_json sections (same logic as frontend OnuDetail.jsx)
    let connectedDevices = [];
    let opticalStatus = null;
    let wanInterfaces = [];
    let lanPorts = [];

    if (fullStatus?.full_status_json) {
      try {
        const parsed = typeof fullStatus.full_status_json === 'string'
          ? JSON.parse(fullStatus.full_status_json)
          : fullStatus.full_status_json;

        connectedDevices = parseConnectedDevicesFromFullStatus(parsed);

        // Optical status
        opticalStatus = parsed['Optical status'] || null;

        // WAN Interfaces
        const wan = parsed['ONU WAN Interfaces'];
        if (wan) {
          wanInterfaces = Array.isArray(wan) ? wan : Object.values(wan);
        }

        // LAN Ports
        const lan = parsed['ONU LAN Interfaces status'];
        if (lan) {
          lanPorts = Array.isArray(lan) ? lan : Object.entries(lan).map(([k, v]) => ({ port: k, ...v }));
        }
      } catch { /* ignore parse errors */ }
    }

    res.json({
      onuFound: true,
      syncHasRun: true,
      pppoeUsername: result.pppoeUsername,
      onu: {
        externalId: extId,
        name: details?.name || result.onu.name,
        serialNumber: details?.sn || result.onu.serial_number,
        status: details?.status || result.onu.status,
        adminStatus: details?.administrative_status || result.onu.admin_status,
        onuType: details?.onu_type_name || result.onu.onu_type,
        oltName: details?.olt_name || result.onu.olt_name,
        zone: details?.zone_name || result.onu.zone,
        odb: details?.odb_name || result.onu.odb,
        wanMode: details?.wan_mode || null,
        vlan: details?.vlan || null,
        speedProfile: result.onu.speed_profile,
        speedDown: details?.service_ports?.[0]?.download_speed || null,
        speedUp: details?.service_ports?.[0]?.upload_speed || null,
        ipAddress: details?.ip_address || result.onu.ip_address,
        macAddress: details?.mac_address || result.onu.mac_address,
        authorizedDate: details?.authorization_date || null,
        pppoeUsername: details?.username || result.pppoeUsername,
        // WiFi from details (live) — user can change these
        wifiPorts: details?.wifi_ports || [],
        wifiSsid: result.onu.wifi_ssid,
        wifiPassword: result.onu.wifi_password,
        lastSynced: result.onu.last_synced,
      },
      signal: signal ? {
        quality: signal.onu_signal || null,
        value: signal.onu_signal_value || null,
        rx1490: signal.onu_signal_1490 || null,
        tx1310: signal.onu_signal_1310 || null,
      } : null,
      opticalStatus,
      connectedDevices,
      wanInterfaces: wanInterfaces.map(wan => ({
        name: wan['Name'] || null,
        connectionStatus: wan['IPv4 Connection status'] || null,
        serviceType: wan['Service type'] || null,
        accessType: wan['IPv4 access type'] || null,
        ipv4Address: wan['IPv4 address'] || null,
        gateway: wan['Default gateway'] || null,
        subnet: wan['Subnet mask'] || null,
        vlan: wan['Manage VLAN'] || null,
        mac: wan['MAC address'] || null,
        connectionType: wan['Connection type'] || null,
      })),
      lanPorts: lanPorts.map(lp => ({
        port: lp.port || null,
        type: lp['Type'] || null,
        speed: lp['Speed'] || null,
        duplex: lp['Duplex'] || null,
        linkState: lp['Link state'] || null,
        loopStatus: lp['Ring Status'] || null,
      })),
    });

  } catch (err) {
    console.error('[ONU-DETAILS ERROR]', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to load device details. Please try again.' });
  }
});

// ==================================================
// GET /api/connection/connected-devices — Fast list for web/desktop
// One SmartOLT read call (full status only) — MACs on ONU
// ==================================================
router.get('/connected-devices', authMiddleware, async (req, res) => {
  try {
    const serviceId = req.query.serviceId || null;
    const result = await findUserOnu(req.user.customerId, serviceId);

    if (result.error) {
      return res.status(404).json({ error: result.error });
    }

    if (!result.onu) {
      return res.json({
        onuFound: false,
        syncHasRun: result.syncHasRun ?? false,
        pppoeUsername: result.pppoeUsername,
        message: result.message || null,
        connectedDevices: [],
      });
    }

    const extId = result.onu.onu_external_id;
    const READ_KEY = process.env.SMARTOLT_READ_API_KEY || process.env.SMARTOLT_API_KEY || '';

    if (!READ_KEY) {
      return res.json({
        onuFound: true,
        onuStatus: result.onu.status,
        onuName: result.onu.name,
        connectedDevices: [],
        message: 'Live device list unavailable — open My Network for full details.',
      });
    }

    let connectedDevices = [];
    try {
      const fsRes = await smartOltRead.get(`/onu/get_onu_full_status_info/${extId}`);
      const fullStatus = fsRes.data;
      if (fullStatus?.full_status_json) {
        const parsed = typeof fullStatus.full_status_json === 'string'
          ? JSON.parse(fullStatus.full_status_json)
          : fullStatus.full_status_json;
        connectedDevices = parseConnectedDevicesFromFullStatus(parsed);
      }
    } catch (e) {
      console.warn(`[CONNECTED-DEVICES] Fetch failed for ${extId}:`, e.message);
      return res.status(502).json({
        error: 'Could not load connected devices from SmartOLT. Try again in a moment.',
      });
    }

    res.json({
      onuFound: true,
      onuStatus: result.onu.status,
      onuName: result.onu.name,
      pppoeUsername: result.pppoeUsername,
      connectedDevices,
      deviceCount: connectedDevices.length,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[CONNECTED-DEVICES ERROR]', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to load connected devices.' });
  }
});

function parseConnectedDevicesFromFullStatus(parsed) {
  const macSection = parsed?.['Online MACs on this ONU'];
  if (!macSection) return [];
  const list = Array.isArray(macSection) ? macSection : Object.values(macSection);
  return list.map(dev => ({
    mac: dev['MAC address'] || dev.mac_address || dev.mac || '—',
    port: dev['Port'] || dev.port || '—',
    vlan: dev['VLAN'] || dev.vlan || '—',
  }));
}

// Helper: format onu_devices DB row for API response
function formatOnuFromDb(onu) {
  return {
    externalId: onu.onu_external_id,
    name: onu.name,
    serialNumber: onu.serial_number,
    status: onu.status,
    adminStatus: onu.admin_status,
    onuType: onu.onu_type,
    oltName: onu.olt_name,
    zone: onu.zone,
    odb: onu.odb,
    speedProfile: onu.speed_profile,
    ipAddress: onu.ip_address,
    macAddress: onu.mac_address,
    wifiSsid: onu.wifi_ssid,
    wifiPassword: onu.wifi_password,
    pppoeUsername: onu.pppoe_username,
    lastSynced: onu.last_synced,
    wifiPorts: [],
  };
}

module.exports = router;
