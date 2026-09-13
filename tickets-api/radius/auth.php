#!/usr/bin/env php
<?php
/**
 * RADIUS Authentication Handler
 * Handles Access-Request packets from routers (PPPoE only)
 */

require_once __DIR__ . '/helpers.php';

// Parse RADIUS attributes from stdin (FreeRADIUS passes via stdin)
$stdin = file_get_contents('php://stdin');
$attrs = [];

foreach (explode("\n", trim($stdin)) as $line) {
    $line = trim($line);
    if (empty($line) || strpos($line, '=') === false) continue;
    
    list($key, $value) = explode('=', $line, 2);
    $attrs[$key] = $value;
}

// Get RADIUS attributes
$username = $attrs['User-Name'] ?? '';
$password = $attrs['User-Password'] ?? '';
$nasIp = $attrs['NAS-IP-Address'] ?? $attrs['NAS-IPv4-Address'] ?? '';
$serviceType = $attrs['Service-Type'] ?? '';

// IMPORTANT: Only process PPPoE requests - skip hotspot
if (!empty($serviceType)) {
    // If Service-Type indicates hotspot, skip it
    if (stripos($serviceType, 'Login') !== false && stripos($serviceType, 'Framed') === false) {
        logRadiusRequest('AUTH_SKIP_HOTSPOT', "Skipping hotspot request: $serviceType");
        echo "Access-Reject\n";
        exit(1);
    }
    
    // Only process Framed-User/Framed (PPPoE)
    if (stripos($serviceType, 'Framed') === false) {
        logRadiusRequest('AUTH_SKIP_NON_PPPOE', "Not a PPPoE request: $serviceType");
        echo "Access-Reject\n";
        exit(1);
    }
}

// Log the request
logRadiusRequest('AUTH', [
    'username' => $username,
    'nas_ip' => $nasIp,
    'service_type' => $serviceType,
    'has_password' => !empty($password)
]);

// Validate NAS-IP
if (empty($nasIp)) {
    logRadiusRequest('AUTH_ERROR', 'No NAS-IP-Address provided');
    echo "Access-Reject\n";
    exit(1);
}

// Get router from database
$router = getRouterByNasIp($nasIp);

if (!$router) {
    logRadiusRequest('AUTH_ERROR', "Router not found for NAS-IP: $nasIp");
    echo "Access-Reject\n";
    exit(1);
}

// Check if this is a PPPoE router (skip hotspot routers)
if (!isPppoeRouter($router)) {
    logRadiusRequest('AUTH_SKIP', "Hotspot router, skipping: $nasIp");
    echo "Access-Reject\n";
    exit(1);
}

// Validate username and password
if (empty($username) || empty($password)) {
    logRadiusRequest('AUTH_ERROR', 'Missing username or password');
    echo "Access-Reject\n";
    exit(1);
}

// Get service from database
$service = getServiceByUsername($username);

if (!$service) {
    logRadiusRequest('AUTH_ERROR', "Service not found for username: $username");
    echo "Access-Reject\n";
    exit(1);
}

// Verify password
if ($service['mikrotik_password'] !== $password) {
    logRadiusRequest('AUTH_ERROR', "Invalid password for username: $username");
    echo "Access-Reject\n";
    exit(1);
}

// Check if service is active
if (!isServiceActive($service)) {
    logRadiusRequest('AUTH_ERROR', "Service is not active for username: $username");
    echo "Access-Reject\n";
    exit(1);
}

// Check if customer is active
if (!isCustomerActive($service['customer_status'])) {
    logRadiusRequest('AUTH_ERROR', "Customer is not active for username: $username");
    echo "Access-Reject\n";
    exit(1);
}

// Parse rate limit
$rateLimit = parseRateLimit($service['rate_limit']);

// Return Access-Accept with attributes
logRadiusRequest('AUTH_SUCCESS', "Access accepted for username: $username");

// Output format for FreeRADIUS
echo "Access-Accept\n";
echo "Mikrotik-Rate-Limit=" . $rateLimit['label'] . "\n";

if (isset($rateLimit['upload']) && $rateLimit['upload'] !== '0') {
    echo "Mikrotik-Rate-Limit-Up=" . $rateLimit['upload'] . "\n";
}
if (isset($rateLimit['download']) && $rateLimit['download'] !== '0') {
    echo "Mikrotik-Rate-Limit-Down=" . $rateLimit['download'] . "\n";
}

exit(0);

