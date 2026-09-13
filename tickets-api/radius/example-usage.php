<?php
/**
 * Example Usage of PPPoERadiusSync
 * Demonstrates how to use the dual-database PPPoE API
 */

require_once __DIR__ . '/PPPoERadiusSync.php';

// =====================================================
// 1. Create API instance
// =====================================================
echo "=== Connecting to databases ===\n";

$pppoe = new PPPoERadiusSync(
    radiusHost: '151.243.169.144',      // VPS IP
    radiusUser: 'radius_pppoe',         // RADIUS DB user
    radiusPassword: '2244',              // RADIUS DB password
    radiusDbName: 'radius_pppoe'        // RADIUS DB name
);

// Test connection
if ($pppoe->testConnection()) {
    echo "✓ Connected to main database (cPanel)\n";
}

if ($pppoe->testRadiusConnection()) {
    echo "✓ Connected to RADIUS database (VPS)\n";
}

echo "\n";

// =====================================================
// 2. Create rate limit groups
// =====================================================
echo "=== Creating rate limit groups ===\n";

// 5 Mbps plan
$pppoe->createRateLimitGroup(
    groupName: '5mbps',
    uploadSpeed: '5M',
    downloadSpeed: '5M',
    sessionTimeout: 0  // No timeout
);
echo "✓ Created 5mbps group\n";

// 10 Mbps plan
$pppoe->createRateLimitGroup(
    groupName: '10mbps',
    uploadSpeed: '10M',
    downloadSpeed: '10M',
    sessionTimeout: 0
);
echo "✓ Created 10mbps group\n";

// 20 Mbps plan with 24-hour session limit
$pppoe->createRateLimitGroup(
    groupName: '20mbps',
    uploadSpeed: '20M',
    downloadSpeed: '20M',
    sessionTimeout: 86400  // 24 hours
);
echo "✓ Created 20mbps group (with 24h timeout)\n";

echo "\n";

// =====================================================
// 3. Create PPPoE service (writes to BOTH databases)
// =====================================================
echo "=== Creating PPPoE service ===\n";

$serviceId = $pppoe->createOrUpdateService(
    customerId: 123,                    // Your customer ID
    mikrotikName: 'customer_john',      // PPPoE username
    mikrotikPassword: 'SecurePass123',  // PPPoE password
    planId: 5,                          // Your plan ID
    routerId: 1,                        // Your router ID
    price: 5000,                        // Monthly price
    groupName: '10mbps'                 // RADIUS group for rate limits
);

echo "✓ Service created! ID: $serviceId\n";
echo "  Username: customer_john\n";
echo "  Password: SecurePass123\n";
echo "  Rate limit: 10mbps\n";

echo "\n";

// =====================================================
// 4. Get active sessions
// =====================================================
echo "=== Active PPPoE sessions ===\n";

$sessions = $pppoe->getActiveRadiusSessions();

if (empty($sessions)) {
    echo "No active sessions\n";
} else {
    foreach ($sessions as $session) {
        echo "Session ID: {$session['radacctid']}\n";
        echo "  Username: {$session['username']}\n";
        echo "  IP Address: {$session['framedipaddress']}\n";
        echo "  MAC: {$session['mac_address']}\n";
        echo "  Start: {$session['acctstarttime']}\n";
        echo "  Duration: " . ($session['acctsessiontime'] ?? 0) . " seconds\n";
        echo "  Download: " . round(($session['download_bytes'] ?? 0) / 1024 / 1024, 2) . " MB\n";
        echo "  Upload: " . round(($session['upload_bytes'] ?? 0) / 1024 / 1024, 2) . " MB\n";
        echo "  Customer ID: {$session['main_db_customer_id']}\n";
        echo "  Service ID: {$session['main_db_service_id']}\n";
        echo "\n";
    }
}

echo "\n";

// =====================================================
// 5. Manage services
// =====================================================
echo "=== Service management ===\n";

// Suspend service (removes from RADIUS, prevents login)
echo "Suspending service...\n";
$pppoe->suspendService($serviceId);
echo "✓ Service suspended (user cannot login)\n\n";

// Wait a moment
sleep(2);

// Activate service (adds back to RADIUS)
echo "Activating service...\n";
$pppoe->activateService($serviceId);
echo "✓ Service activated (user can login again)\n\n";

// =====================================================
// 6. Disconnect user
// =====================================================
echo "=== Disconnect user ===\n";

$disconnected = $pppoe->disconnectRadiusSession('customer_john');
if ($disconnected) {
    echo "✓ User disconnected\n";
} else {
    echo "✗ User not connected or already disconnected\n";
}

echo "\n";

// =====================================================
// 7. Delete service (removes from BOTH databases)
// =====================================================
echo "=== Delete service (optional) ===\n";

// Uncomment to actually delete:
// $pppoe->deleteService($serviceId);
// echo "✓ Service deleted from both databases\n";

echo "✗ Skipped (uncomment to delete)\n";

echo "\n";
echo "=== Example complete ===\n";

