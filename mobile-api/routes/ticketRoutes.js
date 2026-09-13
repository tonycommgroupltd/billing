// ============================================
// TCOM API — Support Ticket Routes
// ============================================
// --- Customer routes (require auth) ---
// POST /api/tickets             — Create ticket
// GET  /api/tickets             — List customer tickets
// GET  /api/tickets/:id         — Get single ticket + replies
// POST /api/tickets/:id/reply   — Add reply to ticket
// PUT  /api/tickets/:id/close   — Close ticket
//
// --- Public/Admin API (API key auth) ---
// GET  /api/tickets/admin/all          — All tickets (filterable)
// GET  /api/tickets/admin/:id          — Ticket detail + replies
// POST /api/tickets/admin/:id/reply    — Admin reply
// PUT  /api/tickets/admin/:id/status   — Change status
// GET  /api/tickets/admin/stats        — Dashboard stats
//
// --- Dashboard Webhook (bridge key auth) ---
// POST /api/tickets/webhook/reply      — Admin replied on dashboard
// POST /api/tickets/webhook/status     — Status changed on dashboard
// POST /api/tickets/webhook/assigned   — Ticket assigned on dashboard
// ============================================

const express = require('express');
const router = express.Router();
const { localPool, remotePool } = require('../db');
const { authMiddleware } = require('../auth');
const { forwardTicket, forwardReply, forwardStatusChange } = require('../services/dashboardSync');
const { sendNotification } = require('../services/pushService');

// Admin API-key middleware
function adminKeyMiddleware(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  const validKey = process.env.TICKETS_API_KEY || 'tcom_tickets_key_2026';
  if (!apiKey || apiKey !== validKey) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  next();
}

// Dashboard bridge key middleware
function bridgeKeyMiddleware(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  const validKey = process.env.ADMIN_BRIDGE_KEY || 'tcom_mobile_bridge_2026_secure';
  if (!apiKey || apiKey !== validKey) {
    return res.status(401).json({ error: 'Invalid or missing bridge key' });
  }
  next();
}

// --------------------------------------------------
// Helper: generate ticket reference  TCOM-20260308-XXXX
// --------------------------------------------------
function generateTicketRef() {
  const d = new Date();
  const date = d.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `TCOM-${date}-${rand}`;
}

// ==================================================
// CUSTOMER ROUTES (JWT auth)
// ==================================================

// POST /api/tickets — Create new ticket
router.post('/', authMiddleware, async (req, res) => {
  try {
    const customerId = req.user.customerId;
    const { subject, category, priority, message } = req.body;

    if (!subject || !message) {
      return res.status(400).json({ error: 'Subject and message are required' });
    }

    const reference = generateTicketRef();
    const cat = category || 'general';
    const prio = priority || 'medium';

    // Get customer info from remote DB
    let customerName = 'Customer';
    let customerInfo = {};
    try {
      const [rows] = await remotePool.query(
        'SELECT name, phone_number, address FROM customers WHERE id = ? LIMIT 1', [customerId]
      );
      if (rows.length) {
        customerName = rows[0].name;
        customerInfo = { name: rows[0].name, phone: rows[0].phone_number, address: rows[0].address };
      }
    } catch { /* ignore */ }

    const [result] = await localPool.query(
      `INSERT INTO support_tickets (customer_id, customer_name, customer_phone, customer_email, reference, subject, category, priority, status, message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
      [customerId, customerName, customerInfo.phone || null, customerInfo.email || null, reference, subject, cat, prio, message]
    );

    // Fire-and-forget: forward to admin dashboard
    forwardTicket(
      { reference, subject, category: cat, priority: prio, message, customer_name: customerName },
      customerInfo
    ).then(syncResult => {
      if (syncResult) {
        localPool.query(
          'UPDATE support_tickets SET admin_ticket_id = ?, admin_ticket_number = ? WHERE id = ?',
          [syncResult.adminId, syncResult.adminNumber, result.insertId]
        ).catch(() => {});
      }
    }).catch(() => {});

    res.status(201).json({
      success: true,
      ticket: {
        id: result.insertId,
        reference,
        subject,
        category: cat,
        priority: prio,
        status: 'open',
        createdAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('Create ticket error:', err);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

// GET /api/tickets — List customer's tickets
router.get('/', authMiddleware, async (req, res) => {
  try {
    const customerId = req.user.customerId;
    const status = req.query.status; // optional filter

    let sql = `SELECT id, reference, subject, category, priority, status, created_at, updated_at
               FROM support_tickets WHERE customer_id = ?`;
    const params = [customerId];

    if (status && ['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC LIMIT 100';

    const [tickets] = await localPool.query(sql, params);

    // Get unread reply counts
    for (const t of tickets) {
      const [[{ cnt }]] = await localPool.query(
        `SELECT COUNT(*) as cnt FROM ticket_replies
         WHERE ticket_id = ? AND sender = 'admin' AND is_read = 0`,
        [t.id]
      );
      t.unreadReplies = cnt;
    }

    res.json({ tickets });
  } catch (err) {
    console.error('List tickets error:', err);
    res.status(500).json({ error: 'Failed to load tickets' });
  }
});

// ==================================================
// ADMIN / EXTERNAL API (API-key auth)
// IMPORTANT: These MUST come before /:id routes!
// ==================================================

// GET /api/tickets/admin/stats — Dashboard stats
router.get('/admin/stats', adminKeyMiddleware, async (req, res) => {
  try {
    const [[counts]] = await localPool.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_count,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed,
        SUM(CASE WHEN priority = 'high' AND status IN ('open','in_progress') THEN 1 ELSE 0 END) as high_prio
      FROM support_tickets
    `);
    const [[recent]] = await localPool.query(
      `SELECT COUNT(*) as cnt FROM support_tickets WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`
    );
    res.json({
      stats: {
        total: counts.total, open: counts.open_count, inProgress: counts.in_progress,
        resolved: counts.resolved, closed: counts.closed,
        highPriority: counts.high_prio, last24h: recent.cnt,
      },
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// GET /api/tickets/admin/all — List all tickets with filters
router.get('/admin/all', adminKeyMiddleware, async (req, res) => {
  try {
    const { status, priority, category, search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let sql = 'SELECT * FROM support_tickets WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (priority) { sql += ' AND priority = ?'; params.push(priority); }
    if (category) { sql += ' AND category = ?'; params.push(category); }
    if (search) {
      sql += ' AND (subject LIKE ? OR reference LIKE ? OR customer_name LIKE ?)';
      const s = `%${search}%`; params.push(s, s, s);
    }
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const [[{ total }]] = await localPool.query(countSql, params);
    sql += ' ORDER BY FIELD(priority, "high", "medium", "low"), created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);
    const [tickets] = await localPool.query(sql, params);
    for (const t of tickets) {
      const [[{ cnt }]] = await localPool.query(
        `SELECT COUNT(*) as cnt FROM ticket_replies WHERE ticket_id = ? AND sender = 'customer' AND is_read = 0`, [t.id]
      );
      t.unreadReplies = cnt;
    }
    res.json({ tickets, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) {
    console.error('Admin list error:', err);
    res.status(500).json({ error: 'Failed to load tickets' });
  }
});

// GET /api/tickets/admin/:id — Single ticket detail
router.get('/admin/:id', adminKeyMiddleware, async (req, res) => {
  try {
    const ticketId = req.params.id;
    const [[ticket]] = await localPool.query('SELECT * FROM support_tickets WHERE id = ?', [ticketId]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    const [replies] = await localPool.query(
      `SELECT id, sender, sender_name, content, created_at FROM ticket_replies WHERE ticket_id = ? ORDER BY created_at ASC`, [ticketId]
    );
    await localPool.query(`UPDATE ticket_replies SET is_read = 1 WHERE ticket_id = ? AND sender = 'customer' AND is_read = 0`, [ticketId]);
    res.json({ ticket, replies });
  } catch (err) {
    console.error('Admin ticket error:', err);
    res.status(500).json({ error: 'Failed to load ticket' });
  }
});

// POST /api/tickets/admin/:id/reply — Admin sends reply
router.post('/admin/:id/reply', adminKeyMiddleware, async (req, res) => {
  try {
    const ticketId = req.params.id;
    const { message, senderName } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });
    const [[ticket]] = await localPool.query('SELECT id FROM support_tickets WHERE id = ?', [ticketId]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    const name = senderName || 'TCOM Support';
    const [result] = await localPool.query(
      `INSERT INTO ticket_replies (ticket_id, sender, sender_name, content) VALUES (?, 'admin', ?, ?)`,
      [ticketId, name, message.trim()]
    );
    await localPool.query(
      `UPDATE support_tickets SET updated_at = NOW(), status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END WHERE id = ?`, [ticketId]
    );
    res.json({ success: true, reply: { id: result.insertId, sender: 'admin', senderName: name, content: message.trim(), createdAt: new Date().toISOString() } });
  } catch (err) {
    console.error('Admin reply error:', err);
    res.status(500).json({ error: 'Failed to send reply' });
  }
});

// PUT /api/tickets/admin/:id/status — Update ticket status
router.put('/admin/:id/status', adminKeyMiddleware, async (req, res) => {
  try {
    const ticketId = req.params.id;
    const { status } = req.body;
    if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Use: open, in_progress, resolved, closed' });
    }
    const [result] = await localPool.query('UPDATE support_tickets SET status = ?, updated_at = NOW() WHERE id = ?', [status, ticketId]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Ticket not found' });
    res.json({ success: true, message: `Ticket status updated to ${status}` });
  } catch (err) {
    console.error('Status update error:', err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// ==================================================
// DASHBOARD → MOBILE WEBHOOKS (bridge key auth)
// Called by the PHP ticketing app on cPanel when
// admin actions happen — syncs them back to mobile.
// ==================================================

// POST /api/tickets/webhook/reply — Admin replied on dashboard
router.post('/webhook/reply', bridgeKeyMiddleware, async (req, res) => {
  try {
    const { admin_ticket_id, message, sender_name } = req.body;
    if (!admin_ticket_id || !message) {
      return res.status(400).json({ error: 'admin_ticket_id and message are required' });
    }

    // Find local ticket by admin_ticket_id
    const [[ticket]] = await localPool.query(
      'SELECT id, status FROM support_tickets WHERE admin_ticket_id = ?', [admin_ticket_id]
    );
    if (!ticket) return res.status(404).json({ error: 'Ticket not found for this admin_ticket_id' });

    // Insert as admin reply
    const name = sender_name || 'TCOM Support';
    const [result] = await localPool.query(
      `INSERT INTO ticket_replies (ticket_id, sender, sender_name, content) VALUES (?, 'admin', ?, ?)`,
      [ticket.id, name, message.trim()]
    );

    // Auto-move open → in_progress
    await localPool.query(
      `UPDATE support_tickets SET updated_at = NOW(),
       status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END
       WHERE id = ?`, [ticket.id]
    );

    console.log(`  ↙ Webhook reply received → local ticket ${ticket.id}`);

    // Push notification to customer
    try {
      const [[t]] = await localPool.query('SELECT customer_id, subject FROM support_tickets WHERE id = ?', [ticket.id]);
      if (t) {
        sendNotification(t.customer_id, {
          title: '💬 New Reply on Your Ticket',
          message: `${name} replied to "${t.subject}"`,
          type: 'ticket',
          data: { ticketId: ticket.id, action: 'reply' },
        });
      }
    } catch (e) { /* ignore push errors */ }

    res.json({ success: true, reply_id: result.insertId });
  } catch (err) {
    console.error('Webhook reply error:', err);
    res.status(500).json({ error: 'Failed to process reply' });
  }
});

// POST /api/tickets/webhook/status — Status changed on dashboard
router.post('/webhook/status', bridgeKeyMiddleware, async (req, res) => {
  try {
    const { admin_ticket_id, status, message } = req.body;
    if (!admin_ticket_id || !status) {
      return res.status(400).json({ error: 'admin_ticket_id and status are required' });
    }

    // Map admin statuses to mobile statuses
    const statusMap = { new: 'open', open: 'open', in_progress: 'in_progress', resolved: 'resolved', closed: 'closed' };
    const localStatus = statusMap[status] || 'open';

    const [[ticket]] = await localPool.query(
      'SELECT id, status as old_status FROM support_tickets WHERE admin_ticket_id = ?', [admin_ticket_id]
    );
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    await localPool.query(
      'UPDATE support_tickets SET status = ?, updated_at = NOW() WHERE id = ?',
      [localStatus, ticket.id]
    );

    // Add an informational reply so customer sees the change
    const statusLabel = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed' };
    const infoMsg = message || `Ticket status updated to ${statusLabel[localStatus] || localStatus}`;
    await localPool.query(
      `INSERT INTO ticket_replies (ticket_id, sender, sender_name, content) VALUES (?, 'admin', 'System', ?)`,
      [ticket.id, `📋 ${infoMsg}`]
    );

    console.log(`  ↙ Webhook status "${localStatus}" → local ticket ${ticket.id}`);

    // Push notification to customer
    try {
      const [[t]] = await localPool.query('SELECT customer_id, subject FROM support_tickets WHERE id = ?', [ticket.id]);
      if (t) {
        const statusLabel = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed' };
        sendNotification(t.customer_id, {
          title: '📋 Ticket Status Updated',
          message: `"${t.subject}" is now ${statusLabel[localStatus] || localStatus}`,
          type: 'ticket',
          data: { ticketId: ticket.id, action: 'status', status: localStatus },
        });
      }
    } catch (e) { /* ignore push errors */ }

    res.json({ success: true });
  } catch (err) {
    console.error('Webhook status error:', err);
    res.status(500).json({ error: 'Failed to process status' });
  }
});

// POST /api/tickets/webhook/assigned — Ticket assigned on dashboard
router.post('/webhook/assigned', bridgeKeyMiddleware, async (req, res) => {
  try {
    const { admin_ticket_id, assigned_to, message } = req.body;
    if (!admin_ticket_id) {
      return res.status(400).json({ error: 'admin_ticket_id is required' });
    }

    const [[ticket]] = await localPool.query(
      'SELECT id FROM support_tickets WHERE admin_ticket_id = ?', [admin_ticket_id]
    );
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    // Add informational reply so customer sees it
    const assignee = assigned_to || 'a technician';
    const infoMsg = message || `Your ticket has been assigned to ${assignee}. Our team will follow up shortly.`;
    await localPool.query(
      `INSERT INTO ticket_replies (ticket_id, sender, sender_name, content) VALUES (?, 'admin', 'System', ?)`,
      [ticket.id, `👤 ${infoMsg}`]
    );

    await localPool.query('UPDATE support_tickets SET updated_at = NOW() WHERE id = ?', [ticket.id]);

    console.log(`  ↙ Webhook assigned "${assignee}" → local ticket ${ticket.id}`);

    // Push notification to customer
    try {
      const [[t]] = await localPool.query('SELECT customer_id, subject FROM support_tickets WHERE id = ?', [ticket.id]);
      if (t) {
        sendNotification(t.customer_id, {
          title: '👤 Ticket Assigned',
          message: `"${t.subject}" has been assigned to ${assignee}`,
          type: 'ticket',
          data: { ticketId: ticket.id, action: 'assigned' },
        });
      }
    } catch (e) { /* ignore push errors */ }

    res.json({ success: true });
  } catch (err) {
    console.error('Webhook assigned error:', err);
    res.status(500).json({ error: 'Failed to process assignment' });
  }
});

// ==================================================
// CUSTOMER DETAIL ROUTES (must come after /admin/*)
// ==================================================

// GET /api/tickets/:id — Single ticket with replies
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const customerId = req.user.customerId;
    const ticketId = req.params.id;

    const [[ticket]] = await localPool.query(
      `SELECT * FROM support_tickets WHERE id = ? AND customer_id = ?`,
      [ticketId, customerId]
    );

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const [replies] = await localPool.query(
      `SELECT id, sender, sender_name, content, created_at
       FROM ticket_replies WHERE ticket_id = ? ORDER BY created_at ASC`,
      [ticketId]
    );

    // Mark admin replies as read
    await localPool.query(
      `UPDATE ticket_replies SET is_read = 1
       WHERE ticket_id = ? AND sender = 'admin' AND is_read = 0`,
      [ticketId]
    );

    res.json({
      ticket: {
        id: ticket.id,
        reference: ticket.reference,
        subject: ticket.subject,
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        message: ticket.message,
        customerName: ticket.customer_name,
        createdAt: ticket.created_at,
        updatedAt: ticket.updated_at,
      },
      replies,
    });
  } catch (err) {
    console.error('Get ticket error:', err);
    res.status(500).json({ error: 'Failed to load ticket' });
  }
});

// POST /api/tickets/:id/reply — Customer adds reply
router.post('/:id/reply', authMiddleware, async (req, res) => {
  try {
    const customerId = req.user.customerId;
    const ticketId = req.params.id;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Verify ownership
    const [[ticket]] = await localPool.query(
      'SELECT id, status FROM support_tickets WHERE id = ? AND customer_id = ?',
      [ticketId, customerId]
    );
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (ticket.status === 'closed') return res.status(400).json({ error: 'Ticket is closed' });

    // Get customer name
    let senderName = 'Customer';
    try {
      const [rows] = await remotePool.query('SELECT name FROM customers WHERE id = ? LIMIT 1', [customerId]);
      if (rows.length) senderName = rows[0].name;
    } catch { /* ignore */ }

    const [result] = await localPool.query(
      `INSERT INTO ticket_replies (ticket_id, sender, sender_name, content)
       VALUES (?, 'customer', ?, ?)`,
      [ticketId, senderName, message.trim()]
    );

    // Update ticket timestamp & reopen if resolved
    await localPool.query(
      `UPDATE support_tickets SET updated_at = NOW(),
       status = CASE WHEN status = 'resolved' THEN 'open' ELSE status END
       WHERE id = ?`,
      [ticketId]
    );

    // Fire-and-forget: forward reply to admin dashboard
    localPool.query('SELECT admin_ticket_id FROM support_tickets WHERE id = ?', [ticketId])
      .then(([[row]]) => {
        if (row?.admin_ticket_id) forwardReply(row.admin_ticket_id, message.trim(), senderName);
      }).catch(() => {});

    res.json({
      success: true,
      reply: {
        id: result.insertId,
        sender: 'customer',
        senderName,
        content: message.trim(),
        createdAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('Reply error:', err);
    res.status(500).json({ error: 'Failed to send reply' });
  }
});

// PUT /api/tickets/:id/close — Customer closes ticket
router.put('/:id/close', authMiddleware, async (req, res) => {
  try {
    const customerId = req.user.customerId;
    const ticketId = req.params.id;

    const [result] = await localPool.query(
      `UPDATE support_tickets SET status = 'closed', updated_at = NOW()
       WHERE id = ? AND customer_id = ?`,
      [ticketId, customerId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Fire-and-forget: forward close to admin dashboard
    localPool.query('SELECT admin_ticket_id FROM support_tickets WHERE id = ?', [ticketId])
      .then(([[row]]) => {
        if (row?.admin_ticket_id) forwardStatusChange(row.admin_ticket_id, 'closed');
      }).catch(() => {});

    res.json({ success: true, message: 'Ticket closed' });
  } catch (err) {
    console.error('Close ticket error:', err);
    res.status(500).json({ error: 'Failed to close ticket' });
  }
});

module.exports = router;
