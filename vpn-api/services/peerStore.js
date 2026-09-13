const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const PEERS_FILE = path.join(DATA_DIR, 'peers.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadPeers() {
  ensureDataDir();
  if (!fs.existsSync(PEERS_FILE)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(PEERS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function savePeers(peers) {
  ensureDataDir();
  fs.writeFileSync(PEERS_FILE, JSON.stringify(peers, null, 2));
}

function nextId(peers) {
  const max = peers.reduce((m, p) => Math.max(m, Number(p.id) || 0), 0);
  return max + 1;
}

module.exports = { loadPeers, savePeers, nextId, PEERS_FILE };
