// ============================================
// TCOM API — Finance Routes
// ============================================
// All finance-related endpoints for the admin dashboard
// Uses remotePool for customer data (tonycomm) and localPool for tracking (tcom_app)

const express = require('express');
const router = express.Router();
const { remotePool: financePool, localPool: trackerPool } = require('../db');

// Helper: format Date to YYYY-MM-DD using local timezone (avoids UTC shift with toISOString)
const localDate = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const todayLocal = () => localDate(new Date());
const daysAgoLocal = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return localDate(d); };

// Note: financePool = remotePool from db.js → 100.42.182.120 / tonycomm (customer data)
// Note: trackerPool = localPool from db.js → localhost / tcom_app (tracking data)

// ============================================
// GET /api/finance/dashboard-stats
// Finance Dashboard Statistics
// ============================================
router.get('/dashboard-stats', async (req, res) => {
  try {
    const now = new Date();
    const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDayThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const formatDate = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

    const thisMonthStart = formatDate(firstDayThisMonth);
    const thisMonthEnd = formatDate(lastDayThisMonth);
    const lastMonthStart = formatDate(firstDayLastMonth);
    const lastMonthEnd = formatDate(lastDayLastMonth);

    // Payment statistics
    const [[thisMonthPayments]] = await financePool.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(sum), 0) as total 
       FROM payments WHERE date BETWEEN ? AND ?`,
      [thisMonthStart, thisMonthEnd]
    );
    
    const [[lastMonthPayments]] = await financePool.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(sum), 0) as total 
       FROM payments WHERE date BETWEEN ? AND ?`,
      [lastMonthStart, lastMonthEnd]
    );

    // Invoice statistics - This Month
    const [[thisMonthUnpaid]] = await financePool.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total 
       FROM invoices WHERE JSON_EXTRACT(status, '$.value') = 1 
       AND invoice_date BETWEEN ? AND ?`,
      [thisMonthStart, thisMonthEnd]
    );
    
    const [[thisMonthPaid]] = await financePool.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total 
       FROM invoices WHERE JSON_EXTRACT(status, '$.value') = 2 
       AND invoice_date BETWEEN ? AND ?`,
      [thisMonthStart, thisMonthEnd]
    );

    // Invoice statistics - Last Month
    const [[lastMonthUnpaid]] = await financePool.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total 
       FROM invoices WHERE JSON_EXTRACT(status, '$.value') = 1 
       AND invoice_date BETWEEN ? AND ?`,
      [lastMonthStart, lastMonthEnd]
    );
    
    const [[lastMonthPaid]] = await financePool.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total 
       FROM invoices WHERE JSON_EXTRACT(status, '$.value') = 2 
       AND invoice_date BETWEEN ? AND ?`,
      [lastMonthStart, lastMonthEnd]
    );

    res.json({
      this_month_payments: thisMonthPayments.count || 0,
      last_month_payments: lastMonthPayments.count || 0,
      sum_this_month_payments: Number(thisMonthPayments.total || 0).toFixed(2),
      sum_last_month_payments: Number(lastMonthPayments.total || 0).toFixed(2),
      this_month_unpaid_invoices: thisMonthUnpaid.count || 0,
      this_month_paid_invoices: thisMonthPaid.count || 0,
      last_month_unpaid_invoices: lastMonthUnpaid.count || 0,
      last_month_paid_invoices: lastMonthPaid.count || 0,
      sum_this_month_unpaid_invoices: Number(thisMonthUnpaid.total || 0).toFixed(2),
      sum_this_month_paid_invoices: Number(thisMonthPaid.total || 0).toFixed(2),
      sum_last_month_unpaid_invoices: Number(lastMonthUnpaid.total || 0).toFixed(2),
      sum_last_month_paid_invoices: Number(lastMonthPaid.total || 0).toFixed(2)
    });

  } catch (err) {
    console.error('Finance dashboard stats error:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// ============================================
// GET /api/finance/overview
// Ops cockpit: today / MTD collections, unpaid-active risk, recent feed
// ============================================
function periodTotals(mpesaRow, manualRow) {
  const mpesaAmount = parseFloat(mpesaRow?.amount || 0);
  const mpesaCount = parseInt(mpesaRow?.count || 0, 10);
  const manualAmount = parseFloat(manualRow?.amount || 0);
  const manualCount = parseInt(manualRow?.count || 0, 10);
  return {
    mpesa: { amount: mpesaAmount, count: mpesaCount },
    manual: { amount: manualAmount, count: manualCount },
    total: mpesaAmount + manualAmount,
    count: mpesaCount + manualCount,
  };
}

async function collectionsForDate(dateStr) {
  const [[mpesa]] = await financePool.query(
    `SELECT COUNT(*) as count, COALESCE(SUM(TransAmount), 0) as amount
     FROM mpesa WHERE DATE(TransTime) = ?`,
    [dateStr]
  );
  const [[manual]] = await trackerPool.query(
    `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as amount
     FROM manual_payments WHERE payment_date = ?`,
    [dateStr]
  );
  return periodTotals(mpesa, manual);
}

async function collectionsForRange(startDate, endDate) {
  const [[mpesa]] = await financePool.query(
    `SELECT COUNT(*) as count, COALESCE(SUM(TransAmount), 0) as amount
     FROM mpesa WHERE DATE(TransTime) BETWEEN ? AND ?`,
    [startDate, endDate]
  );
  const [[manual]] = await trackerPool.query(
    `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as amount
     FROM manual_payments WHERE payment_date BETWEEN ? AND ?`,
    [startDate, endDate]
  );
  return periodTotals(mpesa, manual);
}

router.get('/overview', async (req, res) => {
  try {
    const now = new Date();
    const today = todayLocal();
    const yesterday = daysAgoLocal(1);

    const mtdStart = localDate(new Date(now.getFullYear(), now.getMonth(), 1));
    // Same day-of-month last month (clamp to last day of that month)
    const lastMonthDay = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    const lastMonthEndClamp = new Date(now.getFullYear(), now.getMonth(), 0);
    if (lastMonthDay > lastMonthEndClamp) lastMonthDay.setTime(lastMonthEndClamp.getTime());
    const lastMonthToDateEnd = localDate(lastMonthDay);
    const lastMonthStart = localDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));

    const [todayStats, yesterdayStats, mtdStats, lastMonthToDateStats] = await Promise.all([
      collectionsForDate(today),
      collectionsForDate(yesterday),
      collectionsForRange(mtdStart, today),
      collectionsForRange(lastMonthStart, lastMonthToDateEnd),
    ]);

    const [[activeUnpaid]] = await financePool.query(
      `SELECT COUNT(*) as count,
              COALESCE(SUM(s.price), 0) as planValue,
              SUM(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(s.billing_type, '$.label')) LIKE 'Prepaid%' THEN 1 ELSE 0 END) as prepaid,
              SUM(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(s.billing_type, '$.label')) LIKE 'Recurring%' THEN 1 ELSE 0 END) as recurring
       FROM services s
       INNER JOIN (
         SELECT customer_id, MAX(bill_to) as max_bill
         FROM services
         WHERE deleted_at IS NULL
         GROUP BY customer_id
       ) latest ON s.customer_id = latest.customer_id AND s.bill_to = latest.max_bill
       INNER JOIN customers c ON c.id = s.customer_id AND c.deleted_at IS NULL
       WHERE JSON_UNQUOTE(JSON_EXTRACT(s.status, '$.label')) = 'Active'
       AND s.deleted_at IS NULL
       AND s.bill_to < CURDATE()`
    );

    const [recentMpesa] = await financePool.query(
      `SELECT
         id,
         TransID as ref,
         TransAmount as amount,
         MSISDN as phone,
         BillRefNumber as accountRef,
         TRIM(CONCAT(IFNULL(FirstName,''), ' ', IFNULL(MiddleName,''), ' ', IFNULL(LastName,''))) as name,
         TransTime as occurredAt
       FROM mpesa
       ORDER BY TransTime DESC
       LIMIT 20`
    );

    const [recentManual] = await trackerPool.query(
      `SELECT
         id,
         COALESCE(reference_number, CONCAT('MAN-', id)) as ref,
         amount,
         payer_name as name,
         payment_method as method,
         payment_date as occurredAt,
         created_at as createdAt
       FROM manual_payments
       ORDER BY payment_date DESC, id DESC
       LIMIT 20`
    );

    const recent = [
      ...recentMpesa.map((r) => ({
        id: `mpesa-${r.id}`,
        source: 'mpesa',
        ref: r.ref,
        amount: parseFloat(r.amount || 0),
        phone: r.phone || null,
        name: (r.name || '').trim() || r.accountRef || 'M-Pesa',
        method: 'M-Pesa',
        occurredAt: r.occurredAt,
      })),
      ...recentManual.map((r) => ({
        id: `manual-${r.id}`,
        source: 'manual',
        ref: r.ref,
        amount: parseFloat(r.amount || 0),
        phone: null,
        name: r.name || 'Manual payment',
        method: r.method || 'Manual',
        occurredAt: r.createdAt || r.occurredAt,
      })),
    ]
      .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt))
      .slice(0, 15);

    const mtdTotal = mtdStats.total;
    const lastTotal = lastMonthToDateStats.total;
    const momDeltaPct =
      lastTotal > 0 ? ((mtdTotal - lastTotal) / lastTotal) * 100 : mtdTotal > 0 ? 100 : 0;

    res.json({
      success: true,
      today: todayStats,
      yesterday: yesterdayStats,
      mtd: {
        ...mtdStats,
        startDate: mtdStart,
        endDate: today,
      },
      lastMonthToDate: {
        ...lastMonthToDateStats,
        startDate: lastMonthStart,
        endDate: lastMonthToDateEnd,
      },
      momDeltaPct: Math.round(momDeltaPct * 10) / 10,
      mix: {
        mpesa: mtdStats.mpesa.amount,
        manual: mtdStats.manual.amount,
      },
      activeUnpaid: {
        count: parseInt(activeUnpaid.count || 0, 10),
        planValue: parseFloat(activeUnpaid.planValue || 0),
        prepaid: parseInt(activeUnpaid.prepaid || 0, 10),
        recurring: parseInt(activeUnpaid.recurring || 0, 10),
      },
      recent,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Finance overview error:', err);
    res.status(500).json({ success: false, error: 'Database error: ' + err.message });
  }
});

// ============================================
// GET /api/finance/invoices
// List Invoices with Pagination and Filters
// ============================================
router.get('/invoices', async (req, res) => {
  try {
    const {
      q = '',
      status = '',
      start = '',
      end = '',
      page = 1,
      per_page = 10,
      sort = 'asc',
      sort_col = 'invoice_date'
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(per_page);
    const params = [];
    const whereConditions = [];

    // Search by customer name
    if (q) {
      whereConditions.push('customers.name LIKE ?');
      params.push(`%${q}%`);
    }

    // Filter by status
    if (status) {
      whereConditions.push("JSON_EXTRACT(invoices.status, '$.value') = ?");
      params.push(status);
    }

    // Date range filter
    if (start && end) {
      whereConditions.push('invoices.invoice_date BETWEEN ? AND ?');
      params.push(start, end);
    }

    const whereClause = whereConditions.length > 0 
      ? 'WHERE ' + whereConditions.join(' AND ') 
      : '';

    // Get total count
    const [countResult] = await financePool.query(
      `SELECT COUNT(*) as total 
       FROM invoices 
       LEFT JOIN services ON invoices.services_id = services.id 
       LEFT JOIN customers ON services.customer_id = customers.id 
       ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Validate sort column
    const validSortCols = ['id', 'invoice_date', 'due_date', 'total'];
    const orderBy = validSortCols.includes(sort_col) ? sort_col : 'invoice_date';
    const orderDir = sort.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    // Get paginated data
    const [invoices] = await financePool.query(
      `SELECT invoices.*, customers.name, customers.id as customer_id 
       FROM invoices 
       LEFT JOIN services ON invoices.services_id = services.id 
       LEFT JOIN customers ON services.customer_id = customers.id 
       ${whereClause} 
       ORDER BY invoices.${orderBy} ${orderDir} 
       LIMIT ? OFFSET ?`,
      [...params, parseInt(per_page), offset]
    );

    // Parse JSON status field
    const processedInvoices = invoices.map(invoice => ({
      ...invoice,
      status: typeof invoice.status === 'string' 
        ? JSON.parse(invoice.status) 
        : invoice.status
    }));

    res.json({
      page: parseInt(page),
      per_page: parseInt(per_page),
      total: total,
      total_pages: Math.ceil(total / parseInt(per_page)),
      data: processedInvoices
    });

  } catch (err) {
    console.error('List invoices error:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// ============================================
// GET /api/finance/invoices/:id
// View Single Invoice Details
// ============================================
router.get('/invoices/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [results] = await financePool.query(
      `SELECT invoices.*, customers.name as customer_name, customers.phone_number as customer_phone,
              customers.id as customer_id
       FROM invoices 
       LEFT JOIN services ON invoices.services_id = services.id 
       LEFT JOIN customers ON services.customer_id = customers.id 
       WHERE invoices.id = ?`,
      [id]
    );

    if (results.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = results[0];
    invoice.status = typeof invoice.status === 'string' 
      ? JSON.parse(invoice.status) 
      : invoice.status;

    res.json({ invoice });

  } catch (err) {
    console.error('View invoice error:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// ============================================
// DELETE /api/finance/invoices/:id
// Delete Invoice
// ============================================
router.delete('/invoices/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await financePool.query(
      'DELETE FROM invoices WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json({ message: 'Invoice deleted successfully' });

  } catch (err) {
    console.error('Delete invoice error:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// ============================================
// GET /api/finance/payments
// List Payments with Pagination and Filters
// ============================================
router.get('/payments', async (req, res) => {
  try {
    const {
      q = '',
      start = '',
      end = '',
      page = 1,
      per_page = 10,
      sort = 'asc',
      sort_col = 'date'
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(per_page);
    const params = [];
    const whereConditions = [];

    // Search by transaction ID, customer name, or phone
    if (q) {
      whereConditions.push('(payments.trans_id LIKE ? OR customers.name LIKE ? OR customers.phone_number LIKE ?)');
      const searchTerm = `%${q}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    // Date range filter
    if (start && end) {
      whereConditions.push('payments.date BETWEEN ? AND ?');
      params.push(start, end);
    }

    const whereClause = whereConditions.length > 0 
      ? 'WHERE ' + whereConditions.join(' AND ') 
      : '';

    // Get total count
    const [countResult] = await financePool.query(
      `SELECT COUNT(*) as total 
       FROM payments 
       LEFT JOIN customers ON payments.customer_id = customers.id 
       ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Validate sort column
    const validSortCols = ['id', 'date', 'sum', 'payment_type'];
    const orderBy = validSortCols.includes(sort_col) ? sort_col : 'date';
    const orderDir = sort.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    // Get paginated data
    const [payments] = await financePool.query(
      `SELECT payments.*, customers.name, customers.phone_number,
              CASE payments.payment_type 
                WHEN 'mpesa' THEN 'Mpesa'
                WHEN 'cash' THEN 'Cash'
                WHEN 'bank' THEN 'Bank Transfer'
                ELSE payments.payment_type 
              END as payment_type_label
       FROM payments 
       LEFT JOIN customers ON payments.customer_id = customers.id 
       ${whereClause} 
       ORDER BY payments.${orderBy} ${orderDir} 
       LIMIT ? OFFSET ?`,
      [...params, parseInt(per_page), offset]
    );

    res.json({
      page: parseInt(page),
      per_page: parseInt(per_page),
      total: total,
      total_pages: Math.ceil(total / parseInt(per_page)),
      data: payments
    });

  } catch (err) {
    console.error('List payments error:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// ============================================
// POST /api/finance/payments
// Add New Payment
// ============================================
router.post('/payments', async (req, res) => {
  try {
    const { invoice_id, customer_id, trans_id, payment_type, payment_date, sum } = req.body;

    if (!invoice_id || !customer_id || !sum) {
      return res.status(400).json({ error: 'Missing required fields: invoice_id, customer_id, sum' });
    }

    // Insert payment
    const [result] = await financePool.query(
      `INSERT INTO payments (invoice_id, customer_id, trans_id, payment_type, date, sum) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [invoice_id, customer_id, trans_id || null, payment_type || 'cash', payment_date || new Date(), sum]
    );

    // Update invoice status to paid
    await financePool.query(
      `UPDATE invoices SET status = JSON_SET(status, '$.value', 2, '$.label', 'Paid'), 
       payment_date = ? WHERE id = ?`,
      [payment_date || new Date(), invoice_id]
    );

    res.json({ 
      message: 'Payment recorded successfully', 
      error: false,
      payment_id: result.insertId 
    });

  } catch (err) {
    console.error('Add payment error:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// ============================================
// DELETE /api/finance/payments/:id
// Delete Payment
// ============================================
router.delete('/payments/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await financePool.query(
      'DELETE FROM payments WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json({ message: 'Payment deleted successfully' });

  } catch (err) {
    console.error('Delete payment error:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// ============================================
// GET /api/finance/mpesa
// List M-Pesa Transactions
// ============================================
router.get('/mpesa', async (req, res) => {
  try {
    const {
      q = '',
      start = '',
      end = '',
      page = 1,
      per_page = 10,
      sort = 'desc',
      sort_col = 'TransTime'
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(per_page);
    const params = [];
    const whereConditions = [];

    // Search (using actual column names from mpesa table)
    if (q) {
      whereConditions.push('(TransID LIKE ? OR FirstName LIKE ? OR MiddleName LIKE ? OR LastName LIKE ? OR BillRefNumber LIKE ? OR MSISDN LIKE ?)');
      const searchTerm = `%${q}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Date range filter
    if (start && end) {
      whereConditions.push('TransTime BETWEEN ? AND ?');
      params.push(start, end);
    }

    const whereClause = whereConditions.length > 0 
      ? 'WHERE ' + whereConditions.join(' AND ') 
      : '';

    // Get total count
    const [countResult] = await financePool.query(
      `SELECT COUNT(*) as total FROM mpesa ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Validate sort column
    const validSortCols = ['id', 'TransTime', 'TransAmount', 'TransID'];
    const orderBy = validSortCols.includes(sort_col) ? sort_col : 'TransTime';
    const orderDir = sort.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    // Get paginated data
    const [transactions] = await financePool.query(
      `SELECT * FROM mpesa 
       ${whereClause} 
       ORDER BY ${orderBy} ${orderDir} 
       LIMIT ? OFFSET ?`,
      [...params, parseInt(per_page), offset]
    );

    res.json({
      page: parseInt(page),
      per_page: parseInt(per_page),
      total: total,
      total_pages: Math.ceil(total / parseInt(per_page)),
      data: transactions
    });

  } catch (err) {
    console.error('List M-Pesa transactions error:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// ============================================
// DELETE /api/finance/mpesa/:id
// Delete M-Pesa Transaction
// ============================================
router.delete('/mpesa/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await financePool.query(
      'DELETE FROM mpesa WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'M-Pesa transaction not found' });
    }

    res.json({ message: 'M-Pesa transaction deleted successfully' });

  } catch (err) {
    console.error('Delete M-Pesa transaction error:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// ============================================
// BILL CHANGE TRACKER ENDPOINTS
// ============================================

// GET /api/finance/expired-accounts/today
// Get accounts that expired on a specific date (bill_to = selected date)
// Uses snapshot if available, otherwise shows live data
// Tracks if they've since renewed (bill_to extended beyond that date)
// ============================================
router.get('/expired-accounts/today', async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || todayLocal();
    const isToday = targetDate === todayLocal();
    
    // Check if we have a snapshot for this date
    const [snapshotCheck] = await trackerPool.query(
      'SELECT COUNT(*) as count FROM expired_accounts_snapshot WHERE snapshot_date = ?',
      [targetDate]
    );
    const snapshotExists = snapshotCheck[0].count > 0;

    let accounts = [];
    let summary = { total: 0, expired: 0, paid: 0, disabled: 0 };

    if (snapshotExists) {
      // === USE SNAPSHOT DATA ===
      // Get all accounts that were captured in the snapshot for this date
      const [snapshotAccounts] = await trackerPool.query(`
        SELECT 
          customer_id as customerId,
          service_id as serviceId,
          bill_to as originalBillTo,
          plan_name as planName,
          price,
          account_status as snapshotStatus
        FROM expired_accounts_snapshot
        WHERE snapshot_date = ?
      `, [targetDate]);

      // Get customer info and current bill_to from live data
      for (const snapAcc of snapshotAccounts) {
        const [[customer]] = await financePool.query(
          'SELECT name, phone_number as phone FROM customers WHERE id = ?',
          [snapAcc.customerId]
        );
        const [[currentService]] = await financePool.query(
          'SELECT bill_to, status as service_status FROM services WHERE id = ?',
          [snapAcc.serviceId]
        );

        const originalBillTo = new Date(snapAcc.originalBillTo);
        const currentBillTo = currentService?.bill_to ? new Date(currentService.bill_to) : originalBillTo;
        
        // Check if account is disabled (from snapshot or live status)
        const isDisabled = snapAcc.snapshotStatus === 'disabled' || 
          (currentService?.service_status && currentService.service_status.toString().includes('Disabled'));
        
        // If current bill_to > original bill_to, they paid/renewed
        const isPaid = !isDisabled && currentBillTo > originalBillTo;
        const status = isPaid ? 'paid' : isDisabled ? 'disabled' : 'expired';
        
        const daysOverdue = status === 'expired' 
          ? Math.max(0, Math.floor((new Date() - originalBillTo) / (1000*60*60*24)))
          : 0;

        // If paid, look up actual payment amount from payments table
        let actualPaidAmount = null;
        let paymentDate = null;
        let paymentMethod = null;
        
        if (isPaid) {
          // Find the most recent payment for this customer after the snapshot date
          const [[payment]] = await financePool.query(`
            SELECT sum, date, payment_type, created_at
            FROM payments
            WHERE customer_id = ?
              AND date >= ?
            ORDER BY created_at DESC
            LIMIT 1
          `, [snapAcc.customerId, targetDate]);
          
          if (payment) {
            actualPaidAmount = parseFloat(payment.sum);
            paymentDate = payment.created_at || payment.date;
            paymentMethod = payment.payment_type;
          }
        }

        summary.total++;
        summary[status]++;

        accounts.push({
          customerId: snapAcc.customerId,
          name: customer?.name || 'Unknown',
          phone: customer?.phone || '',
          serviceId: snapAcc.serviceId,
          planName: snapAcc.planName,
          price: snapAcc.price,
          originalBillTo: snapAcc.originalBillTo,
          currentBillTo: currentService?.bill_to || snapAcc.originalBillTo,
          status: status,
          daysOverdue: daysOverdue,
          newExpiryDate: isPaid ? currentService.bill_to : null,
          actualPaidAmount: actualPaidAmount,
          paymentDate: paymentDate,
          paymentMethod: paymentMethod
        });
      }

      // Sort: paid first, then by daysOverdue
      accounts.sort((a, b) => {
        if (a.status === 'paid' && b.status !== 'paid') return -1;
        if (a.status !== 'paid' && b.status === 'paid') return 1;
        return b.daysOverdue - a.daysOverdue;
      });

    } else {
      // === NO SNAPSHOT - USE LIVE DATA ===
      // Get accounts whose bill_to falls on the selected date
      // Disabled accounts expiring on this date will be classified by their service status
      const [liveAccounts] = await financePool.query(`
        SELECT 
          c.id as customerId,
          c.name,
          c.phone_number as phone,
          s.id as serviceId,
          s.bill_to as billTo,
          s.status as serviceStatus,
          p.price,
          p.title as planName
        FROM services s
        LEFT JOIN customers c ON s.customer_id = c.id
        LEFT JOIN plans p ON s.plan_id = p.id
        WHERE DATE(s.bill_to) = ?
        ORDER BY s.bill_to ASC
      `, [targetDate]);

      for (const acc of liveAccounts) {
        const billDate = new Date(acc.billTo);
        const today = new Date();
        
        // Check if account is disabled
        const isDisabled = acc.serviceStatus && acc.serviceStatus.toString().includes('Disabled');
        
        // If bill_to is in the future, they're active (paid)
        // If bill_to is in the past, they're expired
        // If disabled, mark as disabled
        const status = isDisabled ? 'disabled' : billDate >= today ? 'paid' : 'expired';
        const daysOverdue = (status === 'expired' || status === 'disabled')
          ? Math.max(0, Math.floor((today - billDate) / (1000*60*60*24)))
          : 0;

        summary.total++;
        summary[status]++;

        accounts.push({
          customerId: acc.customerId,
          name: acc.name || 'Unknown',
          phone: acc.phone || '',
          serviceId: acc.serviceId,
          planName: acc.planName,
          price: acc.price,
          originalBillTo: acc.billTo,
          currentBillTo: acc.billTo,
          status: status,
          daysOverdue: daysOverdue,
          newExpiryDate: null
        });
      }
    }

    res.json({
      success: true,
      date: targetDate,
      snapshotExists: snapshotExists,
      isToday: isToday,
      accounts: accounts,
      summary: summary,
      message: !snapshotExists && isToday 
        ? 'No snapshot yet. Click "Take Snapshot" to start tracking today\'s expiring accounts.'
        : !snapshotExists 
          ? `No snapshot was taken for ${targetDate}`
          : null,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('Expired accounts error:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// POST /api/finance/expired-accounts/snapshot
// Take a snapshot of accounts expiring today (bill_to = today)
// ============================================
router.post('/expired-accounts/snapshot', async (req, res) => {
  try {
    const today = todayLocal();

    // Check if snapshot already exists for today
    const [existing] = await trackerPool.query(
      'SELECT COUNT(*) as count FROM expired_accounts_snapshot WHERE snapshot_date = ?',
      [today]
    );
    
    if (existing[0].count > 0) {
      return res.json({
        success: false,
        date: today,
        message: `Snapshot already exists for ${today} with ${existing[0].count} accounts`,
        accountsCaptured: existing[0].count,
        timestamp: new Date().toISOString()
      });
    }

    // Get accounts expiring TODAY (bill_to = today) from remote database
    // Also includes disabled accounts that expire today — classified by service status
    const [expiringAccounts] = await financePool.query(`
      SELECT 
        c.id as customer_id,
        c.name,
        c.phone_number as phone,
        s.id as service_id,
        s.bill_to,
        s.status as service_status,
        p.title as plan_name,
        p.price
      FROM services s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN plans p ON s.plan_id = p.id
      WHERE DATE(s.bill_to) = CURDATE()
    `);

    // Insert into local snapshot table
    let inserted = 0;
    for (const acc of expiringAccounts) {
      try {
        const isDisabled = acc.service_status && acc.service_status.toString().includes('Disabled');
        const accountStatus = isDisabled ? 'disabled' : 'expired';
        await trackerPool.query(`
          INSERT INTO expired_accounts_snapshot 
          (snapshot_date, customer_id, service_id, bill_to, days_overdue, price, plan_name, account_status)
          VALUES (?, ?, ?, ?, 0, ?, ?, ?)
        `, [today, acc.customer_id, acc.service_id, acc.bill_to, acc.price, acc.plan_name, accountStatus]);
        inserted++;
      } catch (e) {
        // Duplicate entry, skip
      }
    }

    res.json({
      success: true,
      date: today,
      message: `Snapshot taken: ${inserted} accounts expiring today captured`,
      accountsCaptured: inserted,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('Snapshot error:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// POST /api/finance/expired-accounts/sync-changes
// Check for billing date changes and mark accounts as paid
// ============================================
router.post('/expired-accounts/sync-changes', async (req, res) => {
  try {
    const today = todayLocal();

    // Get today's snapshot accounts
    const [snapshotAccounts] = await trackerPool.query(`
      SELECT eas.customer_id, eas.service_id, eas.bill_to as original_bill_to
      FROM expired_accounts_snapshot eas
      LEFT JOIN expired_accounts_tracker eat 
        ON eas.customer_id = eat.customer_id AND eas.service_id = eat.service_id
      WHERE eas.snapshot_date = ?
        AND (eat.status IS NULL OR eat.status = 'unpaid')
    `, [today]);

    // Get live billing dates from remote
    const serviceIds = snapshotAccounts.map(a => a.service_id);
    if (serviceIds.length === 0) {
      return res.json({
        success: true,
        date: today,
        message: 'No accounts to sync',
        summary: { checked: 0, paidDetected: 0, stillExpired: 0 },
        syncedAt: new Date().toISOString()
      });
    }

    const [liveServices] = await financePool.query(
      `SELECT id, bill_to FROM services WHERE id IN (?)`,
      [serviceIds]
    );
    const liveBillDates = liveServices.reduce((m, s) => { m[s.id] = s.bill_to; return m; }, {});

    let paidCount = 0;
    const paidAccounts = [];

    // Check each account for billing extension
    for (const acc of snapshotAccounts) {
      const liveBillTo = liveBillDates[acc.service_id];
      
      if (liveBillTo && new Date(liveBillTo) > new Date(acc.original_bill_to)) {
        // Billing date extended = customer paid!
        await trackerPool.query(`
          INSERT INTO expired_accounts_tracker 
          (customer_id, service_id, paid_date, next_bill_date, status)
          VALUES (?, ?, NOW(), ?, 'paid')
          ON DUPLICATE KEY UPDATE 
            paid_date = NOW(), 
            next_bill_date = VALUES(next_bill_date), 
            status = 'paid'
        `, [acc.customer_id, acc.service_id, liveBillTo]);
        
        paidCount++;
        paidAccounts.push({
          customerId: acc.customer_id,
          serviceId: acc.service_id,
          originalBillTo: acc.original_bill_to,
          newBillTo: liveBillTo
        });
      }
    }

    res.json({
      success: true,
      date: today,
      message: `Sync complete: ${paidCount} accounts marked as paid`,
      summary: {
        checked: snapshotAccounts.length,
        paidDetected: paidCount,
        stillExpired: snapshotAccounts.length - paidCount
      },
      paidAccounts: paidAccounts,
      syncedAt: new Date().toISOString()
    });

  } catch (err) {
    console.error('Sync changes error:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// GET /api/finance/expired-accounts/activity
// Get today's payment activity (who paid)
// ============================================
router.get('/expired-accounts/activity', async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || todayLocal();

    // Get accounts that were marked as paid
    const [trackerData] = await trackerPool.query(`
      SELECT 
        eat.customer_id,
        eat.service_id,
        eat.paid_date,
        eat.next_bill_date,
        eas.price,
        eas.plan_name,
        eas.days_overdue
      FROM expired_accounts_tracker eat
      INNER JOIN expired_accounts_snapshot eas 
        ON eat.customer_id = eas.customer_id 
        AND eat.service_id = eas.service_id
        AND eas.snapshot_date = ?
      WHERE eat.status = 'paid'
      ORDER BY eat.paid_date DESC
    `, [targetDate]);

    // Get customer names from remote
    const customerIds = [...new Set(trackerData.map(a => a.customer_id))];
    let customerMap = {};
    
    if (customerIds.length > 0) {
      const [customers] = await financePool.query(
        `SELECT id, name, phone_number as phone FROM customers WHERE id IN (?)`,
        [customerIds]
      );
      customerMap = customers.reduce((m, c) => { m[c.id] = c; return m; }, {});
    }

    const activity = trackerData.map(a => ({
      customerId: a.customer_id,
      customerName: customerMap[a.customer_id]?.name || 'Unknown',
      phone: customerMap[a.customer_id]?.phone || '',
      serviceId: a.service_id,
      planName: a.plan_name,
      price: a.price,
      paidAt: a.paid_date,
      newExpiryDate: a.next_bill_date,
      daysOverdue: a.days_overdue
    }));

    res.json({
      success: true,
      date: targetDate,
      activity: activity,
      count: activity.length,
      totalCollected: activity.reduce((sum, a) => sum + (parseFloat(a.price) || 0), 0),
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('Activity error:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// GET /api/finance/expired-accounts/history
// Get history of expiry dates (grouped by bill_to date)
// ============================================
router.get('/expired-accounts/history', async (req, res) => {
  try {
    const { start, end } = req.query;
    const startDate = start || daysAgoLocal(30);
    const endDate = end || todayLocal();

    // Get snapshot dates from our tracker database
    const [snapshotDates] = await trackerPool.query(`
      SELECT 
        DATE_FORMAT(snapshot_date, '%Y-%m-%d') as date,
        COUNT(*) as total
      FROM expired_accounts_snapshot
      WHERE snapshot_date BETWEEN ? AND ?
      GROUP BY snapshot_date
      ORDER BY snapshot_date DESC
    `, [startDate, endDate]);

    // For each snapshot date, calculate paid vs expired by comparing to live data
    const history = [];
    for (const snap of snapshotDates) {
      const snapDate = snap.date;

      // Get service IDs and customer IDs from snapshot
      const [snapServices] = await trackerPool.query(
        'SELECT service_id, customer_id, bill_to, price FROM expired_accounts_snapshot WHERE snapshot_date = ?',
        [snapDate]
      );

      if (snapServices.length === 0) continue;

      // Get current bill_to for these services
      const serviceIds = snapServices.map(s => s.service_id);
      const [liveServices] = await financePool.query(
        'SELECT id, bill_to FROM services WHERE id IN (?)',
        [serviceIds]
      );
      const liveBillMap = liveServices.reduce((m, s) => { m[s.id] = s.bill_to; return m; }, {});

      let paid = 0;
      let expired = 0;
      let amountCollected = 0;

      for (const snapSvc of snapServices) {
        const originalBillTo = new Date(snapSvc.bill_to);
        const liveBillTo = liveBillMap[snapSvc.service_id] 
          ? new Date(liveBillMap[snapSvc.service_id])
          : originalBillTo;

        if (liveBillTo > originalBillTo) {
          paid++;
          // Query actual payment amount from payments table
          try {
            const [[payment]] = await financePool.query(`
              SELECT sum FROM payments 
              WHERE customer_id = ? AND date >= ? 
              ORDER BY created_at DESC LIMIT 1
            `, [snapSvc.customer_id, snapDate]);
            
            if (payment && payment.sum) {
              amountCollected += parseFloat(payment.sum);
            } else {
              // Fallback to plan price if no payment found
              amountCollected += parseFloat(snapSvc.price || 0);
            }
          } catch (e) {
            // Fallback to plan price on error
            amountCollected += parseFloat(snapSvc.price || 0);
          }
        } else {
          expired++;
        }
      }

      history.push({
        date: snapDate,
        total: snap.total,
        paid: paid,
        expired: expired,
        amountCollected: amountCollected.toFixed(2),
        hasSnapshot: true
      });
    }

    res.json({
      success: true,
      startDate: startDate,
      endDate: endDate,
      history: history,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('History error:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// GET /api/finance/expired-accounts/history/:date
// Get snapshot for a specific date
// ============================================
router.get('/expired-accounts/history/:date', async (req, res) => {
  try {
    const { date } = req.params;

    // Get snapshot accounts
    const [snapshotAccounts] = await trackerPool.query(`
      SELECT 
        eas.id,
        eas.customer_id,
        eas.service_id,
        eas.bill_to as originalBillTo,
        eas.days_overdue,
        eas.price,
        eas.plan_name,
        eas.account_status as snapshotStatus,
        eat.status as trackerStatus,
        eat.next_bill_date,
        eat.paid_date
      FROM expired_accounts_snapshot eas
      LEFT JOIN expired_accounts_tracker eat 
        ON eas.customer_id = eat.customer_id AND eas.service_id = eat.service_id
      WHERE eas.snapshot_date = ?
      ORDER BY eat.status ASC, eas.days_overdue DESC
    `, [date]);

    // Get customer names from remote
    const customerIds = [...new Set(snapshotAccounts.map(a => a.customer_id))];
    let customerMap = {};
    
    if (customerIds.length > 0) {
      const [customers] = await financePool.query(
        `SELECT id, name, phone_number as phone FROM customers WHERE id IN (?)`,
        [customerIds]
      );
      customerMap = customers.reduce((m, c) => { m[c.id] = c; return m; }, {});
    }

    const summary = { total: snapshotAccounts.length, expired: 0, paid: 0, disabled: 0 };
    const accounts = snapshotAccounts.map(a => {
      const status = a.trackerStatus === 'paid' ? 'paid' : a.snapshotStatus === 'disabled' ? 'disabled' : 'expired';
      summary[status]++;
      
      return {
        id: a.id,
        customerId: a.customer_id,
        name: customerMap[a.customer_id]?.name || 'Unknown',
        phone: customerMap[a.customer_id]?.phone || '',
        serviceId: a.service_id,
        planName: a.plan_name,
        price: a.price,
        originalBillTo: a.originalBillTo,
        currentBillTo: a.next_bill_date || a.originalBillTo,
        status: status,
        daysOverdue: a.days_overdue,
        paidAt: a.paid_date,
        newExpiryDate: a.next_bill_date
      };
    });

    res.json({
      success: true,
      date: date,
      accounts: accounts,
      summary: summary,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('History date error:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// ============================================
// M-PESA TRACKER ENDPOINTS
// ============================================

// GET /api/finance/mpesa/today
// Get today's M-Pesa transactions summary and list
// ============================================
router.get('/mpesa/today', async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || todayLocal();
    
    // Get total count and amount for the day
    const [[summary]] = await financePool.query(`
      SELECT 
        COUNT(*) as totalTransactions,
        COALESCE(SUM(TransAmount), 0) as totalAmount,
        COUNT(CASE WHEN status = 2 THEN 1 END) as processedCount,
        COUNT(CASE WHEN status = 0 THEN 1 END) as pendingCount,
        COUNT(CASE WHEN status = 3 THEN 1 END) as failedCount
      FROM mpesa 
      WHERE DATE(TransTime) = ?
    `, [targetDate]);

    // Get transactions list
    const [transactions] = await financePool.query(`
      SELECT 
        id,
        TransID as transId,
        TransTime as transTime,
        TransAmount as amount,
        BillRefNumber as accountRef,
        FirstName as firstName,
        MiddleName as middleName,
        LastName as lastName,
        MSISDN as phone,
        status,
        OrgAccountBalance as balance,
        created_at as createdAt
      FROM mpesa 
      WHERE DATE(TransTime) = ?
      ORDER BY TransTime DESC
    `, [targetDate]);

    // Get hourly breakdown
    const [hourlyBreakdown] = await financePool.query(`
      SELECT 
        HOUR(TransTime) as hour,
        COUNT(*) as count,
        SUM(TransAmount) as amount
      FROM mpesa 
      WHERE DATE(TransTime) = ?
      GROUP BY HOUR(TransTime)
      ORDER BY hour
    `, [targetDate]);

    res.json({
      success: true,
      date: targetDate,
      summary: {
        totalTransactions: parseInt(summary.totalTransactions),
        totalAmount: parseFloat(summary.totalAmount),
        processedCount: parseInt(summary.processedCount),
        pendingCount: parseInt(summary.pendingCount),
        failedCount: parseInt(summary.failedCount)
      },
      hourlyBreakdown: hourlyBreakdown,
      transactions: transactions,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('M-Pesa today error:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// GET /api/finance/mpesa/history
// Get daily M-Pesa totals for date range
// ============================================
router.get('/mpesa/history', async (req, res) => {
  try {
    const { start, end, days } = req.query;
    
    let startDate, endDate;
    if (days) {
      endDate = todayLocal();
      startDate = daysAgoLocal(parseInt(days));
    } else {
      startDate = start || daysAgoLocal(30);
      endDate = end || todayLocal();
    }

    const [history] = await financePool.query(`
      SELECT 
        DATE(TransTime) as date,
        COUNT(*) as totalTransactions,
        SUM(TransAmount) as totalAmount,
        COUNT(CASE WHEN status = 2 THEN 1 END) as processedCount,
        COUNT(CASE WHEN status = 0 THEN 1 END) as pendingCount,
        COUNT(CASE WHEN status = 3 THEN 1 END) as failedCount,
        AVG(TransAmount) as avgAmount,
        MIN(TransAmount) as minAmount,
        MAX(TransAmount) as maxAmount
      FROM mpesa 
      WHERE DATE(TransTime) BETWEEN ? AND ?
      GROUP BY DATE(TransTime)
      ORDER BY date DESC
    `, [startDate, endDate]);

    // Get overall summary for the period
    const [[periodSummary]] = await financePool.query(`
      SELECT 
        COUNT(*) as totalTransactions,
        SUM(TransAmount) as totalAmount,
        AVG(TransAmount) as avgAmount,
        COUNT(DISTINCT DATE(TransTime)) as daysWithTransactions
      FROM mpesa 
      WHERE DATE(TransTime) BETWEEN ? AND ?
    `, [startDate, endDate]);

    res.json({
      success: true,
      startDate: startDate,
      endDate: endDate,
      periodSummary: {
        totalTransactions: parseInt(periodSummary.totalTransactions),
        totalAmount: parseFloat(periodSummary.totalAmount || 0),
        avgAmount: parseFloat(periodSummary.avgAmount || 0),
        daysWithTransactions: parseInt(periodSummary.daysWithTransactions),
        avgDailyAmount: periodSummary.daysWithTransactions > 0 
          ? parseFloat(periodSummary.totalAmount / periodSummary.daysWithTransactions).toFixed(2)
          : 0
      },
      history: history.map(h => ({
        date: h.date instanceof Date ? h.date.toLocaleDateString('en-CA') : h.date,
        totalTransactions: parseInt(h.totalTransactions),
        totalAmount: parseFloat(h.totalAmount),
        processedCount: parseInt(h.processedCount),
        pendingCount: parseInt(h.pendingCount),
        failedCount: parseInt(h.failedCount),
        avgAmount: parseFloat(h.avgAmount || 0).toFixed(2),
        minAmount: parseFloat(h.minAmount || 0),
        maxAmount: parseFloat(h.maxAmount || 0)
      })),
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('M-Pesa history error:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// GET /api/finance/mpesa/stats
// Get M-Pesa statistics overview
// ============================================
router.get('/mpesa/stats', async (req, res) => {
  try {
    const now = new Date();
    const today = todayLocal();
    const yesterday = daysAgoLocal(1);
    const thisMonthStart = localDate(new Date(now.getFullYear(), now.getMonth(), 1));
    const lastMonthStart = localDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const lastMonthEnd = localDate(new Date(now.getFullYear(), now.getMonth(), 0));

    // Today's stats
    const [[todayStats]] = await financePool.query(`
      SELECT COUNT(*) as cnt, COALESCE(SUM(TransAmount), 0) as amt 
      FROM mpesa WHERE DATE(TransTime) = ?
    `, [today]);

    // Yesterday's stats
    const [[yesterdayStats]] = await financePool.query(`
      SELECT COUNT(*) as cnt, COALESCE(SUM(TransAmount), 0) as amt 
      FROM mpesa WHERE DATE(TransTime) = ?
    `, [yesterday]);

    // This month
    const [[thisMonthStats]] = await financePool.query(`
      SELECT COUNT(*) as cnt, COALESCE(SUM(TransAmount), 0) as amt 
      FROM mpesa WHERE DATE(TransTime) >= ?
    `, [thisMonthStart]);

    // Last month
    const [[lastMonthStats]] = await financePool.query(`
      SELECT COUNT(*) as cnt, COALESCE(SUM(TransAmount), 0) as amt 
      FROM mpesa WHERE DATE(TransTime) BETWEEN ? AND ?
    `, [lastMonthStart, lastMonthEnd]);

    // All time
    const [[allTimeStats]] = await financePool.query(`
      SELECT COUNT(*) as cnt, COALESCE(SUM(TransAmount), 0) as amt,
             MIN(DATE(TransTime)) as firstDate
      FROM mpesa
    `);

    res.json({
      success: true,
      today: {
        count: parseInt(todayStats.cnt),
        amount: parseFloat(todayStats.amt)
      },
      yesterday: {
        count: parseInt(yesterdayStats.cnt),
        amount: parseFloat(yesterdayStats.amt)
      },
      thisMonth: {
        count: parseInt(thisMonthStats.cnt),
        amount: parseFloat(thisMonthStats.amt)
      },
      lastMonth: {
        count: parseInt(lastMonthStats.cnt),
        amount: parseFloat(lastMonthStats.amt)
      },
      allTime: {
        count: parseInt(allTimeStats.cnt),
        amount: parseFloat(allTimeStats.amt),
        since: allTimeStats.firstDate
      },
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('M-Pesa stats error:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// ============================================
// GET /api/finance/mpesa/monthly
// Get monthly M-Pesa totals (calendar months)
// ============================================
router.get('/mpesa/monthly', async (req, res) => {
  try {
    const { year } = req.query;
    const filterYear = year ? parseInt(year) : null;

    let query, params;
    if (filterYear) {
      query = `
        SELECT 
          YEAR(TransTime) as year,
          MONTH(TransTime) as month,
          COUNT(*) as totalTransactions,
          SUM(TransAmount) as totalAmount,
          COUNT(CASE WHEN status = 2 THEN 1 END) as processedCount,
          COUNT(CASE WHEN status = 0 THEN 1 END) as pendingCount,
          COUNT(CASE WHEN status = 3 THEN 1 END) as failedCount
        FROM mpesa 
        WHERE YEAR(TransTime) = ?
        GROUP BY YEAR(TransTime), MONTH(TransTime)
        ORDER BY year DESC, month DESC
      `;
      params = [filterYear];
    } else {
      query = `
        SELECT 
          YEAR(TransTime) as year,
          MONTH(TransTime) as month,
          COUNT(*) as totalTransactions,
          SUM(TransAmount) as totalAmount,
          COUNT(CASE WHEN status = 2 THEN 1 END) as processedCount,
          COUNT(CASE WHEN status = 0 THEN 1 END) as pendingCount,
          COUNT(CASE WHEN status = 3 THEN 1 END) as failedCount
        FROM mpesa 
        GROUP BY YEAR(TransTime), MONTH(TransTime)
        ORDER BY year DESC, month DESC
      `;
      params = [];
    }

    const [months] = await financePool.query(query, params);

    // Get available years
    const [years] = await financePool.query(`
      SELECT DISTINCT YEAR(TransTime) as year FROM mpesa ORDER BY year DESC
    `);

    const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
                         'July', 'August', 'September', 'October', 'November', 'December'];

    res.json({
      success: true,
      availableYears: years.map(y => y.year),
      months: months.map(m => ({
        year: m.year,
        month: m.month,
        monthName: monthNames[m.month],
        totalTransactions: parseInt(m.totalTransactions),
        totalAmount: parseFloat(m.totalAmount),
        processedCount: parseInt(m.processedCount),
        pendingCount: parseInt(m.pendingCount),
        failedCount: parseInt(m.failedCount)
      })),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('M-Pesa monthly error:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// ============================================
// New Customer Tracker
// ============================================
// Identifies new customers by the welcome SMS they receive
// Joins with payments to show how much they paid

// GET /api/finance/new-customers?date=YYYY-MM-DD&start=&end=
router.get('/new-customers', async (req, res) => {
  try {
    const { date, start, end } = req.query;
    
    let dateFilter;
    let params = [];
    
    if (start && end) {
      dateFilter = 'DATE(md.created_at) BETWEEN ? AND ?';
      params = [start, end];
    } else if (date) {
      dateFilter = 'DATE(md.created_at) = ?';
      params = [date];
    } else {
      // Default to today
      dateFilter = 'DATE(md.created_at) = CURDATE()';
    }

    const [customers] = await financePool.query(`
      SELECT 
        md.customer_id,
        c.name,
        c.phone_number as phone,
        MIN(md.created_at) as joined_date,
        MAX(p.title) as plan_name,
        MAX(p.price) as plan_price,
        MAX(s.id) as service_id,
        MAX(s.bill_to) as bill_to,
        (SELECT SUM(pay.sum) FROM payments pay WHERE pay.customer_id = md.customer_id) as total_paid,
        (SELECT pay.sum FROM payments pay WHERE pay.customer_id = md.customer_id ORDER BY pay.created_at ASC LIMIT 1) as first_payment,
        (SELECT pay.date FROM payments pay WHERE pay.customer_id = md.customer_id ORDER BY pay.created_at ASC LIMIT 1) as first_payment_date,
        (SELECT pay.payment_type FROM payments pay WHERE pay.customer_id = md.customer_id ORDER BY pay.created_at ASC LIMIT 1) as payment_method
      FROM message_details md
      JOIN customers c ON c.id = md.customer_id
      LEFT JOIN services s ON s.customer_id = c.id
      LEFT JOIN plans p ON s.plan_id = p.id
      WHERE md.message LIKE '%Welcome to the best internet%'
        AND md.deleted_at IS NULL
        AND ${dateFilter}
      GROUP BY md.customer_id, c.name, c.phone_number
      ORDER BY MIN(md.created_at) DESC
    `, params);

    // Get summary stats
    const [[todayCount]] = await financePool.query(`
      SELECT COUNT(DISTINCT customer_id) as cnt
      FROM message_details
      WHERE message LIKE '%Welcome to the best internet%'
        AND deleted_at IS NULL
        AND DATE(created_at) = CURDATE()
    `);

    const [[weekCount]] = await financePool.query(`
      SELECT COUNT(DISTINCT customer_id) as cnt
      FROM message_details
      WHERE message LIKE '%Welcome to the best internet%'
        AND deleted_at IS NULL
        AND DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL (WEEKDAY(CURDATE())) DAY)
    `);

    const [[monthCount]] = await financePool.query(`
      SELECT COUNT(DISTINCT customer_id) as cnt
      FROM message_details
      WHERE message LIKE '%Welcome to the best internet%'
        AND deleted_at IS NULL
        AND DATE(created_at) >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
    `);

    const totalPaid = customers.reduce((sum, c) => sum + (parseFloat(c.first_payment) || 0), 0);

    res.json({
      success: true,
      customers,
      summary: {
        total: customers.length,
        totalPaid,
        today: parseInt(todayCount.cnt),
        thisWeek: parseInt(weekCount.cnt),
        thisMonth: parseInt(monthCount.cnt)
      },
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('New customers error:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// GET /api/finance/new-customers/daily-summary
// Returns count of new customers per day for the chart/history
router.get('/new-customers/daily-summary', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    
    const [rows] = await financePool.query(`
      SELECT 
        DATE_FORMAT(md.created_at, '%Y-%m-%d') as date,
        COUNT(DISTINCT md.customer_id) as count,
        COALESCE(SUM(
          (SELECT pay.sum FROM payments pay WHERE pay.customer_id = md.customer_id ORDER BY pay.created_at ASC LIMIT 1)
        ), 0) as total_first_payments
      FROM message_details md
      WHERE md.message LIKE '%Welcome to the best internet%'
        AND md.deleted_at IS NULL
        AND md.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE_FORMAT(md.created_at, '%Y-%m-%d')
      ORDER BY date DESC
    `, [days]);

    res.json({
      success: true,
      history: rows,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('New customers daily summary error:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// ============================================
// Health Check
// ============================================
router.get('/health', async (req, res) => {
  try {
    await financePool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: 'error', database: 'disconnected', error: err.message });
  }
});

// ============================================
// MANUAL PAYMENTS (Cheques, Bank Transfers, Cash, etc.)
// Uses trackerPool → tcom_app.manual_payments
// ============================================

// GET /api/finance/manual-payments/stats — Summary stats for cards
router.get('/manual-payments/stats', async (req, res) => {
  try {
    const now = new Date();
    const today = todayLocal();
    const thisMonthStart = localDate(new Date(now.getFullYear(), now.getMonth(), 1));
    const thisYearStart = `${now.getFullYear()}-01-01`;

    const [[todayStats]] = await trackerPool.query(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(amount),0) as amt FROM manual_payments WHERE payment_date = ?`, [today]
    );
    const [[monthStats]] = await trackerPool.query(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(amount),0) as amt FROM manual_payments WHERE payment_date >= ?`, [thisMonthStart]
    );
    const [[yearStats]] = await trackerPool.query(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(amount),0) as amt FROM manual_payments WHERE payment_date >= ?`, [thisYearStart]
    );
    const [[allStats]] = await trackerPool.query(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(amount),0) as amt FROM manual_payments`
    );

    res.json({
      success: true,
      today: { count: parseInt(todayStats.cnt), amount: parseFloat(todayStats.amt) },
      thisMonth: { count: parseInt(monthStats.cnt), amount: parseFloat(monthStats.amt) },
      thisYear: { count: parseInt(yearStats.cnt), amount: parseFloat(yearStats.amt) },
      allTime: { count: parseInt(allStats.cnt), amount: parseFloat(allStats.amt) },
    });
  } catch (err) {
    console.error('Manual payments stats error:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// GET /api/finance/manual-payments — List with filters
router.get('/manual-payments', async (req, res) => {
  try {
    const { start, end, method, page = 1, per_page = 50 } = req.query;
    const conditions = [];
    const params = [];

    if (start) { conditions.push('payment_date >= ?'); params.push(start); }
    if (end) { conditions.push('payment_date <= ?'); params.push(end); }
    if (method) { conditions.push('payment_method = ?'); params.push(method); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const offset = (parseInt(page) - 1) * parseInt(per_page);

    const [[{ total }]] = await trackerPool.query(
      `SELECT COUNT(*) as total FROM manual_payments ${where}`, params
    );

    const [rows] = await trackerPool.query(
      `SELECT * FROM manual_payments ${where} ORDER BY payment_date DESC, created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(per_page), offset]
    );

    const [[summary]] = await trackerPool.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as totalAmount,
       COUNT(CASE WHEN payment_method = 'cheque' THEN 1 END) as chequeCount,
       COALESCE(SUM(CASE WHEN payment_method = 'cheque' THEN amount END), 0) as chequeAmount,
       COUNT(CASE WHEN payment_method = 'bank_transfer' THEN 1 END) as bankCount,
       COALESCE(SUM(CASE WHEN payment_method = 'bank_transfer' THEN amount END), 0) as bankAmount,
       COUNT(CASE WHEN payment_method = 'cash' THEN 1 END) as cashCount,
       COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN amount END), 0) as cashAmount,
       COUNT(CASE WHEN payment_method NOT IN ('cheque','bank_transfer','cash') THEN 1 END) as otherCount,
       COALESCE(SUM(CASE WHEN payment_method NOT IN ('cheque','bank_transfer','cash') THEN amount END), 0) as otherAmount
       FROM manual_payments ${where}`, params
    );

    res.json({
      success: true,
      payments: rows,
      summary: {
        count: parseInt(summary.count),
        totalAmount: parseFloat(summary.totalAmount),
        cheque: { count: parseInt(summary.chequeCount), amount: parseFloat(summary.chequeAmount) },
        bankTransfer: { count: parseInt(summary.bankCount), amount: parseFloat(summary.bankAmount) },
        cash: { count: parseInt(summary.cashCount), amount: parseFloat(summary.cashAmount) },
        other: { count: parseInt(summary.otherCount), amount: parseFloat(summary.otherAmount) },
      },
      pagination: { total, page: parseInt(page), per_page: parseInt(per_page), pages: Math.ceil(total / per_page) }
    });
  } catch (err) {
    console.error('Manual payments list error:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// POST /api/finance/manual-payments — Add a new payment
router.post('/manual-payments', async (req, res) => {
  try {
    const { payment_date, amount, payment_method, reference_number, payer_name, description, recorded_by } = req.body;
    if (!payment_date || !amount || !payer_name || !recorded_by) {
      return res.status(400).json({ error: 'payment_date, amount, payer_name, and recorded_by are required' });
    }
    if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }
    const validMethods = ['cheque', 'bank_transfer', 'cash', 'card', 'other'];
    const method = validMethods.includes(payment_method) ? payment_method : 'cheque';

    const [result] = await trackerPool.query(
      `INSERT INTO manual_payments (payment_date, amount, payment_method, reference_number, payer_name, description, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [payment_date, parseFloat(amount), method, reference_number || null, payer_name.trim(), description || null, recorded_by.trim()]
    );

    res.json({ success: true, id: result.insertId, message: 'Payment recorded successfully' });
  } catch (err) {
    console.error('Manual payment create error:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// PUT /api/finance/manual-payments/:id — Update a payment
router.put('/manual-payments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_date, amount, payment_method, reference_number, payer_name, description } = req.body;

    const [[existing]] = await trackerPool.query('SELECT id FROM manual_payments WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Payment not found' });

    const updates = [];
    const params = [];
    if (payment_date) { updates.push('payment_date = ?'); params.push(payment_date); }
    if (amount) { updates.push('amount = ?'); params.push(parseFloat(amount)); }
    if (payment_method) { updates.push('payment_method = ?'); params.push(payment_method); }
    if (reference_number !== undefined) { updates.push('reference_number = ?'); params.push(reference_number || null); }
    if (payer_name) { updates.push('payer_name = ?'); params.push(payer_name.trim()); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description || null); }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    params.push(id);
    await trackerPool.query(`UPDATE manual_payments SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ success: true, message: 'Payment updated' });
  } catch (err) {
    console.error('Manual payment update error:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// DELETE /api/finance/manual-payments/:id — Delete a payment
router.delete('/manual-payments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await trackerPool.query('DELETE FROM manual_payments WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Payment not found' });
    res.json({ success: true, message: 'Payment deleted' });
  } catch (err) {
    console.error('Manual payment delete error:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// ============================================
// FINANCIAL REPORT — Comprehensive revenue & customer report
// Combines M-Pesa + Manual Payments as real revenue, credit separate
// Supports daily, monthly, yearly views
// ============================================
router.get('/report/summary', async (req, res) => {
  try {
    const { period = 'monthly', date, month, year } = req.query;
    const now = new Date();

    let startDate, endDate, periodLabel;

    if (period === 'daily') {
      // Single day — defaults to today
      const d = date || todayLocal();
      startDate = d;
      endDate = d;
      periodLabel = d;
    } else if (period === 'monthly') {
      // Calendar month
      const y = parseInt(year) || now.getFullYear();
      const m = month !== undefined ? parseInt(month) : now.getMonth();
      startDate = localDate(new Date(y, m, 1));
      endDate = localDate(new Date(y, m + 1, 0));
      periodLabel = `${y}-${String(m + 1).padStart(2, '0')}`;
    } else if (period === 'yearly') {
      const y = parseInt(year) || now.getFullYear();
      startDate = `${y}-01-01`;
      endDate = `${y}-12-31`;
      periodLabel = `${y}`;
    } else {
      return res.status(400).json({ error: 'Invalid period. Use daily, monthly, or yearly.' });
    }

    // --- Revenue ---
    // M-Pesa revenue (financePool → tonycomm.mpesa)
    const [[mpesa]] = await financePool.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(TransAmount), 0) as amount
       FROM mpesa WHERE DATE(TransTime) BETWEEN ? AND ?`,
      [startDate, endDate]
    );

    // Manual payments (trackerPool → tcom_app.manual_payments)
    const [[manual]] = await trackerPool.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as amount
       FROM manual_payments WHERE payment_date BETWEEN ? AND ?`,
      [startDate, endDate]
    );

    // Manual payments breakdown by method
    const [manualByMethod] = await trackerPool.query(
      `SELECT payment_method, COUNT(*) as count, COALESCE(SUM(amount), 0) as amount
       FROM manual_payments WHERE payment_date BETWEEN ? AND ?
       GROUP BY payment_method ORDER BY amount DESC`,
      [startDate, endDate]
    );

    // --- Credit ---
    const [[credit]] = await financePool.query(
      `SELECT COALESCE(SUM(amount), 0) as totalCredit,
              COUNT(DISTINCT balanceable_id) as customerCount
       FROM balances WHERE balanceable_type = 'App\\\\Models\\\\Customer' AND amount > 0`
    );

    // Credits added in period
    const [[creditInPeriod]] = await financePool.query(
      `SELECT COALESCE(SUM(amount), 0) as amount, COUNT(*) as count
       FROM balances WHERE balanceable_type = 'App\\\\Models\\\\Customer' AND amount > 0
       AND DATE(created_at) BETWEEN ? AND ?`,
      [startDate, endDate]
    );

    // --- Customer and Service Status ---
    // Customers and services use soft deletes. Exclude both deleted records and
    // services belonging to a deleted customer so the report reflects live data.
    const [[customerTotals]] = await financePool.query(
      `SELECT COUNT(*) as count
       FROM customers
       WHERE deleted_at IS NULL`
    );

    const [statusRows] = await financePool.query(
      `SELECT JSON_UNQUOTE(JSON_EXTRACT(s.status, '$.label')) as status_label,
              COUNT(*) as count,
              SUM(CASE WHEN s.bill_to < CURDATE() THEN 1 ELSE 0 END) as behind_bill
       FROM services s
       INNER JOIN customers c ON c.id = s.customer_id AND c.deleted_at IS NULL
       WHERE s.deleted_at IS NULL
       GROUP BY status_label`
    );

    const statusMap = {};
    let totalServices = 0;
    for (const row of statusRows) {
      // Disabled and Expired both mean expired
      const label = row.status_label === 'Disabled' ? 'Expired' : row.status_label;
      if (!statusMap[label]) {
        statusMap[label] = { count: 0, behindBill: 0 };
      }
      statusMap[label].count += parseInt(row.count);
      statusMap[label].behindBill += parseInt(row.behind_bill);
      totalServices += parseInt(row.count);
    }

    // --- Active But Unpaid (status=Active + bill_to < today, latest service per customer only) ---
    const [[activeUnpaid]] = await financePool.query(
      `SELECT COUNT(*) as count,
              SUM(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(s.billing_type, '$.label')) LIKE 'Prepaid%' THEN 1 ELSE 0 END) as prepaid,
              SUM(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(s.billing_type, '$.label')) LIKE 'Recurring%' THEN 1 ELSE 0 END) as recurring
       FROM services s
       INNER JOIN (
         SELECT customer_id, MAX(bill_to) as max_bill
         FROM services
         WHERE deleted_at IS NULL
         GROUP BY customer_id
       ) latest ON s.customer_id = latest.customer_id AND s.bill_to = latest.max_bill
       INNER JOIN customers c ON c.id = s.customer_id AND c.deleted_at IS NULL
       WHERE JSON_UNQUOTE(JSON_EXTRACT(s.status, '$.label')) = 'Active'
       AND s.deleted_at IS NULL
       AND s.bill_to < CURDATE()`
    );

    // Top 20 active-but-unpaid customers
    const [activeUnpaidList] = await financePool.query(
      `SELECT s.id as service_id, s.customer_id, s.price as plan_price,
              s.bill_to, DATEDIFF(CURDATE(), s.bill_to) as days_overdue,
              JSON_UNQUOTE(JSON_EXTRACT(s.billing_type, '$.label')) as billing_type,
              c.name, c.phone_number as phone
       FROM services s
       INNER JOIN (
         SELECT customer_id, MAX(bill_to) as max_bill
         FROM services
         WHERE deleted_at IS NULL
         GROUP BY customer_id
       ) latest ON s.customer_id = latest.customer_id AND s.bill_to = latest.max_bill
       INNER JOIN customers c ON s.customer_id = c.id AND c.deleted_at IS NULL
       WHERE JSON_UNQUOTE(JSON_EXTRACT(s.status, '$.label')) = 'Active'
       AND s.deleted_at IS NULL
       AND s.bill_to < CURDATE()
       ORDER BY s.bill_to ASC
       LIMIT 20`
    );

    // --- New Customers in period ---
    const [[newCustomers]] = await financePool.query(
      `SELECT COUNT(*) as count
       FROM customers
       WHERE deleted_at IS NULL AND DATE(created_at) BETWEEN ? AND ?`,
      [startDate, endDate]
    );

    // --- Monthly breakdown (for yearly view) ---
    let monthlyBreakdown = [];
    if (period === 'yearly') {
      const [mpesaMonthly] = await financePool.query(
        `SELECT MONTH(TransTime) as m, COUNT(*) as count, COALESCE(SUM(TransAmount), 0) as amount
         FROM mpesa WHERE YEAR(TransTime) = ? GROUP BY m ORDER BY m`,
        [parseInt(year) || now.getFullYear()]
      );
      const [manualMonthly] = await trackerPool.query(
        `SELECT MONTH(payment_date) as m, COUNT(*) as count, COALESCE(SUM(amount), 0) as amount
         FROM manual_payments WHERE YEAR(payment_date) = ? GROUP BY m ORDER BY m`,
        [parseInt(year) || now.getFullYear()]
      );
      const [customerMonthly] = await financePool.query(
        `SELECT MONTH(created_at) as m, COUNT(*) as count
         FROM customers
         WHERE deleted_at IS NULL AND YEAR(created_at) = ?
         GROUP BY m ORDER BY m`,
        [parseInt(year) || now.getFullYear()]
      );

      const mpesaMap = Object.fromEntries(mpesaMonthly.map(r => [r.m, r]));
      const manualMap = Object.fromEntries(manualMonthly.map(r => [r.m, r]));
      const custMap = Object.fromEntries(customerMonthly.map(r => [r.m, r]));

      for (let m = 1; m <= 12; m++) {
        const mp = mpesaMap[m] || { count: 0, amount: 0 };
        const mn = manualMap[m] || { count: 0, amount: 0 };
        const nc = custMap[m] || { count: 0 };
        monthlyBreakdown.push({
          month: m,
          mpesa: { count: parseInt(mp.count), amount: parseFloat(mp.amount) },
          manual: { count: parseInt(mn.count), amount: parseFloat(mn.amount) },
          totalRevenue: parseFloat(mp.amount) + parseFloat(mn.amount),
          newCustomers: parseInt(nc.count)
        });
      }
    }

    // --- Daily breakdown (for monthly view) ---
    let dailyBreakdown = [];
    if (period === 'monthly') {
      const [mpesaDaily] = await financePool.query(
        `SELECT DATE(TransTime) as d, COUNT(*) as count, COALESCE(SUM(TransAmount), 0) as amount
         FROM mpesa WHERE DATE(TransTime) BETWEEN ? AND ?
         GROUP BY d ORDER BY d`,
        [startDate, endDate]
      );
      const [manualDaily] = await trackerPool.query(
        `SELECT payment_date as d, COUNT(*) as count, COALESCE(SUM(amount), 0) as amount
         FROM manual_payments WHERE payment_date BETWEEN ? AND ?
         GROUP BY d ORDER BY d`,
        [startDate, endDate]
      );

      const mpesaMap = {};
      mpesaDaily.forEach(r => { mpesaMap[localDate(new Date(r.d))] = r; });
      const manualMap = {};
      manualDaily.forEach(r => { manualMap[localDate(new Date(r.d))] = r; });

      const s = new Date(startDate + 'T00:00:00');
      const e = new Date(endDate + 'T00:00:00');
      for (let cur = new Date(s); cur <= e; cur.setDate(cur.getDate() + 1)) {
        const ds = localDate(cur);
        const mp = mpesaMap[ds] || { count: 0, amount: 0 };
        const mn = manualMap[ds] || { count: 0, amount: 0 };
        dailyBreakdown.push({
          date: ds,
          mpesa: { count: parseInt(mp.count), amount: parseFloat(mp.amount) },
          manual: { count: parseInt(mn.count), amount: parseFloat(mn.amount) },
          totalRevenue: parseFloat(mp.amount) + parseFloat(mn.amount)
        });
      }
    }

    const mpesaAmount = parseFloat(mpesa.amount);
    const manualAmount = parseFloat(manual.amount);

    res.json({
      success: true,
      period,
      periodLabel,
      startDate,
      endDate,
      revenue: {
        mpesa: { count: parseInt(mpesa.count), amount: mpesaAmount },
        manual: { count: parseInt(manual.count), amount: manualAmount, byMethod: manualByMethod },
        totalRevenue: mpesaAmount + manualAmount,
      },
      credit: {
        total: parseFloat(credit.totalCredit),
        customerCount: parseInt(credit.customerCount),
        inPeriod: { amount: parseFloat(creditInPeriod.amount), count: parseInt(creditInPeriod.count) }
      },
      customers: {
        total: parseInt(customerTotals.count),
        activeUnpaid: {
          count: parseInt(activeUnpaid.count),
          prepaid: parseInt(activeUnpaid.prepaid) || 0,
          recurring: parseInt(activeUnpaid.recurring) || 0,
          list: activeUnpaidList
        },
        newInPeriod: parseInt(newCustomers.count)
      },
      services: {
        total: totalServices,
        statuses: statusMap
      },
      monthlyBreakdown,
      dailyBreakdown,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('Financial report error:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// ========== Active But Unpaid - Full Export ==========
router.get('/report/active-unpaid-export', async (req, res) => {
  try {
    const [rows] = await financePool.query(
      `SELECT s.id as service_id, s.customer_id, s.price as plan_price,
              s.bill_to, DATEDIFF(CURDATE(), s.bill_to) as days_overdue,
              JSON_UNQUOTE(JSON_EXTRACT(s.billing_type, '$.label')) as billing_type,
              c.name, c.phone_number as phone
       FROM services s
       INNER JOIN (
         SELECT customer_id, MAX(bill_to) as max_bill
         FROM services
         WHERE deleted_at IS NULL
         GROUP BY customer_id
       ) latest ON s.customer_id = latest.customer_id AND s.bill_to = latest.max_bill
       INNER JOIN customers c ON s.customer_id = c.id AND c.deleted_at IS NULL
       WHERE JSON_UNQUOTE(JSON_EXTRACT(s.status, '$.label')) = 'Active'
       AND s.deleted_at IS NULL
       AND s.bill_to < CURDATE()
       ORDER BY s.bill_to ASC`
    );
    res.json({ success: true, count: rows.length, list: rows });
  } catch (err) {
    console.error('Active unpaid export error:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// ========== Customer Growth Trends (last 12 months) ==========
router.get('/report/customer-growth', async (req, res) => {
  try {
    // New customers per month (last 12 months)
    const [newCust] = await financePool.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') as month,
              COUNT(*) as count
       FROM customers
       WHERE deleted_at IS NULL
       AND created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
       GROUP BY month ORDER BY month`
    );

    // Revenue per month (last 12 months) - M-Pesa
    const [mpesaMonthly] = await financePool.query(
      `SELECT DATE_FORMAT(TransTime, '%Y-%m') as month,
              COALESCE(SUM(TransAmount), 0) as amount,
              COUNT(*) as count
       FROM mpesa
       WHERE TransTime >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
       GROUP BY month ORDER BY month`
    );

    // Revenue per month (last 12 months) - Manual
    const [manualMonthly] = await trackerPool.query(
      `SELECT DATE_FORMAT(payment_date, '%Y-%m') as month,
              COALESCE(SUM(amount), 0) as amount,
              COUNT(*) as count
       FROM manual_payments
       WHERE payment_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
       GROUP BY month ORDER BY month`
    );

    // Customer status counts over time - current snapshot per status
    const [statusCounts] = await financePool.query(
      `SELECT JSON_UNQUOTE(JSON_EXTRACT(s.status, '$.label')) as status_label,
              COUNT(*) as count
       FROM services s
       INNER JOIN customers c ON c.id = s.customer_id AND c.deleted_at IS NULL
       WHERE s.deleted_at IS NULL
       GROUP BY status_label`
    );

    // Build 12-month array
    const months = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const newCustMap = Object.fromEntries(newCust.map(r => [r.month, parseInt(r.count)]));
    const mpesaMap = Object.fromEntries(mpesaMonthly.map(r => [r.month, { amount: parseFloat(r.amount), count: parseInt(r.count) }]));
    const manualMap = Object.fromEntries(manualMonthly.map(r => [r.month, { amount: parseFloat(r.amount), count: parseInt(r.count) }]));

    const trends = months.map(m => ({
      month: m,
      newCustomers: newCustMap[m] || 0,
      mpesaRevenue: mpesaMap[m]?.amount || 0,
      manualRevenue: manualMap[m]?.amount || 0,
      totalRevenue: (mpesaMap[m]?.amount || 0) + (manualMap[m]?.amount || 0),
    }));

    // Merge Disabled into Expired
    const statusMap = {};
    for (const row of statusCounts) {
      const label = row.status_label === 'Disabled' ? 'Expired' : row.status_label;
      statusMap[label] = (statusMap[label] || 0) + parseInt(row.count);
    }

    res.json({
      success: true,
      trends,
      statusBreakdown: statusMap
    });
  } catch (err) {
    console.error('Customer growth error:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

module.exports = router;
