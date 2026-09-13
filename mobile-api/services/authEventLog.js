// Auth / login audit log (app sessions — durable history)
const { localPool } = require('../db');
const { normalizePhone, phoneFormats } = require('../sms');

const AUTH_ACTION_LABELS = {
  login_success: 'Login successful',
  login_fail: 'Login failed',
  logout: 'Logged out',
  refresh: 'Token refreshed',
  password_change: 'Password changed',
  password_set: 'Password set (registration)',
  session_revoked: 'Session revoked by staff',
  register_complete: 'App registration completed',
};

async function ensureAuthEventLogTable() {
  await localPool.query(`
    CREATE TABLE IF NOT EXISTS auth_event_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      phone VARCHAR(20) NULL,
      app_user_id INT NULL,
      customer_id INT NULL,
      action VARCHAR(50) NOT NULL,
      source ENUM('app','admin','system') NOT NULL DEFAULT 'app',
      detail VARCHAR(255) NULL,
      device_info VARCHAR(255) NULL,
      ip_address VARCHAR(45) NULL,
      session_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_phone (phone),
      INDEX idx_app_user (app_user_id),
      INDEX idx_created (created_at),
      INDEX idx_action (action)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function ensureSessionAuditColumns() {
  const alterSafe = async (sql) => {
    try {
      await localPool.query(sql);
    } catch (err) {
      const msg = String(err.message || '');
      if (!msg.includes('Duplicate column') && err.code !== 'ER_DUP_FIELDNAME') {
        console.error('[SESSION-AUDIT]', msg);
      }
    }
  };
  await alterSafe('ALTER TABLE sessions ADD COLUMN revoked_at DATETIME NULL');
  await alterSafe(
    'ALTER TABLE sessions ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'
  );
}

function clientIp(req) {
  if (!req) return null;
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.ip ||
    req.connection?.remoteAddress ||
    null
  );
}

async function logAuthEvent({
  phone = null,
  appUserId = null,
  customerId = null,
  action,
  source = 'app',
  detail = null,
  deviceInfo = null,
  sessionId = null,
  req = null,
}) {
  try {
    if (!action) return;
    await ensureAuthEventLogTable();

    let phoneStr = phone;
    if (phoneStr) {
      const norm = normalizePhone(phoneStr);
      phoneStr = norm.valid ? norm.formatted : String(phoneStr).trim();
    }

    await localPool.query(
      `INSERT INTO auth_event_logs
        (phone, app_user_id, customer_id, action, source, detail, device_info, ip_address, session_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        phoneStr || null,
        appUserId || null,
        customerId || null,
        action,
        source,
        detail || null,
        deviceInfo || (req?.headers?.['user-agent'] || null),
        clientIp(req),
        sessionId || null,
      ]
    );
  } catch (err) {
    console.error('[AUTH-EVENT-LOG]', err.message);
  }
}

function mapAuthRow(row) {
  return {
    id: row.id,
    phone: row.phone,
    appUserId: row.app_user_id,
    customerId: row.customer_id,
    action: row.action,
    actionLabel: AUTH_ACTION_LABELS[row.action] || row.action,
    source: row.source,
    detail: row.detail,
    deviceInfo: row.device_info,
    ipAddress: row.ip_address,
    sessionId: row.session_id,
    createdAt: row.created_at,
    kind: 'auth',
  };
}

async function getAuthEventLogs({ phone, limit = 50, from, to } = {}) {
  await ensureAuthEventLogTable();
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const params = [];
  let where = '1=1';

  if (phone) {
    const formats = phoneFormats(phone);
    if (formats.length) {
      where += ` AND phone IN (${formats.map(() => '?').join(',')})`;
      params.push(...formats);
    }
  }
  if (from) {
    where += ' AND created_at >= ?';
    params.push(from);
  }
  if (to) {
    where += ' AND created_at <= ?';
    params.push(to);
  }

  const [rows] = await localPool.query(
    `SELECT * FROM auth_event_logs WHERE ${where} ORDER BY created_at DESC LIMIT ?`,
    [...params, safeLimit]
  );
  return rows.map(mapAuthRow);
}

module.exports = {
  ensureAuthEventLogTable,
  ensureSessionAuditColumns,
  logAuthEvent,
  getAuthEventLogs,
  AUTH_ACTION_LABELS,
  mapAuthRow,
};
