/**
 * Local registry for GenieACS-managed CPEs (acs_devices cache).
 */
const { localPool } = require('../db');

const TABLE_SQL = `
CREATE TABLE IF NOT EXISTS acs_devices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  genieacs_id VARCHAR(128) NOT NULL,
  serial_number VARCHAR(64) DEFAULT NULL,
  product_class VARCHAR(64) DEFAULT NULL,
  manufacturer VARCHAR(128) DEFAULT NULL,
  pppoe_username VARCHAR(128) DEFAULT NULL,
  customer_id INT DEFAULT NULL,
  wifi_ssid VARCHAR(128) DEFAULT NULL,
  wifi_password VARCHAR(128) DEFAULT NULL,
  software_version VARCHAR(64) DEFAULT NULL,
  connection_request_url VARCHAR(512) DEFAULT NULL,
  last_inform DATETIME DEFAULT NULL,
  online TINYINT(1) DEFAULT 0,
  tags JSON DEFAULT NULL,
  last_synced DATETIME DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_genieacs_id (genieacs_id),
  INDEX idx_serial (serial_number),
  INDEX idx_pppoe (pppoe_username),
  INDEX idx_customer (customer_id),
  INDEX idx_product (product_class),
  INDEX idx_online (online),
  INDEX idx_last_inform (last_inform)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

let tableReady = false;
let dbUnavailable = false;

async function ensureTable() {
  if (tableReady) return true;
  if (dbUnavailable) return false;
  try {
    await localPool.query(TABLE_SQL);
    tableReady = true;
    return true;
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'PROTOCOL_CONNECTION_LOST') {
      dbUnavailable = true;
      return false;
    }
    throw err;
  }
}

function isDbReady() {
  return tableReady && !dbUnavailable;
}

function toMysqlDatetime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

async function upsertFromGenieacs(row) {
  if (!(await ensureTable())) return false;
  const sql = `
    INSERT INTO acs_devices (
      genieacs_id, serial_number, product_class, manufacturer,
      pppoe_username, wifi_ssid, software_version, connection_request_url,
      last_inform, online, last_synced
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    ON DUPLICATE KEY UPDATE
      serial_number = VALUES(serial_number),
      product_class = VALUES(product_class),
      manufacturer = VALUES(manufacturer),
      pppoe_username = COALESCE(acs_devices.pppoe_username, VALUES(pppoe_username)),
      wifi_ssid = VALUES(wifi_ssid),
      software_version = VALUES(software_version),
      connection_request_url = VALUES(connection_request_url),
      last_inform = VALUES(last_inform),
      online = VALUES(online),
      last_synced = NOW()`;
  await localPool.query(sql, [
    row.genieacs_id,
    row.serial_number || null,
    row.product_class || null,
    row.manufacturer || null,
    row.pppoe_username || null,
    row.wifi_ssid || null,
    row.software_version || null,
    row.connection_request_url || null,
    toMysqlDatetime(row.last_inform),
    row.online ? 1 : 0,
  ]);
  return true;
}

async function getStats() {
  if (!(await ensureTable())) {
    const err = new Error('Database unavailable');
    err.code = 'DB_UNAVAILABLE';
    throw err;
  }
  const [rows] = await localPool.query(`
    SELECT
      COUNT(*) AS total,
      SUM(online = 1) AS online,
      SUM(online = 0) AS offline,
      SUM(pppoe_username IS NOT NULL) AS linked_pppoe,
      SUM(customer_id IS NOT NULL) AS linked_customer
    FROM acs_devices`);
  return rows[0];
}

async function listDevices({ search, online, productClass, limit = 100, offset = 0 } = {}) {
  if (!(await ensureTable())) {
    const err = new Error('Database unavailable');
    err.code = 'DB_UNAVAILABLE';
    throw err;
  }
  const where = [];
  const params = [];

  if (search) {
    where.push(`(
      serial_number LIKE ? OR genieacs_id LIKE ? OR pppoe_username LIKE ?
      OR wifi_ssid LIKE ? OR product_class LIKE ?
    )`);
    const q = `%${search}%`;
    params.push(q, q, q, q, q);
  }
  if (online === '1' || online === 'true') {
    where.push('online = 1');
  } else if (online === '0' || online === 'false') {
    where.push('online = 0');
  }
  if (productClass) {
    where.push('product_class = ?');
    params.push(productClass);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [items] = await localPool.query(
    `SELECT * FROM acs_devices ${clause} ORDER BY last_inform DESC LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );
  const [countRows] = await localPool.query(
    `SELECT COUNT(*) AS total FROM acs_devices ${clause}`,
    params
  );
  return { items, total: countRows[0].total };
}

async function getByGenieacsId(genieacsId) {
  if (!(await ensureTable())) return null;
  const [rows] = await localPool.query(
    'SELECT * FROM acs_devices WHERE genieacs_id = ? LIMIT 1',
    [genieacsId]
  );
  return rows[0] || null;
}

async function getByPppoeUsername(pppoeUsername) {
  if (!(await ensureTable())) return null;
  const [rows] = await localPool.query(
    'SELECT * FROM acs_devices WHERE pppoe_username = ? LIMIT 1',
    [pppoeUsername]
  );
  return rows[0] || null;
}

async function linkDevice(genieacsId, { pppoeUsername, customerId } = {}) {
  if (!(await ensureTable())) return null;
  await localPool.query(
    `UPDATE acs_devices SET
      pppoe_username = COALESCE(?, pppoe_username),
      customer_id = COALESCE(?, customer_id)
     WHERE genieacs_id = ?`,
    [pppoeUsername || null, customerId || null, genieacsId]
  );
  return getByGenieacsId(genieacsId);
}

async function updateWifiCache(genieacsId, ssid, password) {
  if (!(await ensureTable())) return false;
  await localPool.query(
    'UPDATE acs_devices SET wifi_ssid = ?, wifi_password = ? WHERE genieacs_id = ?',
    [ssid, password, genieacsId]
  );
}

async function listProductClasses() {
  if (!(await ensureTable())) {
    const err = new Error('Database unavailable');
    err.code = 'DB_UNAVAILABLE';
    throw err;
  }
  const [rows] = await localPool.query(
    `SELECT product_class, COUNT(*) AS count
     FROM acs_devices
     WHERE product_class IS NOT NULL AND product_class != ''
     GROUP BY product_class ORDER BY count DESC`
  );
  return rows;
}

module.exports = {
  ensureTable,
  isDbReady,
  upsertFromGenieacs,
  getStats,
  listDevices,
  getByGenieacsId,
  getByPppoeUsername,
  linkDevice,
  updateWifiCache,
  listProductClasses,
};
