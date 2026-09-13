// ============================================
// TCOM API — Loyalty Token Routes
// ============================================
// GET  /api/loyalty/balance  — Token balance + summary
// GET  /api/loyalty/history  — Full earn/redeem history
// POST /api/loyalty/check    — Scan payments & award tokens
// POST /api/loyalty/redeem   — Redeem tokens → extend billing
// ============================================
//
// Rules:
//   • 1 token per full monthly payment (amount >= plan price)
//   • Tokens never expire
//   • Active: each token extends bill_to by 1 day
//   • Expired: redeem N tokens → activate from today for exactly N days
//   • Max MAX_REDEEM_DAYS_PER_REQUEST tokens per request
//   • Loyalty cannot push bill_to past today + MAX_LOYALTY_BILL_AHEAD_DAYS
//   • Redeem cooldown REDEEM_COOLDOWN_SECONDS between successful redeems
// ============================================

const express = require('express');
const router = express.Router();
const { remotePool, localPool } = require('../db');
const { authMiddleware } = require('../auth');

router.use(authMiddleware);

// Loyalty program start date — only payments from this date onwards qualify
const LOYALTY_START_DATE = '2026-03-01';
/** Max tokens that can be redeemed in a single request (spam / test protection). */
const MAX_REDEEM_DAYS_PER_REQUEST = 7;
/** Loyalty must not push bill_to more than this many days past today. */
const MAX_LOYALTY_BILL_AHEAD_DAYS = 30;
/** Minimum seconds between successful redeems for the same customer+service. */
const REDEEM_COOLDOWN_SECONDS = 8;

// Helper: format MySQL date as local YYYY-MM-DD string (avoids UTC shift)
function formatDateLocal(d) {
  if (!d) return null;
  const dt = (d instanceof Date) ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function startOfLocalDay(d = new Date()) {
  const dt = d instanceof Date ? new Date(d) : new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function addLocalDays(d, days) {
  const dt = startOfLocalDay(d);
  dt.setDate(dt.getDate() + days);
  return dt;
}

/** bill_to before today = expired (matches portal / dashboard logic). */
function getBillingState(billToDate) {
  const today = startOfLocalDay();
  if (!billToDate) {
    return { isExpired: true, daysUntilExpiry: null, billingStatus: 'expired' };
  }
  const billDate = startOfLocalDay(billToDate);
  const daysUntilExpiry = Math.floor((billDate - today) / 86400000);
  let billingStatus = 'active';
  if (daysUntilExpiry < 0) billingStatus = 'expired';
  else if (daysUntilExpiry <= 7) billingStatus = 'expiring_soon';
  return { isExpired: daysUntilExpiry < 0, daysUntilExpiry, billingStatus };
}

/**
 * How many days this redeem is still allowed to add, given balance + caps.
 * Expired: base = today (reactivation). Active: base = current bill_to.
 */
function computeMaxRedeemDays(billToDate, balance, isExpired) {
  const bal = Math.max(0, Number(balance) || 0);
  if (bal < 1) return 0;

  const today = startOfLocalDay();
  const ceiling = addLocalDays(today, MAX_LOYALTY_BILL_AHEAD_DAYS);
  const base = isExpired
    ? today
    : (billToDate ? startOfLocalDay(billToDate) : today);

  const room = Math.floor((ceiling - base) / 86400000);
  if (room < 1) return 0;

  return Math.min(bal, MAX_REDEEM_DAYS_PER_REQUEST, room);
}

/** Token balance for a customer (optionally per service). */
async function getTokenBalance(customerId, serviceId = null) {
  const svcFilter = serviceId ? ' AND service_id = ?' : '';
  const params = serviceId ? [customerId, serviceId] : [customerId];

  const [[earned]] = await localPool.query(
    `SELECT COALESCE(SUM(tokens_earned), 0) as total FROM loyalty_tokens WHERE customer_id = ?${svcFilter}`,
    params
  );
  const [[redeemed]] = await localPool.query(
    `SELECT COALESCE(SUM(tokens_used), 0) as total FROM token_redemptions WHERE customer_id = ?${svcFilter}`,
    params
  );
  return Number(earned.total) - Number(redeemed.total);
}

function friendlyDbError(err) {
  if (!err) return 'Unknown error';
  if (err.code === 'ER_TABLEACCESS_DENIED_ERROR' || err.code === 'ER_DBACCESS_DENIED_ERROR') {
    return 'Billing system permission error. Contact support — remote database user needs UPDATE on services.';
  }
  if (err.code === 'ER_ACCESS_DENIED_ERROR') {
    return 'Database access denied. Contact support to grant billing update permissions.';
  }
  return err.message || 'Unknown error';
}

// --------------------------------------------------
// GET /api/loyalty/balance — Token balance & summary
// --------------------------------------------------
router.get('/balance', async (req, res) => {
  try {
    const customerId = req.user.customerId;
    const serviceId = req.query.serviceId || null;

    // Build optional service filter for local DB queries
    const svcFilter = serviceId ? ' AND service_id = ?' : '';
    const svcParams = serviceId ? [customerId, serviceId] : [customerId];

    // Total earned
    const [[earned]] = await localPool.query(
      `SELECT COALESCE(SUM(tokens_earned), 0) as total FROM loyalty_tokens WHERE customer_id = ?${svcFilter}`,
      svcParams
    );

    // Total redeemed
    const [[redeemed]] = await localPool.query(
      `SELECT COALESCE(SUM(tokens_used), 0) as total FROM token_redemptions WHERE customer_id = ?${svcFilter}`,
      svcParams
    );

    const balance = earned.total - redeemed.total;

    // Last 5 activities (combined earn + redeem, most recent first)
    const [recentEarned] = await localPool.query(
      `SELECT 'earned' as type, tokens_earned as amount, reason as description, created_at
       FROM loyalty_tokens WHERE customer_id = ?${svcFilter}
       ORDER BY created_at DESC LIMIT 5`,
      svcParams
    );
    const [recentRedeemed] = await localPool.query(
      `SELECT 'redeemed' as type, tokens_used as amount,
              CONCAT('Extended billing by ', tokens_used, ' day(s)') as description,
              created_at
       FROM token_redemptions WHERE customer_id = ?${svcFilter}
       ORDER BY created_at DESC LIMIT 5`,
      svcParams
    );

    const recent = [...recentEarned, ...recentRedeemed]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5);

    // Get current bill_to for context
    let svcQuery = `SELECT s.id, s.bill_to, p.title as plan_name, s.price
       FROM services s LEFT JOIN plans p ON s.plan_id = p.id
       WHERE s.customer_id = ? AND s.deleted_at IS NULL`;
    const svcQParams = [customerId];
    if (serviceId) { svcQuery += ' AND s.id = ?'; svcQParams.push(serviceId); }
    svcQuery += ' ORDER BY s.id DESC LIMIT 1';
    const [services] = await remotePool.query(svcQuery, svcQParams);
    const service = services[0] || null;

    const billing = service ? getBillingState(service.bill_to) : { isExpired: false, billingStatus: 'active' };
    const maxRedeemDays = service
      ? computeMaxRedeemDays(service.bill_to, balance, billing.isExpired)
      : Math.min(balance, MAX_REDEEM_DAYS_PER_REQUEST);

    res.json({
      balance,
      totalEarned: earned.total,
      totalRedeemed: redeemed.total,
      currentBillTo: service ? formatDateLocal(service.bill_to) : null,
      planName: service?.plan_name || null,
      planPrice: service ? parseFloat(service.price) : null,
      billingStatus: billing.billingStatus,
      isExpired: billing.isExpired,
      redeemMode: billing.isExpired ? 'activation' : 'extension',
      maxRedeemDays,
      maxRedeemPerRequest: MAX_REDEEM_DAYS_PER_REQUEST,
      maxBillAheadDays: MAX_LOYALTY_BILL_AHEAD_DAYS,
      redeemCooldownSeconds: REDEEM_COOLDOWN_SECONDS,
      daysUntilExpiry: billing.daysUntilExpiry,
      recentActivity: recent.map(r => ({
        type: r.type,
        amount: r.amount,
        description: r.description,
        date: r.created_at,
      })),
    });
  } catch (err) {
    console.error('Loyalty balance error:', err);
    res.status(500).json({ error: 'Failed to fetch loyalty balance' });
  }
});

// --------------------------------------------------
// GET /api/loyalty/history — Full token history
// --------------------------------------------------
router.get('/history', async (req, res) => {
  try {
    const customerId = req.user.customerId;
    const serviceId = req.query.serviceId || null;

    const svcFilter = serviceId ? ' AND service_id = ?' : '';
    const svcParams = serviceId ? [customerId, serviceId] : [customerId];

    const [earned] = await localPool.query(
      `SELECT 'earned' as type, tokens_earned as amount, reason as description,
              payment_amount, plan_price, created_at
       FROM loyalty_tokens WHERE customer_id = ?${svcFilter}
       ORDER BY created_at DESC LIMIT 50`,
      svcParams
    );

    const [redeemed] = await localPool.query(
      `SELECT 'redeemed' as type, tokens_used as amount,
              CONCAT('Extended billing by ', tokens_used, ' day(s)') as description,
              old_bill_to, new_bill_to, created_at
       FROM token_redemptions WHERE customer_id = ?${svcFilter}
       ORDER BY created_at DESC LIMIT 50`,
      svcParams
    );

    const history = [...earned, ...redeemed]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({ history });
  } catch (err) {
    console.error('Loyalty history error:', err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// --------------------------------------------------
// POST /api/loyalty/check — Scan for unawarded payments
// Called when customer opens the app / rewards page
// --------------------------------------------------
router.post('/check', async (req, res) => {
  try {
    const customerId = req.user.customerId;

    // Get customer's active services with plan price
    const [services] = await remotePool.query(
      `SELECT s.id, s.plan_id, s.price, s.bill_to, p.title as plan_name
       FROM services s LEFT JOIN plans p ON s.plan_id = p.id
       WHERE s.customer_id = ? AND s.deleted_at IS NULL`,
      [customerId]
    );

    if (services.length === 0) {
      return res.json({ awarded: 0, message: 'No active service found' });
    }

    const serviceIds = services.map(s => s.id);
    const serviceMap = {};
    services.forEach(s => { serviceMap[s.id] = s; });

    // Get all invoices for these services
    const ph = serviceIds.map(() => '?').join(',');
    const [invoices] = await remotePool.query(
      `SELECT i.id as invoice_id, i.services_id, i.total, i.status
       FROM invoices i
       WHERE i.services_id IN (${ph}) AND i.deleted_at IS NULL`,
      serviceIds
    );

    // Get paid invoices (status label = "Paid")
    const paidInvoices = invoices.filter(inv => {
      try {
        const st = typeof inv.status === 'string' ? JSON.parse(inv.status) : inv.status;
        return st?.label === 'Paid';
      } catch { return false; }
    });

    if (paidInvoices.length === 0) {
      return res.json({ awarded: 0, message: 'No paid invoices found' });
    }

    // Get payments linked to these invoices (only from LOYALTY_START_DATE onwards)
    const invIds = paidInvoices.map(i => i.invoice_id);
    const invPh = invIds.map(() => '?').join(',');
    const [payments] = await remotePool.query(
      `SELECT p.id as payment_id, p.invoice_id, p.sum, p.customer_id, p.date
       FROM payments p
       WHERE p.invoice_id IN (${invPh}) AND p.customer_id = ?
       AND p.date >= ?`,
      [...invIds, customerId, LOYALTY_START_DATE]
    );

    // Get already awarded payment IDs
    const [alreadyAwarded] = await localPool.query(
      'SELECT payment_id FROM loyalty_tokens WHERE customer_id = ?',
      [customerId]
    );
    const awardedSet = new Set(alreadyAwarded.map(a => a.payment_id));

    // Award tokens for qualifying payments
    let awarded = 0;
    for (const pay of payments) {
      if (awardedSet.has(pay.payment_id)) continue; // Already awarded

      // Find the invoice and its service
      const inv = paidInvoices.find(i => i.invoice_id === pay.invoice_id);
      if (!inv) continue;

      const service = serviceMap[inv.services_id];
      if (!service) continue;

      const planPrice = parseFloat(service.price);
      const payAmount = parseFloat(pay.sum);

      // Full payment check: payment amount >= plan price
      if (payAmount >= planPrice && planPrice > 0) {
        await localPool.query(
          `INSERT INTO loyalty_tokens 
           (customer_id, service_id, payment_id, invoice_id, payment_amount, plan_price, tokens_earned, reason)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
          [customerId, service.id, pay.payment_id, inv.invoice_id, payAmount, planPrice,
           `Full payment of KES ${payAmount.toLocaleString()} for ${service.plan_name || 'service'}`]
        );
        awarded++;
      }
    }

    if (awarded > 0) {
      console.log(`  ★ Loyalty: awarded ${awarded} token(s) to customer ${customerId}`);
    }

    // Return updated balance
    const [[earned]] = await localPool.query(
      'SELECT COALESCE(SUM(tokens_earned), 0) as total FROM loyalty_tokens WHERE customer_id = ?',
      [customerId]
    );
    const [[redeemed]] = await localPool.query(
      'SELECT COALESCE(SUM(tokens_used), 0) as total FROM token_redemptions WHERE customer_id = ?',
      [customerId]
    );

    res.json({
      awarded,
      balance: earned.total - redeemed.total,
      message: awarded > 0
        ? `Congratulations! You earned ${awarded} day token${awarded > 1 ? 's' : ''}!`
        : 'All payments already checked',
    });
  } catch (err) {
    console.error('Loyalty check error:', err);
    res.status(500).json({ error: 'Failed to check payments' });
  }
});

// --------------------------------------------------
// POST /api/loyalty/redeem — Redeem tokens to extend billing
// Body: { days, serviceId? }
// --------------------------------------------------
router.post('/redeem', async (req, res) => {
  const customerId = req.user.customerId;
  const { days, serviceId } = req.body;
  let service = null;
  let oldBillToRaw = null;

  try {
    if (!days || days < 1) {
      return res.status(400).json({ error: 'days must be at least 1' });
    }

    const requestedDays = Math.floor(Number(days));
    if (!Number.isFinite(requestedDays) || requestedDays < 1) {
      return res.status(400).json({ error: 'days must be at least 1' });
    }

    const svcId = serviceId ? Number(serviceId) : null;

    // Balance must match what the Rewards screen shows (per-service when serviceId sent)
    const balance = await getTokenBalance(customerId, svcId);

    if (requestedDays > balance) {
      return res.status(400).json({
        error: `Insufficient tokens. You have ${balance} token(s), requested ${requestedDays}.`,
        balance,
      });
    }

    if (requestedDays > MAX_REDEEM_DAYS_PER_REQUEST) {
      return res.status(400).json({
        error: `You can redeem at most ${MAX_REDEEM_DAYS_PER_REQUEST} day(s) at a time.`,
        code: 'MAX_PER_REQUEST',
        maxRedeemPerRequest: MAX_REDEEM_DAYS_PER_REQUEST,
        balance,
      });
    }

    // Get the service to extend
    let serviceQuery = `SELECT s.id, s.bill_to, s.price, p.title as plan_name
                        FROM services s LEFT JOIN plans p ON s.plan_id = p.id
                        WHERE s.customer_id = ? AND s.deleted_at IS NULL`;
    const params = [customerId];
    if (svcId) {
      serviceQuery += ' AND s.id = ?';
      params.push(svcId);
    }
    serviceQuery += ' ORDER BY s.id DESC LIMIT 1';

    const [services] = await remotePool.query(serviceQuery, params);
    if (services.length === 0) {
      return res.status(404).json({ error: 'No service found' });
    }
    service = services[0];
    oldBillToRaw = service.bill_to;
    const oldBillToStr = formatDateLocal(oldBillToRaw) || formatDateLocal(new Date());
    const billing = getBillingState(service.bill_to);
    const redeemMode = billing.isExpired ? 'activation' : 'extension';
    const maxRedeemDays = computeMaxRedeemDays(service.bill_to, balance, billing.isExpired);

    if (requestedDays > maxRedeemDays) {
      const ceilingDate = formatDateLocal(addLocalDays(new Date(), MAX_LOYALTY_BILL_AHEAD_DAYS));
      if (maxRedeemDays < 1) {
        return res.status(400).json({
          error: `Loyalty cannot extend billing past ${ceilingDate} (max ${MAX_LOYALTY_BILL_AHEAD_DAYS} days ahead).`,
          code: 'BILL_AHEAD_CEILING',
          maxBillAheadDays: MAX_LOYALTY_BILL_AHEAD_DAYS,
          maxRedeemDays: 0,
          balance,
          redeemMode,
        });
      }
      return res.status(400).json({
        error: `You can redeem at most ${maxRedeemDays} day(s) right now (cap ${MAX_REDEEM_DAYS_PER_REQUEST}/request, bill date max ${MAX_LOYALTY_BILL_AHEAD_DAYS} days ahead).`,
        code: 'MAX_REDEEM_EXCEEDED',
        maxRedeemDays,
        maxRedeemPerRequest: MAX_REDEEM_DAYS_PER_REQUEST,
        maxBillAheadDays: MAX_LOYALTY_BILL_AHEAD_DAYS,
        balance,
        redeemMode,
      });
    }

    // Cooldown — stop spam loops that burn hundreds of tokens in seconds
    const [[recentRedeem]] = await localPool.query(
      `SELECT created_at FROM token_redemptions
       WHERE customer_id = ? AND service_id = ?
         AND created_at > DATE_SUB(NOW(), INTERVAL ? SECOND)
       ORDER BY id DESC LIMIT 1`,
      [customerId, service.id, REDEEM_COOLDOWN_SECONDS]
    );
    if (recentRedeem) {
      return res.status(429).json({
        error: `Please wait ${REDEEM_COOLDOWN_SECONDS} seconds between redemptions.`,
        code: 'REDEEM_COOLDOWN',
        redeemCooldownSeconds: REDEEM_COOLDOWN_SECONDS,
        balance,
      });
    }

    // Expired → reactivate from today for exactly N days. Active → extend existing bill_to.
    if (redeemMode === 'activation') {
      await remotePool.query(
        `UPDATE services
         SET bill_to = DATE_ADD(CURDATE(), INTERVAL ? DAY),
             updated_at = NOW()
         WHERE id = ?`,
        [requestedDays, service.id]
      );
    } else {
      await remotePool.query(
        `UPDATE services
         SET bill_to = DATE_ADD(COALESCE(bill_to, CURDATE()), INTERVAL ? DAY),
             updated_at = NOW()
         WHERE id = ?`,
        [requestedDays, service.id]
      );
    }

    const [[updated]] = await remotePool.query(
      'SELECT bill_to FROM services WHERE id = ?',
      [service.id]
    );
    const newBillToStr = formatDateLocal(updated.bill_to);
    if (!newBillToStr) {
      throw new Error('Could not update billing date on service record');
    }

    // Sanity: applied days must match the request (catch races / bad DATE_ADD)
    const [[diffRow]] = await remotePool.query(
      redeemMode === 'activation'
        ? 'SELECT DATEDIFF(bill_to, CURDATE()) AS applied_days FROM services WHERE id = ?'
        : 'SELECT DATEDIFF(bill_to, ?) AS applied_days FROM services WHERE id = ?',
      redeemMode === 'activation'
        ? [service.id]
        : [oldBillToStr, service.id]
    );
    const appliedDays = Number(diffRow?.applied_days);
    if (appliedDays !== requestedDays) {
      if (oldBillToRaw) {
        await remotePool.query(
          'UPDATE services SET bill_to = ?, updated_at = NOW() WHERE id = ?',
          [oldBillToRaw, service.id]
        );
      } else {
        await remotePool.query(
          'UPDATE services SET bill_to = NULL, updated_at = NOW() WHERE id = ?',
          [service.id]
        );
      }
      console.error(
        `[LOYALTY REDEEM] Sanity fail service=${service.id} mode=${redeemMode} ` +
        `requested=${requestedDays} applied=${appliedDays} old=${oldBillToStr} new=${newBillToStr}`
      );
      return res.status(500).json({
        success: false,
        error: 'Billing date did not update as expected. No tokens were used — try again.',
        code: 'SANITY_MISMATCH',
      });
    }

    // Soft ceiling check on stored date (defence in depth)
    const [[aheadRow]] = await remotePool.query(
      'SELECT DATEDIFF(bill_to, CURDATE()) AS days_ahead FROM services WHERE id = ?',
      [service.id]
    );
    if (Number(aheadRow?.days_ahead) > MAX_LOYALTY_BILL_AHEAD_DAYS) {
      if (oldBillToRaw) {
        await remotePool.query(
          'UPDATE services SET bill_to = ?, updated_at = NOW() WHERE id = ?',
          [oldBillToRaw, service.id]
        );
      } else {
        await remotePool.query(
          'UPDATE services SET bill_to = NULL, updated_at = NOW() WHERE id = ?',
          [service.id]
        );
      }
      return res.status(400).json({
        success: false,
        error: `Loyalty cannot push billing more than ${MAX_LOYALTY_BILL_AHEAD_DAYS} days ahead.`,
        code: 'BILL_AHEAD_CEILING',
        maxBillAheadDays: MAX_LOYALTY_BILL_AHEAD_DAYS,
      });
    }

    // Audit log on remote DB — non-fatal (was failing when Joram lacked INSERT grant)
    try {
      await remotePool.query(
        `INSERT INTO service_bill_date_changes
         (service_id, old_bill_date, new_bill_date, user_id, remarks, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, NOW(), NOW())`,
        [service.id, oldBillToStr, newBillToStr,
          redeemMode === 'activation'
            ? `Loyalty token activation: ${requestedDays} day(s) via TCOM App`
            : `Loyalty token redemption: ${requestedDays} day(s) via TCOM App`]
      );
    } catch (auditErr) {
      console.warn(`[LOYALTY REDEEM] Audit log skipped for service ${service.id}:`, auditErr.message);
    }

    // Record redemption in local DB — if this fails, roll back bill_to on remote
    try {
      await localPool.query(
        `INSERT INTO token_redemptions
         (customer_id, service_id, tokens_used, old_bill_to, new_bill_to)
         VALUES (?, ?, ?, ?, ?)`,
        [customerId, service.id, requestedDays, oldBillToStr, newBillToStr]
      );
    } catch (localErr) {
      if (oldBillToRaw) {
        await remotePool.query(
          'UPDATE services SET bill_to = ?, updated_at = NOW() WHERE id = ?',
          [oldBillToRaw, service.id]
        );
      } else {
        await remotePool.query(
          'UPDATE services SET bill_to = NULL, updated_at = NOW() WHERE id = ?',
          [service.id]
        );
      }
      throw localErr;
    }

    const newBalance = balance - requestedDays;
    console.log(`  ★ Loyalty: customer ${customerId} ${redeemMode} ${requestedDays} token(s) → bill_to ${newBillToStr}`);

    const successMessage = redeemMode === 'activation'
      ? `Account reactivated for ${requestedDays} day${requestedDays > 1 ? 's' : ''}! Service active until ${newBillToStr}.`
      : `Billing extended by ${requestedDays} day${requestedDays > 1 ? 's' : ''}! New billing date: ${newBillToStr}`;

    res.json({
      success: true,
      tokensUsed: requestedDays,
      balance: newBalance,
      oldBillTo: oldBillToStr,
      newBillTo: newBillToStr,
      planName: service.plan_name,
      redeemMode,
      maxRedeemDays: computeMaxRedeemDays(updated.bill_to, newBalance, false),
      message: successMessage,
    });
  } catch (err) {
    console.error('Loyalty redeem error:', err);
    const errCode = err?.code || null;
    const errMsg = friendlyDbError(err);
    res.status(500).json({
      success: false,
      error: errMsg,
      code: errCode,
      message: err.message || errMsg,
    });
  }
});

module.exports = router;
