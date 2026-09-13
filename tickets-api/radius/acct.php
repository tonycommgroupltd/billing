#!/usr/bin/env php
<?php
/**
 * RADIUS Accounting Handler
 * Handles Accounting-Request packets from routers (PPPoE only)
 */

require_once __DIR__ . '/helpers.php';

// Parse RADIUS attributes from stdin
$stdin = file_get_contents('php://stdin');
$attrs = [];

foreach (explode("\n", trim($stdin)) as $line) {
    $line = trim($line);
    if (empty($line) || strpos($line, '=') === false) continue;
    
    list($key, $value) = explode('=', $line, 2);
    $attrs[$key] = $value;
}

// Get accounting attributes
$acctStatusType = $attrs['Acct-Status-Type'] ?? '';
$username = $attrs['User-Name'] ?? '';
$nasIp = $attrs['NAS-IP-Address'] ?? $attrs['NAS-IPv4-Address'] ?? '';
$framedIpAddress = $attrs['Framed-IP-Address'] ?? '';
$callingStationId = $attrs['Calling-Station-Id'] ?? '';
$acctInputOctets = $attrs['Acct-Input-Octets'] ?? '0';
$acctOutputOctets = $attrs['Acct-Output-Octets'] ?? '0';
$serviceType = $attrs['Service-Type'] ?? '';

// Skip hotspot accounting
if (!empty($serviceType)) {
    if (stripos($serviceType, 'Login') !== false && stripos($serviceType, 'Framed') === false) {
        logRadiusRequest('ACCT_SKIP_HOTSPOT', "Skipping hotspot accounting: $serviceType");
        echo "OK\n";
        exit(0);
    }
}

// Log the request
logRadiusRequest('ACCT', [
    'status_type' => $acctStatusType,
    'username' => $username,
    'nas_ip' => $nasIp,
    'ip' => $framedIpAddress
]);

// Validate NAS-IP
if (empty($nasIp)) {
    logRadiusRequest('ACCT_ERROR', 'No NAS-IP-Address provided');
    echo "Error\n";
    exit(1);
}

// Get router from database
$router = getRouterByNasIp($nasIp);

if (!$router) {
    logRadiusRequest('ACCT_ERROR', "Router not found for NAS-IP: $nasIp");
    echo "Error\n";
    exit(1);
}

// Check if this is a PPPoE router
if (!isPppoeRouter($router)) {
    logRadiusRequest('ACCT_SKIP', "Hotspot router, skipping: $nasIp");
    echo "OK\n";
    exit(0);
}

// Validate username and IP
if (empty($username) || empty($framedIpAddress)) {
    logRadiusRequest('ACCT_ERROR', 'Missing username or IP address');
    echo "Error\n";
    exit(1);
}

$routerId = $router['id'];

// Handle different accounting status types
switch (strtoupper($acctStatusType)) {
    case 'START':
        $macAddress = $callingStationId ?: null;
        $sessionId = createPppoeSession($routerId, $username, $framedIpAddress, $macAddress);
        
        if ($sessionId) {
            logRadiusRequest('ACCT_START', "Session created: $sessionId for $username");
            echo "OK\n";
        } else {
            logRadiusRequest('ACCT_ERROR', "Failed to create session for $username");
            echo "Error\n";
        }
        break;
        
    case 'STOP':
        $session = getActiveSession($username, $framedIpAddress);
        
        if ($session) {
            closePppoeSession($username, $framedIpAddress);
            
            if ($acctInputOctets > 0 || $acctOutputOctets > 0) {
                addStatistics($session['id'], $framedIpAddress, $acctInputOctets, $acctOutputOctets);
            }
            
            logRadiusRequest('ACCT_STOP', "Session closed: {$session['id']} for $username");
            echo "OK\n";
        } else {
            logRadiusRequest('ACCT_WARNING', "No active session found to close for $username");
            echo "OK\n";
        }
        break;
        
    case 'UPDATE':
    case 'INTERIM-UPDATE':
        $session = getActiveSession($username, $framedIpAddress);
        
        if ($session) {
            addStatistics($session['id'], $framedIpAddress, $acctInputOctets, $acctOutputOctets);
            logRadiusRequest('ACCT_UPDATE', "Statistics updated for session: {$session['id']}");
            echo "OK\n";
        } else {
            logRadiusRequest('ACCT_WARNING', "No active session found for update: $username");
            echo "OK\n";
        }
        break;
        
    default:
        logRadiusRequest('ACCT_ERROR', "Unknown status type: $acctStatusType");
        echo "OK\n";
        break;
}

exit(0);

