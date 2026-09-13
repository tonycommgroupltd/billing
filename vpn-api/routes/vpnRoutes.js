const express = require('express');
const router = express.Router();
const vpn = require('../services/vpnService');

router.get('/hubs', (req, res) => {
  res.json({ hubs: vpn.listHubs() });
});

router.get('/peers', (req, res) => {
  res.json({ peers: vpn.listAllPeers(), total: vpn.listAllPeers().length });
});

router.post('/hubs', (req, res) => {
  try {
    const hub = vpn.addHub(req.body);
    res.status(201).json({ hub });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/hubs/:id/import-peers', (req, res) => {
  try {
    res.json(vpn.importPeersFromHub(req.params.id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/hubs/:id/status', (req, res) => {
  try {
    res.json(vpn.hubOverview(req.params.id));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

router.post('/hubs/:id/wizard', (req, res) => {
  try {
    res.json(vpn.mikrotikWizard(req.params.id, req.body));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

router.post('/peers', (req, res) => {
  try {
    if (!req.body.hub_id && req.body.vpn_hub_id) {
      req.body.hub_id = req.body.vpn_hub_id;
    }
    const peer = vpn.addPeer(req.body);
    let sync = null;
    if (req.body.sync_now !== false) {
      sync = vpn.syncPeer(peer.id);
    }
    const peers = vpn.listHubs().flatMap((h) => h.peers);
    const saved = peers.find((p) => String(p.id) === String(peer.id));
    res.status(201).json({ peer: saved || peer, sync });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/peers/:id/sync', (req, res) => {
  try {
    res.json(vpn.syncPeer(req.params.id));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

router.post('/peers/:id/test', (req, res) => {
  try {
    res.json(vpn.testPeer(req.params.id));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

router.delete('/peers/:id', (req, res) => {
  try {
    vpn.deletePeer(req.params.id);
    res.json({ message: 'Peer removed' });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

module.exports = router;
