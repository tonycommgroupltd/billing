// ============================================
// TCOM API — Auth Routes
// ============================================
// POST /api/auth/login       — Sign In (phone + password)
// POST /api/auth/request-otp — Join Us  (phone → OTP)
// POST /api/auth/verify-otp  — Verify OTP → issue JWT
// POST /api/auth/set-password — New user sets password after OTP
// POST /api/auth/refresh     — Refresh access token
// POST /api/auth/logout      — Invalidate session

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

const { localPool, remotePool } = require('../db');
const { generateOTP, normalizePhone, phoneFormats, sendOTP } = require('../sms');
const { generateTokens, verifyToken, authMiddleware } = require('../auth');
const { findCustomerByPhone } = require('../services/customerService');
const { logOtpEvent } = require('../services/otpEventLog');
const {
  ensureSessionAuditColumns,
  logAuthEvent,
} = require('../services/authEventLog');

// --------------------------------------------------
// Helper: find or create app_user in local DB
// --------------------------------------------------
async function findOrCreateAppUser(customer, phone) {
  const norm = normalizePhone(phone);
  const phoneStr = norm.valid ? norm.formatted : phone;

  // Check if app_user exists
  const [existing] = await localPool.query(
    'SELECT * FROM app_users WHERE remote_customer_id = ? LIMIT 1',
    [customer.id]
  );

  if (existing.length > 0) return existing[0];

  // Create new app_user
  const [result] = await localPool.query(
    `INSERT INTO app_users (remote_customer_id, remote_user_id, phone, phone_verified)
     VALUES (?, ?, ?, 0)`,
    [customer.id, customer.user_id || null, phoneStr]
  );

  return {
    id: result.insertId,
    remote_customer_id: customer.id,
    remote_user_id: customer.user_id || null,
    phone: phoneStr,
    phone_verified: 0,
    password_hash: null,
  };
}

// --------------------------------------------------
// Helper: create session in local DB + return tokens
// --------------------------------------------------
async function createSession(appUser, customer, req) {
  await ensureSessionAuditColumns();

  const tokenPayload = {
    appUserId: appUser.id,
    customerId: customer.id,
    phone: appUser.phone,
    name: customer.name,
  };
  const { accessToken, refreshToken } = generateTokens(tokenPayload);

  // Store refresh token + device info
  const deviceInfo = req.headers['user-agent'] || 'unknown';
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  const [insertResult] = await localPool.query(
    `INSERT INTO sessions (app_user_id, refresh_token, device_info, ip_address, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [appUser.id, refreshToken, deviceInfo, ip, expiresAt]
  );

  // Update last_login
  await localPool.query(
    'UPDATE app_users SET last_login = NOW() WHERE id = ?',
    [appUser.id]
  );

  await logAuthEvent({
    phone: appUser.phone,
    appUserId: appUser.id,
    customerId: customer.id,
    action: 'login_success',
    detail: 'Session created',
    deviceInfo,
    sessionId: insertResult.insertId || null,
    req,
  });

  return { accessToken, refreshToken };
}

// ==================================================
// POST /api/auth/login — Sign In with phone + password
// ==================================================
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ error: 'Phone and password are required' });
    }

    // 1. Find customer in remote DB
    const customer = await findCustomerByPhone(phone);
    if (!customer) {
      await logAuthEvent({
        phone,
        action: 'login_fail',
        detail: 'Phone not found in billing',
        req,
      });
      return res.status(401).json({ error: 'Phone number not found in our system' });
    }

    // 2. Verify password
    let passwordValid = false;

    // First check remote users table (existing web portal password)
    if (customer.user && customer.user.password) {
      passwordValid = await bcrypt.compare(password, customer.user.password);
    }

    // If not valid, check local app_users table (app-specific password)
    if (!passwordValid) {
      const [appUsers] = await localPool.query(
        'SELECT password_hash FROM app_users WHERE remote_customer_id = ? AND password_hash IS NOT NULL LIMIT 1',
        [customer.id]
      );
      if (appUsers.length > 0 && appUsers[0].password_hash) {
        passwordValid = await bcrypt.compare(password, appUsers[0].password_hash);
      }
    }

    if (!passwordValid) {
      await logAuthEvent({
        phone,
        customerId: customer.id,
        action: 'login_fail',
        detail: 'Invalid password',
        req,
      });
      return res.status(401).json({ error: 'Invalid phone number or password' });
    }

    // 3. Create/get app_user + session
    const appUser = await findOrCreateAppUser(customer, phone);

    // Mark as verified since they have a password
    if (!appUser.phone_verified) {
      await localPool.query('UPDATE app_users SET phone_verified = 1 WHERE id = ?', [appUser.id]);
    }

    const tokens = await createSession(appUser, customer, req);

    // 4. Return user info + tokens
    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: appUser.id,
        customerId: customer.id,
        name: customer.name,
        phone: appUser.phone,
        service: customer.service || null,
      },
      ...tokens,
    });

  } catch (err) {
    console.error('[LOGIN ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================================================
// POST /api/auth/check-phone — Check if customer exists & has password
// ==================================================
router.post('/check-phone', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number is required' });

    const customer = await findCustomerByPhone(phone);
    if (!customer) {
      return res.json({ exists: false });
    }

    // Check if they have set a mobile app password (local app_user only).
    // We intentionally skip the remote web portal password here so that
    // first-time app users always go through the OTP → set-password flow.
    let hasPassword = false;

    const [appUsers] = await localPool.query(
      'SELECT password_hash FROM app_users WHERE remote_customer_id = ? AND password_hash IS NOT NULL LIMIT 1',
      [customer.id]
    );
    if (appUsers.length > 0 && appUsers[0].password_hash) {
      hasPassword = true;
    }

    res.json({ exists: true, hasPassword, name: customer.name });
  } catch (err) {
    console.error('[CHECK-PHONE ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================================================
// POST /api/auth/request-otp — Join Us / First time
// ==================================================
router.post('/request-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const norm = normalizePhone(phone);
    if (!norm.valid) {
      return res.status(400).json({ error: norm.error });
    }

    // 1. Check customer exists in remote DB
    const customer = await findCustomerByPhone(phone);
    if (!customer) {
      return res.status(404).json({
        error: 'Phone number not found in our system. Please contact support to register your service first.',
      });
    }

    // 2. Check if already has password (should use Sign In instead)
    // We allow OTP even if they have a password (for password reset flow later)

    // 3. Rate limit: check recent OTPs
    const [recent] = await localPool.query(
      `SELECT COUNT(*) as cnt FROM otp_codes
       WHERE phone = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE)`,
      [norm.formatted]
    );
    if (recent[0].cnt > 0) {
      await logOtpEvent({
        phone: norm.formatted,
        customerId: customer?.id,
        action: 'rate_limited',
        purpose: 'signup',
        detail: 'Wait 1 minute between OTP requests',
        req,
      });
      return res.status(429).json({ error: 'Please wait before requesting another code' });
    }

    // 4. Generate and store OTP
    const otpLength = parseInt(process.env.OTP_LENGTH) || 6;
    const expiryMin = parseInt(process.env.OTP_EXPIRY_MINUTES) || 10;
    const code = generateOTP(otpLength);
    const expiresAt = new Date(Date.now() + expiryMin * 60 * 1000);

    const [insertResult] = await localPool.query(
      `INSERT INTO otp_codes (phone, code, purpose, expires_at) VALUES (?, ?, 'signup', ?)`,
      [norm.formatted, code, expiresAt]
    );

    // 5. Send SMS
    const smsResult = await sendOTP(norm.formatted, code);

    await logOtpEvent({
      phone: norm.formatted,
      customerId: customer.id,
      action: 'request_otp',
      purpose: 'signup',
      otpId: insertResult.insertId,
      detail: smsResult.success ? 'SMS sent' : 'SMS failed — use back office to read code',
      smsResult,
      req,
    });

    res.json({
      success: true,
      message: `Verification code sent to ${norm.formatted}`,
      expiresIn: expiryMin * 60, // seconds
    });

  } catch (err) {
    console.error('[REQUEST-OTP ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================================================
// POST /api/auth/verify-otp — Verify OTP code
// ==================================================
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) {
      return res.status(400).json({ error: 'Phone and code are required' });
    }

    const norm = normalizePhone(phone);
    if (!norm.valid) {
      return res.status(400).json({ error: norm.error });
    }

    // ── Normal OTP flow ──
    // 1. Find the latest valid OTP
    const [otps] = await localPool.query(
      `SELECT * FROM otp_codes
         WHERE phone = ? AND verified = 0 AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
      [norm.formatted]
    );

      if (otps.length === 0) {
        await logOtpEvent({
          phone: norm.formatted,
          action: 'no_valid_otp',
          purpose: 'signup',
          detail: 'Customer tried to verify but no active code',
          req,
        });
        return res.status(400).json({ error: 'No valid OTP found. Please request a new code.' });
      }

      const otp = otps[0];

      // 2. Check attempts
      const maxAttempts = parseInt(process.env.OTP_MAX_ATTEMPTS) || 5;
      if (otp.attempts >= maxAttempts) {
        await logOtpEvent({
          phone: norm.formatted,
          action: 'verify_locked',
          purpose: otp.purpose,
          otpId: otp.id,
          detail: `Locked after ${maxAttempts} attempts`,
          req,
        });
        return res.status(429).json({ error: 'Too many attempts. Please request a new code.' });
      }

      // Increment attempts
      await localPool.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', [otp.id]);

      // 3. Verify code
      if (otp.code !== code) {
        await logOtpEvent({
          phone: norm.formatted,
          action: 'verify_fail',
          purpose: otp.purpose,
          otpId: otp.id,
          detail: `Attempt ${otp.attempts + 1}/${maxAttempts}`,
          req,
        });
        return res.status(400).json({ error: 'Invalid verification code' });
      }

      // 4. Mark as verified
      await localPool.query('UPDATE otp_codes SET verified = 1 WHERE id = ?', [otp.id]);

    // 5. Find customer + create app_user
    const customer = await findCustomerByPhone(phone);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const appUser = await findOrCreateAppUser(customer, phone);

    // Mark phone as verified
    await localPool.query('UPDATE app_users SET phone_verified = 1 WHERE id = ?', [appUser.id]);

    await logOtpEvent({
      phone: norm.formatted,
      customerId: customer.id,
      action: 'verify_success',
      purpose: otp.purpose,
      otpId: otp.id,
      detail: 'Phone verified via mobile app',
      req,
    });

    // 6. Check if user needs to set password
    const hasPassword = (customer.user && customer.user.password) || appUser.password_hash;

    if (hasPassword) {
      // Already has password — issue tokens directly
      const tokens = await createSession(appUser, customer, req);
      return res.json({
        success: true,
        message: 'Phone verified successfully',
        needsPassword: false,
        user: {
          id: appUser.id,
          customerId: customer.id,
          name: customer.name,
          phone: appUser.phone,
          service: customer.service || null,
        },
        ...tokens,
      });
    }

    // No password yet — return temp token to set password
    const { generateTokens: genTokens } = require('../auth');
    const tempPayload = {
      appUserId: appUser.id,
      customerId: customer.id,
      phone: appUser.phone,
      purpose: 'set_password',
    };
    const tempToken = require('jsonwebtoken').sign(
      tempPayload,
      process.env.JWT_SECRET || 'tcom_jwt_secret_change_in_production_2026',
      { expiresIn: '15m' }
    );

    res.json({
      success: true,
      message: 'Phone verified. Please set your password.',
      needsPassword: true,
      tempToken,
      user: {
        id: appUser.id,
        customerId: customer.id,
        name: customer.name,
        phone: appUser.phone,
      },
    });

  } catch (err) {
    console.error('[VERIFY-OTP ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================================================
// POST /api/auth/set-password — Set password after OTP
// ==================================================
router.post('/set-password', async (req, res) => {
  try {
    const { tempToken, password } = req.body;
    if (!tempToken || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // 1. Verify temp token
    let decoded;
    try {
      decoded = verifyToken(tempToken);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token. Please verify your phone again.' });
    }
    if (decoded.purpose !== 'set_password') {
      return res.status(401).json({ error: 'Invalid token purpose' });
    }

    // 2. Hash and store password
    const hash = await bcrypt.hash(password, 12);
    await localPool.query(
      'UPDATE app_users SET password_hash = ? WHERE id = ?',
      [hash, decoded.appUserId]
    );

    // 3. Find customer for session
    const [appUsers] = await localPool.query('SELECT * FROM app_users WHERE id = ?', [decoded.appUserId]);
    if (appUsers.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const appUser = appUsers[0];

    const customer = await findCustomerByPhone(appUser.phone);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // 4. Create session
    const tokens = await createSession(appUser, customer, req);

    res.json({
      success: true,
      message: 'Password set successfully. Welcome to TCOM!',
      user: {
        id: appUser.id,
        customerId: customer.id,
        name: customer.name,
        phone: appUser.phone,
        service: customer.service || null,
      },
      ...tokens,
    });

  } catch (err) {
    console.error('[SET-PASSWORD ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================================================
// POST /api/auth/refresh — Refresh access token
// ==================================================
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    // 1. Verify refresh token
    let decoded;
    try {
      decoded = verifyToken(refreshToken);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Not a refresh token' });
    }

    // 2. Check session exists in DB (and not revoked)
    await ensureSessionAuditColumns();
    const [sessions] = await localPool.query(
      `SELECT * FROM sessions
       WHERE refresh_token = ? AND expires_at > NOW() AND revoked_at IS NULL
       LIMIT 1`,
      [refreshToken]
    );
    if (sessions.length === 0) {
      return res.status(401).json({ error: 'Session not found or expired' });
    }

    // 3. Issue new tokens
    const newPayload = {
      appUserId: decoded.appUserId,
      customerId: decoded.customerId,
      phone: decoded.phone,
      name: decoded.name,
    };
    const tokens = generateTokens(newPayload);

    // 4. Replace old refresh token
    await localPool.query(
      'UPDATE sessions SET refresh_token = ? WHERE refresh_token = ?',
      [tokens.refreshToken, refreshToken]
    );

    res.json({ success: true, ...tokens });

  } catch (err) {
    console.error('[REFRESH ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================================================
// POST /api/auth/logout — Invalidate session
// ==================================================
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    await ensureSessionAuditColumns();
    const { refreshToken } = req.body;

    if (refreshToken) {
      // Soft-revoke specific session (keep row for audit)
      await localPool.query(
        `UPDATE sessions SET revoked_at = NOW()
         WHERE refresh_token = ? AND revoked_at IS NULL`,
        [refreshToken]
      );
    } else {
      await localPool.query(
        `UPDATE sessions SET revoked_at = NOW()
         WHERE app_user_id = ? AND revoked_at IS NULL`,
        [req.user.appUserId]
      );
    }

    await logAuthEvent({
      phone: req.user.phone,
      appUserId: req.user.appUserId,
      customerId: req.user.customerId,
      action: 'logout',
      detail: refreshToken ? 'Single session logout' : 'All sessions logout',
      req,
    });

    res.json({ success: true, message: 'Logged out successfully' });

  } catch (err) {
    console.error('[LOGOUT ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================================================
// POST /api/auth/change-password — Change app password
// ==================================================
router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new passwords are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'New password must be different from current password' });
    }

    // Get current password hash
    const [users] = await localPool.query(
      'SELECT id, password_hash FROM app_users WHERE id = ?',
      [req.user.appUserId]
    );
    if (users.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const appUser = users[0];

    if (!appUser.password_hash) {
      return res.status(400).json({ error: 'No password set. Please use "Set Password" first.' });
    }

    // Verify current password
    const valid = await bcrypt.compare(currentPassword, appUser.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash & store new password
    const hash = await bcrypt.hash(newPassword, 12);
    await localPool.query(
      'UPDATE app_users SET password_hash = ? WHERE id = ?',
      [hash, appUser.id]
    );

    console.log(`[CHANGE-PASSWORD] User ${req.user.appUserId} changed app password`);

    res.json({ success: true, message: 'Password changed successfully' });

  } catch (err) {
    console.error('[CHANGE-PASSWORD ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================================================
// POST /api/auth/forgot-password — Request password reset OTP
// ==================================================
router.post('/forgot-password', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const norm = normalizePhone(phone);
    if (!norm.valid) {
      return res.status(400).json({ error: norm.error });
    }

    // 1. Check customer exists
    const customer = await findCustomerByPhone(phone);
    if (!customer) {
      return res.status(404).json({
        error: 'No account found with this phone number.',
      });
    }

    // 2. Rate limit: max 3 per hour, 1 per minute
    const [recentMinute] = await localPool.query(
      `SELECT COUNT(*) as cnt FROM otp_codes
       WHERE phone = ? AND purpose = 'password_reset' AND created_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE)`,
      [norm.formatted]
    );
    if (recentMinute[0].cnt > 0) {
      await logOtpEvent({
        phone: norm.formatted,
        customerId: customer.id,
        action: 'rate_limited',
        purpose: 'password_reset',
        detail: 'Wait 1 minute between reset codes',
        req,
      });
      return res.status(429).json({ error: 'Please wait before requesting another code' });
    }

    const [recentHour] = await localPool.query(
      `SELECT COUNT(*) as cnt FROM otp_codes
       WHERE phone = ? AND purpose = 'password_reset' AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
      [norm.formatted]
    );
    if (recentHour[0].cnt >= 3) {
      await logOtpEvent({
        phone: norm.formatted,
        customerId: customer.id,
        action: 'rate_limited',
        purpose: 'password_reset',
        detail: 'Max 3 reset codes per hour',
        req,
      });
      return res.status(429).json({ error: 'Too many reset attempts. Please wait 1 hour.' });
    }

    // 3. Generate and store OTP
    const otpLength = parseInt(process.env.OTP_LENGTH) || 6;
    const expiryMin = parseInt(process.env.OTP_EXPIRY_MINUTES) || 10;
    const code = generateOTP(otpLength);
    const expiresAt = new Date(Date.now() + expiryMin * 60 * 1000);

    const [insertResult] = await localPool.query(
      `INSERT INTO otp_codes (phone, code, purpose, expires_at) VALUES (?, ?, 'password_reset', ?)`,
      [norm.formatted, code, expiresAt]
    );

    // 4. Send OTP via SMS
    const smsResult = await sendOTP(norm.formatted, code);

    await logOtpEvent({
      phone: norm.formatted,
      customerId: customer.id,
      action: 'forgot_password_request',
      purpose: 'password_reset',
      otpId: insertResult.insertId,
      detail: smsResult.success ? 'Reset SMS sent' : 'Reset SMS failed',
      smsResult,
      req,
    });

    const isDev = process.env.NODE_ENV !== 'production';
    const masked = norm.formatted.slice(0, -4) + '****';

    console.log(`[FORGOT-PASSWORD] OTP sent to ${norm.formatted} for customer ${customer.id}`);

    res.json({
      success: true,
      message: `Verification code sent to ${masked}`,
      expiresIn: expiryMin * 60,
    });

  } catch (err) {
    console.error('[FORGOT-PASSWORD ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================================================
// POST /api/auth/reset-password — Verify OTP + set new password
// ==================================================
router.post('/reset-password', async (req, res) => {
  try {
    const { phone, code, newPassword } = req.body;
    if (!phone || !code || !newPassword) {
      return res.status(400).json({ error: 'Phone, code, and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const norm = normalizePhone(phone);
    if (!norm.valid) {
      return res.status(400).json({ error: norm.error });
    }

    // 1. Find the latest valid OTP for password reset
    const [otps] = await localPool.query(
      `SELECT * FROM otp_codes
       WHERE phone = ? AND purpose = 'password_reset' AND verified = 0 AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [norm.formatted]
    );

    if (otps.length === 0) {
      await logOtpEvent({
        phone: norm.formatted,
        action: 'no_valid_otp',
        purpose: 'password_reset',
        detail: 'Reset attempted with no active code',
        req,
      });
      return res.status(400).json({ error: 'No valid code found. Please request a new one.' });
    }

    const otp = otps[0];

    // 2. Check attempts
    const maxAttempts = parseInt(process.env.OTP_MAX_ATTEMPTS) || 5;
    if (otp.attempts >= maxAttempts) {
      await logOtpEvent({
        phone: norm.formatted,
        action: 'verify_locked',
        purpose: 'password_reset',
        otpId: otp.id,
        req,
      });
      return res.status(429).json({ error: 'Too many attempts. Please request a new code.' });
    }

    // Increment attempts
    await localPool.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', [otp.id]);

    // 3. Verify code
    if (otp.code !== code) {
      await logOtpEvent({
        phone: norm.formatted,
        action: 'reset_password_fail',
        purpose: 'password_reset',
        otpId: otp.id,
        detail: `Wrong reset code — attempt ${otp.attempts}/${maxAttempts}`,
        req,
      });
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // 4. Mark OTP as verified
    await localPool.query('UPDATE otp_codes SET verified = 1 WHERE id = ?', [otp.id]);

    // 5. Find customer and app_user
    const customer = await findCustomerByPhone(phone);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const appUser = await findOrCreateAppUser(customer, phone);

    // 6. Hash and update password in app_users
    const hash = await bcrypt.hash(newPassword, 12);
    await localPool.query(
      'UPDATE app_users SET password_hash = ?, phone_verified = 1 WHERE id = ?',
      [hash, appUser.id]
    );

    // 7. Also update remote users table if linked
    if (customer.user_id) {
      try {
        await remotePool.query(
          'UPDATE users SET password = ? WHERE id = ?',
          [hash, customer.user_id]
        );
      } catch (e) {
        console.warn('[RESET-PASSWORD] Could not update remote users table:', e.message);
      }
    }

    console.log(`[RESET-PASSWORD] Password reset successful for customer ${customer.id} (${norm.formatted})`);

    await logOtpEvent({
      phone: norm.formatted,
      customerId: customer.id,
      action: 'reset_password_success',
      purpose: 'password_reset',
      otpId: otp.id,
      detail: 'Password changed via reset flow',
      req,
    });

    // 8. Auto-login: create session
    const tokens = await createSession(appUser, customer, req);

    res.json({
      success: true,
      message: 'Password reset successfully!',
      user: {
        id: appUser.id,
        customerId: customer.id,
        name: customer.name,
        phone: appUser.phone,
        service: customer.service || null,
      },
      ...tokens,
    });

  } catch (err) {
    console.error('[RESET-PASSWORD ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
