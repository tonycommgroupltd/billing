import { http, httpNode } from './http';

/** Registered eTIMS catalog defaults (see kra/ENDPOINTS.md). */
export const KRA_DEFAULT_ITEM_CODE = 'KE3NTXNOX00002';
export const KRA_DEFAULT_ITEM_NAME = 'INTERNET SERVICES';
export const KRA_FALLBACK_ITEM_CODE = 'KE3NTXNOX00001';
export const KRA_FALLBACK_ITEM_NAME = 'NETWORK FACILLITIES';

export const KRA_RECEIPT_VERIFY_BASE_URL =
  process.env.REACT_APP_KRA_ETIMS_RECEIPT_VERIFY_BASE_URL
  || 'https://etims-sbx.kra.go.ke/common/link/etims/receipt/indexEtimsReceiptData?Data=';
export const KRA_RECEIPT_DATA_PREFIX =
  process.env.REACT_APP_KRA_ETIMS_RECEIPT_DATA_PREFIX || 'P051885316K08';

export function normalizeEtimsItem(row) {
  if (!row || typeof row !== 'object') {
    const code = String(row || '').trim();
    return code ? { itemCode: code, name: '', unitPrice: null } : null;
  }
  const itemCode = String(
    row.itemCode || row.code || row.itemNm || row.name || ''
  ).trim();
  if (!itemCode) return null;
  return {
    itemCode,
    name: row.itemNm || row.name || row.description || '',
    unitPrice: row.unitPrice != null ? Number(row.unitPrice) : null,
    taxCode: row.taxCode || null,
    raw: row,
  };
}

/** Normalize various API response shapes into a flat item list. */
export function parseEtimsItemsResponse(payload) {
  const tryList = (value) => {
    if (!Array.isArray(value)) return null;
    const normalized = value.map(normalizeEtimsItem).filter(Boolean);
    return normalized.length ? normalized : null;
  };

  return (
    tryList(payload?.data?.data)
    || tryList(payload?.data)
    || tryList(payload?.items)
    || tryList(payload)
    || []
  );
}

export function pickDefaultEtimsItem(items) {
  const list = items || [];
  const internet = list.find(
    (i) => i.itemCode === KRA_DEFAULT_ITEM_CODE
      || /internet/i.test(i.name || '')
  );
  if (internet) return internet;
  if (list.length) return list[0];
  return {
    itemCode: KRA_DEFAULT_ITEM_CODE,
    name: KRA_DEFAULT_ITEM_NAME,
    unitPrice: 3500,
  };
}

export function resolveWorkflowItemCode(defaults) {
  const code = String(defaults?.itemCode || '').trim();
  if (!code || code === 'ISP_SUBSCRIPTION') return KRA_DEFAULT_ITEM_CODE;
  return code;
}

const firstNonEmpty = (...values) => {
  for (const value of values) {
    const candidate = String(value || '').trim();
    if (candidate) return candidate;
  }
  return '';
};

export function resolveInvoiceVerificationUrl(invoice) {
  const directUrl = firstNonEmpty(
    invoice?.invoiceVerificationUrl,
    invoice?.verificationUrl,
    invoice?.receiptVerificationUrl,
    invoice?.invoiceVerificationURL,
    invoice?.receiptUrl,
    invoice?.receipt_url
  );

  if (/^https?:\/\//i.test(directUrl)) return directUrl;

  const signature = firstNonEmpty(
    invoice?.signature,
    invoice?.cuSignature,
    invoice?.receiptSignature,
    invoice?.digitalSignature,
    invoice?.sdcSignature,
    invoice?.raw?.signature,
    invoice?.raw?.cuSignature,
    invoice?.data?.signature,
    invoice?.data?.cuSignature
  );

  if (!signature) return null;

  return `${KRA_RECEIPT_VERIFY_BASE_URL}${KRA_RECEIPT_DATA_PREFIX}${encodeURIComponent(signature)}`;
}

function authConfig(authHeader) {
  if (!authHeader?.trim()) return {};
  // VSCU Basic auth — separate header so ticketing Bearer JWT is not forwarded.
  return { headers: { 'X-VSCU-Authorization': authHeader.trim() } };
}

/** User-facing hint when the catalog response is empty or blocked. */
export function describeEtimsItemsFailure(raw) {
  const message = String(raw?.message || raw?.error || '').trim();
  if (/imunify360|bot-protection/i.test(message)) {
    return 'KRA catalog hit production instead of local VSCU — restart npm start and ensure npm run api is running.';
  }
  if (/vscu unreachable|connection refused/i.test(message)) {
    return 'VSCU unreachable — start Virtual FD on port 8888 and run npm run api.';
  }
  if (raw?.success === false && raw?.vscuUrl) {
    return `VSCU unreachable at ${raw.vscuUrl}`;
  }
  if (raw?.success === false && raw?.vscuBaseUrl) {
    return `VSCU unreachable at ${raw.vscuBaseUrl}`;
  }
  return 'No items returned from eTIMS — is the Virtual FD running? (Also run npm run api and restart npm start)';
}

const KraAPI = {
  /** Item catalog from configured Virtual FD via PHP proxy. */
  getEtimsItems: async (authHeader = '') => {
    const res = await http.get('/kra-etims/items', authConfig(authHeader));
    return {
      raw: res.data,
      items: parseEtimsItemsResponse(res.data),
      vscuBaseUrl: res.data?.vscuBaseUrl || null,
    };
  },

  /** VSCU reachability via PHP proxy (Virtual FD catalog). */
  checkConnection: async (authHeader = '') => {
    const started = Date.now();
    try {
      const healthRes = await http.get('/kra-etims/health', authConfig(authHeader));
      const health = healthRes.data || {};
      const items = parseEtimsItemsResponse(health.upstream || health);
      const itemCount = health.itemSampleCount ?? items.length;
      const vscuReachable = health.vscuReachable === true || itemCount > 0;

      return {
        ok: vscuReachable,
        vscuReachable,
        itemCount,
        items,
        vscuBaseUrl: health.vscuBaseUrl || health.upstream?.vscuBaseUrl || null,
        latencyMs: Date.now() - started,
        message: vscuReachable
          ? `VSCU OK · ${itemCount} item(s)`
          : 'VSCU unreachable — check Virtual FD and api/config.local.php',
        raw: health,
      };
    } catch (err) {
      const body = err.response?.data;
      return {
        ok: false,
        vscuReachable: false,
        itemCount: 0,
        items: [],
        latencyMs: Date.now() - started,
        message: body?.error || body?.message || err.message || 'Cannot reach VSCU',
        raw: body || null,
      };
    }
  },

  getCustomerWorkflow: (customerId, authHeader = '') =>
    httpNode.get(
      `/kra/workflow/customer/${encodeURIComponent(customerId)}`,
      authConfig(authHeader)
    ),

  getCustomerInvoices: (customerId, authHeader = '') =>
    httpNode.get(
      `/kra/workflow/customer/${encodeURIComponent(customerId)}/invoices`,
      authConfig(authHeader)
    ),

  syncCustomer: (customerId, payload, authHeader = '') =>
    httpNode.post(
      `/kra/workflow/customer/${encodeURIComponent(customerId)}/sync-customer`,
      payload,
      authConfig(authHeader)
    ),

  createInvoice: (customerId, payload, authHeader = '') =>
    httpNode.post(
      `/kra/workflow/customer/${encodeURIComponent(customerId)}/create-invoice`,
      payload,
      authConfig(authHeader)
    ),

  generateAllInvoices: (customerId, payload, authHeader = '') =>
    httpNode.post(
      `/kra/workflow/customer/${encodeURIComponent(customerId)}/generate-all-invoices`,
      payload,
      authConfig(authHeader)
    ),

  getInvoice: async (traderInvoiceNo, authHeader = '') => {
    const res = await http.get(
      `/kra-etims/invoices/${encodeURIComponent(traderInvoiceNo)}`,
      authConfig(authHeader)
    );
    const envelope = res.data || {};
    const inner = envelope.data && typeof envelope.data === 'object'
      ? envelope.data
      : envelope;
    return { ...res, data: inner, envelope };
  },

  getAutoStatus: () => http.get('/kra-auto/status').then((r) => r.data),
  getAutoPending: () => http.get('/kra-auto/pending').then((r) => r.data),
  getAutoReceipts: (limit = 50) => http.get('/kra-auto/receipts', { params: { limit } }).then((r) => r.data),
  getAutoCustomers: (q = '') => http.get('/kra-auto/customers', { params: { q, limit: 50 } }).then((r) => r.data),
  trackCustomer: (q) => http.get('/kra-auto/track', { params: { q } }).then((r) => r.data),
  processAutoQueue: () => http.post('/kra-auto/process').then((r) => r.data),
  invoicePayment: (paymentId) => http.post('/kra-auto/invoice-payment', { payment_id: paymentId }).then((r) => r.data),
  getCustomerKraPin: (customerId) => http.get(`/kra-auto/customer-pin/${customerId}`).then((r) => r.data),
  setCustomerKraPin: (customerId, kraPin) => http.put(`/kra-auto/customer-pin/${customerId}`, { kra_pin: kraPin }).then((r) => r.data),
};

export default KraAPI;
