// ============================================
// TCOM API — ONU Sync Job
// ============================================
// Fetches all ONU details from SmartOLT every 10 minutes
// and caches them in our local onu_devices table.
//
// IMPORTANT: We make exactly ONE SmartOLT API call per sync
// to avoid rate limits or bot detection.
// ============================================

const axios = require('axios');
const { localPool, remotePool } = require('../db');
let sendNotification; // lazy-loaded to avoid circular deps

// SmartOLT config — uses READ-ONLY key for sync (separate from write key)
const BASE_URL  = process.env.SMARTOLT_BASE_URL      || 'https://tonycomm.smartolt.com';
const API_KEY   = process.env.SMARTOLT_READ_API_KEY   || process.env.SMARTOLT_API_KEY || '';
const SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

// Dedicated axios client with realistic headers (read-only key)
const smartOltClient = axios.create({
  baseURL: `${BASE_URL}/api`,
  headers: {
    'X-Token': API_KEY,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': `${BASE_URL}/`,
    'Origin': BASE_URL,
  },
  timeout: 120000, // 2 min timeout for bulk call
});

let schemaReady = false;

/** TR-069 identity + per-port Wi-Fi columns are added lazily so deploys need no manual migration. */
async function ensureSchema() {
  if (schemaReady) return;
  try {
    await localPool.query(
      `ALTER TABLE onu_devices
         ADD COLUMN IF NOT EXISTS tr069_device_id VARCHAR(128) DEFAULT NULL,
         ADD COLUMN IF NOT EXISTS tr069_status VARCHAR(32) DEFAULT NULL,
         ADD COLUMN IF NOT EXISTS tr069_profile VARCHAR(64) DEFAULT NULL,
         ADD COLUMN IF NOT EXISTS wifi_ports LONGTEXT DEFAULT NULL`
    );
    await localPool.query(
      'ALTER TABLE onu_devices ADD INDEX IF NOT EXISTS idx_tr069_device (tr069_device_id)'
    );
    schemaReady = true;
  } catch (err) {
    console.warn('  ⚠ ONU schema upgrade skipped:', err.message);
  }
}

/**
 * Fetch all ONU details from SmartOLT (single API call)
 * and upsert into onu_devices table.
 */
async function syncOnus() {
  if (!API_KEY) {
    console.log('  ⚠ ONU sync skipped — no SMARTOLT_API_KEY configured');
    return;
  }

  await ensureSchema();

  const startTime = Date.now();
  console.log(`  🔄 ONU sync starting at ${new Date().toISOString()}`);

  try {
    // === ONE single API call — get all ONUs ===
    const res = await smartOltClient.get('/onu/get_all_onus_details');
    const data = res.data;

    if (!data || data.status === false) {
      console.log('  ⚠ ONU sync — SmartOLT returned empty or error:', data?.message || data?.error || 'unknown');
      return;
    }

    // Response shape: { onus: [...], status: true, response_code: '...' }
    // onus can be an array or an object keyed by external_id
    let entries = [];
    const onus = data.onus || data.response || data;

    if (Array.isArray(onus)) {
      // Array of ONU objects — each has unique_external_id
      entries = onus
        .filter(o => typeof o === 'object' && o !== null)
        .map(o => [o.unique_external_id || o.id || o.sn, o]);
    } else if (typeof onus === 'object' && onus !== null) {
      // Object keyed by external_id
      entries = Object.entries(onus).filter(([key, val]) => {
        return typeof val === 'object' && val !== null && key !== 'status' && key !== 'message';
      });
    }

    if (entries.length === 0) {
      console.log('  ⚠ ONU sync — no ONU entries found in response');
      return;
    }

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    let upserted = 0;
    let errors = 0;

    // Batch upsert — process in chunks of 50 to avoid overwhelming DB
    const CHUNK_SIZE = 50;
    for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
      const chunk = entries.slice(i, i + CHUNK_SIZE);
      const promises = chunk.map(async ([extId, onu]) => {
        try {
          // Determine external ID (prefer explicit field over map key)
          const externalId = onu.unique_external_id || extId;
          if (!externalId) return; // skip entries without an ID

          // Extract WiFi info from wifi_ports array if available
          let wifiSsid = onu.wifi_ssid || onu.ssid || null;
          let wifiPassword = onu.wifi_password || onu.wifi_pass || null;
          let wifiMode = onu.wifi_mode || null;
          let wifiPortsJson = null;
          if (onu.wifi_ports && Array.isArray(onu.wifi_ports) && onu.wifi_ports.length > 0) {
            const activeWifi = onu.wifi_ports.find(p => p.ssid) || onu.wifi_ports[0];
            wifiSsid = wifiSsid || activeWifi?.ssid || null;
            wifiPassword = wifiPassword || activeWifi?.password || null;
            wifiMode = wifiMode || activeWifi?.mode || null;
            try {
              wifiPortsJson = JSON.stringify(onu.wifi_ports);
            } catch (_) {
              wifiPortsJson = null;
            }
          }

          // Extract speed profile from service_ports or speed_profiles field
          let speedProfile = onu.speed_profile || onu.speed_profiles || null;
          if (!speedProfile && onu.service_ports && Array.isArray(onu.service_ports) && onu.service_ports.length > 0) {
            const sp = onu.service_ports[0];
            speedProfile = sp.download_speed ? `${sp.download_speed}/${sp.upload_speed}` : null;
          }

          // --- Network status change detection ---
          const newStatus = onu.status || null;
          try {
            const [[existing]] = await localPool.query(
              'SELECT status FROM onu_devices WHERE onu_external_id = ?', [externalId]
            );
            if (existing && existing.status && newStatus && existing.status !== newStatus) {
              // Status changed! Find the customer linked to this ONU
              const pppoeUser = onu.username || onu.pppoe_username || null;
              if (pppoeUser) {
                const [customers] = await remotePool.query(
                  `SELECT c.id as customer_id, c.name FROM customers c
                   JOIN services s ON s.customer_id = c.id
                   WHERE s.login = ? LIMIT 1`,
                  [pppoeUser]
                );
                if (customers.length > 0) {
                  if (!sendNotification) {
                    sendNotification = require('../services/pushService').sendNotification;
                  }
                  const cust = customers[0];
                  const isOnline = newStatus.toLowerCase().includes('online') || newStatus.toLowerCase().includes('active');
                  sendNotification(cust.customer_id, {
                    title: isOnline ? '✅ Internet is Active' : '🔴 Internet Disconnected',
                    message: isOnline
                      ? `Good news ${cust.name.split(' ')[0]}! Your internet connection is now active.`
                      : `Your internet connection is currently offline. If this is unexpected, please contact support.`,
                    type: 'network',
                    data: { onuId: externalId, oldStatus: existing.status, newStatus, pppoeUser },
                  }).catch(() => {}); // fire-and-forget
                }
              }
            }
          } catch (e) { /* ignore status check errors */ }

          await localPool.query(
            `INSERT INTO onu_devices 
              (onu_external_id, serial_number, name, onu_type, status, admin_status,
               pppoe_username, pppoe_password, wifi_ssid, wifi_password, wifi_mode,
               tr069_device_id, tr069_status, tr069_profile, wifi_ports,
               olt_name, olt_id, board, port, onu_number, zone, odb,
               speed_profile, ip_address, mac_address, vlan, last_synced)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              serial_number = VALUES(serial_number),
              name = VALUES(name),
              onu_type = VALUES(onu_type),
              status = VALUES(status),
              admin_status = VALUES(admin_status),
              pppoe_username = VALUES(pppoe_username),
              pppoe_password = VALUES(pppoe_password),
              wifi_ssid = VALUES(wifi_ssid),
              wifi_password = VALUES(wifi_password),
              wifi_mode = VALUES(wifi_mode),
              tr069_device_id = VALUES(tr069_device_id),
              tr069_status = VALUES(tr069_status),
              tr069_profile = VALUES(tr069_profile),
              wifi_ports = VALUES(wifi_ports),
              olt_name = VALUES(olt_name),
              olt_id = VALUES(olt_id),
              board = VALUES(board),
              port = VALUES(port),
              onu_number = VALUES(onu_number),
              zone = VALUES(zone),
              odb = VALUES(odb),
              speed_profile = VALUES(speed_profile),
              ip_address = VALUES(ip_address),
              mac_address = VALUES(mac_address),
              vlan = VALUES(vlan),
              last_synced = VALUES(last_synced)`,
            [
              externalId,
              onu.sn || onu.serial_number || null,
              onu.name || onu.onu_name || null,
              onu.onu_type_name || onu.onu_type || onu.type || null,
              onu.status || null,
              onu.administrative_status || onu.admin_status || null,
              onu.username || onu.pppoe_username || onu.name || null,
              onu.password || onu.pppoe_password || null,
              wifiSsid,
              wifiPassword,
              wifiMode,
              onu.tr069_device_id || null,
              onu.tr069 || null,
              onu.tr069_profile || null,
              wifiPortsJson,
              onu.olt_name || onu.olt || null,
              onu.olt_id || null,
              onu.board ?? onu.board_id ?? null,
              onu.port ?? onu.port_id ?? null,
              onu.onu_number || onu.number || null,
              onu.zone_name || onu.zone || null,
              onu.odb_name || onu.odb || null,
              speedProfile,
              onu.ip || onu.ip_address || null,
              onu.mac || onu.mac_address || null,
              onu.vlan || null,
              now,
            ]
          );
          upserted++;
        } catch (err) {
          errors++;
          if (errors <= 3) console.error(`  ✗ ONU upsert error for ${extId}:`, err.message);
        }
      });
      await Promise.all(promises);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  ✓ ONU sync complete: ${upserted} upserted, ${errors} errors, ${elapsed}s (${entries.length} ONUs from SmartOLT)`);

  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    if (err.response) {
      console.error(`  ✗ ONU sync failed: HTTP ${err.response.status} — ${err.response.data?.message || 'unknown'} (${elapsed}s)`);
    } else {
      console.error(`  ✗ ONU sync failed: ${err.message} (${elapsed}s)`);
    }
  }
}

/**
 * Start the periodic sync. Call this once at server startup.
 */
function startOnuSync() {
  if (!API_KEY) {
    console.log('  ⚠ ONU sync disabled — SMARTOLT_API_KEY not set');
    return;
  }

  console.log(`  ✓ ONU sync scheduled every ${SYNC_INTERVAL_MS / 60000} minutes`);

  // First sync after a 15-second delay (let server fully start)
  setTimeout(() => {
    syncOnus();
  }, 15000);

  // Then every 10 minutes
  setInterval(() => {
    syncOnus();
  }, SYNC_INTERVAL_MS);
}

module.exports = { syncOnus, startOnuSync };
