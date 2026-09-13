/**
 * TonyComm billing lookups for ACS provisioning (remote tonycomm DB, read-only).
 */
const { remotePool } = require('../db');
const { phoneFormats } = require('../sms');

function billingError(err) {
  if (err.code === 'ECONNREFUSED' || err.code === 'PROTOCOL_CONNECTION_LOST') {
    return { status: 503, message: 'Billing database unreachable — check REMOTE_DB_* in .env or VPN' };
  }
  if (err.code === 'ER_HOST_NOT_PRIVILEGED' || err.code === 'ER_ACCESS_DENIED_ERROR') {
    return { status: 503, message: 'Billing database denied this host — run API from VPS or whitelist IP' };
  }
  return { status: 500, message: err.message || 'Billing lookup failed' };
}

async function searchCustomersByPhone(phone) {
  const formats = phoneFormats(phone);
  const placeholders = formats.map(() => '?').join(',');
  const tail = formats[0]?.replace(/\D/g, '').slice(-9) || '';

  const [rows] = await remotePool.query(
    `SELECT c.id AS customer_id, c.name, c.phone_number AS phone,
            s.id AS service_id, s.mikrotik_name AS pppoe_username, s.status AS service_status
     FROM customers c
     LEFT JOIN services s ON s.customer_id = c.id AND s.deleted_at IS NULL
     WHERE (c.phone_number IN (${placeholders}) OR c.phone_number LIKE ?)
       AND c.deleted_at IS NULL
     ORDER BY s.id DESC
     LIMIT 20`,
    [...formats, `%${tail}%`]
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

module.exports = {
  billingError,
  searchCustomersByPhone,
  searchCustomersByPppoe,
  getServicePppoeCredentials,
  getCustomerPppoeCredentials,
};
