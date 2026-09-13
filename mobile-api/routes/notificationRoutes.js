// ============================================
// TCOM API — Notification Routes
// ============================================
// GET  /api/notifications              — List notifications (paginated)
// GET  /api/notifications/unread-count — Badge count
// PUT  /api/notifications/:id/read     — Mark one as read
// PUT  /api/notifications/read-all     — Mark all as read
// POST /api/notifications/register-token — Save Expo push token
// ============================================

const express = require('express');
const router = express.Router();
const { localPool } = require('../db');
const { authMiddleware } = require('../auth');
const { registerPushToken } = require('../services/pushService');

// GET /api/notifications — List all notifications for customer (paginated)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const customerId = req.user.customerId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const [notifications] = await localPool.query(
      `SELECT id, title, message, type, is_read, data, created_at
       FROM notifications
       WHERE customer_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [customerId, limit, offset]
    );

    // Parse JSON data field
    const parsed = notifications.map(n => ({
      ...n,
      data: typeof n.data === 'string' ? JSON.parse(n.data) : (n.data || {}),
    }));

    res.json({ notifications: parsed, page, limit });
  } catch (err) {
    console.error('List notifications error:', err);
    res.status(500).json({ error: 'Failed to load notifications' });
  }
});

// GET /api/notifications/unread-count — Badge count
router.get('/unread-count', authMiddleware, async (req, res) => {
  try {
    const customerId = req.user.customerId;
    const [[row]] = await localPool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE customer_id = ? AND is_read = 0',
      [customerId]
    );
    res.json({ count: row.count });
  } catch (err) {
    console.error('Unread count error:', err);
    res.status(500).json({ error: 'Failed to get count' });
  }
});

// PUT /api/notifications/:id/read — Mark one as read
router.put('/:id/read', authMiddleware, async (req, res) => {
  try {
    const customerId = req.user.customerId;
    await localPool.query(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND customer_id = ?',
      [req.params.id, customerId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// PUT /api/notifications/read-all — Mark all as read
router.put('/read-all', authMiddleware, async (req, res) => {
  try {
    const customerId = req.user.customerId;
    await localPool.query(
      'UPDATE notifications SET is_read = 1 WHERE customer_id = ? AND is_read = 0',
      [customerId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

// POST /api/notifications/register-token — Save Expo push token
router.post('/register-token', authMiddleware, async (req, res) => {
  try {
    const { token, platform } = req.body;
    if (!token) return res.status(400).json({ error: 'token is required' });

    const userId = req.user.appUserId;
    const customerId = req.user.customerId;

    const success = await registerPushToken(userId, customerId, token, platform || 'android');
    res.json({ success });
  } catch (err) {
    console.error('Register token error:', err);
    res.status(500).json({ error: 'Failed to register token' });
  }
});

module.exports = router;
