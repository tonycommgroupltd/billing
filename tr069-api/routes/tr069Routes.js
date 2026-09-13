const express = require('express');
const router = express.Router();
const genieacs = require('../services/genieacsService');
const billing = require('../services/billingService');
const connectivity = require('../services/connectivityService');

function filterItems(items, { search, online, productClass }) {
  let filtered = items;

  if (search) {
    const q = String(search).toLowerCase();
    filtered = filtered.filter((d) =>
      [
        d.serial_number,
        d.genieacs_id,
        d.pppoe_username,
        d.wan_mac,
        d.wifi_ssid,
        d.product_class,
        d.customer_name,
        d.customer_phone,
      ].some((v) => {
        if (!v) return false;
        const s = String(v).toLowerCase();
        if (s.includes(q)) return true;
        // Allow MAC search without separators (aa:bb:cc ↔ aabbcc)
        const compact = s.replace(/[^a-f0-9]/g, '');
        const qCompact = q.replace(/[^a-f0-9]/g, '');
        return qCompact.length >= 4 && compact.includes(qCompact);
      })
    );
  }

  if (online === '1' || online === 'true') {
    filtered = filtered.filter((d) => d.online);
  } else if (online === '0' || online === 'false') {
    filtered = filtered.filter((d) => !d.online);
  }

  if (productClass) {
    filtered = filtered.filter((d) => d.product_class === productClass);
  }

  return filtered;
}

router.get('/health', (req, res) => {
  res.json({ ok: true, nbiUrl: genieacs.NBI_BASE });
});

router.get('/stats', async (req, res) => {
  try {
    let items = await genieacs.listDeviceRows();
    try {
      items = await billing.enrichDevicesWithCustomers(items);
    } catch (err) {
      console.warn('[stats] billing enrichment skipped:', err.message);
    }

    const total = items.length;
    const online = items.filter((d) => d.online).length;
    const byModel = {};
    for (const d of items) {
      const k = d.product_class || 'unknown';
      byModel[k] = (byModel[k] || 0) + 1;
    }

    res.json({
      nbiUrl: genieacs.NBI_BASE,
      total,
      online,
      offline: total - online,
      linked_pppoe: items.filter((d) => d.pppoe_username).length,
      linked_customer: items.filter((d) => d.customer_id).length,
      productClasses: Object.entries(byModel).map(([product_class, count]) => ({
        product_class,
        count,
      })),
    });
  } catch (err) {
    console.error('[stats]', err);
    res.status(502).json({
      error: 'Failed to load TR-069 stats',
      hint: 'Check GENIEACS_NBI_URL — SSH tunnel: ssh -L 7557:127.0.0.1:7557 joram@102.0.15.254',
    });
  }
});

router.get('/devices', async (req, res) => {
  try {
    const limit = Number(req.query.limit || 100);
    const offset = Number(req.query.offset || 0);

    let items = await genieacs.listDeviceRows();
    try {
      items = await billing.enrichDevicesWithCustomers(items);
    } catch (err) {
      console.warn('[devices] billing enrichment skipped:', err.message);
    }

    items = filterItems(items, {
      search: req.query.search,
      online: req.query.online,
      productClass: req.query.productClass,
    });

    items.sort((a, b) => {
      const ta = a.last_inform ? new Date(a.last_inform).getTime() : 0;
      const tb = b.last_inform ? new Date(b.last_inform).getTime() : 0;
      return tb - ta;
    });

    const total = items.length;
    const page = items.slice(offset, offset + limit);

    res.json({ items: page, total, limit, offset, source: 'genieacs' });
  } catch (err) {
    console.error('[devices]', err);
    res.status(502).json({ error: err.message || 'Failed to list devices' });
  }
});

router.get('/devices/:id', async (req, res) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const device = await genieacs.getDevice(id);
    const summary = genieacs.extractDeviceSummary(device);
    let row = genieacs.mapSummaryToRow(summary);
    try {
      [row] = await billing.enrichDevicesWithCustomers([row]);
    } catch (_) { /* billing optional */ }
    res.json({ device: row, source: 'genieacs' });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Device not found' });
  }
});

router.get('/devices/:id/live', async (req, res) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const device = await genieacs.getDevice(id);
    const details = genieacs.extractDeviceDetails(device);
    const faults = await genieacs.listFaults(id, 10);

    let billingCreds = null;
    let pppoeComparison = null;
    try {
      const customerId = req.query.customerId || null;
      const serviceId = req.query.serviceId || null;
      const phone = req.query.phone || null;

      billingCreds = await billing.resolveBillingCredentials({
        customerId,
        serviceId,
        phone,
      });

      if (!billingCreds) {
        const summaryRow = genieacs.mapSummaryToRow(genieacs.extractDeviceSummary(device));
        const [enriched] = await billing.enrichDevicesWithCustomers([summaryRow]);
        if (enriched?.service_id || enriched?.customer_id) {
          billingCreds = await billing.resolveBillingCredentials({
            customerId: enriched.customer_id,
            serviceId: enriched.service_id,
          });
        }
      }

      pppoeComparison = billing.buildPppoeComparison(details.pppoe, billingCreds);
    } catch (err) {
      console.warn('[live] billing comparison skipped:', err.message);
    }

    res.json({
      summary: details,
      pppoe: details.pppoe,
      wan: details.wan,
      wlan: details.wlan,
      lanPorts: details.lanPorts,
      connectedDevices: details.connectedDevices,
      activeDevices: details.activeDevices,
      offlineDevices: details.offlineDevices,
      optical: details.optical,
      hostCount: details.hostCount,
      activeHostCount: details.activeHostCount,
      offlineHostCount: details.offlineHostCount,
      lanPortCount: details.lanPortCount,
      lanPortsUp: details.lanPortsUp,
      pppoeComparison,
      faults,
    });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Failed to fetch live device' });
  }
});

router.get('/service-connectivity/:serviceId', async (req, res) => {
  try {
    const serviceId = Number(req.params.serviceId);
    if (!serviceId) return res.status(400).json({ error: 'Invalid service ID' });
    const result = await connectivity.getServiceConnectivity(serviceId);
    if (result.error && result.status === 404) {
      return res.status(404).json({ error: result.error });
    }
    res.json(result);
  } catch (err) {
    console.error('[service-connectivity]', err);
    res.status(502).json({ error: err.message || 'Connectivity lookup failed' });
  }
});

router.get('/customer-connectivity/:customerId', async (req, res) => {
  try {
    const customerId = Number(req.params.customerId);
    if (!customerId) return res.status(400).json({ error: 'Invalid customer ID' });
    const serviceId = req.query.serviceId ? Number(req.query.serviceId) : undefined;
    const result = await connectivity.getCustomerConnectivity(customerId, { serviceId });
    res.json(result);
  } catch (err) {
    console.error('[customer-connectivity]', err);
    res.status(502).json({ error: err.message || 'Connectivity lookup failed' });
  }
});

router.get('/customer-search', async (req, res) => {
  try {
    const { phone, pppoe } = req.query;
    if (!phone && !pppoe) {
      return res.status(400).json({ error: 'phone or pppoe query required' });
    }
    const customers = phone
      ? await billing.searchCustomersByPhone(phone)
      : await billing.searchCustomersByPppoe(pppoe);
    res.json({ customers });
  } catch (err) {
    const mapped = billing.billingError(err);
    res.status(mapped.status).json({ error: mapped.message });
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

router.post('/devices/:id/reboot', async (req, res) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const task = await genieacs.reboot(id);
    res.json({ success: true, message: 'Reboot queued — ONU will restart on next Inform', task });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to queue reboot' });
  }
});

router.post('/devices/:id/refresh', async (req, res) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const objectName = req.body.objectName || 'InternetGatewayDevice.';
    const task = await genieacs.refreshObject(id, objectName);
    res.json({ success: true, message: 'Refresh queued — wait ~1 min for Inform', task });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to queue refresh' });
  }
});

router.post('/devices/:id/wifi', async (req, res) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const { ssid, password, wlanIndex, productClass } = req.body;
    if (!ssid?.trim()) return res.status(400).json({ error: 'SSID is required' });
    const result = await genieacs.setWifi({
      deviceId: id,
      productClass: productClass || 'HG8546M',
      ssid: ssid.trim(),
      password,
      wlanIndex: wlanIndex || 1,
    });
    res.json({
      success: true,
      message: 'WiFi change queued — applies on next Inform (up to ~2 min)',
      ...result,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to queue WiFi change' });
  }
});

router.post('/devices/:id/pppoe', async (req, res) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const { username, password, productClass } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'PPPoE password must be at least 6 characters' });
    }
    if (!username) return res.status(400).json({ error: 'PPPoE username is required' });
    const result = await genieacs.setPppoe({
      deviceId: id,
      productClass: productClass || 'HG8546M',
      username,
      password,
    });
    res.json({
      success: true,
      message: result.message || 'PPPoE change queued — applies on next Inform (~30s)',
      ...result,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to queue PPPoE change' });
  }
});

router.post('/devices/:id/sync-pppoe', async (req, res) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const { customerId, serviceId, phone } = req.body;

    const creds = await billing.resolveBillingCredentials({
      customerId,
      serviceId,
      phone,
    });

    if (!creds) {
      return res.status(404).json({ error: 'Customer or service not found in billing' });
    }
    if (!creds.pppoe_username) {
      return res.status(400).json({ error: 'Service has no PPPoE username (mikrotik_name) in billing' });
    }
    if (!creds.pppoe_password || String(creds.pppoe_password).length < 6) {
      return res.status(400).json({ error: 'Service has no valid PPPoE password in billing' });
    }

    const device = await genieacs.getDevice(id);
    const productClass = device._deviceId?._ProductClass || 'HG8546M';

    const result = await genieacs.setPppoe({
      deviceId: id,
      productClass,
      username: creds.pppoe_username,
      password: creds.pppoe_password,
    });

    res.json({
      success: true,
      message:
        `PPPoE updated to billing credentials (${creds.pppoe_username}) — applies on next Inform (~30s).`,
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
    const mapped = billing.billingError(err);
    console.error('[sync-pppoe]', err);
    res.status(mapped.status).json({ error: mapped.message });
  }
});

module.exports = router;
