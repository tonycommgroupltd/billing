// ============================================
// TCOM API — Comprehensive Daily Billing Tracker Routes
// ============================================
// GET  /api/expired-accounts/today         — Get ALL accounts with billing status
// GET  /api/expired-accounts/activity      — Get daily billing change activity
// POST /api/expired-accounts/sync-changes  — Sync all billing date changes
// GET  /api/expired-accounts/history       — Get billing change history
//
// Tracks ALL customer accounts based on bill_to dates
// Status: active, expired, expiring_soon
// Takes daily snapshots of all accounts for historical tracking
// ============================================

const express = require('express');
const router = express.Router();
const { remotePool, localPool } = require('../db');
const { authMiddleware } = require('../auth');

router.use(authMiddleware);

// --------------------------------------------------
// Helper: format date as YYYY-MM-DD
// --------------------------------------------------
function formatDate(d) {
  if (!d) return null;
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// --------------------------------------------------
// Helper: add days to date
// --------------------------------------------------
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// --------------------------------------------------
// Helper: calculate account status based on bill_to date
// --------------------------------------------------
function calculateStatus(billToDate, expiringThresholdDays = 7) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const billDate = new Date(billToDate);
  billDate.setHours(0, 0, 0, 0);

  const daysUntilExpiry = Math.floor((billDate - today) / (1000 * 60 * 60 * 24));

  let status = 'active';
  if (daysUntilExpiry < 0) {
    status = 'expired';
  } else if (daysUntilExpiry <= expiringThresholdDays) {
    status = 'expiring_soon';
  }

  return { status, daysUntilExpiry };
}

// --------------------------------------------------
// GET /api/expired-accounts/today — Get ALL accounts with billing status
// Query Parameters:
//   - daysUntilExpiry (optional): Filter to accounts expiring within N days
//   - status (optional): Filter by status (active, expired, expiring_soon)
//   - limit (optional): Max results (default: 500)
// --------------------------------------------------
router.get('/today', async (req, res) => {
  try {
    const daysUntilExpiryFilter = req.query.daysUntilExpiry ? parseInt(req.query.daysUntilExpiry) : null;
    const statusFilter = req.query.status || null;
    const limit = parseInt(req.query.limit) || 500;

    // Get ALL services with customer and plan information
    const [allServices] = await remotePool.query(`
      SELECT
        c.id as customer_id,
        c.name,
        c.phone_number,
        s.id as service_id,
        s.bill_to,
        s.price,
        p.title as plan_name
      FROM customers c
      JOIN services s ON c.id = s.customer_id
      LEFT JOIN plans p ON s.plan_id = p.id
      WHERE s.deleted_at IS NULL
        AND c.deleted_at IS NULL
      ORDER BY s.bill_to ASC, c.name ASC
      LIMIT ?
    `, [limit]);

    // Get latest invoice status for each service
    const [invoiceStatuses] = await remotePool.query(`
      SELECT DISTINCT
        service_id,
        status as latest_invoice_status
      FROM invoices
      WHERE deleted_at IS NULL
      GROUP BY service_id
      ORDER BY created_at DESC
    `);

    // Create invoice status map
    const invoiceMap = {};
    invoiceStatuses.forEach(inv => {
      if (!invoiceMap[inv.service_id]) {
        invoiceMap[inv.service_id] = inv.latest_invoice_status;
      }
    });

    // Process services with status calculation
    const accounts = [];
    for (const service of allServices) {
      const { status, daysUntilExpiry } = calculateStatus(service.bill_to);

      // Apply filters
      if (daysUntilExpiryFilter !== null && daysUntilExpiry > daysUntilExpiryFilter) {
        continue;
      }
      if (statusFilter && status !== statusFilter) {
        continue;
      }

      accounts.push({
        customerId: service.customer_id,
        name: service.name,
        phone: service.phone_number,
        serviceId: service.service_id,
        billTo: formatDate(service.bill_to),
        price: parseFloat(service.price),
        planName: service.plan_name || 'Unknown Plan',
        status: status,
        daysUntilExpiry: daysUntilExpiry,
        daysOverdue: daysUntilExpiry < 0 ? Math.abs(daysUntilExpiry) : 0,
        invoiceStatus: invoiceMap[service.service_id] || 'none'
      });
    }

    // Take daily snapshot of ALL accounts
    const snapshotDate = formatDate(new Date());
    const snapshotCount = accounts.length;

    if (accounts.length > 0) {
      for (const account of accounts) {
        await localPool.query(`
          INSERT INTO expired_accounts_snapshot
            (snapshot_date, customer_id, service_id, bill_to, days_overdue, price, plan_name, account_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            bill_to = VALUES(bill_to),
            days_overdue = VALUES(days_overdue),
            price = VALUES(price),
            plan_name = VALUES(plan_name),
            account_status = VALUES(account_status),
            recorded_at = CURRENT_TIMESTAMP
        `, [
          snapshotDate,
          account.customerId,
          account.serviceId,
          account.billTo,
          account.daysOverdue,
          account.price,
          account.planName,
          account.status
        ]);
      }
    }

    // Return comprehensive response
    res.json({
      success: true,
      date: snapshotDate,
      total: accounts.length,
      filtered: {
        byStatus: {
          active: accounts.filter(a => a.status === 'active').length,
          expiring_soon: accounts.filter(a => a.status === 'expiring_soon').length,
          expired: accounts.filter(a => a.status === 'expired').length
        },
        appliedFilters: {
          daysUntilExpiry: daysUntilExpiryFilter,
          status: statusFilter
        }
      },
      accounts: accounts,
      snapshotTaken: snapshotCount,
      snapshotDate: snapshotDate,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('Billing tracker error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch account billing data',
      details: err.message
    });
  }
});

// --------------------------------------------------
// POST /api/expired-accounts/sync-changes — Detect ALL billing date changes
// --------------------------------------------------
router.post('/sync-changes', async (req, res) => {
  try {
    // Get current services billing dates from remote DB
    const [currentServices] = await remotePool.query(`
      SELECT
        c.id as customer_id,
        c.name,
        s.id as service_id,
        s.bill_to,
        s.price,
        p.title as plan_name
      FROM customers c
      JOIN services s ON c.id = s.customer_id
      LEFT JOIN plans p ON s.plan_id = p.id
      WHERE s.deleted_at IS NULL
        AND c.deleted_at IS NULL
    `);

    let changesDetected = 0;
    let statusChanges = 0;
    const changeDate = formatDate(new Date());

    // Get yesterday's snapshot for comparison
    const yesterday = formatDate(addDays(new Date(), -1));
    const [yesterdayData] = await localPool.query(`
      SELECT customer_id, service_id, bill_to as previous_bill_to, account_status as previous_status
      FROM expired_accounts_snapshot
      WHERE snapshot_date = ?
    `, [yesterday]);

    // Create map of yesterday's data
    const yesterdayMap = {};
    yesterdayData.forEach(record => {
      const key = `${record.customer_id}-${record.service_id}`;
      yesterdayMap[key] = {
        previous_bill_to: record.previous_bill_to,
        previous_status: record.previous_status
      };
    });

    // Compare and detect changes
    for (const service of currentServices) {
      const key = `${service.customer_id}-${service.service_id}`;
      const previousData = yesterdayMap[key];
      const currentBillTo = formatDate(service.bill_to);
      const { status: currentStatus } = calculateStatus(service.bill_to);

      let changeType = 'unchanged';
      let daysExtended = 0;

      if (!previousData) {
        // New service or first time tracking
        changeType = 'new';
      } else {
        const previousBillTo = previousData.previous_bill_to;

        if (currentBillTo > previousBillTo) {
          // Billing date extended - likely payment
          changeType = 'extended';
          daysExtended = Math.floor((new Date(currentBillTo) - new Date(previousBillTo)) / (1000 * 60 * 60 * 24));
        } else if (currentBillTo < previousBillTo) {
          // Billing date reduced
          changeType = 'reduced';
          daysExtended = Math.floor((new Date(currentBillTo) - new Date(previousBillTo)) / (1000 * 60 * 60 * 24));
        }

        // Check for status changes
        if (previousData.previous_status && previousData.previous_status !== currentStatus) {
          statusChanges++;
          if (changeType === 'unchanged') {
            changeType = 'status_change';
          }
        }
      }

      if (changeType !== 'unchanged') {
        // Record the change
        await localPool.query(`
          INSERT INTO billing_change_tracker
            (customer_id, service_id, previous_bill_to, current_bill_to, change_type, days_extended, change_date)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          service.customer_id,
          service.service_id,
          previousData ? previousData.previous_bill_to : null,
          currentBillTo,
          changeType,
          daysExtended,
          changeDate
        ]);
        changesDetected++;
      }
    }

    // Check for invoice status changes
    const [invoiceChanges] = await remotePool.query(`
      SELECT
        i.id as invoice_id,
        i.customer_id,
        i.service_id,
        i.status,
        i.due_date,
        c.name as customer_name
      FROM invoices i
      JOIN customers c ON i.customer_id = c.id
      WHERE i.updated_at >= DATE_SUB(CURDATE(), INTERVAL 1 DAY)
        AND i.deleted_at IS NULL
    `);

    res.json({
      success: true,
      date: changeDate,
      message: `Detected ${changesDetected} billing changes and ${statusChanges} status changes`,
      summary: {
        billingChanges: changesDetected,
        statusChanges: statusChanges,
        invoiceChanges: invoiceChanges.length,
        servicesProcessed: currentServices.length
      },
      syncedAt: new Date().toISOString()
    });

  } catch (err) {
    console.error('Sync changes error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to sync billing changes',
      details: err.message
    });
  }
});

// --------------------------------------------------
// GET /api/expired-accounts/activity — Get daily billing change activity
// Query Parameters:
//   - date (optional): Specific date to query (default: today)
//   - limit (optional): Max results (default: 100)
//   - changeType (optional): Filter by change type
// --------------------------------------------------
router.get('/activity', async (req, res) => {
  try {
    const date = req.query.date || formatDate(new Date());
    const limit = parseInt(req.query.limit) || 100;
    const changeTypeFilter = req.query.changeType || null;

    let query = `
      SELECT
        bct.*,
        c.name as customer_name,
        c.phone_number,
        s.price,
        p.title as plan_name
      FROM billing_change_tracker bct
      JOIN customers c ON bct.customer_id = c.id
      JOIN services s ON bct.service_id = s.id
      LEFT JOIN plans p ON s.plan_id = p.id
      WHERE bct.change_date = ?
    `;

    const params = [date];

    if (changeTypeFilter) {
      query += ' AND bct.change_type = ?';
      params.push(changeTypeFilter);
    }

    query += ' ORDER BY bct.detected_at DESC LIMIT ?';
    params.push(limit);

    const [activity] = await localPool.query(query, params);

    const formattedActivity = activity.map(record => ({
      id: record.id,
      customerId: record.customer_id,
      customerName: record.customer_name,
      phone: record.phone_number,
      serviceId: record.service_id,
      price: parseFloat(record.price),
      planName: record.plan_name || 'Unknown Plan',
      previousBillTo: record.previous_bill_to,
      currentBillTo: record.current_bill_to,
      changeType: record.change_type,
      daysExtended: record.days_extended,
      detectedAt: record.detected_at,
      changeDate: record.change_date
    }));

    res.json({
      success: true,
      date,
      filter: changeTypeFilter,
      activity: formattedActivity,
      count: formattedActivity.length,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('Activity error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch activity',
      details: err.message
    });
  }
});

// --------------------------------------------------
// GET /api/expired-accounts/history — Get billing change history
// Query Parameters:
//   - limit (optional): Max results (default: 200)
//   - offset (optional): Pagination offset (default: 0)
//   - customerId (optional): Filter by customer
//   - serviceId (optional): Filter by service
//   - startDate (optional): Filter from date (YYYY-MM-DD)
//   - endDate (optional): Filter to date (YYYY-MM-DD)
// --------------------------------------------------
router.get('/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 200;
    const offset = parseInt(req.query.offset) || 0;
    const customerId = req.query.customerId ? parseInt(req.query.customerId) : null;
    const serviceId = req.query.serviceId ? parseInt(req.query.serviceId) : null;
    const startDate = req.query.startDate || null;
    const endDate = req.query.endDate || null;

    let query = `
      SELECT
        bct.*,
        c.name as customer_name,
        c.phone_number,
        s.price,
        p.title as plan_name
      FROM billing_change_tracker bct
      JOIN customers c ON bct.customer_id = c.id
      JOIN services s ON bct.service_id = s.id
      LEFT JOIN plans p ON s.plan_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (customerId) {
      query += ' AND bct.customer_id = ?';
      params.push(customerId);
    }

    if (serviceId) {
      query += ' AND bct.service_id = ?';
      params.push(serviceId);
    }

    if (startDate) {
      query += ' AND bct.change_date >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND bct.change_date <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY bct.detected_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [history] = await localPool.query(query, params);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total
      FROM billing_change_tracker bct
      WHERE 1=1
    `;
    const countParams = [];

    if (customerId) {
      countQuery += ' AND bct.customer_id = ?';
      countParams.push(customerId);
    }

    if (serviceId) {
      countQuery += ' AND bct.service_id = ?';
      countParams.push(serviceId);
    }

    if (startDate) {
      countQuery += ' AND bct.change_date >= ?';
      countParams.push(startDate);
    }

    if (endDate) {
      countQuery += ' AND bct.change_date <= ?';
      countParams.push(endDate);
    }

    const [countResult] = await localPool.query(countQuery, countParams);
    const totalCount = countResult[0].total;

    const formattedHistory = history.map(record => ({
      id: record.id,
      customerId: record.customer_id,
      customerName: record.customer_name,
      phone: record.phone_number,
      serviceId: record.service_id,
      price: parseFloat(record.price),
      planName: record.plan_name || 'Unknown Plan',
      previousBillTo: record.previous_bill_to,
      currentBillTo: record.current_bill_to,
      changeType: record.change_type,
      daysExtended: record.days_extended,
      detectedAt: record.detected_at,
      changeDate: record.change_date
    }));

    res.json({
      success: true,
      history: formattedHistory,
      pagination: {
        limit,
        offset,
        total: totalCount,
        returned: formattedHistory.length,
        hasMore: (offset + limit) < totalCount
      },
      filters: {
        customerId,
        serviceId,
        startDate,
        endDate
      },
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('History error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch history',
      details: err.message
    });
  }
});

module.exports = router;