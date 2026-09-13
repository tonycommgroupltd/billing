// OTP / Mobile app support back-office API (staff only — x-api-key)
const express = require('express');
const router = express.Router();
const {
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
} = require('../services/otpSupportService');

function adminKeyMiddleware(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  const validKeys = [
    process.env.OTP_ADMIN_API_KEY,
    process.env.TICKETS_API_KEY,
    process.env.NODE_API_KEY,
    process.env.REACT_APP_NODE_API_KEY,
    'tcom_otp_admin_2026',
    'tcom-api-key-2024',
  ].filter(Boolean);

  if (!apiKey || !validKeys.includes(apiKey)) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  next();
}

router.use(adminKeyMiddleware);

router.use(async (_req, _res, next) => {
  try {
    await ensureMobileAdminSchema();
  } catch (err) {
    console.error('[OTP-ADMIN schema]', err.message);
  }
  next();
});

router.get('/stats', async (req, res) => {
  try {
    res.json(await getStats());
  } catch (err) {
    console.error('[OTP-ADMIN stats]', err);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

router.get('/overview', async (req, res) => {
  try {
    res.json(await getOverviewStats());
  } catch (err) {
    console.error('[OTP-ADMIN overview]', err);
    res.status(500).json({ error: 'Failed to load overview' });
  }
});

router.get('/users', async (req, res) => {
  try {
    res.json(
      await listAppUsers({
        page: req.query.page,
        perPage: req.query.per_page || req.query.perPage,
        q: req.query.q || req.query.search,
        hasSession: req.query.has_session || req.query.hasSession,
      })
    );
  } catch (err) {
    console.error('[OTP-ADMIN users]', err);
    res.status(500).json({ error: 'Failed to load app users' });
  }
});

router.get('/sessions', async (req, res) => {
  try {
    res.json(
      await listSessions({
        page: req.query.page,
        perPage: req.query.per_page || req.query.perPage,
        q: req.query.q || req.query.search,
      })
    );
  } catch (err) {
    console.error('[OTP-ADMIN sessions]', err);
    res.status(500).json({ error: 'Failed to load sessions' });
  }
});

router.post('/sessions/:id/revoke', async (req, res) => {
  try {
    const result = await revokeSession(req.params.id, { adminNote: req.body?.note || '' });
    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    res.json(result);
  } catch (err) {
    console.error('[OTP-ADMIN revoke session]', err);
    res.status(500).json({ error: 'Failed to revoke session' });
  }
});

router.post('/users/:id/revoke-sessions', async (req, res) => {
  try {
    const result = await revokeUserSessions(req.params.id, { adminNote: req.body?.note || '' });
    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    res.json(result);
  } catch (err) {
    console.error('[OTP-ADMIN revoke user sessions]', err);
    res.status(500).json({ error: 'Failed to revoke sessions' });
  }
});

router.get('/audit', async (req, res) => {
  try {
    const items = await getUnifiedLogs({
      type: req.query.type || 'all',
      phone: req.query.phone,
      limit: req.query.limit,
      from: req.query.from,
      to: req.query.to,
    });
    res.json({ items });
  } catch (err) {
    console.error('[OTP-ADMIN audit]', err);
    res.status(500).json({ error: 'Failed to load audit logs' });
  }
});

router.get('/recent', async (req, res) => {
  try {
    const items = await getRecentActivity(req.query.limit);
    res.json({ items });
  } catch (err) {
    console.error('[OTP-ADMIN recent]', err);
    res.status(500).json({ error: 'Failed to load recent OTPs' });
  }
});

router.get('/logs', async (req, res) => {
  try {
    const items = await getAdminLogs(req.query.limit);
    res.json({ items });
  } catch (err) {
    console.error('[OTP-ADMIN logs]', err);
    res.status(500).json({ error: 'Failed to load admin logs' });
  }
});

router.get('/customer/logs', async (req, res) => {
  try {
    const { phone, limit } = req.query;
    if (!phone) {
      return res.status(400).json({ error: 'phone query parameter is required' });
    }
    const items = await getCustomerEventLogs(phone, limit);
    res.json({ items });
  } catch (err) {
    console.error('[OTP-ADMIN customer logs]', err);
    res.status(500).json({ error: 'Failed to load customer logs' });
  }
});

router.get('/customer', async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) {
      return res.status(400).json({ error: 'phone query parameter is required' });
    }
    const profile = await getCustomerProfile(phone);
    if (!profile.valid) {
      return res.status(400).json({ error: profile.error });
    }
    res.json(profile);
  } catch (err) {
    console.error('[OTP-ADMIN customer]', err);
    res.status(500).json({ error: 'Failed to load customer' });
  }
});

router.post('/resend', async (req, res) => {
  try {
    const { phone, purpose = 'signup', force = false, note = '' } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'phone is required' });
    }
    if (!['signup', 'password_reset'].includes(purpose)) {
      return res.status(400).json({ error: 'purpose must be signup or password_reset' });
    }

    const result = await createAndSendOtp(phone, purpose, { force: !!force, adminNote: note });
    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    res.json(result);
  } catch (err) {
    console.error('[OTP-ADMIN resend]', err);
    res.status(500).json({ error: 'Failed to resend OTP' });
  }
});

router.post('/invalidate', async (req, res) => {
  try {
    const { phone, purpose } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'phone is required' });
    }
    const result = await invalidatePending(phone, purpose);
    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    res.json(result);
  } catch (err) {
    console.error('[OTP-ADMIN invalidate]', err);
    res.status(500).json({ error: 'Failed to invalidate OTPs' });
  }
});

router.post('/reset-attempts', async (req, res) => {
  try {
    const { otpId } = req.body;
    if (!otpId) {
      return res.status(400).json({ error: 'otpId is required' });
    }
    const result = await resetOtpAttempts(otpId);
    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    res.json(result);
  } catch (err) {
    console.error('[OTP-ADMIN reset-attempts]', err);
    res.status(500).json({ error: 'Failed to reset attempts' });
  }
});

router.post('/mark-verified', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'phone is required' });
    }
    const result = await markPhoneVerified(phone);
    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    res.json(result);
  } catch (err) {
    console.error('[OTP-ADMIN mark-verified]', err);
    res.status(500).json({ error: 'Failed to mark phone verified' });
  }
});

module.exports = router;
