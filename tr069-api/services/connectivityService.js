/**
 * Per-service connectivity: SmartOLT first, TR-069 fallback, router from billing.
 */
const billing = require('./billingService');
const genieacs = require('./genieacsService');
const smartolt = require('./smartoltService');

const DEVICE_CACHE_TTL_MS = 5 * 60 * 1000;
let deviceRowsCache = { fetchedAt: 0, rows: [] };

function parseStatusValue(status) {
  if (status == null) return null;
  if (typeof status === 'object') return status.value ?? null;
  try {
    const parsed = JSON.parse(status);
    return parsed?.value ?? parsed;
  } catch {
    const n = Number(status);
    return Number.isNaN(n) ? null : n;
  }
}

async function getCachedDeviceRows() {
  if (deviceRowsCache.fetchedAt && Date.now() - deviceRowsCache.fetchedAt < DEVICE_CACHE_TTL_MS) {
    return deviceRowsCache.rows;
  }
  const rows = await genieacs.listDeviceRows();
  deviceRowsCache = { fetchedAt: Date.now(), rows };
  return rows;
}

async function findTr069ByPppoe(pppoeUsername) {
  const target = String(pppoeUsername || '').trim().toLowerCase();
  if (!target) return null;

  const rows = await getCachedDeviceRows();
  const match = rows.find(
    (r) => r.pppoe_username && String(r.pppoe_username).trim().toLowerCase() === target
  );
  if (!match) return null;

  let optical = null;
  try {
    const device = await genieacs.getDevice(match.genieacs_id);
    const details = genieacs.extractDeviceDetails(device);
    optical = details.optical;
  } catch (err) {
    console.warn('[connectivity] TR-069 optical skipped:', err.message);
  }

  const ago = smartolt.formatTimeAgo(match.last_inform);
  const online = !!match.online;
  const label = smartolt.buildStatusLabel('TR069', online, ago);

  return {
    source: 'tr069',
    label,
    online,
    lastSeen: match.last_inform || null,
    lastSeenAgo: online ? 'now' : ago,
    statusSince: ago,
    signal: optical?.rxPowerDbm || null,
    signalLevel: optical?.label || null,
    genieacsId: match.genieacs_id,
    serialNumber: match.serial_number,
    productClass: match.product_class,
  };
}

async function getServiceConnectivity(serviceId) {
  const service = await billing.getServiceWithRouter(Number(serviceId));
  if (!service) {
    return { error: 'Service not found', status: 404 };
  }

  const routerLabel = service.router_title
    ? `${service.router_title} — IP: ${service.router_host || service.router_nas_ip || '—'}`
    : null;

  const base = {
    serviceId: service.service_id,
    customerId: service.customer_id,
    pppoeUsername: service.pppoe_username,
    serviceStatus: service.service_status,
    router: {
      title: service.router_title,
      host: service.router_host,
      nasIp: service.router_nas_ip,
      label: routerLabel,
    },
    source: 'none',
    label: 'TR069 REQUIRED',
    online: null,
    lastSeen: null,
    lastSeenAgo: null,
    signal: null,
    signalLevel: null,
    smartolt: null,
    tr069: null,
    message: null,
  };

  if (!service.pppoe_username) {
    base.message = 'No PPPoE username on this service';
    return base;
  }

  if (smartolt.configured()) {
    try {
      const onu = await smartolt.findOnuByPppoe(service.pppoe_username);
      if (onu) {
        const extId = onu.unique_external_id;
        const signalData = extId ? await smartolt.fetchOnuSignal(extId) : null;
        const smart = smartolt.buildSmartOltStatus(onu, signalData);
        return {
          ...base,
          ...smart,
          smartolt: smart,
          message: null,
        };
      }
    } catch (err) {
      console.warn('[connectivity] SmartOLT lookup failed:', err.message);
      base.message = `SmartOLT lookup failed: ${err.message}`;
    }
  }

  try {
    const tr = await findTr069ByPppoe(service.pppoe_username);
    if (tr) {
      return {
        ...base,
        ...tr,
        tr069: tr,
        message: null,
      };
    }
  } catch (err) {
    console.warn('[connectivity] TR-069 lookup failed:', err.message);
  }

  base.message = 'Not found on SmartOLT or TR-069 — TR069 REQUIRED';
  return base;
}

async function getCustomerConnectivity(customerId, { serviceId } = {}) {
  const services = await billing.listCustomerServicesWithRouter(Number(customerId));
  if (!services.length) {
    return { customerId: Number(customerId), services: [], primary: null };
  }

  let target = services[0];
  if (serviceId) {
    target = services.find((s) => s.service_id === Number(serviceId)) || target;
  } else {
    const active = services.find((s) => parseStatusValue(s.service_status) === 2);
    if (active) target = active;
  }

  const primary = await getServiceConnectivity(target.service_id);
  return {
    customerId: Number(customerId),
    services: services.map((s) => ({
      serviceId: s.service_id,
      pppoeUsername: s.pppoe_username,
      planTitle: s.plan_title,
      serviceStatus: s.service_status,
      router: {
        title: s.router_title,
        host: s.router_host,
        nasIp: s.router_nas_ip,
      },
    })),
    primary,
  };
}

module.exports = {
  getServiceConnectivity,
  getCustomerConnectivity,
};
