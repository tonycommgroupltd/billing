// ============================================
// TCOM API — Database Connection Pools
// ============================================
// Two pools: local (read/write) and remote (read-only)

const mysql = require('mysql2/promise');

// --- Local DB: tcom_app (our own, read/write) ---
const localPool = mysql.createPool({
  host:     process.env.LOCAL_DB_HOST  || '127.0.0.1',
  port:     process.env.LOCAL_DB_PORT  || 3306,
  user:     process.env.LOCAL_DB_USER  || 'root',
  password: process.env.LOCAL_DB_PASSWORD || '',
  database: process.env.LOCAL_DB_NAME  || 'tcom_app',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
});

// --- Remote DB: tonycomm (existing, read-only) ---
const remotePool = mysql.createPool({
  host:     process.env.REMOTE_DB_HOST || 'YOUR_VPS_IP',
  port:     process.env.REMOTE_DB_PORT || 3306,
  user:     process.env.REMOTE_DB_USER || 'Joram',
  password: process.env.REMOTE_DB_PASSWORD || '',
  database: process.env.REMOTE_DB_NAME || 'tonycomm',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  charset: 'utf8mb4',
});

// --- KRA Sidecar DB: audit-grade local subsystem (read/write) ---
const kraPool = mysql.createPool({
  host:     process.env.KRA_DB_HOST || process.env.LOCAL_DB_HOST || '127.0.0.1',
  port:     process.env.KRA_DB_PORT || process.env.LOCAL_DB_PORT || 3306,
  user:     process.env.KRA_DB_USER || process.env.LOCAL_DB_USER || 'root',
  password: process.env.KRA_DB_PASSWORD || process.env.LOCAL_DB_PASSWORD || '',
  database: process.env.KRA_DB_NAME || 'tcom_kra',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
});

// Health check helper
async function testConnections() {
  try {
    const [r1] = await localPool.query('SELECT 1');
    console.log('  ✓ Local DB  (tcom_app) connected');
  } catch (err) {
    console.error('  ✗ Local DB  (tcom_app) FAILED:', err.message);
  }
  try {
    const [r2] = await remotePool.query('SELECT 1');
    console.log('  ✓ Remote DB (tonycomm) connected');
  } catch (err) {
    console.error('  ✗ Remote DB (tonycomm) FAILED:', err.message);
  }

  try {
    const [r3] = await kraPool.query('SELECT 1');
    console.log('  ✓ KRA DB    (tcom_kra) connected');
  } catch (err) {
    console.error('  ✗ KRA DB    (tcom_kra) FAILED:', err.message);
  }
}

module.exports = { localPool, remotePool, kraPool, testConnections };
