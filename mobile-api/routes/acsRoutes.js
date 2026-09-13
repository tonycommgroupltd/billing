// ============================================
// TCOM ACS API — GenieACS staff / NOC routes
// ============================================
// GET  /stats
// GET  /devices
// GET  /devices/:id
// GET  /devices/:id/live
// POST /devices/:id/wifi
// POST /devices/:id/pppoe
// POST /devices/:id/reboot
// POST /devices/:id/refresh
// POST /devices/:id/link
// POST /devices/:id/bootstrap-pppoe
// POST /sync
// GET  /models
// GET  /faults
// GET  /customer-search
// ============================================

const express = require('express');
const router = express.Router();
const acsDeviceService = require('../services/acsDeviceService');
const acsBillingService = require('../services/acsBillingService');
const genieacs = require('../services/genieacsService');
const { syncAcsDevices } = require('../jobs/acsSync');

function adminKeyMiddleware(req, res, next) {
  if (req.method === 'OPTIONS') {
    return next();
  }
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  const validKey =
    process.env.ACS_ADMIN_API_KEY ||
    process.env.OTP_ADMIN_API_KEY ||
    process.env.API_KEY ||
    process.env.VPS_SSH_PASSWORD ||
    'tcom-api-key-2024';
  if (!apiKey || apiKey !== validKey) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  next();
}

router.use(adminKeyMiddleware);

async function listFromGenieacsFallback({ search, online, limit = 100, offset = 0 } = {}) {
  const all = await genieacs.listAllDevices();
  let items = all.map((d) => {
    const s = genieacs.extractDeviceSummary(d);
    return {
      genieacs_id: s.deviceId,
      serial_number: s.serial,
      product_class: s.productClass,
      manufacturer: s.manufacturer,
      pppoe_username: s.pppoeUsername,
      wifi_ssid: s.wifiSsid,
      software_version: s.software,
      connection_request_url: s.connectionRequestUrl,
      last_inform: s.lastInform,
      online: s.online ? 1 : 0,
    };
  });

  if (search) {
    const q = String(search).toLowerCase();
    items = items.filter((d) =>
      [d.serial_number, d.genieacs_id, d.pppoe_username, d.wifi_ssid, d.product_class]
        .some((v) => v && String(v).toLowerCase().includes(q))
    );
  }
  if (online === '1' || online === 'true') items = items.filter((d) => d.online);
  if (online === '0' || online === 'false') items = items.filter((d) => !d.online);

  const total = items.length;
  items = items.slice(Number(offset), Number(offset) + Number(limit));
  return { items, total, source: 'genieacs-live' };
}

async function getDeviceFromGenieacs(id) {
  const device = await genieacs.getDevice(id);
  const live = genieacs.extractDeviceSummary(device);
  return {
    genieacs_id: live.deviceId,
    serial_number: live.serial,
    product_class: live.productClass,
    manufacturer: live.manufacturer,
    pppoe_username: live.pppoeUsername,
    wifi_ssid: live.wifiSsid,
    software_version: live.software,
    connection_request_url: live.connectionRequestUrl,
    last_inform: live.lastInform,
    online: live.online ? 1 : 0,
  };
}

function liveStatsFromItems(items) {
  const total = items.length;
  const online = items.filter((d) => d.online).length;
  const byModel = {};
  for (const d of items) {
    const k = d.product_class || 'unknown';
    byModel[k] = (byModel[k] || 0) + 1;
  }
  return {
    total,
    online,
    offline: total - online,
    linked_pppoe: items.filter((d) => d.pppoe_username).length,
    linked_customer: 0,
    productClasses: Object.entries(byModel).map(([product_class, count]) => ({
      product_class,
      count,
    })),
  };
}

router.get('/stats', async (req, res) => {
  try {
    const dbStats = await acsDeviceService.getStats();
    const productClasses = await acsDeviceService.listProductClasses();
    res.json({
      nbiUrl: genieacs.NBI_BASE,
      db: dbStats,
      productClasses,
      source: 'db',
    });
  } catch (err) {
    console.warn('[ACS stats] DB unavailable, using GenieACS:', err.message);
    try {
      const { items, total } = await listFromGenieacsFallback({ limit: 10000 });
      const online = items.filter((d) => d.online).length;
      const byModel = {};
      for (const d of items) {
        const k = d.product_class || 'unknown';
        byModel[k] = (byModel[k] || 0) + 1;
      }
      res.json({
        nbiUrl: genieacs.NBI_BASE,
        db: {
          total,
          online,
          offline: total - online,
          linked_pppoe: items.filter((d) => d.pppoe_username).length,
          linked_customer: 0,
        },
        productClasses: Object.entries(byModel).map(([product_class, count]) => ({
          product_class,
          count,
        })),
        source: 'genieacs-live',
      });
    } catch (e) {
      console.error('[ACS stats]', e);
      res.status(500).json({ error: 'Failed to load ACS stats' });
    }
  }
});

router.get('/devices', async (req, res) => {
  try {
    const result = await acsDeviceService.listDevices({
      search: req.query.search,
      online: req.query.online,
      productClass: req.query.productClass,
      limit: req.query.limit || 100,
      offset: req.query.offset || 0,
    });
    res.json({ ...result, source: 'db' });
  } catch (err) {
    console.warn('[ACS devices] DB unavailable, using GenieACS:', err.message);
    try {
      const result = await listFromGenieacsFallback({
        search: req.query.search,
        online: req.query.online,
        limit: req.query.limit || 100,
        offset: req.query.offset || 0,
      });
      res.json(result);
    } catch (e) {
      console.error('[ACS devices]', e);
      res.status(500).json({ error: 'Failed to list devices' });
    }
  }
});

router.get('/devices/:id', async (req, res) => {
  const id = decodeURIComponent(req.params.id);
  try {
    const cached = await acsDeviceService.getByGenieacsId(id);
    if (cached) {
      return res.json({ cached, source: 'db' });
    }
    const live = await getDeviceFromGenieacs(id);
    return res.json({ cached: live, source: 'genieacs-live' });
  } catch (err) {
    console.error('[ACS device]', err.message);
    res.status(502).json({
      error: err.message || 'Device not found',
      hint: 'Ensure GENIEACS_NBI_URL is reachable (SSH tunnel if working remotely)',
    });
  }
});

router.get('/devices/:id/live', async (req, res) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const device = await genieacs.getDevice(id);
    const details = genieacs.extractDeviceDetails(device);
    const faults = await genieacs.listFaults(id, 10);
    res.json({
      summary: details,
      pppoe: details.pppoe,
      wan: details.wan,
      wlan: details.wlan,
      lanPorts: details.lanPorts,
      connectedDevices: details.connectedDevices,
      activeDevices: details.activeDevices,
      offlineDevices: details.offlineDevices,
      hostCount: details.hostCount,
      activeHostCount: details.activeHostCount,
      offlineHostCount: details.offlineHostCount,
      lanPortCount: details.lanPortCount,
      lanPortsUp: details.lanPortsUp,
      wlanConnectedDevices: details.wlanConnectedDevices,
      optical: details.optical,
      faults,
    });
  } catch (err) {
    console.error('[ACS live]', err);
    res.status(502).json({ error: err.message || 'Failed to fetch live device from GenieACS' });
  }
});

router.post('/devices/:id/wifi', async (req, res) => {
  try {
    const { ssid, password, wlanIndex } = req.body;
    if (!ssid?.trim()) {
      return res.status(400).json({ error: 'SSID is required' });
    }
    const cached = await acsDeviceService.getByGenieacsId(req.params.id);
    const productClass = cached?.product_class || 'HG8546M';

    const result = await genieacs.setWifi({
      deviceId: req.params.id,
      productClass,
      ssid: ssid.trim(),
      password,
      wlanIndex: wlanIndex || 1,
    });

    if (password) {
      try { await acsDeviceService.updateWifiCache(req.params.id, ssid.trim(), password); } catch (_) { /* no local DB */ }
    } else {
      try { await acsDeviceService.updateWifiCache(req.params.id, ssid.trim(), cached?.wifi_password); } catch (_) { /* no local DB */ }
    }

    res.json({
      success: true,
      message: result.ok
        ? 'WiFi updated on ONU'
        : 'WiFi change queued — applies on next Inform (up to ~2 min)',
      ...result,
    });
  } catch (err) {
    console.error('[ACS wifi]', err);
    res.status(500).json({ error: err.message || 'Failed to queue WiFi change' });
  }
});

router.post('/devices/:id/pppoe', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'PPPoE password must be at least 6 characters' });
    }

    const cached = await acsDeviceService.getByGenieacsId(req.params.id);
    const productClass = cached?.product_class || 'HG8546M';

    let user = username || cached?.pppoe_username;
    if (!user) {
      const device = await genieacs.getDevice(req.params.id);
      user = genieacs.extractDeviceDetails(device).pppoe?.username;
    }
    if (!user) {
      return res.status(400).json({ error: 'PPPoE username is required (enter it or link customer first)' });
    }

    const result = await genieacs.setPppoe({
      deviceId: req.params.id,
      productClass,
      username: user,
      password,
    });

    try {
      await acsDeviceService.linkDevice(req.params.id, { pppoeUsername: user });
    } catch (_) { /* no local DB */ }

    res.json({
      success: true,
      message: result.message || 'PPPoE change queued — applies on next Inform',
      ...result,
    });
  } catch (err) {
    console.error('[ACS pppoe]', err);
    res.status(500).json({ error: err.message || 'Failed to queue PPPoE change' });
  }
});

router.post('/devices/:id/reboot', async (req, res) => {
  try {
    const task = await genieacs.reboot(req.params.id);
    res.json({
      success: true,
      message: 'Reboot queued — ONU will restart on next Inform',
      task,
    });
  } catch (err) {
    console.error('[ACS reboot]', err);
    res.status(500).json({ error: err.message || 'Failed to queue reboot' });
  }
});

router.post('/devices/:id/refresh', async (req, res) => {
  try {
    const objectName = req.body.objectName
      || 'InternetGatewayDevice.';
    const task = await genieacs.refreshObject(req.params.id, objectName);
    res.json({ success: true, task });
  } catch (err) {
    console.error('[ACS refresh]', err);
    res.status(500).json({ error: err.message || 'Failed to queue refresh' });
  }
});

router.post('/devices/:id/link', async (req, res) => {
  try {
    const { pppoeUsername, customerId } = req.body;
    if (!pppoeUsername && !customerId) {
      return res.status(400).json({ error: 'pppoeUsername or customerId required' });
    }
    const updated = await acsDeviceService.linkDevice(req.params.id, {
      pppoeUsername,
      customerId: customerId ? Number(customerId) : null,
    });
    if (!updated) {
      return res.status(503).json({
        error: 'Customer linking requires local database (not available in dev mode)',
      });
    }
    res.json({ success: true, device: updated });
  } catch (err) {
    console.error('[ACS link]', err);
    res.status(500).json({ error: 'Failed to link device' });
  }
});

router.post('/devices/:id/bootstrap-pppoe', async (req, res) => {
  try {
    const { serviceId, customerId, phone } = req.body;
    if (!serviceId && !customerId && !phone) {
      return res.status(400).json({
        error: 'serviceId, customerId, or phone required',
        hint: 'Use customer search by phone, then bootstrap with the serviceId',
      });
    }

    let creds = null;
    if (serviceId) {
      creds = await acsBillingService.getServicePppoeCredentials(Number(serviceId));
    } else if (customerId) {
      creds = await acsBillingService.getCustomerPppoeCredentials(Number(customerId));
    } else {
      const matches = await acsBillingService.searchCustomersByPhone(phone);
      const withService = matches.find((m) => m.service_id && m.pppoe_username);
      if (!withService) {
        return res.status(404).json({ error: 'No active service with PPPoE username for that phone' });
      }
      creds = await acsBillingService.getServicePppoeCredentials(withService.service_id);
    }

    if (!creds) {
      return res.status(404).json({ error: 'Customer or service not found in billing' });
    }
    if (!creds.pppoe_username) {
      return res.status(400).json({ error: 'Service has no PPPoE username (mikrotik_name) in billing' });
    }
    if (!creds.pppoe_password || String(creds.pppoe_password).length < 6) {
      return res.status(400).json({ error: 'Service has no valid PPPoE password in billing' });
    }

    const cached = await acsDeviceService.getByGenieacsId(req.params.id);
    const productClass = cached?.product_class || 'HG8546M';

    const result = await genieacs.setPppoe({
      deviceId: req.params.id,
      productClass,
      username: creds.pppoe_username,
      password: creds.pppoe_password,
    });

    try {
      await acsDeviceService.linkDevice(req.params.id, {
        pppoeUsername: creds.pppoe_username,
        customerId: creds.customer_id,
      });
    } catch (_) { /* local DB optional */ }

    res.json({
      success: true,
      message:
        'PPPoE credentials from billing queued — ONU will dial on next Inform (~30s). '
        + 'No customer internet until then.',
      customer: {
        id: creds.customer_id,
        name: creds.customer_name,
        phone: creds.phone,
      },
      pppoeUsername: creds.pppoe_username,
      serviceId: creds.service_id,
      ...result,
    });
  } catch (err) {
    const mapped = acsBillingService.billingError(err);
    console.error('[ACS bootstrap-pppoe]', err);
    res.status(mapped.status).json({ error: mapped.message });
  }
});

router.post('/sync', async (req, res) => {
  try {
    await syncAcsDevices();
    const stats = await acsDeviceService.getStats();
    res.json({ success: true, stats, source: 'db' });
  } catch (err) {
    console.warn('[ACS sync] DB sync failed, using GenieACS live:', err.message);
    try {
      const { items, total } = await listFromGenieacsFallback({ limit: 10000 });
      const live = liveStatsFromItems(items);
      res.json({
        success: true,
        source: 'genieacs-live',
        message: 'Local DB unavailable — loaded live device list from GenieACS',
        stats: {
          total: live.total,
          online: live.online,
          offline: live.offline,
          linked_pppoe: live.linked_pppoe,
          linked_customer: 0,
        },
        deviceCount: total,
      });
    } catch (e) {
      console.error('[ACS sync]', e);
      res.status(502).json({
        error: 'Sync failed — cannot reach GenieACS NBI',
        hint: 'Set GENIEACS_NBI_URL or SSH tunnel: ssh -L 7557:127.0.0.1:7557 joram@102.0.15.254',
      });
    }
  }
});

router.get('/models', (req, res) => {
  try {
    res.json({ models: genieacs.listModelFiles() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list models' });
  }
});

router.get('/faults', async (req, res) => {
  try {
    const faults = await genieacs.listFaults(req.query.device, 50);
    res.json({ faults });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load faults' });
  }
});

router.get('/customer-search', async (req, res) => {
  try {
    const { phone, pppoe } = req.query;
    if (!phone && !pppoe) {
      return res.status(400).json({ error: 'phone or pppoe query required' });
    }

    const rows = phone
      ? await acsBillingService.searchCustomersByPhone(phone)
      : await acsBillingService.searchCustomersByPppoe(pppoe);

    res.json({ customers: rows });
  } catch (err) {
    const mapped = acsBillingService.billingError(err);
    console.error('[ACS customer-search]', err);
    res.status(mapped.status).json({ error: mapped.message });
  }
});

module.exports = router;
