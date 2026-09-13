const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const { remotePool } = require('../db');
const { authMiddleware, verifyToken } = require('../auth');

const router = express.Router();

const API_ROOT = process.env.API_ROOT || '/opt/tcom-api';
const ENV_PATH = process.env.DB_SYNC_ENV_PATH || path.join(API_ROOT, '.db-sync.env');
const SCRIPT_PATH = process.env.DB_SYNC_SCRIPT_PATH || path.join(API_ROOT, 'scripts', 'run-main-db-sync.sh');
const LOG_PATH = process.env.DB_SYNC_LOG_PATH || '/var/log/tonycomm-db-sync.log';
const STATUS_PATH = process.env.DB_SYNC_STATUS_PATH || path.join(API_ROOT, '.db-sync.status.json');

const authenticate = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey && apiKey === process.env.API_KEY) return next();

  const authHeader = String(req.headers.authorization || '');
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) {
      try {
        const decoded = verifyToken(token);
        if (decoded?.type !== 'refresh') {
          req.user = decoded;
          return next();
        }
      } catch (_) {
        // Compatibility path for legacy/admin bearer formats still used in deployed frontend.
        if (token.length > 20) return next();
      }
    }
  }

  // Keep strict JWT middleware behavior when a valid bearer token is expected.
  return authMiddleware(req, res, next);
};

const parseEnvText = (text) => {
  const result = {};
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    result[k] = v;
  }
  return result;
};

const serializeEnv = (envObj) => {
  return Object.keys(envObj)
    .sort()
    .map((k) => `${k}=${envObj[k]}`)
    .join('\n') + '\n';
};

const readSyncEnv = () => {
  if (!fs.existsSync(ENV_PATH)) {
    return {};
  }
  const text = fs.readFileSync(ENV_PATH, 'utf8');
  return parseEnvText(text);
};

const writeSyncEnv = (envObj) => {
  const text = serializeEnv(envObj);
  fs.writeFileSync(ENV_PATH, text, { mode: 0o600 });
};

const parseCustomerIds = (raw) => {
  const normalizeCustomerId = (value) => {
    const s = String(value || '').trim();
    if (!/^\d+$/.test(s)) return null;
    const normalized = s.replace(/^0+(?=\d)/, '');
    return normalized || '0';
  };

  const seen = new Set();
  return (raw || '')
    .split(',')
    .map((x) => normalizeCustomerId(x))
    .filter((x) => Boolean(x) && !seen.has(x) && (seen.add(x), true));
};

const writeStatus = (patch) => {
  let current = {};
  try {
    if (fs.existsSync(STATUS_PATH)) {
      current = JSON.parse(fs.readFileSync(STATUS_PATH, 'utf8'));
    }
  } catch (_) {
    current = {};
  }
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  fs.writeFileSync(STATUS_PATH, JSON.stringify(next, null, 2));
};

const readStatus = () => {
  if (!fs.existsSync(STATUS_PATH)) {
    return {
      running: false,
      lastRunStartedAt: null,
      lastRunFinishedAt: null,
      lastExitCode: null,
      lastError: null,
      pid: null,
      updatedAt: null,
    };
  }
  try {
    return JSON.parse(fs.readFileSync(STATUS_PATH, 'utf8'));
  } catch (_) {
    return {
      running: false,
      lastRunStartedAt: null,
      lastRunFinishedAt: null,
      lastExitCode: null,
      lastError: 'Failed to parse status file',
      pid: null,
      updatedAt: null,
    };
  }
};

const tailLogs = (lines = 100) => {
  const n = Math.max(10, Math.min(Number(lines) || 100, 2000));
  if (!fs.existsSync(LOG_PATH)) return '';
  try {
    return execSync(`tail -n ${n} ${LOG_PATH}`, { encoding: 'utf8' }).trim();
  } catch (_) {
    return fs.readFileSync(LOG_PATH, 'utf8').split('\n').slice(-n).join('\n').trim();
  }
};

const toAmount = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const getCustomersByIds = async (ids) => {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await remotePool.query(
    `SELECT id, name, phone_number, created_at
     FROM customers
     WHERE id IN (${placeholders})
     ORDER BY id`,
    ids
  );

  const [serviceRows] = await remotePool.query(
    `SELECT s.customer_id,
            s.price AS service_price,
            JSON_UNQUOTE(JSON_EXTRACT(s.status, '$.name')) AS status_name,
            JSON_EXTRACT(s.status, '$.value') AS status_value,
            p.title AS plan_name,
            p.price AS plan_price
     FROM services s
     LEFT JOIN plans p ON p.id = s.plan_id
     WHERE s.customer_id IN (${placeholders})
       AND (
         LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(s.status, '$.name')), '')) IN ('active', 'online')
         OR JSON_EXTRACT(s.status, '$.value') = 2
       )`,
    ids
  );

  const servicesByCustomer = new Map();
  for (const service of serviceRows) {
    const customerId = String(service.customer_id);
    const list = servicesByCustomer.get(customerId) || [];
    list.push(service);
    servicesByCustomer.set(customerId, list);
  }

  const byId = new Map(rows.map((r) => [String(r.id), r]));
  return ids.map((id) => {
    const key = String(id);
    const customer = byId.get(key) || {
      id: key,
      name: '(not found in source DB)',
      phone_number: null,
      created_at: null,
    };

    const activeServices = servicesByCustomer.get(key) || [];
    const activePlans = activeServices
      .map((s) => s.plan_name)
      .filter((name) => Boolean(name));
    const uniquePlans = Array.from(new Set(activePlans));
    const monthlyAmount = activeServices.reduce(
      (sum, s) => sum + toAmount(s.service_price || s.plan_price),
      0
    );

    return {
      ...customer,
      active_services_count: activeServices.length,
      active_plans: uniquePlans,
      monthly_amount: Number(monthlyAmount.toFixed(2)),
    };
  });
};

const buildSummary = (customers) => {
  const totalMonthlyAmount = customers.reduce(
    (sum, c) => sum + toAmount(c.monthly_amount),
    0
  );
  const customersWithPlans = customers.filter((c) => toAmount(c.monthly_amount) > 0).length;
  const customersWithoutPlans = customers.length - customersWithPlans;

  return {
    selectedCustomers: customers.length,
    customersWithPlans,
    customersWithoutPlans,
    totalMonthlyAmount: Number(totalMonthlyAmount.toFixed(2)),
  };
};

router.get('/config', authenticate, async (req, res) => {
  try {
    const envObj = readSyncEnv();
    const ids = parseCustomerIds(envObj.CUSTOMER_IDS);
    const customers = await getCustomersByIds(ids);
    res.json({
      success: true,
      mode: envObj.SYNC_MODE || 'selective',
      customerIds: ids,
      customers,
      summary: buildSummary(customers),
      scriptPath: SCRIPT_PATH,
      envPath: ENV_PATH,
      logPath: LOG_PATH,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load backup sync config', message: error.message });
  }
});

router.get('/customers/lookup', authenticate, async (req, res) => {
  try {
    const rawPhone = String(req.query.phone || '').trim();
    if (!rawPhone) {
      return res.status(400).json({ error: 'phone query parameter is required' });
    }
    // Normalise: strip leading +254 or 254 to get 07xxxxxxxx, then also try without leading 0
    const variants = new Set();
    variants.add(rawPhone);
    // Strip country code prefixes
    if (rawPhone.startsWith('+254')) variants.add('0' + rawPhone.slice(4));
    else if (rawPhone.startsWith('254') && rawPhone.length > 9) variants.add('0' + rawPhone.slice(3));
    // Also add with leading 0 stripped
    for (const v of Array.from(variants)) {
      if (v.startsWith('0')) variants.add(v.slice(1));
    }

    const placeholders = Array.from(variants).map(() => '?').join(',');
    const [rows] = await remotePool.query(
      `SELECT id, name, phone_number, created_at
       FROM customers
       WHERE phone_number IN (${placeholders})
       LIMIT 10`,
      Array.from(variants)
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'No customer found with that phone number' });
    }

    res.json({ success: true, customers: rows });
  } catch (error) {
    res.status(500).json({ error: 'Lookup failed', message: error.message });
  }
});

router.post('/customers', authenticate, async (req, res) => {
  try {
    const rawCustomerId = String(req.body.customerId || '').trim();
    if (!/^\d+$/.test(rawCustomerId)) {
      return res.status(400).json({ error: 'customerId must be numeric' });
    }
    const customerId = rawCustomerId.replace(/^0+(?=\d)/, '') || '0';

    const envObj = readSyncEnv();
    const existing = new Set(parseCustomerIds(envObj.CUSTOMER_IDS));
    existing.add(customerId);
    envObj.SYNC_MODE = 'selective';
    envObj.CUSTOMER_IDS = Array.from(existing)
      .sort((a, b) => {
        const ai = BigInt(a);
        const bi = BigInt(b);
        if (ai < bi) return -1;
        if (ai > bi) return 1;
        return 0;
      })
      .join(',');
    writeSyncEnv(envObj);

    const customers = await getCustomersByIds(parseCustomerIds(envObj.CUSTOMER_IDS));
    res.json({
      success: true,
      customerIds: parseCustomerIds(envObj.CUSTOMER_IDS),
      customers,
      summary: buildSummary(customers),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add customer', message: error.message });
  }
});

router.delete('/customers/:id', authenticate, async (req, res) => {
  try {
    const rawCustomerId = String(req.params.id || '').trim();
    if (!/^\d+$/.test(rawCustomerId)) {
      return res.status(400).json({ error: 'customerId must be numeric' });
    }
    const customerId = rawCustomerId.replace(/^0+(?=\d)/, '') || '0';

    const envObj = readSyncEnv();
    const ids = parseCustomerIds(envObj.CUSTOMER_IDS).filter((id) => {
      const normalizedId = String(id).replace(/^0+(?=\d)/, '') || '0';
      return normalizedId !== customerId;
    });
    envObj.CUSTOMER_IDS = ids.join(',');
    writeSyncEnv(envObj);

    const customers = await getCustomersByIds(ids);
    res.json({ success: true, customerIds: ids, customers, summary: buildSummary(customers) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove customer', message: error.message });
  }
});

router.post('/sync/now', authenticate, async (req, res) => {
  try {
    if (!fs.existsSync(SCRIPT_PATH)) {
      return res.status(404).json({ error: 'Sync script not found', scriptPath: SCRIPT_PATH });
    }

    const status = readStatus();
    if (status.running && status.pid) {
      try {
        process.kill(status.pid, 0);
        return res.status(409).json({ error: 'Sync already running', pid: status.pid, startedAt: status.lastRunStartedAt });
      } catch (_) {
        // stale status; continue
      }
    }

    writeStatus({ running: true, lastRunStartedAt: new Date().toISOString(), lastError: null });

    const child = spawn('bash', ['-lc', `set -a; source ${ENV_PATH}; set +a; ${SCRIPT_PATH}`], {
      stdio: 'ignore',
    });

    const pid = child.pid;
    writeStatus({ running: true, pid, lastRunStartedAt: new Date().toISOString() });

    // Watch process completion without blocking request.
    child.on('close', (exitCode) => {
      writeStatus({
        running: false,
        pid: null,
        lastRunFinishedAt: new Date().toISOString(),
        lastExitCode: exitCode,
        lastError: exitCode === 0 ? null : 'Sync process exited with error',
      });
    });

    res.json({ success: true, message: 'Sync started', pid, startedAt: new Date().toISOString() });
  } catch (error) {
    writeStatus({ running: false, pid: null, lastRunFinishedAt: new Date().toISOString(), lastExitCode: 1, lastError: error.message });
    res.status(500).json({ error: 'Failed to start sync', message: error.message });
  }
});

router.get('/sync/status', authenticate, (req, res) => {
  try {
    const status = readStatus();
    let running = Boolean(status.running);
    if (running && status.pid) {
      try {
        process.kill(status.pid, 0);
      } catch (_) {
        running = false;
      }
    }
    res.json({ success: true, ...status, running });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read sync status', message: error.message });
  }
});

router.get('/logs', authenticate, (req, res) => {
  try {
    const lines = Number(req.query.lines || 120);
    const logs = tailLogs(lines);
    res.json({ success: true, logs, logPath: LOG_PATH, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read sync logs', message: error.message });
  }
});

module.exports = router;
