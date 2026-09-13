// GenieACS NBI → local acs_devices cache (every 5 minutes)
const genieacs = require('../services/genieacsService');
const acsDeviceService = require('../services/acsDeviceService');

const SYNC_INTERVAL_MS = Number(process.env.ACS_SYNC_INTERVAL_MS || 5 * 60 * 1000);
const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

async function syncAcsDevices() {
  if (process.env.ACS_SYNC_ENABLED === 'false') {
    return;
  }

  const start = Date.now();
  console.log(`  🔄 ACS sync starting at ${new Date().toISOString()}`);

  try {
    await acsDeviceService.ensureTable();
    const devices = await genieacs.listAllDevices();
    let upserted = 0;

    for (const d of devices) {
      const status = genieacs.extractDeviceSummary(d);
      const ok = await acsDeviceService.upsertFromGenieacs({
        genieacs_id: status.deviceId,
        serial_number: status.serial,
        product_class: status.productClass,
        manufacturer: status.manufacturer,
        pppoe_username: status.pppoeUsername,
        wifi_ssid: status.wifiSsid,
        software_version: status.software,
        connection_request_url: status.connectionRequestUrl,
        last_inform: status.lastInform,
        online: status.lastInform
          && Date.now() - new Date(status.lastInform).getTime() < ONLINE_THRESHOLD_MS,
      });
      if (ok) upserted++;
    }

    if (upserted === 0 && devices.length > 0) {
      console.log(`  ⚠ ACS sync — ${devices.length} devices from GenieACS (DB not available)`);
      return;
    }

    console.log(`  ✓ ACS sync done — ${upserted} devices in ${Date.now() - start}ms`);
  } catch (err) {
    console.error('  ✗ ACS sync failed:', err.message);
  }
}

function startAcsSync() {
  syncAcsDevices();
  setInterval(syncAcsDevices, SYNC_INTERVAL_MS);
  console.log(`  ✓ ACS sync scheduled every ${SYNC_INTERVAL_MS / 1000}s`);
}

module.exports = { syncAcsDevices, startAcsSync };
