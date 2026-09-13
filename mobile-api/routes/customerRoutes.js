// ============================================
// TCOM API — Customer / Dashboard Routes
// ============================================
// GET  /api/customer/dashboard  — Full dashboard data
// GET  /api/customer/profile    — Customer profile
// GET  /api/billing/invoices    — All invoices
// GET  /api/billing/payments    — All payments
//
// Remote DB columns (read-only):
//   customers: id, user_id, name, phone_number, address, city, created_at
//   services:  id, customer_id, plan_id, price, start_date, end_date,
//              bill_to, mikrotik_name, mikrotik_password, status (JSON)
//   invoices:  id, services_id, invoice_date, due_date, total, status (JSON)
//   payments:  id, customer_id, invoice_id, trans_id, payment_type, date, sum
//   plans:     id, title, price

const express = require('express');
const router = express.Router();
const { remotePool, localPool } = require('../db');
const { authMiddleware } = require('../auth');

// All routes require auth
router.use(authMiddleware);

// --------------------------------------------------
// Helper: format MySQL date as local YYYY-MM-DD string
// Avoids timezone shift when JSON.stringify converts to UTC
// --------------------------------------------------
function formatDateLocal(d) {
  if (!d) return null;
  const dt = (d instanceof Date) ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// --------------------------------------------------
// Helper: parse status JSON from DB
// --------------------------------------------------
function parseStatus(statusJson) {
  try {
    const parsed = typeof statusJson === 'string' ? JSON.parse(statusJson) : statusJson;
    return parsed?.label || 'Unknown';
  } catch {
    return 'Unknown';
  }
}

function parseStatusValue(statusJson) {
  try {
    const parsed = typeof statusJson === 'string' ? JSON.parse(statusJson) : statusJson;
    return parsed?.value || 0;
  } catch {
    return 0;
  }
}

// --------------------------------------------------
// GET /api/customer/dashboard — Main dashboard payload
// --------------------------------------------------
router.get('/dashboard', async (req, res) => {
  try {
    const customerId = req.user.customerId;

    // 1. Customer info
    const [customers] = await remotePool.query(
      `SELECT c.id, c.name, c.phone_number, c.address, c.city,
              c.created_at as member_since
       FROM customers c
       WHERE c.id = ? AND c.deleted_at IS NULL
       LIMIT 1`,
      [customerId]
    );
    if (customers.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    const customer = customers[0];

    // 2. ALL active services + plans (supports multi-service customers)
    const [allServices] = await remotePool.query(
      `SELECT s.id, s.mikrotik_name, s.mikrotik_password, s.status,
              s.price, s.start_date, s.end_date, s.bill_to,
              p.title as plan_name, p.price as plan_price
       FROM services s
       LEFT JOIN plans p ON s.plan_id = p.id
       WHERE s.customer_id = ? AND s.deleted_at IS NULL
       ORDER BY s.id DESC`,
      [customerId]
    );
    // Primary service = first (latest), but expose all
    const service = allServices.length > 0 ? allServices[0] : null;
    const allServiceIds = allServices.map(s => s.id);

    // 2b. Fetch weekly/bi-weekly pricing from local plan_pricing table
    const [pricingRows] = await localPool.query('SELECT monthly_price, weekly_price, bi_weekly_price FROM plan_pricing');
    const pricingMap = {};
    pricingRows.forEach(r => { pricingMap[parseFloat(r.monthly_price)] = r; });

    // 3. Recent invoices across ALL services (last 5)
    let invoices = [];
    if (allServiceIds.length > 0) {
      const ph = allServiceIds.map(() => '?').join(',');
      const [inv] = await remotePool.query(
        `SELECT i.id, i.invoice_date, i.due_date,
                i.total, i.status, i.services_id,
                COALESCE(SUM(pay.sum), 0) as paid_amount
         FROM invoices i
         LEFT JOIN payments pay ON i.id = pay.invoice_id
         WHERE i.services_id IN (${ph})
         GROUP BY i.id
         ORDER BY i.invoice_date DESC
         LIMIT 5`,
        allServiceIds
      );
      invoices = inv;
    }

    // 4. Recent payments (last 5)
    let payments = [];
    if (allServiceIds.length > 0) {
      const [pay] = await remotePool.query(
        `SELECT p.id, p.sum, p.payment_type, p.trans_id, p.date
         FROM payments p
         WHERE p.customer_id = ?
         ORDER BY p.date DESC
         LIMIT 5`,
        [customerId]
      );
      payments = pay;
    }

    // 5. Account balance (total unpaid across ALL services)
    let balance = 0;
    if (allServiceIds.length > 0) {
      const ph = allServiceIds.map(() => '?').join(',');
      const [allInv] = await remotePool.query(
        `SELECT i.total, i.status,
                COALESCE(SUM(pay.sum), 0) as paid_amount
         FROM invoices i
         LEFT JOIN payments pay ON i.id = pay.invoice_id
         WHERE i.services_id IN (${ph})
         GROUP BY i.id`,
        allServiceIds
      );
      balance = allInv.reduce((sum, inv) => {
        const statusLabel = parseStatus(inv.status);
        if (statusLabel !== 'Paid') {
          return sum + (parseFloat(inv.total) - parseFloat(inv.paid_amount));
        }
        return sum;
      }, 0);
    }

    // 6. Connection status from service status field
    //    status JSON: {"value":2,"label":"Active"} — value 2 = active/online
    const serviceStatusLabel = service ? parseStatus(service.status) : 'Unknown';
    const serviceStatusValue = service ? parseStatusValue(service.status) : 0;
    const connectionStatus = serviceStatusValue === 2 ? 'online' : 'offline';

    // 7. Days until next bill
    let daysUntilBill = null;
    if (service && service.bill_to) {
      const billDate = new Date(service.bill_to);
      const now = new Date();
      daysUntilBill = Math.ceil((billDate - now) / (1000 * 60 * 60 * 24));
    }

    res.json({
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone_number,
        address: customer.address || null,
        city: customer.city || null,
        memberSince: customer.member_since,
      },
      service: service ? (() => {
        const sp = parseFloat(service.price) || parseFloat(service.plan_price) || 0;
        const pp = pricingMap[sp];
        return {
          id: service.id,
          planName: service.plan_name || 'Unknown Plan',
          price: sp,
          weeklyPrice: pp?.weekly_price ? parseFloat(pp.weekly_price) : null,
          biWeeklyPrice: pp?.bi_weekly_price ? parseFloat(pp.bi_weekly_price) : null,
          status: serviceStatusLabel,
          mikrotikName: service.mikrotik_name,
          billTo: formatDateLocal(service.bill_to),
          startDate: formatDateLocal(service.start_date),
          endDate: formatDateLocal(service.end_date),
          daysUntilBill,
          connectionStatus,
        };
      })() : null,
      services: allServices.map(s => {
        const sp = parseFloat(s.price) || parseFloat(s.plan_price) || 0;
        const pp = pricingMap[sp];
        return {
          id: s.id,
          planName: s.plan_name || 'Unknown Plan',
          price: sp,
          weeklyPrice: pp?.weekly_price ? parseFloat(pp.weekly_price) : null,
          biWeeklyPrice: pp?.bi_weekly_price ? parseFloat(pp.bi_weekly_price) : null,
          status: parseStatus(s.status),
          mikrotikName: s.mikrotik_name,
          billTo: formatDateLocal(s.bill_to),
          startDate: formatDateLocal(s.start_date),
          endDate: formatDateLocal(s.end_date),
          connectionStatus: parseStatusValue(s.status) === 2 ? 'online' : 'offline',
        };
      }),
      invoices: invoices.map(inv => ({
        id: inv.id,
        serviceId: inv.services_id,
        date: inv.invoice_date,
        dueDate: inv.due_date,
        total: parseFloat(inv.total),
        paidAmount: parseFloat(inv.paid_amount),
        status: parseStatus(inv.status),
      })),
      payments: payments.map(p => ({
        id: p.id,
        amount: parseFloat(p.sum),
        type: p.payment_type,
        transId: p.trans_id,
        date: p.date,
      })),
      summary: {
        balance: Math.max(0, balance),
        connectionStatus,
        daysUntilBill,
      },
    });

  } catch (err) {
    console.error('[DASHBOARD ERROR]', err);
    res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

// --------------------------------------------------
// GET /api/customer/profile — Customer profile
// --------------------------------------------------
router.get('/profile', async (req, res) => {
  try {
    const customerId = req.user.customerId;

    const [customers] = await remotePool.query(
      `SELECT c.id, c.name, c.phone_number, c.address, c.city,
              c.created_at as member_since
       FROM customers c
       WHERE c.id = ? AND c.deleted_at IS NULL
       LIMIT 1`,
      [customerId]
    );
    if (customers.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    const customer = customers[0];

    // Get ALL services
    const [services] = await remotePool.query(
      `SELECT s.id, s.mikrotik_name, s.status, s.price, s.bill_to,
              p.title as plan_name
       FROM services s
       LEFT JOIN plans p ON s.plan_id = p.id
       WHERE s.customer_id = ? AND s.deleted_at IS NULL
       ORDER BY s.id DESC`,
      [customerId]
    );

    res.json({
      id: req.user.appUserId,
      customerId: customer.id,
      name: customer.name,
      phone: customer.phone_number,
      address: customer.address,
      city: customer.city,
      memberSince: customer.member_since,
      services: services.map(svc => ({
        id: svc.id,
        planName: svc.plan_name,
        price: parseFloat(svc.price),
        status: parseStatus(svc.status),
        mikrotikName: svc.mikrotik_name,
        billTo: formatDateLocal(svc.bill_to),
      })),
    });

  } catch (err) {
    console.error('[PROFILE ERROR]', err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

// --------------------------------------------------
// PUT /api/customer/profile — Update customer info
// Body: { name, phone, address, city }
// --------------------------------------------------
router.put('/profile', async (req, res) => {
  try {
    const customerId = req.user.customerId;
    const { name, phone, address, city } = req.body;

    // Validate — at least one field must be provided
    if (!name && !phone && !address && !city) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Build dynamic update
    const fields = [];
    const values = [];

    if (name && name.trim()) {
      fields.push('name = ?');
      values.push(name.trim());
    }
    if (phone && phone.trim()) {
      fields.push('phone_number = ?');
      values.push(phone.trim());
    }
    if (typeof address === 'string') {
      fields.push('address = ?');
      values.push(address.trim());
    }
    if (typeof city === 'string') {
      fields.push('city = ?');
      values.push(city.trim());
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    values.push(customerId);
    await remotePool.query(
      `UPDATE customers SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
      values
    );

    // Also update phone in app_users local table if phone changed
    if (phone && phone.trim()) {
      try {
        await localPool.query(
          'UPDATE app_users SET phone = ? WHERE remote_customer_id = ?',
          [phone.trim(), customerId]
        );
      } catch (e) {
        console.warn('[PROFILE UPDATE] Could not sync phone to app_users:', e.message);
      }
    }

    console.log(`[PROFILE UPDATE] Customer ${customerId} updated: ${fields.join(', ')}`);

    // Return the updated profile
    const [updated] = await remotePool.query(
      `SELECT c.id, c.name, c.phone_number, c.address, c.city, c.created_at as member_since
       FROM customers c WHERE c.id = ? AND c.deleted_at IS NULL LIMIT 1`,
      [customerId]
    );

    if (updated.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const cust = updated[0];
    res.json({
      success: true,
      message: 'Profile updated successfully',
      profile: {
        id: req.user.appUserId,
        customerId: cust.id,
        name: cust.name,
        phone: cust.phone_number,
        address: cust.address,
        city: cust.city,
        memberSince: cust.member_since,
      },
    });

  } catch (err) {
    console.error('[PROFILE UPDATE ERROR]', err);
    const code = err?.code || null;
    const msg = err?.message || '';
    const isDenied = code === 'ER_TABLEACCESS_DENIED_ERROR' || code === 'ER_DBACCESS_DENIED_ERROR' || /denied/i.test(msg);
    res.status(500).json({
      error: isDenied
        ? 'Profile update is not permitted on the billing database. Contact support.'
        : 'Failed to update profile',
      code,
      message: process.env.NODE_ENV !== 'production' ? msg : undefined,
    });
  }
});

// --------------------------------------------------
// GET /api/billing/invoices — All invoices
// --------------------------------------------------
router.get('/invoices', async (req, res) => {
  try {
    const customerId = req.user.customerId;

    // Get service IDs
    const [services] = await remotePool.query(
      `SELECT id FROM services WHERE customer_id = ? AND deleted_at IS NULL`,
      [customerId]
    );
    if (services.length === 0) return res.json([]);

    const serviceIds = services.map(s => s.id);
    const placeholders = serviceIds.map(() => '?').join(',');

    const [invoices] = await remotePool.query(
      `SELECT i.id, i.invoice_date, i.due_date,
              i.total, i.status, i.services_id,
              COALESCE(SUM(pay.sum), 0) as paid_amount
       FROM invoices i
       LEFT JOIN payments pay ON i.id = pay.invoice_id
       WHERE i.services_id IN (${placeholders})
       GROUP BY i.id
       ORDER BY i.invoice_date DESC`,
      serviceIds
    );

    res.json(invoices.map(inv => ({
      id: inv.id,
      serviceId: inv.services_id,
      date: inv.invoice_date,
      dueDate: inv.due_date,
      total: parseFloat(inv.total),
      paidAmount: parseFloat(inv.paid_amount),
      status: parseStatus(inv.status),
    })));

  } catch (err) {
    console.error('[INVOICES ERROR]', err);
    res.status(500).json({ error: 'Failed to load invoices' });
  }
});

// --------------------------------------------------
// GET /api/billing/statement — Bank-style statement
// --------------------------------------------------
// Query params: startDate, endDate (YYYY-MM-DD)
// Mirrors PHP CustomerStatement::getStatementData()
// --------------------------------------------------
router.get('/statement', async (req, res) => {
  try {
    const customerId = req.user.customerId;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required (YYYY-MM-DD)' });
    }

    // ── Customer info ──
    const [customers] = await remotePool.query(
      `SELECT c.id, c.name, c.phone_number, c.address
       FROM customers c WHERE c.id = ? AND c.deleted_at IS NULL LIMIT 1`,
      [customerId]
    );
    if (customers.length === 0) return res.status(404).json({ error: 'Customer not found' });
    const customer = customers[0];

    // ── ALL services + plans (for complete financial picture) ──
    const [services] = await remotePool.query(
      `SELECT s.id, s.mikrotik_name, s.status, p.title as plan_name, s.price
       FROM services s
       LEFT JOIN plans p ON s.plan_id = p.id
       WHERE s.customer_id = ? AND s.deleted_at IS NULL
       ORDER BY s.id DESC`,
      [customerId]
    );
    const service = services.length > 0 ? services[0] : null;
    const serviceIds = services.map(s => s.id);

    // ── Opening balance: invoices before startDate minus payments before startDate ──
    let openingBalance = 0;
    if (serviceIds.length > 0) {
      const ph = serviceIds.map(() => '?').join(',');

      const [invBefore] = await remotePool.query(
        `SELECT COALESCE(SUM(i.total), 0) as total
         FROM invoices i
         WHERE i.services_id IN (${ph}) AND i.invoice_date < ? AND i.deleted_at IS NULL`,
        [...serviceIds, startDate]
      );

      const [payBefore] = await remotePool.query(
        `SELECT COALESCE(SUM(p.sum), 0) as total
         FROM payments p
         WHERE p.customer_id = ? AND p.date < ?`,
        [customerId, startDate]
      );

      openingBalance = parseFloat(invBefore[0].total) - parseFloat(payBefore[0].total);
    }

    // ── Invoices in period (debits) ──
    const transactions = [];

    if (serviceIds.length > 0) {
      const ph = serviceIds.map(() => '?').join(',');
      const [invoices] = await remotePool.query(
        `SELECT i.id, i.invoice_date as date, i.total as amount,
                CONCAT('Invoice #', i.id, ' - ', COALESCE(s.mikrotik_name, 'Service')) as description,
                CONCAT('INV-', i.id) as reference
         FROM invoices i
         INNER JOIN services s ON i.services_id = s.id
         WHERE i.services_id IN (${ph})
           AND i.invoice_date BETWEEN ? AND ?
           AND i.deleted_at IS NULL`,
        [...serviceIds, startDate, endDate]
      );

      invoices.forEach(inv => {
        transactions.push({
          date: inv.date,
          description: inv.description,
          reference: inv.reference,
          debit: parseFloat(inv.amount),
          credit: 0,
          type: 'INVOICE',
        });
      });
    }

    // ── Payments in period (credits) ──
    const [payments] = await remotePool.query(
      `SELECT p.id, p.date, p.sum as amount,
              CASE
                WHEN p.invoice_id IS NOT NULL THEN CONCAT('Payment for Invoice #', p.invoice_id)
                ELSE 'General Payment'
              END as description,
              COALESCE(p.trans_id, CONCAT('PAY-', p.id)) as reference,
              p.payment_type
       FROM payments p
       WHERE p.customer_id = ?
         AND p.date BETWEEN ? AND ?
       ORDER BY p.date ASC`,
      [customerId, startDate, endDate]
    );

    payments.forEach(pay => {
      transactions.push({
        date: pay.date,
        description: pay.description,
        reference: pay.reference,
        debit: 0,
        credit: parseFloat(pay.amount),
        type: 'PAYMENT',
      });
    });

    // ── Sort chronologically ──
    transactions.sort((a, b) => new Date(a.date) - new Date(b.date));

    // ── Running balance ──
    let running = openingBalance;
    transactions.forEach(tx => {
      running += tx.debit - tx.credit;
      tx.balance = running;
    });

    // ── Totals ──
    const totalDebits  = transactions.reduce((s, t) => s + t.debit, 0);
    const totalCredits = transactions.reduce((s, t) => s + t.credit, 0);
    const closingBalance = openingBalance + totalDebits - totalCredits;

    // ── Statement ID ──
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const hash = Math.random().toString(36).substring(2, 8).toUpperCase();
    const statementId = `STMT-${customerId}-${stamp}-${hash}`;

    res.json({
      statementId,
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone_number,
        address: customer.address,
      },
      service: service ? {
        mikrotikName: service.mikrotik_name,
        planName: service.plan_name,
        price: parseFloat(service.price),
        status: parseStatus(service.status),
      } : null,
      period: { start: startDate, end: endDate },
      openingBalance,
      closingBalance,
      totals: {
        debits: totalDebits,
        credits: totalCredits,
        netMovement: totalDebits - totalCredits,
      },
      transactions,
    });

  } catch (err) {
    console.error('[STATEMENT ERROR]', err);
    res.status(500).json({ error: 'Failed to generate statement' });
  }
});

// --------------------------------------------------
// GET /api/billing/payments — All payments
// --------------------------------------------------
router.get('/payments', async (req, res) => {
  try {
    const customerId = req.user.customerId;

    const [payments] = await remotePool.query(
      `SELECT p.id, p.sum, p.payment_type, p.trans_id, p.date
       FROM payments p
       WHERE p.customer_id = ?
       ORDER BY p.date DESC`,
      [customerId]
    );

    res.json(payments.map(p => ({
      id: p.id,
      amount: parseFloat(p.sum),
      type: p.payment_type,
      transId: p.trans_id,
      date: p.date,
    })));

  } catch (err) {
    console.error('[PAYMENTS ERROR]', err);
    res.status(500).json({ error: 'Failed to load payments' });
  }
});

// --------------------------------------------------
// GET /api/customer/data-usage — Data usage stats
// Returns current session, daily history, and totals
// --------------------------------------------------
router.get('/data-usage', async (req, res) => {
  try {
    const customerId = req.user.customerId;
    const days = Math.min(parseInt(req.query.days) || 30, 90);
    const serviceId = req.query.serviceId || null;

    // 1. Get customer's PPPoE usernames from services
    let svcQuery = `SELECT s.id, s.mikrotik_name, s.status,
              p.title as plan_name
       FROM services s
       LEFT JOIN plans p ON s.plan_id = p.id
       WHERE s.customer_id = ? AND s.deleted_at IS NULL`;
    const svcParams = [customerId];
    if (serviceId) {
      svcQuery += ' AND s.id = ?';
      svcParams.push(serviceId);
    }
    const [services] = await remotePool.query(svcQuery, svcParams);

    if (!services.length) {
      return res.json({ username: null, currentSession: null, daily: [], totalUsage: { download: 0, upload: 0 } });
    }

    const usernames = services.map(s => s.mikrotik_name).filter(Boolean);
    if (!usernames.length) {
      return res.json({ username: null, currentSession: null, daily: [], totalUsage: { download: 0, upload: 0 } });
    }

    const ph = usernames.map(() => '?').join(',');

    // 2. Current active session (no stop time = still connected)
    const [activeSessions] = await remotePool.query(
      `SELECT username, acctstarttime, acctsessiontime,
              acctinputoctets as download, acctoutputoctets as upload,
              framedipaddress as ip_address
       FROM radacct
       WHERE username IN (${ph}) AND acctstoptime IS NULL
       ORDER BY acctstarttime DESC
       LIMIT 1`,
      usernames
    );

    // 3. Daily usage for last N days (from radacct)
    const [dailyRows] = await remotePool.query(
      `SELECT DATE(acctstarttime) as date,
              SUM(acctinputoctets) as download,
              SUM(acctoutputoctets) as upload,
              COUNT(*) as sessions
       FROM radacct
       WHERE username IN (${ph})
         AND acctstarttime >= CURDATE() - INTERVAL ? DAY
       GROUP BY DATE(acctstarttime)
       ORDER BY date ASC`,
      [...usernames, days]
    );

    // 4. Total usage from data_usage_by_period (historical aggregate)
    const [totalRows] = await remotePool.query(
      `SELECT SUM(CASE WHEN acctinputoctets > 0 THEN acctinputoctets ELSE 0 END) as download,
              SUM(CASE WHEN acctoutputoctets > 0 THEN acctoutputoctets ELSE 0 END) as upload
       FROM data_usage_by_period
       WHERE username IN (${ph})`,
      usernames
    );

    // 5. Current month usage
    const [monthRows] = await remotePool.query(
      `SELECT SUM(acctinputoctets) as download,
              SUM(acctoutputoctets) as upload
       FROM radacct
       WHERE username IN (${ph})
         AND acctstarttime >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`,
      usernames
    );

    const activeSession = activeSessions.length > 0 ? {
      username: activeSessions[0].username,
      startTime: activeSessions[0].acctstarttime,
      duration: activeSessions[0].acctsessiontime || 0,
      download: Number(activeSessions[0].download) || 0,
      upload: Number(activeSessions[0].upload) || 0,
      ipAddress: activeSessions[0].ip_address,
    } : null;

    res.json({
      username: usernames[0],
      service: {
        planName: services[0].plan_name,
        status: parseStatus(services[0].status),
      },
      currentSession: activeSession,
      daily: dailyRows.map(r => ({
        date: formatDateLocal(r.date),
        download: Number(r.download) || 0,
        upload: Number(r.upload) || 0,
        sessions: r.sessions,
      })),
      thisMonth: {
        download: Number(monthRows[0]?.download) || 0,
        upload: Number(monthRows[0]?.upload) || 0,
      },
      totalUsage: {
        download: Number(totalRows[0]?.download) || 0,
        upload: Number(totalRows[0]?.upload) || 0,
      },
    });

  } catch (err) {
    console.error('[DATA-USAGE ERROR]', err);
    res.status(500).json({ error: 'Failed to load data usage' });
  }
});

module.exports = router;
