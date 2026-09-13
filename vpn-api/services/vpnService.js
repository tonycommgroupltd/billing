const fs = require('fs');
const path = require('path');
const { loadPeers, savePeers, nextId } = require('./peerStore');
const { runOnHub, parseWgShow, parseWgConf, sshPassword } = require('./sshService');

const HUBS_PATH = path.join(__dirname, '../config/hubs.json');

function loadHubs() {
  return JSON.parse(fs.readFileSync(HUBS_PATH, 'utf8')).filter((h) => h.enabled !== false);
}

function getHub(hubId) {
  const hub = loadHubs().find((h) => h.id === hubId || String(h.id) === String(hubId));
  if (!hub) throw new Error('Hub not found');
  return hub;
}

function normalizeTunnelIp(ip) {
  return String(ip || '').split('/')[0].trim();
}

function normalizeAllowedIps(allowed, tunnelIp) {
  let list = allowed;
  if (typeof list === 'string') {
    list = list.split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (!Array.isArray(list) || list.length === 0) {
    return [`${normalizeTunnelIp(tunnelIp)}/32`];
  }
  return list;
}

function serializeHub(hub, peers, wireguardStatus = null) {
  const hubPeers = peers.filter((p) => p.hub_id === hub.id).map(serializePeer);
  const serverPeers = wireguardStatus?.peers || hub.last_status?.peers || [];
  const usedIps = hubPeers.map((p) => normalizeTunnelIp(p.tunnel_ip));
  const nextFree = nextFreeTunnelIp(hub, peers);

  return {
    ...hub,
    ssh_configured: Boolean(sshPassword(hub.ssh_password_env)),
    peers_count: hubPeers.length,
    server_peers_count: serverPeers.length,
    peers: hubPeers,
    server_peers: serverPeers,
    next_free_tunnel_ip: nextFree,
    used_tunnel_ips: usedIps,
    hub_public_key: wireguardStatus?.public_key || hub.last_status?.public_key || null,
    last_status: wireguardStatus || hub.last_status || null,
  };
}

function serializePeer(peer) {
  const hub = loadHubs().find((h) => h.id === peer.hub_id);
  const allowed = normalizeAllowedIps(peer.allowed_ips, peer.tunnel_ip);
  return {
    ...peer,
    allowed_ips: allowed,
    manual_sync_command: hub
      ? `wg set ${hub.wg_interface} peer ${peer.public_key} allowed-ips ${allowed.join(',')} persistent-keepalive 25`
      : null,
  };
}

function nextFreeTunnelIp(hub, peers) {
  const parts = hub.subnet.split('/')[0].split('.').map(Number);
  const used = peers
    .filter((p) => p.hub_id === hub.id)
    .map((p) => Number(normalizeTunnelIp(p.tunnel_ip).split('.')[3]));

  for (let host = 5; host <= 250; host++) {
    if (!used.includes(host)) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.${host}`;
    }
  }
  return `${parts[0]}.${parts[1]}.${parts[2]}.5`;
}

function hubSubnetPrefix(hub) {
  const base = String(hub.subnet || '').split('/')[0];
  const parts = base.split('.');
  if (parts.length < 3) return null;
  return `${parts[0]}.${parts[1]}.${parts[2]}.`;
}

function guessTunnelIp(allowedIps, hub) {
  const prefix = hubSubnetPrefix(hub);
  const entries = String(allowedIps || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const entry of entries) {
    const ip = normalizeTunnelIp(entry);
    if (prefix && ip.startsWith(prefix)) return ip;
  }

  const first = entries.find((e) => /\/32$/.test(e));
  return first ? normalizeTunnelIp(first) : null;
}

function loadPeerNamesFromHub(hub) {
  const iface = hub.wg_interface || 'wg0';
  const paths = [`/etc/wireguard/${iface}.conf`, `/etc/wireguard/wg0.conf`];
  for (const confPath of paths) {
    try {
      const raw = runOnHub(hub, `cat ${confPath} 2>/dev/null`);
      if (raw) return parseWgConf(raw);
    } catch (_) {
      /* try next path */
    }
  }
  return {};
}

function importPeersFromHub(hubId) {
  const hub = getHub(hubId);
  const peers = loadPeers();
  const names = loadPeerNamesFromHub(hub);
  const raw = runOnHub(hub, `wg show ${hub.wg_interface}`);
  const wireguard = parseWgShow(raw);
  const imported = [];
  const skipped = [];

  for (const sp of wireguard.peers || []) {
    const publicKey = sp.public_key;
    if (!publicKey) continue;

    const existing = peers.find((p) => p.public_key === publicKey);
    if (existing) {
      skipped.push({ public_key: publicKey, reason: 'already_registered', id: existing.id });
      continue;
    }

    const tunnelIp = guessTunnelIp(sp.allowed_ips, hub);
    const peer = {
      id: nextId(peers),
      hub_id: hub.id,
      name: names[publicKey] || `imported-${publicKey.slice(0, 8)}`,
      peer_type: 'mikrotik',
      tunnel_ip: tunnelIp || nextFreeTunnelIp(hub, peers),
      public_key: publicKey,
      allowed_ips: normalizeAllowedIps(sp.allowed_ips, tunnelIp),
      listen_port: null,
      sync_status: sp.latest_handshake ? 'synced' : 'imported',
      sync_message: 'Imported from live WireGuard',
      enabled: true,
      last_handshake_at: sp.latest_handshake || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    peers.push(peer);
    imported.push(peer);
  }

  if (imported.length) savePeers(peers);

  return {
    ok: true,
    hub_id: hub.id,
    imported_count: imported.length,
    skipped_count: skipped.length,
    imported,
    skipped,
    live_peers: wireguard.peers.length,
  };
}

function hubOverview(hubId) {
  const hub = getHub(hubId);
  const peers = loadPeers();
  let wireguard;
  try {
    const raw = runOnHub(hub, `wg show ${hub.wg_interface}`);
    wireguard = parseWgShow(raw);
  } catch (err) {
    wireguard = { ok: false, error: err.message, public_key: null, peers: [] };
  }
  hub.last_status = wireguard;
  return {
    hub: serializeHub(hub, peers, wireguard),
    wireguard,
    hub_public_key: wireguard.public_key || null,
  };
}

function mikrotikWizard(hubId, input = {}) {
  const hub = getHub(hubId);
  const tunnelIp = normalizeTunnelIp(input.tunnel_ip || nextFreeTunnelIp(hub, loadPeers()));
  const allowedIps = normalizeAllowedIps(input.allowed_ips, tunnelIp);
  const interfaceName = input.interface_name || 'wg-tcom';
  const listenPort = Number(input.listen_port) || 51821;
  const peerName = input.name || 'mikrotik-peer';

  let hubPublicKey = '<HUB_PUBLIC_KEY>';
  try {
    const raw = runOnHub(hub, `wg show ${hub.wg_interface}`);
    hubPublicKey = parseWgShow(raw).public_key || hubPublicKey;
  } catch (_) {
    /* manual refresh later */
  }

  const step1 = [
    '# Step 1 — On MikroTik: create WireGuard interface',
    `/interface wireguard add name=${interfaceName} listen-port=${listenPort} comment="${peerName}"`,
    `/ip address add address=${tunnelIp}/32 interface=${interfaceName}`,
    '',
    '# Step 2 — Copy MikroTik PUBLIC key',
    `/interface wireguard print detail where name=${interfaceName}`,
    '# Copy: public-key: <paste below>',
  ].join('\n');

  const step3 = [
    '# Step 3 — After sync on hub, add hub as peer on MikroTik',
    `/interface wireguard peers add interface=${interfaceName} \\`,
    `  public-key="${hubPublicKey}" \\`,
    `  endpoint-address=${hub.host} endpoint-port=${hub.listen_port} \\`,
    `  allowed-address=${allowedIps.join(',')} \\`,
    '  persistent-keepalive=25s',
    '',
    '# Step 4 — Verify',
    '/interface wireguard peers print detail',
    `/ping ${hub.hub_tunnel_ip} count=3`,
  ].join('\n');

  return {
    hub,
    draft: { name: peerName, tunnel_ip: tunnelIp, allowed_ips: allowedIps, interface_name: interfaceName, listen_port: listenPort },
    hub_public_key: hubPublicKey,
    steps: [
      { title: 'Create interface on MikroTik', commands: step1 },
      { title: 'Paste MikroTik public key in TonyComm', commands: 'Copy public-key from Step 2 and paste in the form.' },
      { title: 'Add hub peer on MikroTik', commands: step3 },
    ],
  };
}

function syncPeer(peerId) {
  const peers = loadPeers();
  const peer = peers.find((p) => String(p.id) === String(peerId));
  if (!peer) throw new Error('Peer not found');

  const hub = getHub(peer.hub_id);
  const allowed = normalizeAllowedIps(peer.allowed_ips, peer.tunnel_ip).join(',');

  try {
    const out = runOnHub(
      hub,
      `wg set ${hub.wg_interface} peer ${peer.public_key} allowed-ips ${allowed} persistent-keepalive 25`
    );
    peer.sync_status = 'synced';
    peer.sync_message = out || 'Peer added on hub';
    peer.updated_at = new Date().toISOString();
    savePeers(peers);
    return { ok: true, message: 'Peer synced to hub', output: out };
  } catch (err) {
    peer.sync_status = 'failed';
    peer.sync_message = err.message;
    peer.updated_at = new Date().toISOString();
    savePeers(peers);
    return {
      ok: false,
      message: err.message,
      manual_command: serializePeer(peer).manual_sync_command,
    };
  }
}

function testPeer(peerId) {
  const peers = loadPeers();
  const peer = peers.find((p) => String(p.id) === String(peerId));
  if (!peer) throw new Error('Peer not found');

  const hub = getHub(peer.hub_id);
  const target = normalizeTunnelIp(peer.tunnel_ip);

  try {
    const wgShow = runOnHub(hub, `wg show ${hub.wg_interface}`);
    const parsed = parseWgShow(wgShow);
    const match = parsed.peers.find((p) => p.public_key === peer.public_key);
    let pingOk = false;
    let pingOut = '';
    try {
      pingOut = runOnHub(hub, `ping -c 2 -W 2 ${target}`);
      pingOk = /bytes from|received/i.test(pingOut);
    } catch (pingErr) {
      pingOut = pingErr.message;
    }

    const ok = Boolean(match?.latest_handshake) || pingOk;
    peer.last_test_at = new Date().toISOString();
    peer.last_test_ok = ok;
    peer.last_handshake_at = match?.latest_handshake || peer.last_handshake_at;
    peer.updated_at = new Date().toISOString();
    savePeers(peers);

    return { ok, handshake: match?.latest_handshake || null, ping_ok: pingOk, ping_output: pingOut, wg_show: wgShow };
  } catch (err) {
    peer.last_test_at = new Date().toISOString();
    peer.last_test_ok = false;
    savePeers(peers);
    return { ok: false, message: err.message };
  }
}

function listHubs() {
  const hubs = loadHubs();
  const peers = loadPeers();
  return hubs.map((h) => serializeHub(h, peers));
}

function listAllPeers() {
  const hubs = loadHubs();
  const peers = loadPeers();
  return peers.map((peer) => {
    const hub = hubs.find((h) => h.id === peer.hub_id);
    return {
      ...serializePeer(peer),
      hub_id: peer.hub_id,
      hub_name: hub?.name || peer.hub_id,
      hub_host: hub?.host || '',
      hub_location_type: hub?.location_type || '',
    };
  });
}

function addHub(data) {
  const hubs = loadHubs();
  const slug = `${String(data.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`;
  const hub = {
    id: slug,
    slug,
    enabled: true,
    wg_interface: data.wg_interface || 'wg0',
    listen_port: Number(data.listen_port) || 51820,
    subnet: data.subnet || '10.88.0.0/24',
    ssh_port: Number(data.ssh_port) || 22,
    ssh_password_env: data.ssh_password_env || null,
    ...data,
  };
  const all = JSON.parse(fs.readFileSync(HUBS_PATH, 'utf8'));
  all.push(hub);
  fs.writeFileSync(HUBS_PATH, JSON.stringify(all, null, 2));
  return hub;
}

function addPeer(data) {
  const hub = getHub(data.hub_id);
  const peers = loadPeers();
  const tunnelIp = normalizeTunnelIp(data.tunnel_ip || nextFreeTunnelIp(hub, peers));
  const peer = {
    id: nextId(peers),
    hub_id: hub.id,
    name: data.name,
    peer_type: data.peer_type || 'mikrotik',
    tunnel_ip: tunnelIp,
    public_key: String(data.public_key).trim(),
    allowed_ips: normalizeAllowedIps(data.allowed_ips, tunnelIp),
    listen_port: data.listen_port || null,
    sync_status: 'pending',
    enabled: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  peers.push(peer);
  savePeers(peers);
  return peer;
}

function deletePeer(peerId) {
  const peers = loadPeers().filter((p) => String(p.id) !== String(peerId));
  savePeers(peers);
}

module.exports = {
  listHubs,
  listAllPeers,
  hubOverview,
  mikrotikWizard,
  syncPeer,
  testPeer,
  addHub,
  addPeer,
  deletePeer,
  importPeersFromHub,
  getHub,
};
