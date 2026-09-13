const mysql = require('mysql2/promise');

const remotePool = mysql.createPool({
  host: process.env.REMOTE_DB_HOST || '100.42.182.120',
  port: Number(process.env.REMOTE_DB_PORT || 3306),
  user: process.env.REMOTE_DB_USER || 'Joram',
  password: process.env.REMOTE_DB_PASSWORD || '',
  database: process.env.REMOTE_DB_NAME || 'tonycomm',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  charset: 'utf8mb4',
});

async function testConnection() {
  try {
    await remotePool.query('SELECT 1');
    console.log('  ✓ TonyComm DB (tonycomm) connected');
    return true;
  } catch (err) {
    console.error('  ✗ TonyComm DB FAILED:', err.message);
    return false;
  }
}

module.exports = { remotePool, testConnection };
