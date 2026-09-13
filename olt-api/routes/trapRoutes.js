const express = require('express');
const router = express.Router();
const trapStore = require('../services/trapStore');
const { getTrapSetup } = require('../services/oltRegistry');

router.get('/setup', (req, res) => {
  res.json(getTrapSetup());
});

router.get('/traps', (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const oltId = req.query.oltId || null;
  const sourceIp = req.query.sourceIp || null;
  const items = trapStore.listTraps({ limit, oltId, sourceIp });
  res.json({
    items,
    total: items.length,
    stats: trapStore.stats(),
    receiver: {
      port: Number(process.env.SNMP_TRAP_PORT || 3162),
      enabled: process.env.SNMP_TRAP_ENABLED !== 'false',
    },
  });
});

router.delete('/traps', (req, res) => {
  trapStore.clearTraps();
  res.json({ success: true });
});

module.exports = router;
