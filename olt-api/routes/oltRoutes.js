const express = require('express');
const router = express.Router();
const routerOs = require('../services/routerOsService');
const { loadOlts, getOltById } = require('../services/oltRegistry');
const { parseSnmpRows, buildOltSummary } = require('../services/oltParseService');
const { buildTrapSummary } = require('../services/oltStatusService');
const { pollOltInfo, pollOnuList } = require('../services/vsolPollService');
const trapStore = require('../services/trapStore');
const syslogStore = require('../services/syslogStore');
const cache = require('../services/oltCache');

function isVsolPoll(olt) {
  return olt.vendor === 'vsol' && olt.monitorMode === 'poll';
}

async function pollOne(olt, { force = false } = {}) {
  if (olt.monitorMode === 'trap') {
    const summary = buildTrapSummary(olt);
    const traps = trapStore.listTraps({ limit: 20, oltId: olt.id });
    return {
      summary: { ...summary, publicWebUrl: olt.publicWebUrl || null },
      detail: { traps, mode: 'trap' },
      source: 'trap',
    };
  }

  const cacheKey = `olt:${olt.id}`;
  if (!force) {
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        summary: {
          ...(cached.summary || {}),
          publicWebUrl: olt.publicWebUrl || cached.summary?.publicWebUrl || null,
        },
        source: 'cache',
      };
    }
  }

  const pollResult = await routerOs.pollOltSnmp(olt);
  const parsed = pollResult.ok ? parseSnmpRows(pollResult.snmpRows) : null;
  const summary = {
    ...buildOltSummary(pollResult, parsed),
    monitorMode: 'poll',
    publicWebUrl: olt.publicWebUrl || null,
  };
  const payload = {
    summary,
    detail: pollResult.ok
      ? { snmpSample: parsed.sample, ping: pollResult.ping, mode: 'poll' }
      : { ping: pollResult.ping, error: pollResult.error, mode: 'poll' },
    source: 'live',
  };
  cache.set(cacheKey, payload);
  return payload;
}

router.get('/gateway', async (req, res) => {
  try {
    const resource = await routerOs.getRouterResource();
    res.json({
      host: process.env.ROUTEROS_HOST || '102.0.26.60',
      version: resource.version,
      board: resource['board-name'],
      uptime: resource.uptime,
    });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Faiba 2 RouterOS unreachable' });
  }
});

router.get('/olts', async (req, res) => {
  try {
    const olts = loadOlts();
    const force = req.query.refresh === '1' || req.query.refresh === 'true';
    const results = [];

    for (const olt of olts) {
      try {
        const data = await pollOne(olt, { force });
        results.push(data.summary);
      } catch (err) {
        results.push({
          id: olt.id,
          name: olt.name,
          host: olt.host,
          vendor: olt.vendor,
          model: olt.model,
          ok: false,
          online: false,
          error: err.message,
          polledAt: new Date().toISOString(),
          publicWebUrl: olt.publicWebUrl || null,
        });
      }
    }

    res.json({
      items: results,
      total: results.length,
      online: results.filter((r) => r.ok).length,
      gateway: process.env.ROUTEROS_HOST || '102.0.26.60',
      monitorMode: 'trap+poll',
    });
  } catch (err) {
    console.error('[olts]', err);
    res.status(502).json({ error: err.message || 'Failed to load OLTs' });
  }
});

router.get('/olts/:id', async (req, res) => {
  try {
    const olt = getOltById(req.params.id);
    if (!olt) return res.status(404).json({ error: 'OLT not found in config' });

    const force = req.query.refresh === '1' || req.query.refresh === 'true';
    const data = await pollOne(olt, { force });
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message || 'Failed to load OLT' });
  }
});

router.post('/olts/:id/refresh', async (req, res) => {
  try {
    const olt = getOltById(req.params.id);
    if (!olt) return res.status(404).json({ error: 'OLT not found in config' });

    cache.clear(`olt:${olt.id}`);
    const data = await pollOne(olt, { force: true });
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Refresh failed' });
  }
});

router.get('/olts/:id/info', async (req, res) => {
  try {
    const olt = getOltById(req.params.id);
    if (!olt) return res.status(404).json({ error: 'OLT not found in config' });
    if (!isVsolPoll(olt)) {
      return res.status(400).json({ error: 'OLT info endpoint requires VSOL poll mode OLT' });
    }
    const force = req.query.refresh === '1' || req.query.refresh === 'true';
    const data = await pollOltInfo(olt, { force });
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message || 'Failed to load OLT info' });
  }
});

router.get('/olts/:id/onus', async (req, res) => {
  try {
    const olt = getOltById(req.params.id);
    if (!olt) return res.status(404).json({ error: 'OLT not found in config' });
    if (!isVsolPoll(olt)) {
      return res.status(400).json({ error: 'ONU list endpoint requires VSOL poll mode OLT' });
    }
    const force = req.query.refresh === '1' || req.query.refresh === 'true';
    const data = await pollOnuList(olt, { force });
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message || 'Failed to load ONU list' });
  }
});

router.get('/olts/:id/logs', async (req, res) => {
  try {
    const olt = getOltById(req.params.id);
    if (!olt) return res.status(404).json({ error: 'OLT not found in config' });

    const limit = Math.min(Number(req.query.limit || 100), 500);
    const items = syslogStore.listLogs({
      limit,
      oltId: olt.id,
      level: req.query.level,
      search: req.query.search,
    });

    res.json({
      oltId: olt.id,
      host: olt.host,
      syslogTag: olt.syslogTag || null,
      setupHints: olt.setupHints || null,
      items,
      total: items.length,
      stats: syslogStore.stats(olt.id),
    });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Failed to load logs' });
  }
});

router.get('/olts/:id/config', async (req, res) => {
  try {
    const olt = getOltById(req.params.id);
    if (!olt) return res.status(404).json({ error: 'OLT not found in config' });
    const { community, ...safe } = olt;
    res.json({ ...safe, community: '***' });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Failed to load OLT config' });
  }
});

router.get('/olts/:id/snmp', async (req, res) => {
  try {
    const olt = getOltById(req.params.id);
    if (!olt) return res.status(404).json({ error: 'OLT not found' });
    if (olt.monitorMode === 'trap') {
      return res.status(400).json({
        error: 'OLT uses trap mode — SNMP poll not available. Check /traps instead.',
      });
    }

    const oid = req.query.oid || olt.systemOid || '1.3.6.1.2.1.1';
    const snmpClient = require('../services/snmpClient');
    const rows = await snmpClient.snmpWalk(olt, oid);
    res.json({ oid, host: olt.host, rows, count: rows.length });
  } catch (err) {
    res.status(502).json({ error: err.message || 'SNMP walk failed' });
  }
});

module.exports = router;
