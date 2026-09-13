// ============================================
// Splynx Proxy Routes — Live data from Splynx DB
// Used by frontend0 (tickets.tonycommgroupltd.com)
// ============================================

const express = require('express');
const router = express.Router();
const { remotePool } = require('../db');

// Simple API key auth for proxy endpoints
const API_KEY = process.env.SPLYNX_PROXY_KEY || 'tcom-splynx-2026';

function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key || key !== API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
}

router.use(requireApiKey);

// GET /api/splynx/expired?date=2026-03-12
// Returns services that expired on a given date (defaults to today)
router.get('/expired', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];

    const [rows] = await remotePool.query(`
      SELECT 
        s.id as service_id,
        s.customer_id,
        c.name as customer_name,
        c.phone_number,
        c.city,
        p.title as plan_name,
        s.price,
        s.status,
        s.end_date,
        s.bill_to,
        s.mikrotik_name,
        COALESCE((
          SELECT SUM(b.amount) 
          FROM balances b 
          WHERE b.balanceable_type = 'App\\\\Models\\\\Customer' 
          AND b.balanceable_id = c.id
        ), 0) as balance
      FROM services s
      JOIN customers c ON s.customer_id = c.id
      LEFT JOIN plans p ON s.plan_id = p.id
      WHERE DATE(s.bill_to) = ?
        AND s.deleted_at IS NULL
        AND c.deleted_at IS NULL
      ORDER BY c.name
    `, [date]);

    // Parse JSON status field
    const parsed = rows.map(r => ({
      ...r,
      status: (() => {
        try { return JSON.parse(r.status); } catch { return r.status; }
      })()
    }));

    res.json({ date, total: parsed.length, data: parsed });
  } catch (err) {
    console.error('[splynx/expired]', err.message);
    res.status(500).json({ error: 'Failed to fetch expired accounts' });
  }
});

// GET /api/splynx/expired-range?from=2026-03-01&to=2026-03-12
// Returns daily counts of expired services for a date range
router.get('/expired-range', async (req, res) => {
  try {
    const from = req.query.from;
    const to = req.query.to || new Date().toISOString().split('T')[0];
    if (!from) return res.status(400).json({ error: 'from date required' });

    const [rows] = await remotePool.query(`
      SELECT 
        DATE(s.bill_to) as date,
        COUNT(*) as total_expired
      FROM services s
      WHERE DATE(s.bill_to) BETWEEN ? AND ?
        AND s.deleted_at IS NULL
      GROUP BY DATE(s.bill_to)
      ORDER BY date DESC
    `, [from, to]);

    res.json({ from, to, data: rows });
  } catch (err) {
    console.error('[splynx/expired-range]', err.message);
    res.status(500).json({ error: 'Failed to fetch expired range' });
  }
});

// GET /api/splynx/customer/:id/balance
router.get('/customer/:id/balance', async (req, res) => {
  try {
    const [rows] = await remotePool.query(`
      SELECT 
        c.id, c.name, c.phone_number,
        COALESCE((
          SELECT SUM(b.amount) 
          FROM balances b 
          WHERE b.balanceable_type = 'App\\\\Models\\\\Customer' 
          AND b.balanceable_id = c.id
        ), 0) as balance
      FROM customers c
      WHERE c.id = ? AND c.deleted_at IS NULL
    `, [req.params.id]);

    if (!rows.length) return res.status(404).json({ error: 'Customer not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[splynx/customer/balance]', err.message);
    res.status(500).json({ error: 'Failed to fetch balance' });
  }
});

// GET /api/splynx/customers-with-balance?page=1&per_page=50&search=
router.get('/customers-with-balance', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = Math.min(parseInt(req.query.per_page) || 50, 200);
    const search = req.query.search || '';
    const offset = (page - 1) * perPage;

    let where = 'c.deleted_at IS NULL';
    const params = [];
    if (search) {
      where += ' AND (c.name LIKE ? OR c.phone_number LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const [[{ total }]] = await remotePool.query(
      `SELECT COUNT(*) as total FROM customers c WHERE ${where}`, params
    );

    const [rows] = await remotePool.query(`
      SELECT 
        c.id, c.name, c.phone_number, c.city,
        COALESCE((
          SELECT SUM(b.amount) 
          FROM balances b 
          WHERE b.balanceable_type = 'App\\\\Models\\\\Customer' 
          AND b.balanceable_id = c.id
        ), 0) as balance
      FROM customers c
      WHERE ${where}
      ORDER BY c.name
      LIMIT ? OFFSET ?
    `, [...params, perPage, offset]);

    res.json({ total, page, per_page: perPage, data: rows });
  } catch (err) {
    console.error('[splynx/customers-with-balance]', err.message);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// GET /api/splynx/services?page=1&per_page=100&search=&status=&has_balance=
// Returns all customer services with customer info + balance
router.get('/services', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = Math.min(parseInt(req.query.per_page) || 100, 500);
    const search = req.query.search || '';
    const status = req.query.status || '';       // Active, Expired, Disabled
    const hasBalance = req.query.has_balance || ''; // yes, negative
    const offset = (page - 1) * perPage;

    // Base WHERE for search only (no status/balance filter) — used for global stats
    let baseWhere = 's.deleted_at IS NULL AND c.deleted_at IS NULL';
    const baseParams = [];
    if (search) {
      baseWhere += ' AND (c.name LIKE ? OR c.phone_number LIKE ? OR s.mikrotik_name LIKE ? OR p.title LIKE ?)';
      baseParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    // Global stats query — counts across ALL matching records (ignoring status/balance filters)
    const balanceSubquery = `COALESCE((SELECT SUM(b.amount) FROM balances b WHERE b.balanceable_type = 'App\\\\Models\\\\Customer' AND b.balanceable_id = c.id), 0)`;
    
    const [statsRows] = await remotePool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN s.status LIKE '%Active%' THEN 1 ELSE 0 END) as active_count,
        SUM(CASE WHEN s.status LIKE '%Expired%' THEN 1 ELSE 0 END) as expired_count,
        SUM(CASE WHEN s.status LIKE '%Disabled%' THEN 1 ELSE 0 END) as disabled_count,
        SUM(CASE WHEN ${balanceSubquery} > 0 THEN 1 ELSE 0 END) as with_balance,
        SUM(CASE WHEN ${balanceSubquery} < 0 THEN 1 ELSE 0 END) as negative_balance
      FROM services s
      JOIN customers c ON s.customer_id = c.id
      LEFT JOIN plans p ON s.plan_id = p.id
      WHERE ${baseWhere}
    `, baseParams);

    const globalStats = statsRows[0];

    // Filtered WHERE — includes status + balance filters for actual data query
    let where = baseWhere;
    const params = [...baseParams];

    if (status) {
      where += ' AND s.status LIKE ?';
      params.push(`%${status}%`);
    }
    if (hasBalance === 'yes') {
      where += ` AND ${balanceSubquery} > 0`;
    } else if (hasBalance === 'negative') {
      where += ` AND ${balanceSubquery} < 0`;
    }

    // Count total with all filters applied (for pagination)
    const [[{ total }]] = await remotePool.query(`
      SELECT COUNT(*) as total
      FROM services s
      JOIN customers c ON s.customer_id = c.id
      LEFT JOIN plans p ON s.plan_id = p.id
      WHERE ${where}
    `, params);

    // Fetch paginated data with all filters
    const [rows] = await remotePool.query(`
      SELECT
        s.id as service_id,
        s.customer_id,
        c.name as customer_name,
        c.phone_number,
        c.city,
        p.title as plan_name,
        s.price,
        s.status,
        s.start_date,
        s.end_date,
        s.bill_to,
        s.billing_type,
        s.mikrotik_name,
        ${balanceSubquery} as balance
      FROM services s
      JOIN customers c ON s.customer_id = c.id
      LEFT JOIN plans p ON s.plan_id = p.id
      WHERE ${where}
      ORDER BY c.name
      LIMIT ? OFFSET ?
    `, [...params, perPage, offset]);

    // Parse JSON fields
    const parsed = rows.map(r => ({
      ...r,
      status: (() => { try { return JSON.parse(r.status); } catch { return r.status; } })(),
      billing_type: (() => { try { return JSON.parse(r.billing_type); } catch { return r.billing_type; } })(),
      balance: Number(r.balance)
    }));

    res.json({
      total,
      page,
      per_page: perPage,
      total_pages: Math.ceil(total / perPage),
      stats: {
        active: Number(globalStats.active_count),
        expired: Number(globalStats.expired_count),
        disabled: Number(globalStats.disabled_count),
        with_balance: Number(globalStats.with_balance),
        negative_balance: Number(globalStats.negative_balance)
      },
      data: parsed
    });
  } catch (err) {
    console.error('[splynx/services]', err.message);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

// GET /api/splynx/services/export?search=&status=&has_balance=
// Returns ALL matching services (no pagination) for Excel export
router.get('/services/export', async (req, res) => {
  try {
    const search = req.query.search || '';
    const status = req.query.status || '';
    const hasBalance = req.query.has_balance || '';

    const balanceSubquery = `COALESCE((SELECT SUM(b.amount) FROM balances b WHERE b.balanceable_type = 'App\\\\Models\\\\Customer' AND b.balanceable_id = c.id), 0)`;

    let where = 's.deleted_at IS NULL AND c.deleted_at IS NULL';
    const params = [];

    if (search) {
      where += ' AND (c.name LIKE ? OR c.phone_number LIKE ? OR s.mikrotik_name LIKE ? OR p.title LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) {
      where += ' AND s.status LIKE ?';
      params.push(`%${status}%`);
    }
    if (hasBalance === 'yes') {
      where += ` AND ${balanceSubquery} > 0`;
    } else if (hasBalance === 'negative') {
      where += ` AND ${balanceSubquery} < 0`;
    }

    const [rows] = await remotePool.query(`
      SELECT
        c.id as customer_id,
        c.name as customer_name,
        c.phone_number,
        c.city,
        p.title as plan_name,
        s.price,
        s.status,
        s.start_date,
        s.bill_to,
        s.billing_type,
        s.mikrotik_name,
        ${balanceSubquery} as balance
      FROM services s
      JOIN customers c ON s.customer_id = c.id
      LEFT JOIN plans p ON s.plan_id = p.id
      WHERE ${where}
      ORDER BY c.name
    `, params);

    const parsed = rows.map(r => ({
      ...r,
      status: (() => { try { return JSON.parse(r.status)?.label || r.status; } catch { return r.status; } })(),
      billing_type: (() => { try { return JSON.parse(r.billing_type)?.label || r.billing_type; } catch { return r.billing_type; } })(),
      balance: Number(r.balance)
    }));

    res.json({ total: parsed.length, data: parsed });
  } catch (err) {
    console.error('[splynx/services/export]', err.message);
    res.status(500).json({ error: 'Failed to export services' });
  }
});

module.exports = router;
