const { localPool } = require('../db');
const { generateOTP, normalizePhone, phoneFormats, sendOTP } = require('../sms');
const { findCustomerByPhone } = require('./customerService');
const { logOtpEvent, getCustomerEventLogs, ensureEventLogTable, ACTION_LABELS } = require('./otpEventLog');
const {
  ensureAuthEventLogTable,
  ensureSessionAuditColumns,
  logAuthEvent,
  getAuthEventLogs,
  AUTH_ACTION_LABELS,
} = require('./authEventLog');

const OTP_LENGTH = () => parseInt(process.env.OTP_LENGTH, 10) || 6;
const OTP_EXPIRY_MINUTES = () => parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 10;
const OTP_MAX_ATTEMPTS = () => parseInt(process.env.OTP_MAX_ATTEMPTS, 10) || 5;

let schemaReady = false;
async function ensureMobileAdminSchema() {
  if (schemaReady) return;
  await ensureEventLogTable();
  await ensureAuthEventLogTable();
  await ensureSessionAuditColumns();
  schemaReady = true;
}

function activeSessionSql(alias = '') {
  const p = alias ? `${alias}.` : '';
  return `${p}expires_at > NOW() AND ${p}revoked_at IS NULL`;
}

async function logAdminAction(payload) {
  return logOtpEvent({ ...payload, source: 'admin' });
}

function mapOtpRow(row) {
  const expired = new Date(row.expires_at) < new Date();
  const locked = row.attempts >= OTP_MAX_ATTEMPTS();
  return {
    id: row.id,
    phone: row.phone,
    code: row.code,
    purpose: row.purpose,
    attempts: row.attempts,
    maxAttempts: OTP_MAX_ATTEMPTS(),
    verified: !!row.verified,
    expired,
    locked,
    active: !row.verified && !expired && !locked,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

async function getAppUserForCustomer(customerId) {
  const [rows] = await localPool.query(
    `SELECT id, phone, phone_verified, password_hash IS NOT NULL AS has_password,
            last_login, created_at
     FROM app_users WHERE remote_customer_id = ? LIMIT 1`,
    [customerId]
  );
  return rows[0] || null;
}

async function getCustomerProfile(phone) {
  const norm = normalizePhone(phone);
  if (!norm.valid) {
    return { error: norm.error, valid: false };
  }

  const customer = await findCustomerByPhone(phone);
  const appUser = customer ? await getAppUserForCustomer(customer.id) : null;

  const formats = phoneFormats(phone);
  const placeholders = formats.map(() => '?').join(',');
  const [otps] = await localPool.query(
    `SELECT * FROM otp_codes
     WHERE phone IN (${placeholders})
     ORDER BY created_at DESC LIMIT 15`,
    formats
  );

  const normalizedOtps = otps.map(mapOtpRow);
  const activeOtp = normalizedOtps.find((o) => o.active) || null;

  let sessionCount = 0;
  if (appUser) {
    await ensureMobileAdminSchema();
    const [sessions] = await localPool.query(
      `SELECT COUNT(*) AS cnt FROM sessions WHERE app_user_id = ? AND ${activeSessionSql()}`,
      [appUser.id]
    );
    sessionCount = sessions[0].cnt;
  }

  return {
    valid: true,
    phone: norm.formatted,
    customer: customer
      ? {
          id: customer.id,
          name: customer.name,
          phoneNumber: customer.phone_number,
          service: customer.service
            ? {
                id: customer.service.id,
                username: customer.service.mikrotik_name,
                status: customer.service.status,
                planName: customer.service.plan_name,
              }
            : null,
        }
      : null,
    appUser: appUser
      ? {
          id: appUser.id,
          phone: appUser.phone,
          phoneVerified: !!appUser.phone_verified,
          hasPassword: !!appUser.has_password,
          lastLogin: appUser.last_login,
          createdAt: appUser.created_at,
          activeSessions: sessionCount,
        }
      : null,
    activeOtp,
    otpHistory: normalizedOtps,
    activityLogs: await getCustomerEventLogs(phone, 50),
  };
}

async function createAndSendOtp(phone, purpose, { force = false, adminNote = '' } = {}) {
  const norm = normalizePhone(phone);
  if (!norm.valid) {
    return { error: norm.error, status: 400 };
  }

  const customer = await findCustomerByPhone(phone);
  if (!customer) {
    return { error: 'Customer not found in billing system', status: 404 };
  }

  if (!force) {
    const [recent] = await localPool.query(
      `SELECT COUNT(*) AS cnt FROM otp_codes
       WHERE phone = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE)`,
      [norm.formatted]
    );
    if (recent[0].cnt > 0) {
      return { error: 'OTP was sent less than 1 minute ago. Use force to resend anyway.', status: 429 };
    }
  }

  const code = generateOTP(OTP_LENGTH());
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES() * 60 * 1000);

  const [result] = await localPool.query(
    `INSERT INTO otp_codes (phone, code, purpose, expires_at) VALUES (?, ?, ?, ?)`,
    [norm.formatted, code, purpose, expiresAt]
  );

  const smsResult = await sendOTP(norm.formatted, code);

  await logAdminAction({
    phone: norm.formatted,
    action: 'admin_resend',
    purpose,
    otpId: result.insertId,
    detail: adminNote || (force ? 'forced resend' : 'admin resend'),
    smsResult,
    customerId: customer.id,
  });

  return {
    success: true,
    otp: {
      id: result.insertId,
      phone: norm.formatted,
      code,
      purpose,
      expiresAt,
      expiresIn: OTP_EXPIRY_MINUTES() * 60,
    },
    sms: {
      success: smsResult.success,
      error: smsResult.error || null,
      provider: smsResult.data || null,
    },
    customer: { id: customer.id, name: customer.name },
  };
}

async function invalidatePending(phone, purpose) {
  const norm = normalizePhone(phone);
  if (!norm.valid) return { error: norm.error, status: 400 };

  let sql = `UPDATE otp_codes SET verified = 1
             WHERE phone = ? AND verified = 0 AND expires_at > NOW()`;
  const params = [norm.formatted];

  if (purpose) {
    sql += ' AND purpose = ?';
    params.push(purpose);
  }

  const [result] = await localPool.query(sql, params);

  await logAdminAction({
    phone: norm.formatted,
    action: 'admin_invalidate',
    purpose: purpose || 'all',
    detail: `invalidated ${result.affectedRows} OTP(s)`,
  });

  return { success: true, invalidated: result.affectedRows };
}

async function resetOtpAttempts(otpId) {
  const [result] = await localPool.query(
    'UPDATE otp_codes SET attempts = 0 WHERE id = ? AND verified = 0',
    [otpId]
  );
  if (result.affectedRows === 0) {
    return { error: 'OTP not found or already verified', status: 404 };
  }

  const [rows] = await localPool.query('SELECT phone, purpose FROM otp_codes WHERE id = ?', [otpId]);
  await logAdminAction({
    phone: rows[0].phone,
    action: 'admin_reset_attempts',
    purpose: rows[0].purpose,
    otpId,
  });

  return { success: true };
}

async function markPhoneVerified(phone) {
  const norm = normalizePhone(phone);
  if (!norm.valid) return { error: norm.error, status: 400 };

  const customer = await findCustomerByPhone(phone);
  if (!customer) return { error: 'Customer not found', status: 404 };

  const [existing] = await localPool.query(
    'SELECT id FROM app_users WHERE remote_customer_id = ? LIMIT 1',
    [customer.id]
  );

  if (existing.length === 0) {
    await localPool.query(
      `INSERT INTO app_users (remote_customer_id, remote_user_id, phone, phone_verified)
       VALUES (?, ?, ?, 1)`,
      [customer.id, customer.user_id || null, norm.formatted]
    );
  } else {
    await localPool.query('UPDATE app_users SET phone_verified = 1 WHERE id = ?', [existing[0].id]);
  }

  await logAdminAction({ phone: norm.formatted, action: 'admin_mark_verified', customerId: customer.id });
  return { success: true };
}

async function getStats() {
  const [[today]] = await localPool.query(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN purpose = 'signup' THEN 1 ELSE 0 END) AS signup,
       SUM(CASE WHEN purpose = 'password_reset' THEN 1 ELSE 0 END) AS reset,
       SUM(CASE WHEN verified = 1 THEN 1 ELSE 0 END) AS verified
     FROM otp_codes WHERE created_at >= CURDATE()`
  );

  const [[pending]] = await localPool.query(
    `SELECT COUNT(*) AS cnt FROM otp_codes
     WHERE verified = 0 AND expires_at > NOW()`
  );

  let smsFailedToday = 0;
  try {
    await ensureEventLogTable();
    const [[failed]] = await localPool.query(
      `SELECT COUNT(*) AS cnt FROM otp_event_logs
       WHERE sms_success = 0 AND created_at >= CURDATE()`
    );
    smsFailedToday = failed.cnt;
  } catch (_) {
    /* ignore */
  }

  return {
    today: {
      total: today.total || 0,
      signup: today.signup || 0,
      passwordReset: today.reset || 0,
      verified: today.verified || 0,
    },
    pendingOtps: pending.cnt || 0,
    smsFailedToday,
  };
}

async function getRecentActivity(limit = 25) {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);

  const [otps] = await localPool.query(
    `SELECT id, phone, code, purpose, verified, attempts, expires_at, created_at
     FROM otp_codes
     ORDER BY created_at DESC
     LIMIT ?`,
    [safeLimit]
  );

  // Enrich with customer names from remote (batch would be ideal; keep simple per-row)
  const enriched = [];
  for (const row of otps) {
    let customerName = null;
    try {
      const customer = await findCustomerByPhone(row.phone);
      customerName = customer?.name || null;
    } catch (_) {
      /* ignore lookup errors */
    }
    enriched.push({
      ...mapOtpRow(row),
      customerName,
    });
  }

  return enriched;
}

async function getAdminLogs(limit = 20) {
  try {
    await ensureEventLogTable();
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const [rows] = await localPool.query(
      `SELECT * FROM otp_event_logs ORDER BY created_at DESC LIMIT ?`,
      [safeLimit]
    );
    return rows.map((row) => ({
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
      kind: 'otp',
    }));
  } catch (_) {
    return [];
  }
}

async function getOverviewStats() {
  await ensureMobileAdminSchema();
  const otpStats = await getStats();

  const [[users]] = await localPool.query(
    `SELECT
       COUNT(*) AS registered,
       SUM(CASE WHEN phone_verified = 1 THEN 1 ELSE 0 END) AS verified,
       SUM(CASE WHEN password_hash IS NOT NULL THEN 1 ELSE 0 END) AS withPassword,
       SUM(CASE WHEN last_login IS NOT NULL AND last_login >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS activeLast7Days,
       SUM(CASE WHEN created_at >= CURDATE() THEN 1 ELSE 0 END) AS registeredToday
     FROM app_users`
  );

  const [[sess]] = await localPool.query(
    `SELECT
       COUNT(*) AS activeSessions,
       COUNT(DISTINCT app_user_id) AS loggedInUsers
     FROM sessions
     WHERE ${activeSessionSql()}`
  );

  let pushDevices = 0;
  try {
    const [[push]] = await localPool.query(
      `SELECT COUNT(DISTINCT customer_id) AS cnt FROM push_tokens WHERE customer_id IS NOT NULL`
    );
    pushDevices = push.cnt || 0;
  } catch (_) {
    /* push_tokens optional */
  }

  let loginsToday = 0;
  try {
    const [[auth]] = await localPool.query(
      `SELECT COUNT(*) AS cnt FROM auth_event_logs
       WHERE action = 'login_success' AND created_at >= CURDATE()`
    );
    loginsToday = auth.cnt || 0;
  } catch (_) {
    /* ignore */
  }

  return {
    registered: users.registered || 0,
    verified: users.verified || 0,
    withPassword: users.withPassword || 0,
    activeLast7Days: users.activeLast7Days || 0,
    registeredToday: users.registeredToday || 0,
    activeSessions: sess.activeSessions || 0,
    loggedInUsers: sess.loggedInUsers || 0,
    pushDevices,
    loginsToday,
    otps: otpStats,
  };
}

async function listAppUsers({ page = 1, perPage = 25, q = '', hasSession } = {}) {
  await ensureMobileAdminSchema();
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const safePer = Math.min(Math.max(parseInt(perPage, 10) || 25, 1), 100);
  const offset = (safePage - 1) * safePer;
  const params = [];
  let where = '1=1';

  if (q && String(q).trim()) {
    const term = `%${String(q).trim()}%`;
    where += ' AND (u.phone LIKE ? OR CAST(u.remote_customer_id AS CHAR) LIKE ?)';
    params.push(term, term);
  }

  const sessionJoin = `LEFT JOIN (
      SELECT app_user_id, COUNT(*) AS active_sessions
      FROM sessions
      WHERE ${activeSessionSql()}
      GROUP BY app_user_id
    ) s ON s.app_user_id = u.id`;

  if (hasSession === '1' || hasSession === 'true') {
    where += ' AND COALESCE(s.active_sessions, 0) > 0';
  } else if (hasSession === '0' || hasSession === 'false') {
    where += ' AND COALESCE(s.active_sessions, 0) = 0';
  }

  const [[{ total }]] = await localPool.query(
    `SELECT COUNT(*) AS total FROM app_users u ${sessionJoin} WHERE ${where}`,
    params
  );

  const [rows] = await localPool.query(
    `SELECT u.id, u.remote_customer_id, u.phone, u.phone_verified,
            u.password_hash IS NOT NULL AS has_password,
            u.last_login, u.created_at,
            COALESCE(s.active_sessions, 0) AS active_sessions
     FROM app_users u
     ${sessionJoin}
     WHERE ${where}
     ORDER BY u.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, safePer, offset]
  );

  const items = [];
  for (const row of rows) {
    let customerName = null;
    try {
      if (row.phone) {
        const customer = await findCustomerByPhone(row.phone);
        customerName = customer?.name || null;
      }
    } catch (_) {
      /* ignore */
    }
    items.push({
      id: row.id,
      customerId: row.remote_customer_id,
      phone: row.phone,
      customerName,
      phoneVerified: !!row.phone_verified,
      hasPassword: !!row.has_password,
      lastLogin: row.last_login,
      createdAt: row.created_at,
      activeSessions: Number(row.active_sessions) || 0,
      online: (Number(row.active_sessions) || 0) > 0,
    });
  }

  return { items, total: total || 0, page: safePage, perPage: safePer };
}

async function listSessions({ page = 1, perPage = 50, q = '' } = {}) {
  await ensureMobileAdminSchema();
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const safePer = Math.min(Math.max(parseInt(perPage, 10) || 50, 1), 100);
  const offset = (safePage - 1) * safePer;
  const params = [];
  let where = activeSessionSql('s');

  if (q && String(q).trim()) {
    const term = `%${String(q).trim()}%`;
    where += ' AND (u.phone LIKE ? OR s.ip_address LIKE ? OR s.device_info LIKE ?)';
    params.push(term, term, term);
  }

  const [[{ total }]] = await localPool.query(
    `SELECT COUNT(*) AS total
     FROM sessions s
     JOIN app_users u ON u.id = s.app_user_id
     WHERE ${where}`,
    params
  );

  const [rows] = await localPool.query(
    `SELECT s.id, s.app_user_id, s.device_info, s.ip_address, s.expires_at, s.created_at,
            u.phone, u.remote_customer_id
     FROM sessions s
     JOIN app_users u ON u.id = s.app_user_id
     WHERE ${where}
     ORDER BY COALESCE(s.created_at, s.expires_at) DESC
     LIMIT ? OFFSET ?`,
    [...params, safePer, offset]
  );

  const items = rows.map((row) => ({
    id: row.id,
    appUserId: row.app_user_id,
    customerId: row.remote_customer_id,
    phone: row.phone,
    deviceInfo: row.device_info,
    ipAddress: row.ip_address,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }));

  return { items, total: total || 0, page: safePage, perPage: safePer };
}

async function revokeSession(sessionId, { adminNote = '' } = {}) {
  await ensureMobileAdminSchema();
  const id = parseInt(sessionId, 10);
  if (!id) return { error: 'Invalid session id', status: 400 };

  const [rows] = await localPool.query(
    `SELECT s.id, s.app_user_id, u.phone, u.remote_customer_id
     FROM sessions s
     JOIN app_users u ON u.id = s.app_user_id
     WHERE s.id = ? LIMIT 1`,
    [id]
  );
  if (!rows.length) return { error: 'Session not found', status: 404 };

  const row = rows[0];
  await localPool.query(
    `UPDATE sessions SET revoked_at = NOW() WHERE id = ? AND revoked_at IS NULL`,
    [id]
  );

  await logAuthEvent({
    phone: row.phone,
    appUserId: row.app_user_id,
    customerId: row.remote_customer_id,
    action: 'session_revoked',
    source: 'admin',
    detail: adminNote || `Session #${id} revoked`,
    sessionId: id,
  });

  await logAdminAction({
    phone: row.phone,
    action: 'admin_session_revoke',
    detail: adminNote || `revoked session #${id}`,
    customerId: row.remote_customer_id,
  });

  return { success: true, sessionId: id };
}

async function revokeUserSessions(appUserId, { adminNote = '' } = {}) {
  await ensureMobileAdminSchema();
  const id = parseInt(appUserId, 10);
  if (!id) return { error: 'Invalid app user id', status: 400 };

  const [users] = await localPool.query(
    'SELECT id, phone, remote_customer_id FROM app_users WHERE id = ? LIMIT 1',
    [id]
  );
  if (!users.length) return { error: 'App user not found', status: 404 };

  const user = users[0];
  const [result] = await localPool.query(
    `UPDATE sessions SET revoked_at = NOW()
     WHERE app_user_id = ? AND revoked_at IS NULL AND expires_at > NOW()`,
    [id]
  );

  await logAuthEvent({
    phone: user.phone,
    appUserId: user.id,
    customerId: user.remote_customer_id,
    action: 'session_revoked',
    source: 'admin',
    detail: adminNote || `Revoked ${result.affectedRows} session(s)`,
  });

  return { success: true, revoked: result.affectedRows };
}

async function getUnifiedLogs({ type = 'all', phone, limit = 50, from, to } = {}) {
  await ensureMobileAdminSchema();
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const wantOtp = type === 'all' || type === 'otp';
  const wantAuth = type === 'all' || type === 'auth';

  let otpItems = [];
  let authItems = [];

  if (wantOtp) {
    if (phone) {
      otpItems = await getCustomerEventLogs(phone, safeLimit);
    } else {
      otpItems = await getAdminLogs(safeLimit);
    }
  }

  if (wantAuth) {
    authItems = await getAuthEventLogs({ phone, limit: safeLimit, from, to });
  }

  const merged = [...otpItems, ...authItems].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  return merged.slice(0, safeLimit);
}

module.exports = {
  ensureMobileAdminSchema,
  getCustomerProfile,
  getCustomerEventLogs,
  createAndSendOtp,
  invalidatePending,
  resetOtpAttempts,
  markPhoneVerified,
  getStats,
  getRecentActivity,
  getAdminLogs,
  getOverviewStats,
  listAppUsers,
  listSessions,
  revokeSession,
  revokeUserSessions,
  getUnifiedLogs,
  AUTH_ACTION_LABELS,
};
