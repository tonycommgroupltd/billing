// Per-customer OTP activity log (app + admin + SMS outcomes)
const { localPool } = require('../db');
const { normalizePhone, phoneFormats } = require('../sms');

const ACTION_LABELS = {
  request_otp: 'Signup OTP requested',
  forgot_password_request: 'Reset OTP requested',
  verify_success: 'Code verified',
  verify_fail: 'Wrong code entered',
  verify_locked: 'Too many wrong attempts',
  no_valid_otp: 'No valid code to verify',
  rate_limited: 'Rate limited — wait before retry',
  reset_password_success: 'Password reset completed',
  reset_password_fail: 'Reset code wrong',
  admin_resend: 'Staff resent OTP',
  admin_invalidate: 'Staff invalidated pending codes',
  admin_reset_attempts: 'Staff reset attempt counter',
  admin_mark_verified: 'Staff marked phone verified',
  admin_session_revoke: 'Staff revoked app session',
};

async function ensureEventLogTable() {
  await localPool.query(`
    CREATE TABLE IF NOT EXISTS otp_event_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      phone VARCHAR(20) NOT NULL,
      customer_id INT NULL,
      action VARCHAR(50) NOT NULL,
      purpose VARCHAR(30) NULL,
      source ENUM('app','admin','system') NOT NULL DEFAULT 'app',
      otp_id INT NULL,
      detail VARCHAR(255) NULL,
      sms_success TINYINT(1) NULL,
      sms_error TEXT NULL,
      ip_address VARCHAR(45) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_phone (phone),
      INDEX idx_customer (customer_id),
      INDEX idx_created (created_at),
      INDEX idx_action (action)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

function clientIp(req) {
  if (!req) return null;
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.ip
    || req.connection?.remoteAddress
    || null;
}

async function logOtpEvent({
  phone,
  customerId = null,
  action,
  purpose = null,
  source = 'app',
  otpId = null,
  detail = null,
  smsResult = null,
  req = null,
}) {
  try {
    const norm = normalizePhone(phone);
    const phoneStr = norm.valid ? norm.formatted : String(phone || '').trim();
    if (!phoneStr || !action) return;

    await ensureEventLogTable();
    await localPool.query(
      `INSERT INTO otp_event_logs
        (phone, customer_id, action, purpose, source, otp_id, detail, sms_success, sms_error, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        phoneStr,
        customerId || null,
        action,
        purpose || null,
        source,
        otpId || null,
        detail || null,
        smsResult != null ? (smsResult.success ? 1 : 0) : null,
        smsResult && !smsResult.success ? (smsResult.error || 'SMS failed') : null,
        clientIp(req),
      ]
    );
  } catch (err) {
    console.error('[OTP-EVENT-LOG]', err.message);
  }
}

function mapEventRow(row) {
  return {
    id: row.id,
    phone: row.phone,
    customerId: row.customer_id,
    action: row.action,
    actionLabel: ACTION_LABELS[row.action] || row.action,
    purpose: row.purpose,
    source: row.source,
    otpId: row.otp_id,
    detail: row.detail,
    smsSuccess: row.sms_success === 1,
    smsFailed: row.sms_success === 0,
    smsError: row.sms_error,
    ipAddress: row.ip_address,
    createdAt: row.created_at,
    legacy: false,
  };
}

async function getCustomerEventLogs(phone, limit = 50) {
  const norm = normalizePhone(phone);
  if (!norm.valid) return [];

  const formats = phoneFormats(phone);
  const placeholders = formats.map(() => '?').join(',');
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);

  let events = [];
  try {
    await ensureEventLogTable();
    const [rows] = await localPool.query(
      `SELECT * FROM otp_event_logs
       WHERE phone IN (${placeholders})
       ORDER BY created_at DESC
       LIMIT ?`,
      [...formats, safeLimit]
    );
    events = rows.map(mapEventRow);
  } catch (_) {
    /* ignore */
  }

  if (events.length < safeLimit) {
    const [codes] = await localPool.query(
      `SELECT id, phone, code, purpose, verified, attempts, expires_at, created_at
       FROM otp_codes
       WHERE phone IN (${placeholders})
       ORDER BY created_at DESC
       LIMIT ?`,
      [...formats, safeLimit]
    );

    const loggedOtpIds = new Set(events.filter((e) => e.otpId).map((e) => e.otpId));
    for (const code of codes) {
      if (loggedOtpIds.has(code.id)) continue;
      const expired = new Date(code.expires_at) < new Date();
      let detail = `Code ${code.code}`;
      if (code.verified) detail = `Code ${code.code} — used`;
      else if (expired) detail = `Code ${code.code} — expired`;
      else detail = `Code ${code.code} — pending`;

      events.push({
        id: `legacy-${code.id}`,
        phone: code.phone,
        customerId: null,
        action: code.verified ? 'verify_success' : 'request_otp',
        actionLabel: code.verified ? 'Code verified (historical)' : 'OTP created (historical)',
        purpose: code.purpose,
        source: 'system',
        otpId: code.id,
        detail,
        smsSuccess: null,
        smsFailed: null,
        smsError: null,
        ipAddress: null,
        createdAt: code.created_at,
        legacy: true,
      });
    }

    events.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    events = events.slice(0, safeLimit);
  }

  return events;
}

module.exports = {
  logOtpEvent,
  getCustomerEventLogs,
  ensureEventLogTable,
  ACTION_LABELS,
};
