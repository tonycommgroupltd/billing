// ============================================
// TCOM — Expired PPPoE captive portal API
// ============================================
// Public endpoints for MikroTik walled-garden portal (no JWT).
// Account = PPPoE username (mikrotik_name), phone, or service ID.
// M-Pesa account ref: customerPhone#serviceId (same as mobile app).
// ============================================

const express = require('express');
const rateLimit = require('express-rate-limit');
const { remotePool, localPool } = require('../db');
const { initiateSTKPush, querySTKStatus } = require('../services/mpesaService');
const { decodeToken } = require('../services/paymentLinkService');

const router = express.Router();

const PAYBILL = process.env.MPESA_SHORTCODE || '4129711';

const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Too many lookups. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const payLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Too many payment attempts. Try again in a few minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

function formatDate(d) {
  if (!d) return null;
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function parseServiceStatus(statusRaw) {
  if (!statusRaw) return {};
  try {
    return typeof statusRaw === 'string' ? JSON.parse(statusRaw) : statusRaw;
  } catch {
    return { label: String(statusRaw) };
  }
}

function billingStatus(billToDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const billDate = new Date(billToDate);
  billDate.setHours(0, 0, 0, 0);
  const daysUntilExpiry = Math.floor((billDate - today) / (86400000));
  if (daysUntilExpiry < 0) return { status: 'expired', daysUntilExpiry, daysOverdue: Math.abs(daysUntilExpiry) };
  if (daysUntilExpiry <= 7) return { status: 'expiring_soon', daysUntilExpiry, daysOverdue: 0 };
  return { status: 'active', daysUntilExpiry, daysOverdue: 0 };
}

function isPortalEligible(service, bill) {
  const st = parseServiceStatus(service.status);
  const label = String(st.label || st.value || '').toLowerCase();
  if (label.includes('expired') || label.includes('disabled')) return true;
  return bill.status === 'expired' || bill.status === 'expiring_soon';
}

async function loadPricingMap() {
  const [rows] = await localPool.query(
    'SELECT monthly_price, weekly_price, bi_weekly_price FROM plan_pricing'
  );
  const map = {};
  for (const r of rows) {
    map[parseFloat(r.monthly_price)] = {
      weekly: parseFloat(r.weekly_price),
      biWeekly: parseFloat(r.bi_weekly_price),
      monthly: parseFloat(r.monthly_price),
    };
  }
  return map;
}

function pricingForService(service, pricingMap) {
  const monthly = parseFloat(service.price) || 0;
  const row = pricingMap[monthly];
  return {
    monthly,
    weekly: row?.weekly ?? null,
    biWeekly: row?.biWeekly ?? null,
  };
}

async function findServices(account) {
  const q = String(account || '').trim();
  if (!q || q.length < 2) return [];

  const digits = q.replace(/\D/g, '');
  const params = [];
  const clauses = ['s.mikrotik_name = ?'];
  params.push(q);

  // Username / name substring only when query is long enough to be intentional
  if (q.length >= 4 && !/^\d+$/.test(q)) {
    clauses.push('s.mikrotik_name LIKE ?');
    params.push(`%${q}%`);
  }

  // Phone match only with enough digits (avoids LIKE %1% / %% matching everyone)
  if (digits.length >= 9) {
    clauses.push('REPLACE(REPLACE(c.phone_number, \' \', \'\'), \'+\', \'\') LIKE ?');
    clauses.push('c.phone_number LIKE ?');
    params.push(`%${digits}%`, `%${digits}%`);
    const local = digits.replace(/^254/, '0');
    if (local !== digits && local.length >= 9) {
      clauses.push('REPLACE(REPLACE(c.phone_number, \' \', \'\'), \'+\', \'\') LIKE ?');
      params.push(`%${local}%`);
    }
  }

  if (/^\d+$/.test(q) && q.length <= 8) {
    clauses.push('s.id = ?', 'c.id = ?');
    params.push(parseInt(q, 10), parseInt(q, 10));
  }

  let where = `
    s.deleted_at IS NULL AND c.deleted_at IS NULL
    AND (${clauses.join(' OR ')})
  `;

  const [rows] = await remotePool.query(
    `SELECT
      s.id AS serviceId,
      s.customer_id AS customerId,
      s.mikrotik_name AS pppoeUsername,
      s.price,
      s.bill_to AS billTo,
      s.status,
      c.name AS customerName,
      c.phone_number AS phone,
      p.title AS planName
    FROM services s
    JOIN customers c ON c.id = s.customer_id
    LEFT JOIN plans p ON p.id = s.plan_id
    WHERE ${where}
    ORDER BY s.bill_to ASC
    LIMIT 10`,
    params
  );

  return rows;
}

function mapService(row, pricingMap) {
  const bill = billingStatus(row.billTo);
  const pricing = pricingForService(row, pricingMap);
  const st = parseServiceStatus(row.status);
  return {
    serviceId: row.serviceId,
    customerId: row.customerId,
    customerName: row.customerName,
    phone: row.phone,
    pppoeUsername: row.pppoeUsername,
    planName: row.planName || 'Internet',
    billTo: formatDate(row.billTo),
    serviceStatus: st.label || st.value || 'Unknown',
    billingStatus: bill.status,
    daysOverdue: bill.daysOverdue || 0,
    daysUntilExpiry: bill.daysUntilExpiry,
    canPay: isPortalEligible(row, bill),
    pricing: {
      monthly: pricing.monthly,
      weekly: pricing.weekly,
      biWeekly: pricing.biWeekly,
    },
  };
}

/** EXPIRED PPPoE pool (Faiba2). Contabo must see real framed IP (no WAN masquerade). */
const CAPTIVE_IP_PREFIXES = (process.env.PORTAL_CAPTIVE_PREFIXES || '90.').split(',').map((s) => s.trim()).filter(Boolean);

function isCaptiveFramedIp(ip) {
  const s = String(ip || '').trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) return false;
  return CAPTIVE_IP_PREFIXES.some((p) => s === p || s.startsWith(p));
}

function normalizeIp(raw) {
  let ip = String(raw || '').trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  // Strip port if present (rare)
  if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.split(':')[0];
  return ip;
}

/**
 * Resolve PPPoE username from framed IP via RADIUS radacct (open session preferred).
 */
async function findUsernameByFramedIp(ip) {
  const framed = normalizeIp(ip);
  if (!isCaptiveFramedIp(framed)) return null;

  const [rows] = await remotePool.query(
    `SELECT username, framedipaddress, acctstarttime, acctstoptime
     FROM radacct
     WHERE framedipaddress = ?
     ORDER BY (acctstoptime IS NULL) DESC, acctstarttime DESC
     LIMIT 1`,
    [framed]
  );
  const row = rows[0];
  if (!row || !row.username) return null;
  return {
    username: String(row.username).trim(),
    framedIp: row.framedipaddress,
    sessionOpen: row.acctstoptime == null,
    startedAt: row.acctstarttime,
  };
}

async function lookupResponseForAccount(account, extra = {}) {
  const rows = await findServices(account);
  if (!rows.length) {
    return { found: false, services: [], ...extra };
  }
  const pricingMap = await loadPricingMap();
  const services = rows.map((r) => mapService(r, pricingMap));
  return {
    found: true,
    services,
    paybill: PAYBILL,
    ...extra,
  };
}

// GET /api/portal/config
router.get('/config', (req, res) => {
  res.json({
    paybill: PAYBILL,
    brand: 'TCOM Internet',
    supportPhone: '+254 110 345 166',
  });
});

// GET /api/portal/lookup?account=pppoe_or_phone
router.get('/lookup', lookupLimiter, async (req, res) => {
  try {
    const account = req.query.account || req.query.q;
    if (!account) {
      return res.status(400).json({ error: 'account is required' });
    }

    res.json(await lookupResponseForAccount(account));
  } catch (err) {
    console.error('[portal/lookup]', err.message);
    res.status(500).json({ error: 'Lookup failed' });
  }
});

// GET /api/portal/whoami?ip=90.x.x.x
// Captive auto-detect: framed IP (EXPIRED pool) → PPPoE username → services.
// Contabo proxy must send the real client IP (requires Faiba2 no-masquerade to portal).
router.get('/whoami', lookupLimiter, async (req, res) => {
  try {
    const ip = normalizeIp(req.query.ip || '');
    if (!ip) {
      return res.status(400).json({ error: 'ip is required', found: false });
    }
    if (!isCaptiveFramedIp(ip)) {
      return res.json({
        found: false,
        reason: 'not_captive_pool',
        ip,
        services: [],
      });
    }

    const session = await findUsernameByFramedIp(ip);
    if (!session) {
      return res.json({
        found: false,
        reason: 'no_radius_session',
        ip,
        services: [],
      });
    }

    const result = await lookupResponseForAccount(session.username, {
      detected: true,
      account: session.username,
      ip: session.framedIp || ip,
      sessionOpen: session.sessionOpen,
    });

    if (!result.found) {
      return res.json({
        found: false,
        reason: 'username_not_in_billing',
        account: session.username,
        ip,
        services: [],
      });
    }

    res.json(result);
  } catch (err) {
    console.error('[portal/whoami]', err.message);
    res.status(500).json({ error: 'Whoami failed', found: false });
  }
});

// POST /api/portal/pay
// Body: { account, serviceId, period: monthly|weekly|biweekly, phone }
router.post('/pay', payLimiter, async (req, res) => {
  try {
    const { account, serviceId, period, phone } = req.body || {};

    if (!account || !serviceId || !period || !phone) {
      return res.status(400).json({ error: 'account, serviceId, period, and phone are required' });
    }

    const rows = await findServices(account);
    const service = rows.find((r) => r.serviceId === parseInt(serviceId, 10));
    if (!service) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const pricingMap = await loadPricingMap();
    const mapped = mapService(service, pricingMap);

    if (!mapped.canPay) {
      return res.status(400).json({
        error: 'This account is still active. Payment is only needed when service has expired.',
        billingStatus: mapped.billingStatus,
      });
    }

    let amount = mapped.pricing.monthly;
    if (period === 'weekly') {
      if (!mapped.pricing.weekly) {
        return res.status(400).json({ error: 'Weekly payment is not available for this plan' });
      }
      amount = mapped.pricing.weekly;
    } else if (period === 'biweekly') {
      if (!mapped.pricing.biWeekly) {
        return res.status(400).json({ error: 'Bi-weekly payment is not available for this plan' });
      }
      amount = mapped.pricing.biWeekly;
    } else if (period !== 'monthly') {
      return res.status(400).json({ error: 'period must be monthly, weekly, or biweekly' });
    }

    if (amount <= 0) {
      return res.status(400).json({ error: 'Invalid plan amount' });
    }

    const customerDbPhone = String(service.phone || '').replace(/\D/g, '');
    if (!customerDbPhone) {
      return res.status(400).json({ error: 'Customer phone not on file. Call support.' });
    }

    const accountRef = `${customerDbPhone}#${service.serviceId}`;
    const periodLabel = period === 'weekly' ? 'Weekly' : period === 'biweekly' ? 'Bi-weekly' : 'Monthly';

    console.log(`[PORTAL PAY] ${mapped.pppoeUsername} svc=${serviceId} ${period} KES ${amount} ref=${accountRef}`);

    const result = await initiateSTKPush(phone, amount, accountRef, `TCOM ${periodLabel} Renewal`);

    if (!result.success) {
      return res.status(502).json({ success: false, error: result.error });
    }

    res.json({
      success: true,
      checkoutRequestId: result.checkoutRequestId,
      amount,
      period,
      accountRef,
      paybill: PAYBILL,
      message: 'Check your phone for the M-Pesa prompt.',
    });
  } catch (err) {
    console.error('[portal/pay]', err.message);
    res.status(500).json({ error: 'Payment initiation failed' });
  }
});

// GET /api/portal/status/:checkoutRequestId
router.get('/status/:checkoutRequestId', payLimiter, async (req, res) => {
  try {
    const result = await querySTKStatus(req.params.checkoutRequestId);
    res.json(result);
  } catch (err) {
    res.json({ status: 'pending', resultDesc: 'Waiting for payment confirmation' });
  }
});

function parseInvoiceStatus(raw) {
  if (!raw) return {};
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return { label: String(raw) };
  }
}

async function loadReminderBundle(invoiceId, serviceId) {
  const [rows] = await remotePool.query(
    `SELECT
      i.id AS invoiceId,
      i.total AS invoiceTotal,
      i.due_date AS invoiceDue,
      i.status AS invoiceStatus,
      s.id AS serviceId,
      s.mikrotik_name AS pppoeUsername,
      s.price AS servicePrice,
      s.bill_to AS billTo,
      c.id AS customerId,
      c.name AS customerName,
      c.phone_number AS phone,
      p.title AS planName
    FROM invoices i
    JOIN services s ON s.id = i.services_id AND s.deleted_at IS NULL
    JOIN customers c ON c.id = s.customer_id AND c.deleted_at IS NULL
    LEFT JOIN plans p ON p.id = s.plan_id
    WHERE i.id = ? AND s.id = ?
    LIMIT 1`,
    [invoiceId, serviceId]
  );
  return rows[0] || null;
}

async function customerCredit(customerId) {
  const [rows] = await remotePool.query(
    `SELECT COALESCE(SUM(amount), 0) AS credit
     FROM balances
     WHERE balanceable_id = ? AND balanceable_type LIKE '%Customer%'`,
    [customerId]
  );
  return Math.max(0, parseFloat(rows[0]?.credit || 0));
}

async function dueAmountForInvoice(row) {
  const [payRows] = await remotePool.query(
    'SELECT COALESCE(SUM(sum), 0) AS paid FROM payments WHERE invoice_id = ?',
    [row.invoiceId]
  );
  const charge = parseFloat(row.invoiceTotal) || parseFloat(row.servicePrice) || 0;
  const paid = parseFloat(payRows[0]?.paid || 0);
  const credit = await customerCredit(row.customerId);
  const toPay = Math.max(0, Math.round((charge - paid - credit) * 100) / 100);
  return { toPay, charge, paid, credit };
}

function maskPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length < 4) return '';
  return `***${d.slice(-4)}`;
}

// GET /api/portal/reminder?t=signedToken — payment reminder landing (public)
router.get('/reminder', lookupLimiter, async (req, res) => {
  try {
    const decoded = decodeToken(req.query.t);
    if (!decoded) {
      return res.status(400).json({ error: 'This payment link is invalid or has expired.' });
    }

    const row = await loadReminderBundle(decoded.invoiceId, decoded.serviceId);
    if (!row) {
      return res.status(404).json({ error: 'Invoice or service not found.' });
    }

    const invSt = parseInvoiceStatus(row.invoiceStatus);
    const paid = Number(invSt.value) === 2 || String(invSt.label || '').toLowerCase() === 'paid';
    const amounts = await dueAmountForInvoice(row);
    const serviceCountRows = await remotePool.query(
      'SELECT COUNT(*) AS cnt FROM services WHERE customer_id = ? AND deleted_at IS NULL',
      [row.customerId]
    );
    const multi = Number(serviceCountRows[0][0]?.cnt || 0) > 1;
    const accountDigits = String(row.phone || '').replace(/\D/g, '');
    const accountRef = multi ? `${accountDigits}#${row.serviceId}` : accountDigits;

    res.json({
      ok: true,
      alreadyPaid: paid || amounts.toPay <= 0,
      customerName: row.customerName,
      planName: row.planName || 'Internet',
      pppoeUsername: row.pppoeUsername,
      invoiceDue: formatDate(row.invoiceDue),
      billTo: formatDate(row.billTo),
      dueAmount: amounts.toPay,
      invoiceTotal: amounts.charge,
      creditApplied: amounts.credit,
      paybill: PAYBILL,
      accountRef,
      phoneHint: maskPhone(row.phone),
      defaultPhone: row.phone,
    });
  } catch (err) {
    console.error('[portal/reminder]', err.message);
    res.status(500).json({ error: 'Could not load payment details.' });
  }
});

// POST /api/portal/reminder/pay — STK for reminder link (public)
router.post('/reminder/pay', payLimiter, async (req, res) => {
  try {
    const { token, phone } = req.body || {};
    const decoded = decodeToken(token);
    if (!decoded) {
      return res.status(400).json({ error: 'This payment link is invalid or has expired.' });
    }
    if (!phone) {
      return res.status(400).json({ error: 'M-Pesa phone number is required.' });
    }

    const row = await loadReminderBundle(decoded.invoiceId, decoded.serviceId);
    if (!row) {
      return res.status(404).json({ error: 'Invoice or service not found.' });
    }

    const invSt = parseInvoiceStatus(row.invoiceStatus);
    if (Number(invSt.value) === 2 || String(invSt.label || '').toLowerCase() === 'paid') {
      return res.status(400).json({ error: 'This invoice is already paid.' });
    }

    const amounts = await dueAmountForInvoice(row);
    if (amounts.toPay <= 0) {
      return res.status(400).json({ error: 'Nothing to pay on this invoice.' });
    }

    const accountDigits = String(row.phone || '').replace(/\D/g, '');
    if (!accountDigits) {
      return res.status(400).json({ error: 'Customer phone not on file. Call support.' });
    }

    const serviceCountRows = await remotePool.query(
      'SELECT COUNT(*) AS cnt FROM services WHERE customer_id = ? AND deleted_at IS NULL',
      [row.customerId]
    );
    const multi = Number(serviceCountRows[0][0]?.cnt || 0) > 1;
    const accountRef = multi ? `${accountDigits}#${row.serviceId}` : accountDigits;

    console.log(`[PORTAL REMINDER PAY] inv=${decoded.invoiceId} svc=${decoded.serviceId} KES ${amounts.toPay} ref=${accountRef}`);

    const result = await initiateSTKPush(phone, amounts.toPay, accountRef, 'TCOM Bill Payment');

    if (!result.success) {
      return res.status(502).json({ success: false, error: result.error });
    }

    res.json({
      success: true,
      checkoutRequestId: result.checkoutRequestId,
      amount: amounts.toPay,
      accountRef,
      paybill: PAYBILL,
      message: 'Check your phone for the M-Pesa prompt.',
    });
  } catch (err) {
    console.error('[portal/reminder/pay]', err.message);
    res.status(500).json({ error: 'Payment initiation failed' });
  }
});

module.exports = router;
