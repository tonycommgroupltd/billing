// ============================================
// TCOM API — KRA Sidecar Routes
// ============================================
// GET /api/kra/bootstrap-status — Sidecar readiness and source summary

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { remotePool, kraPool } = require('../db');

const authenticate = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey && apiKey === process.env.API_KEY) return next();
  // Also accept Bearer JWT for mobile/app clients
  const { authMiddleware } = require('../auth');
  return authMiddleware(req, res, next);
};

router.use(authenticate);

const KRA_ETIMS_BASE_URL = (process.env.KRA_ETIMS_BASE_URL || 'http://46.137.15.155/api/v1').replace(/\/+$/, '');
const KRA_ETIMS_RECEIPT_VERIFY_BASE_URL = process.env.KRA_ETIMS_RECEIPT_VERIFY_BASE_URL
  || 'https://etims-sbx.kra.go.ke/common/link/etims/receipt/indexEtimsReceiptData?Data=';
const KRA_ETIMS_RECEIPT_DATA_PREFIX = process.env.KRA_ETIMS_RECEIPT_DATA_PREFIX || 'P051885316K08';
const KRA_ETIMS_ALLOW_SYNTHETIC_RECEIPT_URL = String(process.env.KRA_ETIMS_ALLOW_SYNTHETIC_RECEIPT_URL || 'true').toLowerCase() === 'true';

function normalizeEtimsPath(path) {
  return path.startsWith('/') ? path : `/${path}`;
}

function isLikelyHttpUrl(value) {
  const candidate = String(value || '').trim();
  return /^https?:\/\//i.test(candidate);
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const candidate = String(value || '').trim();
    if (candidate) {
      return candidate;
    }
  }
  return '';
}

function buildInvoiceVerificationUrl(invoice) {
  const directUrl = firstNonEmpty(
    invoice?.invoiceVerificationUrl,
    invoice?.verificationUrl,
    invoice?.receiptVerificationUrl,
    invoice?.invoiceVerificationURL,
    invoice?.receiptUrl,
    invoice?.receipt_url
  );
  if (isLikelyHttpUrl(directUrl)) {
    return String(directUrl).trim();
  }

  if (!KRA_ETIMS_ALLOW_SYNTHETIC_RECEIPT_URL) {
    return null;
  }

  const signature = firstNonEmpty(
    invoice?.signature,
    invoice?.cuSignature,
    invoice?.receiptSignature,
    invoice?.digitalSignature,
    invoice?.sdcSignature,
    invoice?.raw?.signature,
    invoice?.raw?.cuSignature
  );
  if (!signature) {
    return null;
  }

  return `${KRA_ETIMS_RECEIPT_VERIFY_BASE_URL}${KRA_ETIMS_RECEIPT_DATA_PREFIX}${encodeURIComponent(signature)}`;
}

function getEtimsAuthHeader(req) {
  if (req.headers.authorization) {
    return req.headers.authorization;
  }

  const username = process.env.KRA_ETIMS_USERNAME;
  const password = process.env.KRA_ETIMS_PASSWORD;
  if (!username || !password) {
    return null;
  }

  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

function relayEtimsResponse(res, upstreamResponse) {
  const contentType = upstreamResponse.headers?.['content-type'] || '';
  if (contentType.includes('application/json')) {
    return res.status(upstreamResponse.status).json(upstreamResponse.data);
  }

  return res.status(upstreamResponse.status).send(upstreamResponse.data);
}

async function callEtims({ method, path, data, params, authorization }) {
  return axios({
    method,
    url: `${KRA_ETIMS_BASE_URL}${normalizeEtimsPath(path)}`,
    data,
    params,
    timeout: Number(process.env.KRA_ETIMS_TIMEOUT_MS || 20000),
    headers: {
      Accept: 'application/json',
      ...(authorization ? { Authorization: authorization } : {}),
    },
    validateStatus: () => true,
  });
}

async function proxyEtimsRequest(req, res, { method, path, requireAuth = false }) {
  try {
    const authorization = getEtimsAuthHeader(req);

    if (requireAuth && !authorization) {
      return res.status(400).json({
        success: false,
        error: 'Missing eTIMS Authorization header. Provide Authorization header or set KRA_ETIMS_USERNAME/KRA_ETIMS_PASSWORD in env.',
      });
    }

    const upstreamResponse = await callEtims({
      method,
      path,
      data: req.body,
      params: req.query,
      authorization,
    });

    return relayEtimsResponse(res, upstreamResponse);
  } catch (err) {
    const details = err.response?.data || err.message;
    console.error('[KRA ETIMS PROXY ERROR]', method, path, details);

    return res.status(502).json({
      success: false,
      error: 'Failed to reach KRA eTIMS API',
      details,
    });
  }
}

function extractEtimsInvoiceList(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  if (Array.isArray(payload?.results)) {
    return payload.results;
  }

  return [];
}

function normalizeEtimsInvoice(invoice) {
  const traderInvoiceNo = invoice?.traderInvoiceNo || invoice?.invoiceNumber || invoice?.invoiceNo || invoice?.invoice_number || null;
  const totalAmount = toNumeric(
    invoice?.totalAmount ?? invoice?.amount ?? invoice?.total ?? invoice?.total_amount
  );
  const salesDate = invoice?.salesDate || invoice?.invoiceDate || invoice?.createdAt || invoice?.created_at || null;
  const status = invoice?.status || invoice?.invoiceStatus || invoice?.statusCode || null;

  return {
    traderInvoiceNo,
    totalAmount,
    salesDate,
    status,
    raw: invoice,
  };
}

function buildEtimsSalesPayload({
  traderInvoiceNo,
  totalAmount,
  paymentType,
  salesTypeCode,
  salesStatusCode,
  receiptTypeCode,
  salesDate,
  currency,
  exchangeRate,
  customerPin,
  salesItems,
}) {
  return {
    traderInvoiceNo: String(traderInvoiceNo),
    totalAmount: toNumeric(totalAmount),
    paymentType: String(paymentType || '01'),
    salesTypeCode: String(salesTypeCode || 'N'),
    receiptTypeCode: String(receiptTypeCode || 'S'),
    salesStatusCode: String(salesStatusCode || '01'),
    salesDate: String(salesDate || toEtimsSalesDate()),
    currency: String(currency || 'KES'),
    exchangeRate: Number(exchangeRate ?? 1),
    ...(customerPin ? { customerPin: String(customerPin) } : {}),
    salesItems: salesItems.map((item) => ({
      itemCode: String(item.itemCode),
      qty: toNumeric(item.qty || 1),
      pkg: toNumeric(item.pkg || 0),
      unitPrice: toNumeric(item.unitPrice || 0),
      amount: toNumeric(item.amount || 0),
      discountAmount: toNumeric(item.discountAmount || 0),
    })),
  };
}

// ============================================
// KRA eTIMS Swagger Proxy Endpoints
// ============================================
// Source: smartOLT/kra/swagger.yaml

router.get('/etims/endpoints', (req, res) => {
  res.json({
    success: true,
    baseUrl: KRA_ETIMS_BASE_URL,
    endpoints: [
      'POST /api/kra/etims/users/auth',
      'POST /api/kra/etims/items',
      'GET /api/kra/etims/items',
      'GET /api/kra/etims/items/:itemCode',
      'PUT /api/kra/etims/items/:itemCode',
      'DELETE /api/kra/etims/items/:itemCode',
      'POST /api/kra/etims/invoices',
      'GET /api/kra/etims/invoices',
      'GET /api/kra/etims/invoices/:traderInvoiceNo',
    ],
  });
});

router.post('/etims/users/auth', async (req, res) => {
  return proxyEtimsRequest(req, res, { method: 'post', path: '/users/auth' });
});

router.post('/etims/items', async (req, res) => {
  return proxyEtimsRequest(req, res, { method: 'post', path: '/items', requireAuth: true });
});

router.get('/etims/items', async (req, res) => {
  return proxyEtimsRequest(req, res, { method: 'get', path: '/items', requireAuth: true });
});

router.get('/etims/items/:itemCode', async (req, res) => {
  return proxyEtimsRequest(req, res, {
    method: 'get',
    path: `/items/${encodeURIComponent(req.params.itemCode)}`,
    requireAuth: true,
  });
});

router.put('/etims/items/:itemCode', async (req, res) => {
  return proxyEtimsRequest(req, res, {
    method: 'put',
    path: `/items/${encodeURIComponent(req.params.itemCode)}`,
    requireAuth: true,
  });
});

router.delete('/etims/items/:itemCode', async (req, res) => {
  return proxyEtimsRequest(req, res, {
    method: 'delete',
    path: `/items/${encodeURIComponent(req.params.itemCode)}`,
    requireAuth: true,
  });
});

router.post('/etims/invoices', async (req, res) => {
  return proxyEtimsRequest(req, res, { method: 'post', path: '/invoices', requireAuth: true });
});

router.get('/etims/invoices', async (req, res) => {
  return proxyEtimsRequest(req, res, { method: 'get', path: '/invoices', requireAuth: true });
});

router.get('/etims/invoices/:traderInvoiceNo', async (req, res) => {
  return proxyEtimsRequest(req, res, {
    method: 'get',
    path: `/invoices/${encodeURIComponent(req.params.traderInvoiceNo)}`,
    requireAuth: true,
  });
});

router.get('/etims/customers', async (req, res) => {
  return proxyEtimsRequest(req, res, { method: 'get', path: '/customers', requireAuth: true });
});

router.post('/etims/customers', async (req, res) => {
  return proxyEtimsRequest(req, res, { method: 'post', path: '/customers', requireAuth: true });
});

router.get('/etims/customers/:customerPin', async (req, res) => {
  return proxyEtimsRequest(req, res, {
    method: 'get',
    path: `/customers/${encodeURIComponent(req.params.customerPin)}`,
    requireAuth: true,
  });
});

router.put('/etims/customers/:customerPin', async (req, res) => {
  return proxyEtimsRequest(req, res, {
    method: 'put',
    path: `/customers/${encodeURIComponent(req.params.customerPin)}`,
    requireAuth: true,
  });
});

router.delete('/etims/customers/:customerPin', async (req, res) => {
  return proxyEtimsRequest(req, res, {
    method: 'delete',
    path: `/customers/${encodeURIComponent(req.params.customerPin)}`,
    requireAuth: true,
  });
});

router.get('/etims/codes/:codeType', async (req, res) => {
  const allowed = new Set(['countries', 'currencies', 'qtyunitcodes', 'pkgunitcodes', 'itemcodes']);
  const { codeType } = req.params;
  if (!allowed.has(codeType)) {
    return res.status(400).json({
      success: false,
      error: `Unsupported codeType '${codeType}'. Allowed: ${Array.from(allowed).join(', ')}`,
    });
  }

  return proxyEtimsRequest(req, res, {
    method: 'get',
    path: `/${codeType}`,
    requireAuth: true,
  });
});

function toNumeric(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toEtimsSalesDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}${hh}${min}${ss}`;
}

function makeTraderInvoiceNo(customerId) {
  const ts = Date.now().toString().slice(-8);
  return `TCOM-${customerId}-${ts}`;
}

function makeMonthlyTraderInvoiceNo(customerId, monthKey) {
  return `TCOM-${customerId}-${String(monthKey || '').replace('-', '')}`;
}

function parseMonthStart(monthKey) {
  if (!/^\d{4}-\d{2}$/.test(String(monthKey || ''))) {
    return null;
  }

  const [year, month] = monthKey.split('-').map((v) => Number(v));
  if (!year || !month || month < 1 || month > 12) {
    return null;
  }

  return new Date(year, month - 1, 1);
}

function nextMonthStart(monthKey) {
  const start = parseMonthStart(monthKey);
  if (!start) {
    return null;
  }
  return new Date(start.getFullYear(), start.getMonth() + 1, 1);
}

async function resolveCustomerContext(customerNumber) {
  const value = String(customerNumber || '').trim();
  const isNumeric = /^\d+$/.test(value);

  const customerSql = isNumeric
    ? `SELECT id, user_id, name, phone_number, address, city, created_at
       FROM customers
       WHERE deleted_at IS NULL
         AND (id = ? OR user_id = ? OR phone_number = ?)
       ORDER BY id = ? DESC
       LIMIT 1`
    : `SELECT id, user_id, name, phone_number, address, city, created_at
       FROM customers
       WHERE deleted_at IS NULL
         AND phone_number = ?
       LIMIT 1`;

  const customerParams = isNumeric ? [value, value, value, value] : [value];
  const [customers] = await remotePool.query(customerSql, customerParams);
  const customer = customers[0];

  if (!customer) {
    return null;
  }

  const [services] = await remotePool.query(
    `SELECT s.id,
            s.customer_id,
            s.plan_id,
            s.price,
            s.bill_to,
            JSON_UNQUOTE(JSON_EXTRACT(s.status, '$.name')) AS status_name,
            JSON_EXTRACT(s.status, '$.value') AS status_value,
            p.title AS plan_title,
            p.price AS plan_price
     FROM services s
     LEFT JOIN plans p ON p.id = s.plan_id
     WHERE s.customer_id = ?
       AND s.deleted_at IS NULL
     ORDER BY s.id DESC`,
    [customer.id]
  );

  const normalizedServices = services.map((row) => {
    const monthlyAmount = toNumeric(row.price) > 0 ? toNumeric(row.price) : toNumeric(row.plan_price);
    const statusName = String(row.status_name || '').toLowerCase();
    const statusValue = toNumeric(row.status_value);
    const active = statusName === 'active' || statusName === 'online' || statusValue === 2;

    return {
      id: row.id,
      title: row.plan_title || `Service ${row.id}`,
      planTitle: row.plan_title || null,
      planId: row.plan_id || null,
      statusName: row.status_name || null,
      statusValue,
      active,
      monthlyAmount,
      billTo: row.bill_to || null,
    };
  });

  const activeServices = normalizedServices.filter((s) => s.active);
  const monthlyAmount = activeServices.reduce((sum, s) => sum + toNumeric(s.monthlyAmount), 0);

  const [payments] = await remotePool.query(
    `SELECT id, trans_id, sum AS amount, date
     FROM payments
     WHERE customer_id = ?
     ORDER BY date DESC
     LIMIT 5`,
    [customer.id]
  );

  const thirdMonthStart = formatDateOnly(monthStart(-2));
  const nextMonthStart = formatDateOnly(monthStart(1));
  const [continuityRows] = await remotePool.query(
    `SELECT COUNT(DISTINCT DATE_FORMAT(date, '%Y-%m')) AS months_with_payment
     FROM payments
     WHERE customer_id = ?
       AND DATE(date) >= ?
       AND DATE(date) < ?`,
    [customer.id, thirdMonthStart, nextMonthStart]
  );
  const monthsWithPayment = toNumeric(continuityRows[0]?.months_with_payment);

  return {
    customer: {
      id: customer.id,
      userId: customer.user_id,
      name: customer.name,
      phone: customer.phone_number,
      address: customer.address,
      city: customer.city,
      createdAt: customer.created_at,
    },
    services: normalizedServices,
    activeServices,
    monthlyAmount,
    payments: payments.map((p) => ({
      id: p.id,
      transId: p.trans_id,
      amount: toNumeric(p.amount),
      date: p.date,
    })),
    continuity: {
      monthsWithPayment,
      requiredMonths: 3,
      eligible: monthsWithPayment >= 3,
    },
  };
}

router.get('/workflow/customer/:customerNumber', async (req, res) => {
  try {
    const context = await resolveCustomerContext(req.params.customerNumber);
    if (!context) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found for supplied customer number',
      });
    }

    const preferredService = context.activeServices[0] || context.services[0] || null;

    return res.json({
      success: true,
      customerNumber: req.params.customerNumber,
      context,
      defaults: {
        customerPin: '',
        itemCode: process.env.KRA_DEFAULT_ITEM_CODE || 'KE3NOCT0000518',
        paymentType: '06',
        salesTypeCode: 'N',
        receiptTypeCode: 'S',
        preferredServiceId: preferredService ? preferredService.id : null,
        suggestedUnitPrice: preferredService ? toNumeric(preferredService.monthlyAmount) : toNumeric(context.monthlyAmount),
        suggestedAmount: preferredService ? toNumeric(preferredService.monthlyAmount) : toNumeric(context.monthlyAmount),
      },
      guidance: {
        step1: 'Sync customer to KRA using POST /api/kra/workflow/customer/:customerNumber/sync-customer',
        step2: 'Issue invoice using POST /api/kra/workflow/customer/:customerNumber/create-invoice',
      },
    });
  } catch (err) {
    console.error('[KRA WORKFLOW CUSTOMER LOOKUP ERROR]', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to load customer KRA workflow context',
      details: err.message,
    });
  }
});

router.get('/workflow/customer/:customerNumber/invoices', async (req, res) => {
  try {
    const context = await resolveCustomerContext(req.params.customerNumber);
    if (!context) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found for supplied customer number',
      });
    }

    const authorization = getEtimsAuthHeader(req);
    if (!authorization) {
      return res.status(400).json({
        success: false,
        error: 'Missing eTIMS Authorization. Set request Authorization header or KRA_ETIMS_USERNAME/KRA_ETIMS_PASSWORD in env.',
      });
    }

    const upstreamResponse = await callEtims({
      method: 'get',
      path: '/invoices',
      params: req.query,
      authorization,
    });

    const invoicePrefix = `TCOM-${context.customer.id}-`;
    const invoices = extractEtimsInvoiceList(upstreamResponse.data)
      .filter((invoice) => {
        const traderInvoiceNo = invoice?.traderInvoiceNo || invoice?.invoiceNumber || invoice?.invoiceNo || invoice?.invoice_number || '';
        return String(traderInvoiceNo).startsWith(invoicePrefix);
      })
      .map((invoice) => ({
        ...invoice,
        invoiceVerificationUrl: buildInvoiceVerificationUrl(invoice),
      }))
      .sort((a, b) => {
        const aDate = String(a?.salesDate || a?.invoiceDate || a?.createdAt || a?.created_at || '');
        const bDate = String(b?.salesDate || b?.invoiceDate || b?.createdAt || b?.created_at || '');
        return bDate.localeCompare(aDate);
      });

    const upstreamStatus = upstreamResponse.status;
    const upstreamBody = upstreamResponse.data || {};
    const nativeStatus = upstreamBody?.status ?? upstreamStatus;
    const nativeStatusCode = upstreamBody?.statusCode ?? (upstreamStatus >= 200 && upstreamStatus < 300 ? 'SUCCESS' : 'FAILED');
    const nativeMessage = upstreamBody?.message || 'Loaded successfully';

    return res.status(200).json({
      success: upstreamStatus >= 200 && upstreamStatus < 300,
      action: 'customer-invoices',
      customerNumber: req.params.customerNumber,
      upstreamStatus,
      status: nativeStatus,
      statusCode: nativeStatusCode,
      message: nativeMessage,
      data: invoices,
      customer: context.customer,
      totalFound: invoices.length,
      invoices,
      upstream: upstreamBody,
    });
  } catch (err) {
    console.error('[KRA WORKFLOW CUSTOMER INVOICES ERROR]', err);
    return res.status(502).json({
      success: false,
      error: 'Failed to load customer invoices from KRA',
      details: err.response?.data || err.message,
    });
  }
});

router.post('/workflow/customer/:customerNumber/sync-customer', async (req, res) => {
  try {
    const context = await resolveCustomerContext(req.params.customerNumber);
    if (!context) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    const authorization = getEtimsAuthHeader(req);
    if (!authorization) {
      return res.status(400).json({
        success: false,
        error: 'Missing eTIMS Authorization. Set request Authorization header or KRA_ETIMS_USERNAME/KRA_ETIMS_PASSWORD in env.',
      });
    }

    const customerPin = String(req.body.customerPin || '').trim();

    const customerPayload = {
      name: context.customer.name,
      phone: context.customer.phone || String(req.params.customerNumber),
      ...(customerPin ? { pin: customerPin } : {}),
      ...(req.body.customerPayload || {}),
    };

    const upstreamResponse = await callEtims({
      method: 'post',
      path: '/customers',
      data: customerPayload,
      authorization,
    });

    const syncOk = upstreamResponse.status >= 200 && upstreamResponse.status < 300;
    return res.status(200).json({
      success: syncOk,
      action: 'sync-customer',
      customerNumber: req.params.customerNumber,
      requestPayload: customerPayload,
      upstreamStatus: upstreamResponse.status,
      upstream: upstreamResponse.data,
    });
  } catch (err) {
    console.error('[KRA WORKFLOW SYNC CUSTOMER ERROR]', err);
    return res.status(502).json({
      success: false,
      error: 'Failed to sync customer to KRA',
      details: err.response?.data || err.message,
    });
  }
});

router.post('/workflow/customer/:customerNumber/create-invoice', async (req, res) => {
  try {
    const context = await resolveCustomerContext(req.params.customerNumber);
    if (!context) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    const authorization = getEtimsAuthHeader(req);
    if (!authorization) {
      return res.status(400).json({
        success: false,
        error: 'Missing eTIMS Authorization. Set request Authorization header or KRA_ETIMS_USERNAME/KRA_ETIMS_PASSWORD in env.',
      });
    }

    const customerPin = String(req.body.customerPin || '').trim();

    const selectedService = context.services.find((s) => String(s.id) === String(req.body.mainServiceId))
      || context.activeServices[0]
      || context.services[0];

    const quantity = Math.max(1, toNumeric(req.body.quantity || 1));
    const unitPrice = toNumeric(req.body.unitPrice || selectedService?.monthlyAmount || context.monthlyAmount || 0);
    const amount = toNumeric(req.body.amount || (quantity * unitPrice));
    const itemCode = String(req.body.itemCode || process.env.KRA_DEFAULT_ITEM_CODE || 'KE3NOCT0000518');
    const itemDescription = String(req.body.itemDescription || selectedService?.title || 'Internet subscription');
    const traderInvoiceNo = String(req.body.traderInvoiceNo || makeTraderInvoiceNo(context.customer.id));

    const salesPayload = {
      ...buildEtimsSalesPayload({
        traderInvoiceNo,
        totalAmount: amount,
        paymentType: req.body.paymentType || '01',
        salesTypeCode: req.body.salesTypeCode || 'N',
        salesStatusCode: req.body.salesStatusCode || '01',
        receiptTypeCode: req.body.receiptTypeCode || 'S',
        salesDate: req.body.salesDate || toEtimsSalesDate(),
        currency: req.body.currency || 'KES',
        exchangeRate: req.body.exchangeRate ?? 1,
        customerPin,
        salesItems: [
          {
            itemCode,
            qty: quantity,
            pkg: req.body.pkg ?? 0,
            unitPrice,
            amount,
            discountAmount: req.body.discountAmount || 0,
          },
        ],
      }),
      ...(req.body.salesPayload || {}),
    };

    let customerSyncResult = null;
    if (req.body.syncCustomerFirst) {
      const customerPayload = {
        name: context.customer.name,
        phone: context.customer.phone || String(req.params.customerNumber),
        ...(customerPin ? { pin: customerPin } : {}),
        ...(req.body.customerPayload || {}),
      };

      const customerSyncResponse = await callEtims({
        method: 'post',
        path: '/customers',
        data: customerPayload,
        authorization,
      });

      customerSyncResult = {
        status: customerSyncResponse.status,
        data: customerSyncResponse.data,
      };
    }

    const invoiceResponse = await callEtims({
      method: 'post',
      path: '/invoices',
      data: salesPayload,
      authorization,
    });

    const invoiceOk = invoiceResponse.status >= 200 && invoiceResponse.status < 300;
    const upstreamBody = invoiceResponse.data;
    const etimsPayload = (upstreamBody && typeof upstreamBody === 'object' && !Array.isArray(upstreamBody))
      ? upstreamBody
      : { data: upstreamBody };

    return res.status(200).json({
      ...etimsPayload,
      meta: {
        success: invoiceOk,
        action: 'create-invoice',
        customerNumber: req.params.customerNumber,
        selectedService,
        requestPayload: salesPayload,
        customerSync: customerSyncResult,
        upstreamStatus: invoiceResponse.status,
      },
    });
  } catch (err) {
    console.error('[KRA WORKFLOW CREATE INVOICE ERROR]', err);
    return res.status(502).json({
      success: false,
      error: 'Failed to create KRA invoice',
      details: err.response?.data || err.message,
    });
  }
});

router.post('/workflow/customer/:customerNumber/generate-all-invoices', async (req, res) => {
  try {
    const context = await resolveCustomerContext(req.params.customerNumber);
    if (!context) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    const authorization = getEtimsAuthHeader(req);
    if (!authorization) {
      return res.status(400).json({
        success: false,
        error: 'Missing eTIMS Authorization. Set request Authorization header or KRA_ETIMS_USERNAME/KRA_ETIMS_PASSWORD in env.',
      });
    }

    const fromMonth = String(req.body.fromMonth || '').trim();
    const toMonth = String(req.body.toMonth || '').trim();
    if (fromMonth && !parseMonthStart(fromMonth)) {
      return res.status(400).json({ success: false, error: 'Invalid fromMonth format. Use YYYY-MM' });
    }
    if (toMonth && !parseMonthStart(toMonth)) {
      return res.status(400).json({ success: false, error: 'Invalid toMonth format. Use YYYY-MM' });
    }

    const where = ['customer_id = ?'];
    const params = [context.customer.id];

    if (fromMonth) {
      where.push('DATE(date) >= ?');
      params.push(`${fromMonth}-01`);
    }
    if (toMonth) {
      const toEndExclusive = nextMonthStart(toMonth);
      where.push('DATE(date) < ?');
      params.push(formatDateOnly(toEndExclusive));
    }

    const [monthlyPayments] = await remotePool.query(
      `SELECT DATE_FORMAT(date, '%Y-%m') AS month_key,
              MIN(date) AS first_payment_date,
              MAX(date) AS last_payment_date,
              COUNT(*) AS payments_count,
              COALESCE(SUM(sum), 0) AS total_amount
       FROM payments
       WHERE ${where.join(' AND ')}
       GROUP BY DATE_FORMAT(date, '%Y-%m')
       ORDER BY month_key ASC`,
      params
    );

    const months = monthlyPayments
      .map((row) => ({
        monthKey: row.month_key,
        firstPaymentDate: row.first_payment_date,
        lastPaymentDate: row.last_payment_date,
        paymentsCount: toNumeric(row.payments_count),
        totalAmount: toNumeric(row.total_amount),
      }))
      .filter((m) => m.totalAmount > 0);

    if (months.length === 0) {
      return res.json({
        success: true,
        action: 'generate-all-invoices',
        customerNumber: req.params.customerNumber,
        customerId: context.customer.id,
        generated: 0,
        failed: 0,
        skipped: 0,
        results: [],
        message: 'No monthly payments found for invoice generation in the selected period.',
      });
    }

    const customerPin = String(req.body.customerPin || '').trim();
    const selectedService = context.services.find((s) => String(s.id) === String(req.body.mainServiceId))
      || context.activeServices[0]
      || context.services[0];

    const baseQuantity = Math.max(1, toNumeric(req.body.quantity || 1));
    const baseUnitPrice = toNumeric(req.body.unitPrice || selectedService?.monthlyAmount || context.monthlyAmount || 0);
    const itemCode = String(req.body.itemCode || process.env.KRA_DEFAULT_ITEM_CODE || 'KE3NOCT0000518');
    const itemDescription = String(req.body.itemDescription || selectedService?.title || 'Internet subscription');

    let customerSyncResult = null;
    if (req.body.syncCustomerFirst) {
      const customerPayload = {
        name: context.customer.name,
        phone: context.customer.phone || String(req.params.customerNumber),
        ...(customerPin ? { pin: customerPin } : {}),
        ...(req.body.customerPayload || {}),
      };

      const syncResponse = await callEtims({
        method: 'post',
        path: '/customers',
        data: customerPayload,
        authorization,
      });

      customerSyncResult = {
        status: syncResponse.status,
        success: syncResponse.status >= 200 && syncResponse.status < 300,
        data: syncResponse.data,
      };
    }

    const results = [];
    for (const month of months) {
      const monthAmount = toNumeric(month.totalAmount);
      const quantity = baseQuantity;
      const unitPrice = toNumeric(req.body.unitPrice) > 0 ? toNumeric(req.body.unitPrice) : baseUnitPrice;

      const salesPayload = {
        ...buildEtimsSalesPayload({
          traderInvoiceNo: makeMonthlyTraderInvoiceNo(context.customer.id, month.monthKey),
          totalAmount: monthAmount,
          paymentType: req.body.paymentType || '01',
          salesTypeCode: req.body.salesTypeCode || 'N',
          salesStatusCode: req.body.salesStatusCode || '01',
          receiptTypeCode: req.body.receiptTypeCode || 'S',
          salesDate: req.body.salesDate || toEtimsSalesDate(month.firstPaymentDate || new Date()),
          currency: req.body.currency || 'KES',
          exchangeRate: req.body.exchangeRate ?? 1,
          customerPin,
          salesItems: [
            {
              itemCode,
              qty: quantity,
              pkg: req.body.pkg ?? 0,
              unitPrice,
              amount: monthAmount,
              discountAmount: req.body.discountAmount || 0,
            },
          ],
        }),
        ...(req.body.salesPayload || {}),
      };

      try {
        const invoiceResponse = await callEtims({
          method: 'post',
          path: '/invoices',
          data: salesPayload,
          authorization,
        });

        results.push({
          month: month.monthKey,
          paymentsCount: month.paymentsCount,
          amount: monthAmount,
          status: invoiceResponse.status,
          success: invoiceResponse.status >= 200 && invoiceResponse.status < 300,
          traderInvoiceNo: salesPayload.traderInvoiceNo,
          requestPayload: salesPayload,
          upstream: invoiceResponse.data,
        });
      } catch (err) {
        results.push({
          month: month.monthKey,
          paymentsCount: month.paymentsCount,
          amount: monthAmount,
          status: 0,
          success: false,
          traderInvoiceNo: salesPayload.traderInvoiceNo,
          requestPayload: salesPayload,
          upstream: err.response?.data || err.message,
        });
      }
    }

    const generated = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return res.json({
      success: failed === 0,
      action: 'generate-all-invoices',
      customerNumber: req.params.customerNumber,
      customerId: context.customer.id,
      selectedService,
      period: {
        fromMonth: fromMonth || null,
        toMonth: toMonth || null,
      },
      totals: {
        monthsFound: months.length,
        generated,
        failed,
      },
      customerSync: customerSyncResult,
      results,
    });
  } catch (err) {
    console.error('[KRA WORKFLOW GENERATE ALL INVOICES ERROR]', err);
    return res.status(502).json({
      success: false,
      error: 'Failed to generate all monthly invoices for customer',
      details: err.response?.data || err.message,
    });
  }
});

function monthStart(offsetMonths) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
}

function formatDateOnly(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Fetch available items from KRA eTIMS (for item code lookup) — /items is public
router.get('/etims-items', async (req, res) => {
  try {
    const authorization = getEtimsAuthHeader(req);
    const upstreamResponse = await callEtims({ method: 'get', path: '/items', params: req.query, authorization });
    return res.status(200).json({
      success: upstreamResponse.status >= 200 && upstreamResponse.status < 300,
      upstreamStatus: upstreamResponse.status,
      data: upstreamResponse.data,
    });
  } catch (err) {
    return res.status(502).json({ success: false, error: 'Failed to fetch eTIMS items', details: err.message });
  }
});

router.get('/bootstrap-status', async (req, res) => {
  const requiredTables = [
    'kra_customers',
    'kra_service_accounts',
    'kra_staff_users',
    'kra_invoices',
    'kra_invoice_lines',
    'kra_payment_receipts',
    'kra_payment_allocations',
    'kra_credit_notes',
    'kra_debit_notes',
    'kra_financial_events',
    'kra_entity_versions',
    'kra_sync_outbox',
    'kra_sync_dead_letter',
    'kra_reconciliation_runs',
    'kra_reconciliation_items',
  ];

  const currentMonthStart = formatDateOnly(monthStart(0));
  const thirdMonthStart = formatDateOnly(monthStart(-2));
  const nextMonthStart = formatDateOnly(monthStart(1));

  try {
    const [sourceCounts] = await Promise.all([
      Promise.all([
        remotePool.query('SELECT COUNT(*) AS total FROM customers WHERE deleted_at IS NULL'),
        remotePool.query('SELECT COUNT(*) AS total FROM services WHERE deleted_at IS NULL'),
        remotePool.query('SELECT COUNT(*) AS total FROM payments'),
        remotePool.query(
          `SELECT COUNT(DISTINCT c.id) AS total
           FROM customers c
           JOIN services s ON s.customer_id = c.id
           WHERE c.deleted_at IS NULL
             AND s.deleted_at IS NULL
             AND JSON_EXTRACT(s.status, '$.value') = 2`
        ),
        remotePool.query(
          `SELECT COUNT(*) AS total
           FROM (
             SELECT p.customer_id
             FROM payments p
             WHERE DATE(p.date) >= ?
               AND DATE(p.date) < ?
             GROUP BY p.customer_id
             HAVING COUNT(DISTINCT DATE_FORMAT(p.date, '%Y-%m')) = 3
           ) continuity`,
          [thirdMonthStart, nextMonthStart]
        ),
        remotePool.query(
          `SELECT MAX(date) AS latest_payment_at
           FROM payments`
        ),
      ]),
    ]);

    let sidecarStatus;
    try {
      const [tables] = await kraPool.query(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = DATABASE()`
      );
      const existingTables = new Set(tables.map((row) => row.table_name));
      sidecarStatus = {
        database: process.env.KRA_DB_NAME || 'tcom_kra',
        ready: requiredTables.every((table) => existingTables.has(table)),
        tablesPresent: requiredTables.filter((table) => existingTables.has(table)),
        tablesMissing: requiredTables.filter((table) => !existingTables.has(table)),
      };
    } catch (err) {
      sidecarStatus = {
        database: process.env.KRA_DB_NAME || 'tcom_kra',
        ready: false,
        tablesPresent: [],
        tablesMissing: requiredTables,
        error: err.message,
      };
    }

    const [customersTotal] = sourceCounts[0];
    const [servicesTotal] = sourceCounts[1];
    const [paymentsTotal] = sourceCounts[2];
    const [activeCustomers] = sourceCounts[3];
    const [continuousPayers] = sourceCounts[4];
    const [latestPayment] = sourceCounts[5];

    res.json({
      success: true,
      sourceSummary: {
        customers: customersTotal[0].total,
        services: servicesTotal[0].total,
        payments: paymentsTotal[0].total,
        activeCustomers: activeCustomers[0].total,
        continuousPayers3Months: continuousPayers[0].total,
        latestPaymentAt: latestPayment[0].latest_payment_at,
        paymentContinuityWindow: {
          start: thirdMonthStart,
          currentMonthStart,
          endExclusive: nextMonthStart,
        },
      },
      sidecar: sidecarStatus,
      guidance: {
        invoiceIssuanceRule: 'KRA invoices must be issued only after confirmed payment receipt is ingested.',
        nextStep: sidecarStatus.ready ? 'Begin payment receipt ingestion and invoice issuance workflows.' : 'Run the KRA sidecar migration to create the audit-grade schema.',
      },
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[KRA BOOTSTRAP STATUS ERROR]', err);
    res.status(500).json({
      success: false,
      error: 'Failed to inspect KRA sidecar readiness',
      details: err.message,
    });
  }
});

// ============================================
// POST /api/kra/ingest-payment
// ============================================
// Ingest M-Pesa payment receipt into KRA sidecar.
// Enforces payment-first rule: creates immutable payment_receipts entry
// with full M-Pesa evidence trail for audit, then emits sync_outbox event
// to propagate back to main DB for reconciliation.

const crypto = require('crypto');

router.post('/ingest-payment', async (req, res) => {
  const {
    main_payment_id,
    main_customer_id,
    main_service_id,
    amount,
    mpesa_receipt_number,
    source_payload,
    received_at,
    idempotency_key,
  } = req.body;

  // Validation: Required fields
  if (!main_payment_id || !main_customer_id || !amount || !mpesa_receipt_number || !source_payload || !idempotency_key) {
    return res.status(400).json({
      success: false,
      error: 'Missing required payment ingestion fields: main_payment_id, main_customer_id, amount, mpesa_receipt_number, source_payload, idempotency_key',
    });
  }

  const connection = await kraPool.getConnection();
  try {
    await connection.beginTransaction();

    // Check idempotency: payment with this idempotency_key already ingested?
    const [existingReceipts] = await connection.query(
      `SELECT id, created_at FROM kra_payment_receipts WHERE idempotency_key = ?`,
      [idempotency_key]
    );

    if (existingReceipts.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        error: 'Payment already ingested (idempotency key duplicate)',
        receipt_id: existingReceipts[0].id,
        ingested_at: existingReceipts[0].created_at,
      });
    }

    // Validate customer eligibility in source DB: active, with continuous payment history
    const [sourceCustomer] = await remotePool.query(
      `SELECT c.id, c.name, c.phone
       FROM customers c
       WHERE c.id = ? AND c.deleted_at IS NULL`,
      [main_customer_id]
    );

    if (sourceCustomer.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: 'Customer not found in source DB or is deleted',
        main_customer_id,
      });
    }

    const customer = sourceCustomer[0];

    // Validate service eligibility: active and within 3-month continuity window
    const [sourceService] = await remotePool.query(
      `SELECT id, customer_id, billing_date FROM services
       WHERE id = ? AND customer_id = ? AND deleted_at IS NULL
       AND JSON_EXTRACT(status, '$.value') = 2`,
      [main_service_id, main_customer_id]
    );

    if (sourceService.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: 'Service not found, deleted, or not active',
        main_service_id,
        main_customer_id,
      });
    }

    // Check 3-month payment continuity: has this customer made payments in last 3 months?
    const thirdMonthStart = formatDateOnly(monthStart(-2));
    const nextMonthStart = formatDateOnly(monthStart(1));
    const [continuityCheck] = await remotePool.query(
      `SELECT COUNT(DISTINCT DATE_FORMAT(date, '%Y-%m')) AS months_with_payment
       FROM payments
       WHERE customer_id = ?
         AND DATE(date) >= ?
         AND DATE(date) < ?`,
      [main_customer_id, thirdMonthStart, nextMonthStart]
    );

    const monthsWithPayment = continuityCheck[0]?.months_with_payment || 0;
    if (monthsWithPayment < 3) {
      await connection.rollback();
      return res.status(403).json({
        success: false,
        error: 'Customer does not meet 3-month payment continuity requirement for KRA invoicing',
        main_customer_id,
        monthsWithPayment,
        requiredMonths: 3,
      });
    }

    // Compute source_payload_hash for M-Pesa deduplication
    const sourcePayloadHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(source_payload))
      .digest('hex');

    // Generate immutable receipt number (will be set by trigger, but we track here)
    const [sequenceResult] = await connection.query(
      `INSERT INTO kra_invoice_sequences (sequence_type, last_value, updated_at)
       VALUES ('payment_receipt', COALESCE((SELECT MAX(CAST(SUBSTRING(invoice_number, 4) AS UNSIGNED)) FROM kra_payment_receipts), 1000), NOW())
       ON DUPLICATE KEY UPDATE last_value = last_value + 1`,
      []
    );

    const receiptNumber = `RCV${String(Date.now()).slice(-6)}${String(Math.random()).slice(2, 5)}`;

    // Insert payment receipt with full M-Pesa evidence trail
    const [insertResult] = await connection.query(
      `INSERT INTO kra_payment_receipts (
        receipt_number,
        main_payment_id,
        main_customer_id,
        main_service_id,
        amount,
        mpesa_receipt_number,
        source_payload,
        source_payload_hash,
        idempotency_key,
        received_at,
        confirmed_at,
        confirmation_status,
        created_by,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'CONFIRMED', ?, NOW(), NOW())`,
      [
        receiptNumber,
        main_payment_id,
        main_customer_id,
        main_service_id,
        amount,
        mpesa_receipt_number,
        JSON.stringify(source_payload),
        sourcePayloadHash,
        idempotency_key,
        received_at || new Date().toISOString(),
        req.user.id || 'system',
      ]
    );

    const paymentReceiptId = insertResult.insertId;

    // Record immutable financial event for audit trail
    await connection.query(
      `INSERT INTO kra_financial_events (
        event_type,
        entity_type,
        entity_id,
        actor,
        change_summary,
        full_payload,
        source_system,
        source_reference,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        'PAYMENT_RECEIPT_INGESTED',
        'payment_receipt',
        paymentReceiptId,
        req.user.id || 'system',
        `Receipt RCV${String(Date.now()).slice(-6)} confirmed for customer ${main_customer_id}, amount ${amount}`,
        JSON.stringify({
          receipt_id: paymentReceiptId,
          main_payment_id,
          amount,
          mpesa_receipt: mpesa_receipt_number,
          continuity_check: { months_with_payment: monthsWithPayment },
        }),
        'mpesa',
        mpesa_receipt_number,
      ]
    );

    // Emit sync_outbox event: propagate back to main DB for reconciliation
    await connection.query(
      `INSERT INTO kra_sync_outbox (
        sync_type,
        target_system,
        source_entity_type,
        source_entity_id,
        payload,
        retry_count,
        last_retry_at,
        status,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NOW())`,
      [
        'PAYMENT_RECEIPT_SYNC',
        'main_db',
        'payment_receipt',
        paymentReceiptId,
        JSON.stringify({
          payment_receipt_id: paymentReceiptId,
          receipt_number: receiptNumber,
          main_payment_id,
          main_customer_id,
          amount,
          mpesa_receipt_number,
          confirmation_status: 'CONFIRMED',
        }),
        0,
        'PENDING',
      ]
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      payment_receipt_id: paymentReceiptId,
      receipt_number: receiptNumber,
      main_payment_id,
      main_customer_id,
      amount,
      mpesa_receipt_number,
      confirmation_status: 'CONFIRMED',
      received_at: received_at || new Date().toISOString(),
      customer: {
        name: customer.name,
        phone: customer.phone,
      },
      continuity_verification: {
        months_with_payment: monthsWithPayment,
        required_months: 3,
        eligible_for_invoicing: true,
      },
      guidance: 'Payment receipt confirmed. Customer is now eligible for KRA invoice issuance in this period. Use POST /api/kra/issue-invoice to create invoice.',
      ingested_at: new Date().toISOString(),
    });
  } catch (err) {
    try {
      await connection.rollback();
    } catch (rbErr) {
      // ignore rollback failure
    }
    console.error('[KRA PAYMENT INGESTION ERROR]', err);
    res.status(500).json({
      success: false,
      error: 'Failed to ingest payment receipt',
      details: err.message,
    });
  } finally {
    connection.release();
  }
});

// ============================================
// POST /api/kra/issue-invoice
// ============================================
// Issue immutable KRA invoice after payment receipt confirmation.
// Enforces payment-first rule: requires kra_payment_receipts entry
// for customer in current/recent period. Generates immutable invoice_number
// and allocates confirmed payment to invoice lines.

router.post('/issue-invoice', async (req, res) => {
  const {
    main_customer_id,
    main_service_id,
    period_start,
    period_end,
    invoice_lines,
    notes,
    idempotency_key,
  } = req.body;

  // Validation: Required fields
  if (!main_customer_id || !main_service_id || !period_start || !period_end || !invoice_lines || !Array.isArray(invoice_lines) || invoice_lines.length === 0 || !idempotency_key) {
    return res.status(400).json({
      success: false,
      error: 'Missing required invoice issuance fields: main_customer_id, main_service_id, period_start, period_end, invoice_lines (array), idempotency_key',
    });
  }

  // Validate each line has description, quantity, unit_price, amount
  for (const line of invoice_lines) {
    if (!line.description || typeof line.quantity !== 'number' || typeof line.unit_price !== 'number' || typeof line.amount !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'Each invoice_line must have: description, quantity (number), unit_price (number), amount (number)',
      });
    }
  }

  const connection = await kraPool.getConnection();
  try {
    await connection.beginTransaction();

    // Check idempotency: invoice with this idempotency_key already created?
    const [existingInvoices] = await connection.query(
      `SELECT id, invoice_number, created_at FROM kra_invoices WHERE idempotency_key = ?`,
      [idempotency_key]
    );

    if (existingInvoices.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        error: 'Invoice already issued (idempotency key duplicate)',
        invoice_id: existingInvoices[0].id,
        invoice_number: existingInvoices[0].invoice_number,
        issued_at: existingInvoices[0].created_at,
      });
    }

    // PAYMENT-FIRST RULE: Verify payment_receipt exists for this customer in the period
    const [paymentReceipts] = await connection.query(
      `SELECT id, receipt_number, amount, confirmed_at
       FROM kra_payment_receipts
       WHERE main_customer_id = ?
         AND confirmation_status = 'CONFIRMED'
         AND DATE(confirmed_at) >= ?
         AND DATE(confirmed_at) <= ?
       ORDER BY confirmed_at DESC
       LIMIT 1`,
      [main_customer_id, period_start, period_end]
    );

    if (paymentReceipts.length === 0) {
      await connection.rollback();
      return res.status(403).json({
        success: false,
        error: 'Payment-first rule violated: no confirmed payment receipt found for this customer in the specified period',
        main_customer_id,
        period_start,
        period_end,
        guidance: 'First ingest a confirmed payment receipt using POST /api/kra/ingest-payment before creating invoice.',
      });
    }

    const paymentReceipt = paymentReceipts[0];
    const totalInvoiceAmount = invoice_lines.reduce((sum, line) => sum + line.amount, 0);

    // Validate payment amount >= invoice amount (payment must cover invoice)
    if (paymentReceipt.amount < totalInvoiceAmount) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: 'Invoice amount exceeds confirmed payment amount',
        invoice_total: totalInvoiceAmount,
        payment_amount: paymentReceipt.amount,
        shortfall: totalInvoiceAmount - paymentReceipt.amount,
      });
    }

    // Fetch KRA customer record (must exist from bootstrap or prior sync)
    const [kraCustomers] = await connection.query(
      `SELECT id, customer_name FROM kra_customers WHERE main_customer_id = ?`,
      [main_customer_id]
    );

    if (kraCustomers.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: 'Customer not found in KRA sidecar. Run bootstrap sync first.',
        main_customer_id,
      });
    }

    const kraCustomer = kraCustomers[0];

    // Generate immutable invoice number using sequence
    const [seqResult] = await connection.query(
      `SELECT last_value FROM kra_invoice_sequences WHERE sequence_type = 'invoice'`,
      []
    );

    let nextInvoiceNumber;
    if (seqResult.length > 0) {
      nextInvoiceNumber = String(seqResult[0].last_value + 1).padStart(8, '0');
      await connection.query(
        `UPDATE kra_invoice_sequences SET last_value = last_value + 1 WHERE sequence_type = 'invoice'`,
        []
      );
    } else {
      nextInvoiceNumber = '00000101';
      await connection.query(
        `INSERT INTO kra_invoice_sequences (sequence_type, last_value, updated_at) VALUES (?, ?, NOW())`,
        ['invoice', 101]
      );
    }

    const invoiceNumber = `INV-${nextInvoiceNumber}`;

    // Create immutable invoice record with payment-first flag set
    const [invoiceResult] = await connection.query(
      `INSERT INTO kra_invoices (
        invoice_number,
        main_customer_id,
        main_service_id,
        kra_customer_id,
        period_start,
        period_end,
        total_amount,
        tax_amount,
        net_amount,
        issued_after_payment,
        payment_receipt_id,
        status,
        notes,
        idempotency_key,
        created_by,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        invoiceNumber,
        main_customer_id,
        main_service_id,
        kraCustomer.id,
        period_start,
        period_end,
        totalInvoiceAmount,
        0, // tax_amount (can be customized per jurisdiction)
        totalInvoiceAmount,
        true, // issued_after_payment = 1 (enforced rule)
        paymentReceipt.id,
        'ISSUED',
        notes || '',
        idempotency_key,
        req.user.id || 'system',
      ]
    );

    const invoiceId = invoiceResult.insertId;

    // Insert invoice lines (immutable items)
    const linePromises = invoice_lines.map((line, idx) =>
      connection.query(
        `INSERT INTO kra_invoice_lines (
          invoice_id,
          line_number,
          description,
          quantity,
          unit_price,
          amount,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [invoiceId, idx + 1, line.description, line.quantity, line.unit_price, line.amount]
      )
    );

    await Promise.all(linePromises);

    // Record financial event: INVOICE_ISSUED
    await connection.query(
      `INSERT INTO kra_financial_events (
        event_type,
        entity_type,
        entity_id,
        actor,
        change_summary,
        full_payload,
        source_system,
        source_reference,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        'INVOICE_ISSUED',
        'invoice',
        invoiceId,
        req.user.id || 'system',
        `Invoice ${invoiceNumber} issued to customer ${main_customer_id} for period ${period_start}–${period_end}. Payment-first rule applied. Total: ${totalInvoiceAmount}`,
        JSON.stringify({
          invoice_id: invoiceId,
          invoice_number: invoiceNumber,
          main_customer_id,
          total_amount: totalInvoiceAmount,
          payment_receipt_id: paymentReceipt.id,
          receipt_number: paymentReceipt.receipt_number,
          line_count: invoice_lines.length,
        }),
        'kra_api',
        invoiceNumber,
      ]
    );

    // Record payment allocation: tie payment_receipt to invoice for reconciliation
    await connection.query(
      `INSERT INTO kra_payment_allocations (
        payment_receipt_id,
        invoice_id,
        allocated_amount,
        allocation_status,
        created_at
      ) VALUES (?, ?, ?, ?, NOW())`,
      [paymentReceipt.id, invoiceId, totalInvoiceAmount, 'ALLOCATED']
    );

    // Emit sync_outbox event: propagate KRA invoice back to main DB
    await connection.query(
      `INSERT INTO kra_sync_outbox (
        sync_type,
        target_system,
        source_entity_type,
        source_entity_id,
        payload,
        retry_count,
        last_retry_at,
        status,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NOW())`,
      [
        'INVOICE_SYNC',
        'main_db',
        'invoice',
        invoiceId,
        JSON.stringify({
          invoice_id: invoiceId,
          invoice_number: invoiceNumber,
          main_customer_id,
          main_service_id,
          period_start,
          period_end,
          total_amount: totalInvoiceAmount,
          payment_receipt_id: paymentReceipt.id,
          issued_after_payment: true,
          line_count: invoice_lines.length,
        }),
        0,
        'PENDING',
      ]
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      invoice_id: invoiceId,
      invoice_number: invoiceNumber,
      main_customer_id,
      main_service_id,
      customer_name: kraCustomer.customer_name,
      period: { start: period_start, end: period_end },
      line_items: invoice_lines,
      totals: {
        items_total: totalInvoiceAmount,
        tax: 0,
        invoice_total: totalInvoiceAmount,
      },
      payment_confirmation: {
        receipt_number: paymentReceipt.receipt_number,
        amount: paymentReceipt.amount,
        allocated_to_invoice: totalInvoiceAmount,
        confirmed_at: paymentReceipt.confirmed_at,
      },
      payment_first_rule: {
        applied: true,
        enforced_by: 'issued_after_payment flag set to 1',
        payment_receipt_required: 'YES',
        payment_receipt_verified: true,
      },
      status: 'ISSUED',
      guidance: 'Invoice is now immutable and audit-locked. Payment allocation recorded. Sync pending to main DB.',
      issued_at: new Date().toISOString(),
    });
  } catch (err) {
    try {
      await connection.rollback();
    } catch (rbErr) {
      // ignore rollback failure
    }
    console.error('[KRA INVOICE ISSUANCE ERROR]', err);
    res.status(500).json({
      success: false,
      error: 'Failed to issue invoice',
      details: err.message,
    });
  } finally {
    connection.release();
  }
});

module.exports = router;