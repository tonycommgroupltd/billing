<?php
/**
 * Accounting Configuration Verification Endpoint
 * GET /api/verify-accounting
 * 
 * Comprehensive check of RADIUS accounting setup
 */

require_once __DIR__ . '/helpers.php';

setCorsHeaders();

// Allow access via browser with token in URL for debugging, or via Authorization header
$token = null;

// Try query parameter first (for browser access)
if (isset($_GET['token']) && !empty($_GET['token'])) {
    $token = $_GET['token'];
} else {
    // Try Authorization header
    $headers = getallheaders();
    $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!empty($authHeader)) {
        $token = preg_replace('/^Bearer\s+/i', '', trim($authHeader));
    }
}

$config = require __DIR__ . '/config.php';

if (empty($token)) {
    // Return helpful error message
    http_response_code(401);
    header('Content-Type: application/json');
    echo json_encode([
        'error' => 'Unauthorized',
        'message' => 'No token provided. Access via: /api/verify-accounting?token=mock-jwt-token-for-super-admin',
        'hint' => 'Add ?token=mock-jwt-token-for-super-admin to the URL',
        'valid_tokens' => $config['mock_tokens']
    ]);
    exit;
}

if (!in_array($token, $config['mock_tokens'])) {
    // Invalid token
    http_response_code(401);
    header('Content-Type: application/json');
    echo json_encode([
        'error' => 'Unauthorized',
        'message' => 'Invalid token provided'
    ]);
    exit;
}

// Authentication passed, continue

$pdo = getDB();

$verification = [
    'timestamp' => date('Y-m-d H:i:s'),
    'overall_status' => 'unknown',
    'checks' => [],
    'summary' => [],
    'errors' => [],
    'warnings' => [],
    'recommendations' => []
];

$radiusDb = null;

// Check 1: RADIUS Database Connection
$verification['checks']['radius_connection'] = [
    'name' => 'RADIUS Database Connection',
    'status' => 'unknown',
    'details' => []
];

try {
    require_once __DIR__ . '/radius/PPPoERadiusSync.php';
    $pppoeRadius = new PPPoERadiusSync();
    $radiusDb = $pppoeRadius->getRadiusConnection();
    
    // Test connection
    $testQuery = $radiusDb->query("SELECT 1 as test");
    $testResult = $testQuery->fetch();
    
    if ($testResult && $testResult['test'] == 1) {
        $verification['checks']['radius_connection']['status'] = 'pass';
        $verification['checks']['radius_connection']['details']['connection'] = 'Connected successfully';
    } else {
        $verification['checks']['radius_connection']['status'] = 'fail';
        $verification['checks']['radius_connection']['details']['connection'] = 'Connection test failed';
    }
    
    // Get database info
    $dbInfo = $radiusDb->query("SELECT DATABASE() as db_name, VERSION() as version")->fetch();
    $verification['checks']['radius_connection']['details']['database'] = $dbInfo['db_name'] ?? 'unknown';
    $verification['checks']['radius_connection']['details']['mysql_version'] = $dbInfo['version'] ?? 'unknown';
    
} catch (Exception $e) {
    $verification['checks']['radius_connection']['status'] = 'fail';
    $verification['checks']['radius_connection']['details']['error'] = $e->getMessage();
    $verification['errors'][] = "RADIUS connection failed: " . $e->getMessage();
}

// Check 2: radacct Table Structure
$verification['checks']['radacct_structure'] = [
    'name' => 'radacct Table Structure',
    'status' => 'unknown',
    'details' => []
];

try {
    if ($radiusDb) {
        // Check if table exists
        $tableCheck = $radiusDb->query("SHOW TABLES LIKE 'radacct'")->fetch();
        
        if ($tableCheck) {
            $verification['checks']['radacct_structure']['details']['table_exists'] = true;
            
            // Get table structure
            $columns = $radiusDb->query("DESCRIBE radacct")->fetchAll();
            $verification['checks']['radacct_structure']['details']['columns'] = count($columns);
            $verification['checks']['radacct_structure']['details']['column_names'] = array_column($columns, 'Field');
            
            // Check for critical columns
            $requiredColumns = ['radacctid', 'username', 'acctstarttime', 'acctstoptime', 'nasipaddress', 'framedipaddress'];
            $existingColumns = array_column($columns, 'Field');
            $missingColumns = array_diff($requiredColumns, $existingColumns);
            
            if (empty($missingColumns)) {
                $verification['checks']['radacct_structure']['status'] = 'pass';
                $verification['checks']['radacct_structure']['details']['all_required_columns'] = true;
            } else {
                $verification['checks']['radacct_structure']['status'] = 'fail';
                $verification['checks']['radacct_structure']['details']['missing_columns'] = array_values($missingColumns);
                $verification['errors'][] = "radacct table missing columns: " . implode(', ', $missingColumns);
            }
        } else {
            $verification['checks']['radacct_structure']['status'] = 'fail';
            $verification['checks']['radacct_structure']['details']['table_exists'] = false;
            $verification['errors'][] = "radacct table does not exist in RADIUS database";
        }
    }
} catch (Exception $e) {
    $verification['checks']['radacct_structure']['status'] = 'fail';
    $verification['checks']['radacct_structure']['details']['error'] = $e->getMessage();
    $verification['errors'][] = "Error checking radacct structure: " . $e->getMessage();
}

// Check 3: Accounting Records
$verification['checks']['accounting_records'] = [
    'name' => 'Accounting Records',
    'status' => 'unknown',
    'details' => []
];

try {
    if ($radiusDb) {
        // Total records
        $totalRecords = $radiusDb->query("SELECT COUNT(*) as count FROM radacct")->fetch()['count'] ?? 0;
        $verification['checks']['accounting_records']['details']['total_records'] = (int)$totalRecords;
        
        // Active sessions (no stop time)
        $activeSessions = $radiusDb->query("SELECT COUNT(*) as count FROM radacct WHERE acctstoptime IS NULL AND username IS NOT NULL AND username != ''")->fetch()['count'] ?? 0;
        $verification['checks']['accounting_records']['details']['active_sessions'] = (int)$activeSessions;
        
        // Records in last 24 hours
        $recentRecords = $radiusDb->query("SELECT COUNT(*) as count FROM radacct WHERE acctstarttime >= DATE_SUB(NOW(), INTERVAL 24 HOUR)")->fetch()['count'] ?? 0;
        $verification['checks']['accounting_records']['details']['records_last_24h'] = (int)$recentRecords;
        
        // Records in last 7 days
        $weekRecords = $radiusDb->query("SELECT COUNT(*) as count FROM radacct WHERE acctstarttime >= DATE_SUB(NOW(), INTERVAL 7 DAY)")->fetch()['count'] ?? 0;
        $verification['checks']['accounting_records']['details']['records_last_7d'] = (int)$weekRecords;
        
        // Most recent record
        $latestRecord = $radiusDb->query("SELECT username, acctstarttime, acctstoptime, nasipaddress FROM radacct ORDER BY acctstarttime DESC LIMIT 1")->fetch();
        if ($latestRecord) {
            $verification['checks']['accounting_records']['details']['latest_record'] = [
                'username' => $latestRecord['username'],
                'start_time' => $latestRecord['acctstarttime'],
                'stop_time' => $latestRecord['acctstoptime'],
                'nas_ip' => $latestRecord['nasipaddress']
            ];
        }
        
        // Oldest active session (stale sessions check)
        $oldestActive = $radiusDb->query("SELECT username, acctstarttime, TIMESTAMPDIFF(HOUR, acctstarttime, NOW()) as hours_old FROM radacct WHERE acctstoptime IS NULL ORDER BY acctstarttime ASC LIMIT 1")->fetch();
        if ($oldestActive) {
            $verification['checks']['accounting_records']['details']['oldest_active_session'] = [
                'username' => $oldestActive['username'],
                'start_time' => $oldestActive['acctstarttime'],
                'hours_old' => (int)$oldestActive['hours_old']
            ];
            
            if ($oldestActive['hours_old'] > 168) { // 7 days
                $verification['warnings'][] = "Found active session older than 7 days. May be stale: {$oldestActive['username']}";
            }
        }
        
        // Status determination
        if ($totalRecords > 0) {
            if ($recentRecords > 0) {
                $verification['checks']['accounting_records']['status'] = 'pass';
            } else {
                $verification['checks']['accounting_records']['status'] = 'warning';
                $verification['warnings'][] = "No accounting records in the last 24 hours. Accounting may not be working currently.";
            }
        } else {
            $verification['checks']['accounting_records']['status'] = 'fail';
            $verification['errors'][] = "No accounting records found in radacct table. Accounting is not recording sessions.";
        }
    }
} catch (Exception $e) {
    $verification['checks']['accounting_records']['status'] = 'fail';
    $verification['checks']['accounting_records']['details']['error'] = $e->getMessage();
    $verification['errors'][] = "Error checking accounting records: " . $e->getMessage();
}

// Check 4: Router Configuration
$verification['checks']['router_config'] = [
    'name' => 'Router Configuration',
    'status' => 'unknown',
    'details' => []
];

try {
    // Get all routers
    $routers = $pdo->query("
        SELECT 
            id,
            title,
            nas_ip,
            nas_type,
            radius_secret,
            accounting,
            authorization
        FROM routers
        WHERE deleted_at IS NULL
    ")->fetchAll();
    
    $verification['checks']['router_config']['details']['total_routers'] = count($routers);
    
    $pppoeRouters = [];
    $routersWithAccounting = [];
    $routersWithRadiusSecret = [];
    $routersWithoutNasIp = [];
    
    foreach ($routers as $router) {
        $nasType = json_decode($router['nas_type'] ?? '{}', true);
        $isPppoe = false;
        
        if (isset($nasType['type']) && $nasType['type'] === 'pppoe') {
            $isPppoe = true;
            $pppoeRouters[] = [
                'id' => $router['id'],
                'title' => $router['title'],
                'nas_ip' => $router['nas_ip']
            ];
            
            if (empty($router['nas_ip'])) {
                $routersWithoutNasIp[] = $router['title'];
            }
        }
        
        if (!empty($router['accounting'])) {
            $accounting = json_decode($router['accounting'], true);
            if (is_array($accounting) && !empty($accounting)) {
                $routersWithAccounting[] = [
                    'id' => $router['id'],
                    'title' => $router['title'],
                    'accounting' => $accounting
                ];
            }
        }
        
        if (!empty($router['radius_secret'])) {
            $routersWithRadiusSecret[] = [
                'id' => $router['id'],
                'title' => $router['title']
            ];
        }
    }
    
    $verification['checks']['router_config']['details']['pppoe_routers'] = $pppoeRouters;
    $verification['checks']['router_config']['details']['pppoe_routers_count'] = count($pppoeRouters);
    $verification['checks']['router_config']['details']['routers_with_accounting'] = count($routersWithAccounting);
    $verification['checks']['router_config']['details']['routers_with_radius_secret'] = count($routersWithRadiusSecret);
    
    if (count($pppoeRouters) > 0) {
        if (count($routersWithoutNasIp) > 0) {
            $verification['checks']['router_config']['status'] = 'warning';
            $verification['warnings'][] = "Some PPPoE routers are missing nas_ip: " . implode(', ', $routersWithoutNasIp);
        } elseif (count($routersWithRadiusSecret) > 0) {
            $verification['checks']['router_config']['status'] = 'pass';
        } else {
            $verification['checks']['router_config']['status'] = 'warning';
            $verification['warnings'][] = "PPPoE routers found but missing radius_secret configuration";
        }
    } else {
        $verification['checks']['router_config']['status'] = 'warning';
        $verification['warnings'][] = "No PPPoE routers configured. Set nas_type to {\"type\": \"pppoe\"} for routers using RADIUS accounting.";
    }
    
} catch (Exception $e) {
    $verification['checks']['router_config']['status'] = 'fail';
    $verification['checks']['router_config']['details']['error'] = $e->getMessage();
    $verification['errors'][] = "Error checking router configuration: " . $e->getMessage();
}

// Check 5: Active Sessions vs Services
$verification['checks']['session_matching'] = [
    'name' => 'Session Matching',
    'status' => 'unknown',
    'details' => []
];

try {
    if ($radiusDb) {
        // Get active sessions from RADIUS
        $activeSessions = $radiusDb->query("
            SELECT DISTINCT username
            FROM radacct
            WHERE acctstoptime IS NULL
            AND username IS NOT NULL
            AND username != ''
        ")->fetchAll();
        
        $sessionUsernames = array_column($activeSessions, 'username');
        
        // Get active services from main DB
        $activeServices = $pdo->query("
            SELECT DISTINCT mikrotik_name
            FROM services
            WHERE JSON_EXTRACT(status, '$.value') = 2
            AND deleted_at IS NULL
        ")->fetchAll();
        
        $serviceUsernames = array_column($activeServices, 'mikrotik_name');
        
        $matching = array_intersect($sessionUsernames, $serviceUsernames);
        $sessionsNotInServices = array_diff($sessionUsernames, $serviceUsernames);
        $servicesNotInSessions = array_diff($serviceUsernames, $sessionUsernames);
        
        $verification['checks']['session_matching']['details']['active_sessions_count'] = count($sessionUsernames);
        $verification['checks']['session_matching']['details']['active_services_count'] = count($serviceUsernames);
        $verification['checks']['session_matching']['details']['matching_count'] = count($matching);
        $verification['checks']['session_matching']['details']['sessions_not_in_services'] = array_values($sessionsNotInServices);
        $verification['checks']['session_matching']['details']['services_not_in_sessions'] = array_values($servicesNotInSessions);
        
        if (count($matching) > 0 || count($sessionUsernames) == 0) {
            $verification['checks']['session_matching']['status'] = 'pass';
        } else {
            $verification['checks']['session_matching']['status'] = 'warning';
            $verification['warnings'][] = "Active sessions found but no matching services. This may indicate stale sessions or username mismatches.";
        }
        
        if (count($sessionsNotInServices) > 0) {
            $verification['warnings'][] = "Found " . count($sessionsNotInServices) . " active session(s) in RADIUS that don't match any active service. These may be stale sessions.";
        }
    }
} catch (Exception $e) {
    $verification['checks']['session_matching']['status'] = 'fail';
    $verification['checks']['session_matching']['details']['error'] = $e->getMessage();
    $verification['errors'][] = "Error checking session matching: " . $e->getMessage();
}

// Check 6: Database Tables (Main DB)
$verification['checks']['main_db_tables'] = [
    'name' => 'Main Database Tables',
    'status' => 'unknown',
    'details' => []
];

try {
    $requiredTables = ['routers', 'services', 'customers', 'plans'];
    $existingTables = [];
    
    foreach ($requiredTables as $table) {
        $check = $pdo->query("SHOW TABLES LIKE '$table'")->fetch();
        if ($check) {
            $existingTables[] = $table;
        }
    }
    
    $missingTables = array_diff($requiredTables, $existingTables);
    
    $verification['checks']['main_db_tables']['details']['required_tables'] = $requiredTables;
    $verification['checks']['main_db_tables']['details']['existing_tables'] = $existingTables;
    
    if (empty($missingTables)) {
        $verification['checks']['main_db_tables']['status'] = 'pass';
    } else {
        $verification['checks']['main_db_tables']['status'] = 'fail';
        $verification['checks']['main_db_tables']['details']['missing_tables'] = array_values($missingTables);
        $verification['errors'][] = "Missing required tables: " . implode(', ', $missingTables);
    }
} catch (Exception $e) {
    $verification['checks']['main_db_tables']['status'] = 'fail';
    $verification['checks']['main_db_tables']['details']['error'] = $e->getMessage();
}

// Check 7: RADIUS Authentication Tables
$verification['checks']['radius_auth_tables'] = [
    'name' => 'RADIUS Authentication Tables',
    'status' => 'unknown',
    'details' => []
];

try {
    if ($radiusDb) {
        $requiredRadiusTables = ['radcheck', 'radusergroup', 'radgroupreply'];
        $existingRadiusTables = [];
        
        foreach ($requiredRadiusTables as $table) {
            $check = $radiusDb->query("SHOW TABLES LIKE '$table'")->fetch();
            if ($check) {
                $existingRadiusTables[] = $table;
            }
        }
        
        $missingRadiusTables = array_diff($requiredRadiusTables, $existingRadiusTables);
        
        $verification['checks']['radius_auth_tables']['details']['required_tables'] = $requiredRadiusTables;
        $verification['checks']['radius_auth_tables']['details']['existing_tables'] = $existingRadiusTables;
        
        if (empty($missingRadiusTables)) {
            $verification['checks']['radius_auth_tables']['status'] = 'pass';
        } else {
            $verification['checks']['radius_auth_tables']['status'] = 'fail';
            $verification['checks']['radius_auth_tables']['details']['missing_tables'] = array_values($missingRadiusTables);
            $verification['errors'][] = "Missing required RADIUS tables: " . implode(', ', $missingRadiusTables);
        }
        
        // Check if radcheck has entries
        if (in_array('radcheck', $existingRadiusTables)) {
            $radcheckCount = $radiusDb->query("SELECT COUNT(*) as count FROM radcheck")->fetch()['count'] ?? 0;
            $verification['checks']['radius_auth_tables']['details']['radcheck_entries'] = (int)$radcheckCount;
        }
    }
} catch (Exception $e) {
    $verification['checks']['radius_auth_tables']['status'] = 'fail';
    $verification['checks']['radius_auth_tables']['details']['error'] = $e->getMessage();
}

// Generate Summary
$passCount = 0;
$failCount = 0;
$warningCount = 0;

foreach ($verification['checks'] as $check) {
    if ($check['status'] === 'pass') {
        $passCount++;
    } elseif ($check['status'] === 'fail') {
        $failCount++;
    } elseif ($check['status'] === 'warning') {
        $warningCount++;
    }
}

$verification['summary'] = [
    'total_checks' => count($verification['checks']),
    'passed' => $passCount,
    'failed' => $failCount,
    'warnings' => $warningCount
];

// Overall status
if ($failCount > 0) {
    $verification['overall_status'] = 'fail';
} elseif ($warningCount > 0) {
    $verification['overall_status'] = 'warning';
} else {
    $verification['overall_status'] = 'pass';
}

// Recommendations
if ($verification['checks']['accounting_records']['status'] === 'fail') {
    $verification['recommendations'][] = "Configure FreeRADIUS to use SQL accounting module. Edit /etc/freeradius/3.0/sites-enabled/default and ensure 'sql' is called in the accounting section for PPPoE.";
    $verification['recommendations'][] = "Verify routers are sending accounting packets to FreeRADIUS on port 1813.";
    $verification['recommendations'][] = "Check FreeRADIUS logs: tail -f /var/log/freeradius/radius.log | grep -i accounting";
}

if ($verification['checks']['accounting_records']['status'] === 'warning') {
    $verification['recommendations'][] = "No recent accounting records. Check if routers are sending accounting packets and FreeRADIUS is receiving them.";
    $verification['recommendations'][] = "Verify router accounting configuration: /radius print (on MikroTik)";
    $verification['recommendations'][] = "Test accounting with: radclient -x accounting-packet 127.0.0.1:1813 testing123";
}

if ($verification['checks']['router_config']['status'] === 'warning') {
    $verification['recommendations'][] = "Configure routers with nas_type = {\"type\": \"pppoe\"} and ensure nas_ip and radius_secret are set.";
}

if (count($verification['checks']['session_matching']['details']['sessions_not_in_services'] ?? []) > 0) {
    $verification['recommendations'][] = "Consider cleaning up stale sessions in radacct table that don't match active services.";
}

if (empty($verification['recommendations'])) {
    $verification['recommendations'][] = "All checks passed! Accounting appears to be configured correctly.";
}

jsonResponse($verification);

