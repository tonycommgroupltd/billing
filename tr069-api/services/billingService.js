/**
 * TonyComm billing lookups for TR-069 device list (read-only tonycomm DB).
 */
const { remotePool } = require('../db');

function billingError(err) {
  if (err.code === 'ECONNREFUSED' || err.code === 'PROTOCOL_CONNECTION_LOST') {
    return { status: 503, message: 'Billing database unreachable — check REMOTE_DB_* in .env' };
  }
  if (err.code === 'ER_HOST_NOT_PRIVILEGED' || err.code === 'ER_ACCESS_DENIED_ERROR') {
    return { status: 503, message: 'Billing database denied this host — whitelist VPS IP' };
  }
  return { status: 500, message: err.message || 'Billing lookup failed' };
}

/** Normalize MAC to 12 lowercase hex chars, or null if invalid. */
function normalizeMac(mac) {
  const hex = String(mac || '').toLowerCase().replace(/[^a-f0-9]/g, '');
  return hex.length === 12 ? hex : null;
}

/** Common callingstationid formats for a 12-hex MAC. */
function macVariants(hex) {
  const h = hex.toLowerCase();
  const pairs = h.match(/.{2}/g) || [];
  const colon = pairs.join(':');
  const dash = pairs.join('-');
  return [
    h,
    h.toUpperCase(),
    colon,
    colon.toUpperCase(),
    dash,
    dash.toUpperCase(),
  ];
}

async function enrichByPppoeUsername(items) {
  const usernames = [...new Set(items.map((d) => d.pppoe_username).filter(Boolean))];
  if (!usernames.length) {
    return items.map((d) => ({
      ...d,
      customer_id: d.customer_id ?? null,
      customer_name: d.customer_name ?? null,
      customer_phone: d.customer_phone ?? null,
      service_id: d.service_id ?? null,
      service_status: d.service_status ?? null,
      link_method: d.link_method ?? null,
    }));
  }

  const placeholders = usernames.map(() => '?').join(',');
  const [rows] = await remotePool.query(
    `SELECT s.mikrotik_name AS pppoe_username, s.id AS service_id,
            c.id AS customer_id, c.name AS customer_name, c.phone_number AS customer_phone,
            s.status AS service_status
     FROM services s
     JOIN customers c ON c.id = s.customer_id AND c.deleted_at IS NULL
     WHERE s.mikrotik_name IN (${placeholders}) AND s.deleted_at IS NULL
     ORDER BY s.id DESC`,
    usernames
  );

  const byPppoe = new Map();
  for (const row of rows) {
    if (!byPppoe.has(row.pppoe_username)) {
      byPppoe.set(row.pppoe_username, row);
    }
  }

  return items.map((d) => {
    const match = d.pppoe_username ? byPppoe.get(d.pppoe_username) : null;
    if (!match) {
      return {
        ...d,
        customer_id: d.customer_id ?? null,
        customer_name: d.customer_name ?? null,
        customer_phone: d.customer_phone ?? null,
        service_id: d.service_id ?? null,
        service_status: d.service_status ?? null,
        link_method: d.link_method ?? null,
      };
    }
    return {
      ...d,
      customer_id: match.customer_id,
      customer_name: match.customer_name,
      customer_phone: match.customer_phone,
      service_id: match.service_id,
      service_status: match.service_status,
      link_method: 'pppoe',
    };
  });
}

/**
 * Fallback: match ONU WAN MAC → radacct.callingstationid → username → service.
 * Only fills devices that still lack customer_id after PPPoE enrichment.
 */
async function enrichByWanMac(items) {
  const needMac = items.filter((d) => !d.customer_id && normalizeMac(d.wan_mac));
  if (!needMac.length) return items;

  const hexList = [...new Set(needMac.map((d) => normalizeMac(d.wan_mac)))];
  const variants = [];
  for (const hex of hexList) {
    for (const v of macVariants(hex)) {
      variants.push(v);
    }
  }

  const placeholders = variants.map(() => '?').join(',');
  // Recent-first; pick first username per normalized MAC in JS (avoids heavy SQL REPLACE GROUP BY).
  const [acctRows] = await remotePool.query(
    `SELECT username, callingstationid
     FROM radacct
     WHERE callingstationid IN (${placeholders})
       AND username IS NOT NULL AND username != ''
     ORDER BY radacctid DESC
     LIMIT 5000`,
    variants
  );

  const hexToUsername = new Map();
  for (const row of acctRows) {
    const compact = normalizeMac(row.callingstationid);
    if (compact && row.username && !hexToUsername.has(compact)) {
      hexToUsername.set(compact, row.username);
    }
  }

  const usernames = [...new Set(hexToUsername.values())];
  if (!usernames.length) return items;

  const userPlaceholders = usernames.map(() => '?').join(',');
  const [svcRows] = await remotePool.query(
    `SELECT s.mikrotik_name AS pppoe_username, s.id AS service_id,
            c.id AS customer_id, c.name AS customer_name, c.phone_number AS customer_phone,
            s.status AS service_status
     FROM services s
     JOIN customers c ON c.id = s.customer_id AND c.deleted_at IS NULL
     WHERE s.mikrotik_name IN (${userPlaceholders}) AND s.deleted_at IS NULL
     ORDER BY s.id DESC`,
    usernames
  );

  const byPppoe = new Map();
  for (const row of svcRows) {
    if (!byPppoe.has(row.pppoe_username)) {
      byPppoe.set(row.pppoe_username, row);
    }
  }

  return items.map((d) => {
    if (d.customer_id) return d;
    const hex = normalizeMac(d.wan_mac);
    if (!hex) return d;
    const username = hexToUsername.get(hex);
    const match = username ? byPppoe.get(username) : null;
    if (!match) return d;
    return {
      ...d,
      customer_id: match.customer_id,
      customer_name: match.customer_name,
      customer_phone: match.customer_phone,
      service_id: match.service_id,
      service_status: match.service_status,
      link_method: 'mac',
      linked_pppoe_username: match.pppoe_username,
    };
  });
}

async function enrichDevicesWithCustomers(items) {
  const withPppoe = await enrichByPppoeUsername(items);
  return enrichByWanMac(withPppoe);
}

async function searchCustomersByPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  const tail = digits.slice(-9);
  const [rows] = await remotePool.query(
    `SELECT c.id AS customer_id, c.name, c.phone_number AS phone,
            s.id AS service_id, s.mikrotik_name AS pppoe_username, s.status AS service_status
     FROM customers c
     LEFT JOIN services s ON s.customer_id = c.id AND s.deleted_at IS NULL
     WHERE (c.phone_number LIKE ? OR c.phone_number LIKE ?)
       AND c.deleted_at IS NULL
     ORDER BY s.id DESC
     LIMIT 20`,
    [`%${tail}%`, `%${digits}%`]
  );
  return rows;
}

async function searchCustomersByPppoe(pppoe) {
  const [rows] = await remotePool.query(
    `SELECT c.id AS customer_id, c.name, c.phone_number AS phone,
            s.id AS service_id, s.mikrotik_name AS pppoe_username, s.status AS service_status
     FROM services s
     JOIN customers c ON c.id = s.customer_id AND c.deleted_at IS NULL
     WHERE s.mikrotik_name = ? AND s.deleted_at IS NULL
     LIMIT 10`,
    [pppoe]
  );
  return rows;
}

async function getServicePppoeCredentials(serviceId) {
  const [rows] = await remotePool.query(
    `SELECT s.id AS service_id, s.customer_id, s.mikrotik_name AS pppoe_username,
            s.mikrotik_password AS pppoe_password, s.status AS service_status,
            c.name AS customer_name, c.phone_number AS phone
     FROM services s
     JOIN customers c ON c.id = s.customer_id AND c.deleted_at IS NULL
     WHERE s.id = ? AND s.deleted_at IS NULL
     LIMIT 1`,
    [serviceId]
  );
  return rows[0] || null;
}

async function getCustomerPppoeCredentials(customerId) {
  const [rows] = await remotePool.query(
    `SELECT s.id AS service_id, s.customer_id, s.mikrotik_name AS pppoe_username,
            s.mikrotik_password AS pppoe_password, s.status AS service_status,
            c.name AS customer_name, c.phone_number AS phone
     FROM services s
     JOIN customers c ON c.id = s.customer_id AND c.deleted_at IS NULL
     WHERE s.customer_id = ? AND s.deleted_at IS NULL AND s.mikrotik_name IS NOT NULL
     ORDER BY s.id DESC
     LIMIT 1`,
    [customerId]
  );
  return rows[0] || null;
}

function normUser(u) {
  return String(u || '').trim().toLowerCase();
}

function buildPppoeComparison(acsPppoe, billing) {
  if (!billing?.pppoe_username) {
    return {
      hasBilling: false,
      usernameMismatch: false,
      billing: null,
      message: 'No billing service linked — match customer by phone on the device list first.',
    };
  }

  const acsUser = acsPppoe?.username;
  const usernameMismatch = acsUser
    ? normUser(acsUser) !== normUser(billing.pppoe_username)
    : true;

  return {
    hasBilling: true,
    usernameMismatch,
    acsUsername: acsUser || null,
    billingUsername: billing.pppoe_username,
    billingPasswordAvailable: !!(billing.pppoe_password && String(billing.pppoe_password).length >= 6),
    billing: {
      customer_id: billing.customer_id,
      customer_name: billing.customer_name,
      phone: billing.phone,
      service_id: billing.service_id,
      pppoe_username: billing.pppoe_username,
    },
    message: usernameMismatch
      ? `ONU PPPoE "${acsUser || '—'}" does not match billing "${billing.pppoe_username}".`
      : 'PPPoE username matches billing.',
  };
}

async function resolveBillingCredentials({ customerId, serviceId, phone }) {
  if (serviceId) return getServicePppoeCredentials(Number(serviceId));
  if (customerId) return getCustomerPppoeCredentials(Number(customerId));
  if (phone) {
    const matches = await searchCustomersByPhone(phone);
    const withService = matches.find((m) => m.service_id && m.pppoe_username);
    if (withService) return getServicePppoeCredentials(withService.service_id);
  }
  return null;
}

async function getServiceWithRouter(serviceId) {
  const [rows] = await remotePool.query(
    `SELECT s.id AS service_id, s.customer_id, s.mikrotik_name AS pppoe_username,
            s.status AS service_status, s.plan_id,
            p.title AS plan_title,
            r.id AS router_id, r.title AS router_title, r.host AS router_host, r.nas_ip AS router_nas_ip
     FROM services s
     LEFT JOIN plans p ON p.id = s.plan_id
     LEFT JOIN routers r ON r.id = COALESCE(s.router_id, p.router_id)
     WHERE s.id = ? AND s.deleted_at IS NULL
     LIMIT 1`,
    [serviceId]
  );
  return rows[0] || null;
}

async function listCustomerServicesWithRouter(customerId) {
  const [rows] = await remotePool.query(
    `SELECT s.id AS service_id, s.mikrotik_name AS pppoe_username, s.status AS service_status,
            p.title AS plan_title,
            r.title AS router_title, r.host AS router_host, r.nas_ip AS router_nas_ip
     FROM services s
     LEFT JOIN plans p ON p.id = s.plan_id
     LEFT JOIN routers r ON r.id = COALESCE(s.router_id, p.router_id)
     WHERE s.customer_id = ? AND s.deleted_at IS NULL
     ORDER BY s.id DESC`,
    [customerId]
  );
  return rows;
}

module.exports = {
  billingError,
  enrichDevicesWithCustomers,
  searchCustomersByPhone,
  searchCustomersByPppoe,
  getServicePppoeCredentials,
  getCustomerPppoeCredentials,
  buildPppoeComparison,
  resolveBillingCredentials,
  getServiceWithRouter,
  listCustomerServicesWithRouter,
};
