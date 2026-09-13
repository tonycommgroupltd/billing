/**
 * Resolve a customer's connection device across both Wi-Fi channels.
 *
 * SmartOLT (OMCI) holds the provisioned SSIDs and their cleartext passwords;
 * GenieACS holds live state and connected clients. They are joined by
 * SmartOLT's `tr069_device_id`, which is already a GenieACS device id
 * (OUI-ProductClass-Serial). A customer may resolve to one or both.
 */
const { localPool, remotePool } = require('../db');
const acsDeviceService = require('./acsDeviceService');

function normKey(v) {
  return String(v || '')
    .trim()
    .toLowerCase();
}

/**
 * SmartOLT external ids encode the vendor as ASCII (HWTC…) while GenieACS
 * uses the hex serial (48575443…). Converting lets us find the ACS device
 * by serial when SmartOLT has no tr069_device_id recorded.
 */
function deriveAcsSerial(externalId) {
  const id = String(externalId || '').trim().toUpperCase();
  const m = /^([A-Z]{4})([0-9A-F]{8,16})$/.exec(id);
  if (!m) return null;
  const vendorHex = Buffer.from(m[1], 'ascii').toString('hex').toUpperCase();
  return vendorHex + m[2];
}

function parseWifiPorts(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function extractPppoeFromDevice(device, genieacs) {
  try {
    const summary = genieacs.extractDeviceSummary(device);
    if (summary?.pppoeUsername) return String(summary.pppoeUsername).trim();
  } catch (_) {
    /* fall through */
  }
  const paths = [
    'VirtualParameters.pppUsername',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.Username',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.Username',
  ];
  for (const p of paths) {
    const v = genieacs.paramValue?.(device, p);
    if (v) return String(v).trim();
  }
  return null;
}

function summaryToAcs(summary, fallbackPppoe) {
  return {
    genieacs_id: summary.deviceId,
    serial_number: summary.serial,
    product_class: summary.productClass,
    manufacturer: summary.manufacturer,
    pppoe_username: summary.pppoeUsername || fallbackPppoe || null,
    wifi_ssid: summary.wifiSsid,
    software_version: summary.software,
    connection_request_url: summary.connectionRequestUrl,
    last_inform: summary.lastInform,
    online: summary.online ? 1 : 0,
  };
}

async function cacheAcs(acs) {
  if (!acs?.genieacs_id) return;
  try {
    await acsDeviceService.upsertFromGenieacs(acs);
  } catch (_) {
    /* cache is best-effort */
  }
}

async function findOnuInCache(pppoeUsername) {
  const key = normKey(pppoeUsername);
  if (!key) return null;

  const [rows] = await localPool.query(
    `SELECT * FROM onu_devices
     WHERE LOWER(TRIM(pppoe_username)) = ?
        OR LOWER(TRIM(name)) = ?
     LIMIT 1`,
    [key, key]
  );
  return rows[0] || null;
}

/**
 * Most SmartOLT ONUs carry a tr069_device_id that belongs to SmartOLT's own
 * ACS, so a miss in our GenieACS is the normal case rather than an error.
 * Remembering misses keeps the customer view off a doomed round trip.
 */
const MISS_TTL_MS = 10 * 60 * 1000;
const acsMisses = new Map();

function recentMiss(key) {
  const at = acsMisses.get(key);
  if (!at) return false;
  if (Date.now() - at > MISS_TTL_MS) {
    acsMisses.delete(key);
    return false;
  }
  return true;
}

function isNotFound(err) {
  return /not found|404/i.test(err?.message || '');
}

/** Resolve the GenieACS side of an ONU using SmartOLT's TR-069 identity. */
async function findAcsForOnu(onu, pppoeUsername) {
  if (!onu) return null;
  const genieacs = require('./genieacsService');

  const deviceId = onu.tr069_device_id ? String(onu.tr069_device_id).trim() : '';
  if (deviceId) {
    const cached = await acsDeviceService.getByGenieacsId(deviceId).catch(() => null);
    if (cached) return cached;
    if (!recentMiss(deviceId)) {
      try {
        const live = await genieacs.getDevice(deviceId);
        if (live) {
          const acs = summaryToAcs(genieacs.extractDeviceSummary(live), pppoeUsername);
          await cacheAcs(acs);
          return acs;
        }
        acsMisses.set(deviceId, Date.now());
      } catch (err) {
        acsMisses.set(deviceId, Date.now());
        if (!isNotFound(err)) {
          console.warn(`[connection] ACS lookup by tr069_device_id ${deviceId} failed:`, err.message);
        }
      }
    }
  }

  const acsSerial = deriveAcsSerial(onu.onu_external_id);
  if (acsSerial && !recentMiss(acsSerial)) {
    try {
      const live = await genieacs.findDeviceBySerial(acsSerial);
      if (live) {
        const acs = summaryToAcs(genieacs.extractDeviceSummary(live), pppoeUsername);
        await cacheAcs(acs);
        return acs;
      }
      acsMisses.set(acsSerial, Date.now());
    } catch (err) {
      acsMisses.set(acsSerial, Date.now());
      if (!isNotFound(err)) {
        console.warn(`[connection] ACS lookup by serial ${acsSerial} failed:`, err.message);
      }
    }
  }

  return null;
}

async function findAcsLiveByPppoe(pppoeUsername) {
  const target = normKey(pppoeUsername);
  if (!target) return null;

  const genieacs = require('./genieacsService');

  try {
    const direct = await genieacs.findDeviceByPppoe(pppoeUsername);
    if (direct) return summaryToAcs(genieacs.extractDeviceSummary(direct), pppoeUsername);
  } catch (err) {
    console.warn('[connection] GenieACS findDeviceByPppoe failed:', err.message);
  }

  try {
    const all = await genieacs.listAllDevices();
    const match = all.find((d) => normKey(extractPppoeFromDevice(d, genieacs)) === target);
    if (!match) return null;
    return summaryToAcs(genieacs.extractDeviceSummary(match), pppoeUsername);
  } catch (err) {
    console.warn('[connection] live ACS lookup failed:', err.message);
    return null;
  }
}

/** Look up the SmartOLT ONU that owns a given GenieACS device. */
async function findOnuForAcs(acs) {
  if (!acs?.genieacs_id) return null;
  try {
    const [rows] = await localPool.query(
      `SELECT * FROM onu_devices
       WHERE tr069_device_id = ? OR UPPER(serial_number) = ?
       LIMIT 1`,
      [acs.genieacs_id, String(acs.serial_number || '').toUpperCase()]
    );
    return rows[0] || null;
  } catch (_) {
    return null;
  }
}

/**
 * Resolve both channels for a customer.
 *
 * @param {number} customerId
 * @param {string|number|null} serviceId
 * @param {{ onuExternalId?: string, genieacsId?: string, serialNumber?: string }} [hints]
 *        Device ids already resolved by the connectivity badge.
 */
async function findCustomerDevices(customerId, serviceId = null, hints = {}) {
  let svcQuery = `SELECT s.id, s.mikrotik_name, s.mikrotik_password, s.onu_sn
     FROM services s
     WHERE s.customer_id = ? AND s.mikrotik_name IS NOT NULL AND s.deleted_at IS NULL`;
  const svcParams = [customerId];
  if (serviceId) {
    svcQuery += ' AND s.id = ?';
    svcParams.push(serviceId);
  }
  svcQuery += ' LIMIT 1';
  const [services] = await remotePool.query(svcQuery, svcParams);

  if (services.length === 0) {
    return { error: 'No service found for your account', pppoeUsername: null };
  }

  const svc = services[0];
  const pppoeUsername = svc.mikrotik_name;
  const onuSn = svc.onu_sn ? String(svc.onu_sn).trim() : '';
  const hintOnuId = hints.onuExternalId ? String(hints.onuExternalId).trim() : '';
  const hintGenieId = hints.genieacsId ? String(hints.genieacsId).trim() : '';
  const hintSerial = hints.serialNumber ? String(hints.serialNumber).trim() : '';

  const base = {
    pppoeUsername,
    pppoePassword: svc.mikrotik_password,
    serviceId: svc.id,
    syncHasRun: true,
  };

  await acsDeviceService.ensureTable();

  let onu = null;
  let acs = null;

  // SmartOLT side — cache by PPPoE/name, then any external id we already know
  onu = await findOnuInCache(pppoeUsername);
  if (!onu) {
    const externalId = hintOnuId || onuSn;
    if (externalId) {
      const [rows] = await localPool.query(
        'SELECT * FROM onu_devices WHERE onu_external_id = ? LIMIT 1',
        [externalId]
      );
      onu = rows[0] || {
        onu_external_id: externalId,
        serial_number: hintSerial || externalId,
        pppoe_username: pppoeUsername,
        wifi_ssid: null,
        wifi_password: null,
        wifi_ports: null,
        status: null,
      };
    }
  }

  // GenieACS side — the badge's device id wins, then SmartOLT's TR-069 identity
  if (hintGenieId) {
    acs =
      (await acsDeviceService.getByGenieacsId(hintGenieId).catch(() => null)) || {
        genieacs_id: hintGenieId,
        serial_number: hintSerial || null,
        product_class: 'HG8546M',
        pppoe_username: pppoeUsername,
        wifi_ssid: null,
        online: 1,
      };
  }
  if (!acs && onu) acs = await findAcsForOnu(onu, pppoeUsername);
  if (!acs) acs = await acsDeviceService.getByPppoeUsername(pppoeUsername).catch(() => null);

  // Scanning the whole GenieACS fleet is slow, so only do it when SmartOLT
  // gave us nothing and the customer would otherwise show as unlinked.
  if (!acs && !onu) {
    acs = await findAcsLiveByPppoe(pppoeUsername);
    if (acs) await cacheAcs(acs);
  }

  // ACS found first? Pull its SmartOLT twin so we still get the stored credentials.
  if (acs && !onu) onu = await findOnuForAcs(acs);

  if (onu || acs) {
    return {
      ...base,
      source: onu && acs ? 'both' : onu ? 'smartolt' : 'acs',
      onu,
      acs,
      wifiPorts: parseWifiPorts(onu?.wifi_ports),
    };
  }

  const [countRes] = await localPool.query('SELECT COUNT(*) AS cnt FROM onu_devices');
  const [acsCount] = await localPool.query('SELECT COUNT(*) AS cnt FROM acs_devices');
  const syncHasRun = countRes[0].cnt > 0 || acsCount[0].cnt > 0;

  return {
    ...base,
    source: null,
    onu: null,
    acs: null,
    wifiPorts: [],
    syncHasRun,
    message: syncHasRun
      ? 'Your device is not linked yet. Contact support to register your router.'
      : 'Device data is still syncing. Please try again in a few minutes.',
  };
}

/**
 * Single-channel view kept for the customer portal, which branches on
 * `result.acs` else `result.onu` and expects exactly one to be set.
 * SmartOLT keeps priority there so existing behaviour is unchanged.
 */
async function findUserConnection(customerId, serviceId = null, hints = {}) {
  const result = await findCustomerDevices(customerId, serviceId, hints);
  if (result.error || (!result.onu && !result.acs)) return result;

  if (result.onu) {
    return { ...result, source: 'smartolt', acs: null };
  }
  return { ...result, source: 'acs' };
}

module.exports = {
  findUserConnection,
  findCustomerDevices,
  deriveAcsSerial,
  parseWifiPorts,
};
