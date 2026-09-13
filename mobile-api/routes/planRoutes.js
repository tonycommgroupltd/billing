// ============================================
// TCOM API — Plan Change Routes (Upgrade/Downgrade)
// ============================================
// GET  /api/plans/available        — List plans customer can switch to
// POST /api/plans/calculate        — Calculate pro-rata cost
// POST /api/plans/change           — Initiate plan change + M-Pesa payment
// GET  /api/plans/change/:id       — Get change request status
// GET  /api/plans/history          — Customer's plan change history
// ============================================

const express = require('express');
const router = express.Router();
const { remotePool, localPool } = require('../db');
const { authMiddleware } = require('../auth');
const { initiateSTKPush } = require('../services/mpesaService');

router.use(authMiddleware);

// --------------------------------------------------
// Helper: parse JSON status
// --------------------------------------------------
function parseStatus(s) {
  try {
    const p = typeof s === 'string' ? JSON.parse(s) : s;
    return p?.label || 'Unknown';
  } catch { return 'Unknown'; }
}

// --------------------------------------------------
// Helper: detect plan group from title
// --------------------------------------------------
function detectGroup(title) {
  if (!title) return 'other';
  const t = title.toLowerCase().trim();
  if (t.startsWith('internet - main2'))   return 'main2';
  if (t.startsWith('internet - main'))     return 'main';
  if (t.startsWith('wireless'))            return 'wireless';
  return 'other';
}

// Friendly group labels
const GROUP_LABELS = {
  main:     'Internet - Main',
  main2:    'Internet - Main 2',
  wireless: 'Wireless',
  other:    'Other',
};

// --------------------------------------------------
// Helper: parse speed (in Mbps) from rate_limit JSON
// --------------------------------------------------
function parseSpeedMbps(rateLimit) {
  try {
    const rl = typeof rateLimit === 'string' ? JSON.parse(rateLimit) : rateLimit;
    const label = rl?.label || '';
    const num = parseInt(label);
    return isNaN(num) ? 0 : num;
  } catch { return 0; }
}

// --------------------------------------------------
// Helper: clean plan title → just "X Mbps"
// --------------------------------------------------
function cleanPlanTitle(title) {
  if (!title) return '';
  // Extract the speed number from the title
  const match = title.match(/(\d+)\s*M(?:B(?:PS)?)?/i);
  if (match) return `${match[1]} Mbps`;
  return title;
}

// --------------------------------------------------
// GET /api/plans/available — All plans customer can switch to
// --------------------------------------------------
router.get('/available', async (req, res) => {
  try {
    const customerId = req.user.customerId;
    const serviceId = req.query.serviceId || null;

    // Get customer's current service(s)
    const [services] = await remotePool.query(
      `SELECT s.id, s.plan_id, s.price, s.bill_to, s.status, s.router_id,
              p.title as plan_name, p.price as plan_price, p.rate_limit
       FROM services s
       LEFT JOIN plans p ON s.plan_id = p.id
       WHERE s.customer_id = ? AND s.deleted_at IS NULL
       ORDER BY s.id DESC`,
      [customerId]
    );

    if (services.length === 0) {
      return res.status(404).json({ error: 'No active service found' });
    }

    // Get active service — prefer specific serviceId if provided
    let activeService;
    if (serviceId) {
      activeService = services.find(s => String(s.id) === String(serviceId));
    }
    if (!activeService) {
      activeService = services.find(s => {
        try {
          const st = typeof s.status === 'string' ? JSON.parse(s.status) : s.status;
          return st?.value === 2;
        } catch { return false; }
      }) || services[0];
    }

    // Detect customer's current plan group
    const currentGroup = detectGroup(activeService.plan_name);
    const currentSpeedMbps = parseSpeedMbps(activeService.rate_limit || null);

    // Fetch ALL available plans (excluding EXPIRED plans)
    const [allPlans] = await remotePool.query(
      `SELECT id, title, price, weekly_price, bi_weekly_price, rate_limit, router_id
       FROM plans
       WHERE deleted_at IS NULL
         AND price > 0
         AND title NOT LIKE '%EXPIRED%'
         AND title NOT LIKE '%Expired%'
       ORDER BY price ASC`,
    );

    // Filter by SAME GROUP, speed >= 5 Mbps, exclude current plan
    // Sort by speed ascending
    const MIN_SPEED = 5;
    const plans = allPlans
      .filter(p => {
        if (p.id === activeService.plan_id) return false;  // Exclude current
        if (detectGroup(p.title) !== currentGroup) return false; // Same group only
        const speed = parseSpeedMbps(p.rate_limit);
        if (speed < MIN_SPEED) return false; // 5 Mbps minimum
        return true;
      })
      .map(p => {
        const speedMbps = parseSpeedMbps(p.rate_limit);
        let speed = '';
        try {
          const rl = typeof p.rate_limit === 'string' ? JSON.parse(p.rate_limit) : p.rate_limit;
          speed = rl?.label || '';
        } catch {}

        return {
          id: p.id,
          title: cleanPlanTitle(p.title),      // "5 Mbps" instead of "Internet - Main 5MB"
          originalTitle: p.title,               // Keep original for reference
          price: parseFloat(p.price),
          weeklyPrice: p.weekly_price ? parseFloat(p.weekly_price) : null,
          biWeeklyPrice: p.bi_weekly_price ? parseFloat(p.bi_weekly_price) : null,
          speed,
          speedMbps,
          routerId: p.router_id,
          sameRouter: p.router_id === activeService.router_id,
        };
      })
      .sort((a, b) => a.speedMbps - b.speedMbps); // Sort by speed ascending

    const currentPrice = parseFloat(activeService.price) || parseFloat(activeService.plan_price) || 0;

    res.json({
      currentService: {
        id: activeService.id,
        planId: activeService.plan_id,
        planName: activeService.plan_name,
        price: currentPrice,
        billTo: activeService.bill_to,
        status: parseStatus(activeService.status),
        routerId: activeService.router_id,
        group: currentGroup,
        groupLabel: GROUP_LABELS[currentGroup] || currentGroup,
        speed: cleanPlanTitle(activeService.plan_name),
      },
      group: currentGroup,
      groupLabel: GROUP_LABELS[currentGroup] || currentGroup,
      totalPlans: plans.length,
      plans,
    });
  } catch (err) {
    console.error('Plans available error:', err);
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});

// --------------------------------------------------
// POST /api/plans/calculate — Calculate pro-rata cost
// Body: { newPlanId, serviceId? }
// --------------------------------------------------
router.post('/calculate', async (req, res) => {
  try {
    const customerId = req.user.customerId;
    const { newPlanId, serviceId } = req.body;

    if (!newPlanId) {
      return res.status(400).json({ error: 'newPlanId is required' });
    }

    // Get customer's service
    let serviceQuery = `SELECT s.id, s.plan_id, s.price, s.bill_to, s.router_id,
                                p.title as current_plan, p.price as plan_price
                         FROM services s
                         LEFT JOIN plans p ON s.plan_id = p.id
                         WHERE s.customer_id = ? AND s.deleted_at IS NULL`;
    const params = [customerId];
    if (serviceId) {
      serviceQuery += ' AND s.id = ?';
      params.push(serviceId);
    }
    serviceQuery += ' ORDER BY s.id DESC LIMIT 1';

    const [services] = await remotePool.query(serviceQuery, params);
    if (services.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }
    const service = services[0];
    const currentPrice = parseFloat(service.price) || parseFloat(service.plan_price) || 0;

    // Get new plan
    const [plans] = await remotePool.query(
      'SELECT id, title, price, rate_limit FROM plans WHERE id = ? AND deleted_at IS NULL',
      [newPlanId]
    );
    if (plans.length === 0) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    const newPlan = plans[0];
    const newPrice = parseFloat(newPlan.price);

    // Calculate days remaining in billing cycle
    let daysRemaining = 0;
    let totalCycleDays = 30; // Default monthly
    if (service.bill_to) {
      const billTo = new Date(service.bill_to);
      const now = new Date();
      daysRemaining = Math.max(0, Math.ceil((billTo - now) / (1000 * 60 * 60 * 24)));
    }

    // Pro-rata calculation
    const priceDiff = newPrice - currentPrice;
    const changeType = priceDiff > 0 ? 'upgrade' : 'downgrade';
    const proRateAmount = Math.abs(priceDiff) * (daysRemaining / totalCycleDays);
    const roundedAmount = Math.ceil(proRateAmount); // Round up for upgrade

    // For upgrade: customer pays proRateAmount
    // For downgrade: customer gets credit of proRateAmount
    let speed = '';
    try {
      const rl = typeof newPlan.rate_limit === 'string' ? JSON.parse(newPlan.rate_limit) : newPlan.rate_limit;
      speed = rl?.label || '';
    } catch {}

    res.json({
      changeType,
      currentPlan: service.current_plan,
      currentPrice,
      newPlan: newPlan.title,
      newPlanId: newPlan.id,
      newPrice,
      newSpeed: speed,
      priceDifference: Math.abs(priceDiff),
      daysRemaining,
      totalCycleDays,
      proRateAmount: roundedAmount,
      // What customer needs to do:
      amountToPay: changeType === 'upgrade' ? roundedAmount : 0,
      creditAmount: changeType === 'downgrade' ? roundedAmount : 0,
      summary: changeType === 'upgrade'
        ? `Pay KES ${roundedAmount} for ${daysRemaining} remaining days (${currentPrice} → ${newPrice}/month)`
        : `You'll receive KES ${roundedAmount} credit for ${daysRemaining} remaining days (${currentPrice} → ${newPrice}/month)`,
    });
  } catch (err) {
    console.error('Plan calculate error:', err);
    res.status(500).json({ error: 'Failed to calculate upgrade cost' });
  }
});

// --------------------------------------------------
// POST /api/plans/change — Initiate plan change
// Body: { newPlanId, serviceId?, phone? }
// --------------------------------------------------
router.post('/change', async (req, res) => {
  try {
    const customerId = req.user.customerId;
    const { newPlanId, serviceId, phone } = req.body;

    if (!newPlanId) {
      return res.status(400).json({ error: 'newPlanId is required' });
    }

    // Get customer info
    const [customers] = await remotePool.query(
      'SELECT id, name, phone_number FROM customers WHERE id = ? AND deleted_at IS NULL',
      [customerId]
    );
    if (customers.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    const customer = customers[0];

    // Get current service
    let serviceQuery = `SELECT s.id, s.plan_id, s.price, s.bill_to, s.router_id,
                                p.title as current_plan, p.price as plan_price
                         FROM services s
                         LEFT JOIN plans p ON s.plan_id = p.id
                         WHERE s.customer_id = ? AND s.deleted_at IS NULL`;
    const params = [customerId];
    if (serviceId) {
      serviceQuery += ' AND s.id = ?';
      params.push(serviceId);
    }
    serviceQuery += ' ORDER BY s.id DESC LIMIT 1';

    const [services] = await remotePool.query(serviceQuery, params);
    if (services.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }
    const service = services[0];
    const currentPrice = parseFloat(service.price) || parseFloat(service.plan_price) || 0;

    // Get new plan
    const [plans] = await remotePool.query(
      'SELECT id, title, price FROM plans WHERE id = ? AND deleted_at IS NULL',
      [newPlanId]
    );
    if (plans.length === 0) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    const newPlan = plans[0];
    const newPrice = parseFloat(newPlan.price);

    // Calculate
    let daysRemaining = 0;
    if (service.bill_to) {
      const billTo = new Date(service.bill_to);
      daysRemaining = Math.max(0, Math.ceil((billTo - new Date()) / (1000 * 60 * 60 * 24)));
    }
    const priceDiff = newPrice - currentPrice;
    const changeType = priceDiff > 0 ? 'upgrade' : 'downgrade';
    const proRateAmount = Math.ceil(Math.abs(priceDiff) * (daysRemaining / 30));

    // Check for duplicate pending requests  
    const [existing] = await localPool.query(
      `SELECT id FROM plan_change_requests 
       WHERE customer_id = ? AND service_id = ? AND status IN ('pending_payment','paid','processing')`,
      [customerId, service.id]
    );
    if (existing.length > 0) {
      return res.status(409).json({ 
        error: 'You already have a pending plan change request',
        existingId: existing[0].id,
      });
    }

    const payPhone = phone || customer.phone_number;

    // For DOWNGRADE or zero-cost: process immediately (no payment needed)
    if (changeType === 'downgrade' || proRateAmount === 0) {
      // Insert request as 'paid' and process immediately
      const [result] = await localPool.query(
        `INSERT INTO plan_change_requests 
         (customer_id, service_id, current_plan_id, new_plan_id, current_price, new_price,
          prorate_amount, days_remaining, change_type, status, credit_amount, mpesa_phone, notes)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 'processing', ?, ?, ?)`,
        [customerId, service.id, service.plan_id, newPlanId, currentPrice, newPrice,
         daysRemaining, changeType, proRateAmount, payPhone,
         changeType === 'downgrade' ? `Downgrade credit: KES ${proRateAmount}` : 'Same price plan change']
      );

      const requestId = result.insertId;

      // Apply the change directly
      await applyPlanChange(requestId, service.id, newPlanId, newPrice, customerId, proRateAmount, changeType);

      return res.json({
        success: true,
        requestId,
        changeType,
        status: 'completed',
        creditAmount: proRateAmount,
        message: changeType === 'downgrade'
          ? `Plan downgraded successfully. KES ${proRateAmount} credited to your account.`
          : 'Plan changed successfully.',
      });
    }

    // For UPGRADE: initiate M-Pesa STK Push
    const accountRef = `TCOM-${changeType.toUpperCase().substring(0, 3)}-${service.id}`;

    // Insert pending request
    const [result] = await localPool.query(
      `INSERT INTO plan_change_requests 
       (customer_id, service_id, current_plan_id, new_plan_id, current_price, new_price,
        prorate_amount, days_remaining, change_type, status, mpesa_phone, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', ?, ?)`,
      [customerId, service.id, service.plan_id, newPlanId, currentPrice, newPrice,
       proRateAmount, daysRemaining, changeType, payPhone,
       `Upgrade: ${service.current_plan} → ${newPlan.title}`]
    );
    const requestId = result.insertId;

    // Initiate STK Push
    const stkResult = await initiateSTKPush(
      payPhone,
      proRateAmount,
      accountRef,
      `Plan upgrade: ${newPlan.title}`
    );

    if (!stkResult.success) {
      // STK failed — mark request as failed
      await localPool.query(
        `UPDATE plan_change_requests SET status = 'failed', notes = CONCAT(IFNULL(notes,''), ' | STK failed: ${stkResult.error}') WHERE id = ?`,
        [requestId]
      );
      return res.status(502).json({
        success: false,
        error: stkResult.error || 'Failed to initiate M-Pesa payment',
      });
    }

    // Save checkout IDs
    await localPool.query(
      `UPDATE plan_change_requests 
       SET checkout_request_id = ?, merchant_request_id = ?
       WHERE id = ?`,
      [stkResult.checkoutRequestId, stkResult.merchantRequestId, requestId]
    );

    console.log(`  ↗ Plan change #${requestId}: ${changeType} ${service.current_plan} → ${newPlan.title} (KES ${proRateAmount})`);

    res.json({
      success: true,
      requestId,
      changeType,
      status: 'pending_payment',
      amountToPay: proRateAmount,
      checkoutRequestId: stkResult.checkoutRequestId,
      message: `M-Pesa payment of KES ${proRateAmount} initiated. Check your phone.`,
    });
  } catch (err) {
    console.error('Plan change error:', err);
    const code = err?.code || null;
    const msg = err?.message || '';
    const isDenied = code === 'ER_TABLEACCESS_DENIED_ERROR' || /denied/i.test(msg);
    res.status(500).json({
      error: isDenied ? 'Plan change blocked by database permissions. Contact support.' : 'Failed to initiate plan change',
      code,
    });
  }
});

// --------------------------------------------------
// GET /api/plans/change/:id — Get change request status
// --------------------------------------------------
router.get('/change/:id', async (req, res) => {
  try {
    const customerId = req.user.customerId;
    const [[request]] = await localPool.query(
      `SELECT * FROM plan_change_requests WHERE id = ? AND customer_id = ?`,
      [req.params.id, customerId]
    );
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    // Enrich with plan names from remote
    const [plans] = await remotePool.query(
      'SELECT id, title FROM plans WHERE id IN (?, ?)',
      [request.current_plan_id, request.new_plan_id]
    );
    const planMap = {};
    plans.forEach(p => { planMap[p.id] = p.title; });

    res.json({
      id: request.id,
      changeType: request.change_type,
      currentPlan: planMap[request.current_plan_id] || 'Unknown',
      newPlan: planMap[request.new_plan_id] || 'Unknown',
      currentPrice: parseFloat(request.current_price),
      newPrice: parseFloat(request.new_price),
      proRateAmount: parseFloat(request.prorate_amount),
      creditAmount: parseFloat(request.credit_amount),
      daysRemaining: request.days_remaining,
      status: request.status,
      mpesaReceipt: request.mpesa_receipt,
      checkoutRequestId: request.checkout_request_id,
      createdAt: request.created_at,
      completedAt: request.completed_at,
      notes: request.notes,
    });
  } catch (err) {
    console.error('Plan change status error:', err);
    res.status(500).json({ error: 'Failed to fetch request status' });
  }
});

// --------------------------------------------------
// GET /api/plans/history — Customer's plan change history
// --------------------------------------------------
router.get('/history', async (req, res) => {
  try {
    const customerId = req.user.customerId;
    const [requests] = await localPool.query(
      `SELECT id, current_plan_id, new_plan_id, current_price, new_price,
              prorate_amount, credit_amount, change_type, status, mpesa_receipt,
              created_at, completed_at
       FROM plan_change_requests 
       WHERE customer_id = ?
       ORDER BY created_at DESC
       LIMIT 20`,
      [customerId]
    );

    // Collect all plan IDs
    const planIds = [...new Set(requests.flatMap(r => [r.current_plan_id, r.new_plan_id]))];
    let planMap = {};
    if (planIds.length > 0) {
      const ph = planIds.map(() => '?').join(',');
      const [plans] = await remotePool.query(`SELECT id, title FROM plans WHERE id IN (${ph})`, planIds);
      plans.forEach(p => { planMap[p.id] = p.title; });
    }

    res.json(requests.map(r => ({
      id: r.id,
      changeType: r.change_type,
      currentPlan: planMap[r.current_plan_id] || 'Unknown',
      newPlan: planMap[r.new_plan_id] || 'Unknown',
      currentPrice: parseFloat(r.current_price),
      newPrice: parseFloat(r.new_price),
      proRateAmount: parseFloat(r.prorate_amount),
      creditAmount: parseFloat(r.credit_amount),
      status: r.status,
      mpesaReceipt: r.mpesa_receipt,
      createdAt: r.created_at,
      completedAt: r.completed_at,
    })));
  } catch (err) {
    console.error('Plan history error:', err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// --------------------------------------------------
// Apply plan change on the remote (billing) database
// --------------------------------------------------
async function applyPlanChange(requestId, serviceId, newPlanId, newPrice, customerId, creditAmount, changeType) {
  try {
    // 1. Update the service's plan and price
    await remotePool.query(
      'UPDATE services SET plan_id = ?, price = ?, updated_at = NOW() WHERE id = ?',
      [newPlanId, newPrice, serviceId]
    );

    // 2. Log the change in service_change_logs (changed_by = 1 for system/Main Admin)
    await remotePool.query(
      `INSERT INTO service_change_logs (service_id, changed_by, field, old_value, new_value, notes, created_at, updated_at)
       VALUES (?, 1, 'plan_id', ?, ?, ?, NOW(), NOW())`,
      [serviceId, String(requestId), String(newPlanId), `Mobile app ${changeType} by customer`]
    );

    // Also log the price change
    await remotePool.query(
      `INSERT INTO service_change_logs (service_id, changed_by, field, old_value, new_value, notes, created_at, updated_at)
       VALUES (?, 1, 'price', ?, ?, ?, NOW(), NOW())`,
      [serviceId, '0', String(newPrice), `Mobile app ${changeType} price update`]
    );

    // 3. If downgrade, add credit to customer's balance
    if (changeType === 'downgrade' && creditAmount > 0) {
      await remotePool.query(
        `INSERT INTO balances (balanceable_type, balanceable_id, amount, reason, created_at, updated_at)
         VALUES ('App\\\\Models\\\\Customer', ?, ?, ?, NOW(), NOW())`,
        [customerId, creditAmount, `Plan downgrade credit (change request #${requestId})`]
      );
    }

    // 4. Mark request as completed
    await localPool.query(
      `UPDATE plan_change_requests SET status = 'completed', completed_at = NOW() WHERE id = ?`,
      [requestId]
    );

    console.log(`  ✓ Plan change #${requestId} applied: service ${serviceId} → plan ${newPlanId} @ KES ${newPrice}`);
    return true;
  } catch (err) {
    console.error(`Plan change #${requestId} apply error:`, err);
    const note = (err?.message || 'unknown').replace(/'/g, "''");
    await localPool.query(
      `UPDATE plan_change_requests SET status = 'failed', notes = CONCAT(IFNULL(notes,''), ' | Apply error: ${note}') WHERE id = ?`,
      [requestId]
    );
    return false;
  }
}

// Export the apply function for use by M-Pesa callback
module.exports = router;
module.exports.applyPlanChange = applyPlanChange;
