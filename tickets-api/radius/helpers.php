<?php
/**
 * RADIUS Helper Functions
 * Functions for parsing RADIUS attributes and database operations
 */

require_once __DIR__ . '/../config.php';

/**
 * Get database connection
 */
function getRadiusDB() {
    static $pdo = null;
    
    if ($pdo === null) {
        $config = require __DIR__ . '/../config.php';
        $db = $config['db'];
        
        try {
            $dsn = "mysql:host={$db['host']};port=" . ($db['port'] ?? 3306) . ";dbname={$db['database']};charset={$db['charset']}";
            $pdo = new PDO($dsn, $db['username'], $db['password'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false
            ]);
        } catch (PDOException $e) {
            error_log("RADIUS DB Error: " . $e->getMessage());
            return null;
        }
    }
    
    return $pdo;
}

/**
 * Get router by NAS-IP
 */
function getRouterByNasIp($nasIp) {
    $pdo = getRadiusDB();
    if (!$pdo) return null;
    
    try {
        $stmt = $pdo->prepare("SELECT * FROM routers WHERE nas_ip = ? AND deleted_at IS NULL");
        $stmt->execute([$nasIp]);
        return $stmt->fetch();
    } catch (PDOException $e) {
        error_log("Error getting router: " . $e->getMessage());
        return null;
    }
}

/**
 * Check if router is PPPoE type
 */
function isPppoeRouter($router) {
    if (!$router || empty($router['nas_type'])) {
        return true; // NULL means PPPoE for backward compatibility
    }
    
    $nasType = json_decode($router['nas_type'], true);
    
    if (is_string($nasType)) {
        return strtolower($nasType) === 'pppoe';
    }
    
    if (is_array($nasType)) {
        $typeStr = json_encode($nasType);
        return stripos($typeStr, 'pppoe') !== false && stripos($typeStr, 'hotspot') === false;
    }
    
    return false;
}

/**
 * Get service by username (mikrotik_name)
 */
function getServiceByUsername($username) {
    $pdo = getRadiusDB();
    if (!$pdo) return null;
    
    try {
        $stmt = $pdo->prepare("
            SELECT s.*, p.rate_limit, c.status as customer_status, c.id as customer_id
            FROM services s
            LEFT JOIN plans p ON s.plan_id = p.id
            LEFT JOIN customers c ON s.customer_id = c.id
            WHERE s.mikrotik_name = ? AND s.deleted_at IS NULL
            LIMIT 1
        ");
        $stmt->execute([$username]);
        return $stmt->fetch();
    } catch (PDOException $e) {
        error_log("Error getting service: " . $e->getMessage());
        return null;
    }
}

/**
 * Parse rate limit from plan
 */
function parseRateLimit($rateLimitJson) {
    if (empty($rateLimitJson)) {
        return ['upload' => '0', 'download' => '0', 'label' => 'default'];
    }
    
    $rateLimit = json_decode($rateLimitJson, true);
    
    if (!$rateLimit) {
        return ['upload' => '0', 'download' => '0', 'label' => 'default'];
    }
    
    if (isset($rateLimit['label'])) {
        return [
            'label' => $rateLimit['label'],
            'upload' => $rateLimit['upload'] ?? '0',
            'download' => $rateLimit['download'] ?? '0'
        ];
    }
    
    return [
        'label' => $rateLimit['label'] ?? 'default',
        'upload' => $rateLimit['upload'] ?? $rateLimit[0] ?? '0',
        'download' => $rateLimit['download'] ?? $rateLimit[1] ?? '0'
    ];
}

/**
 * Check if service is active
 */
function isServiceActive($service) {
    if (!$service) return false;
    
    $status = json_decode($service['status'], true);
    
    if (is_array($status) && isset($status['value'])) {
        return (int)$status['value'] === 2; // 2 = active
    }
    
    if (is_string($status)) {
        return strtolower($status) === 'active';
    }
    
    return false;
}

/**
 * Check if customer is active
 */
function isCustomerActive($customerStatus) {
    return strtolower($customerStatus) === 'active';
}

/**
 * Create PPPoE session
 */
function createPppoeSession($routerId, $username, $ipAddress, $macAddress = null) {
    $pdo = getRadiusDB();
    if (!$pdo) return null;
    
    try {
        $stmt = $pdo->prepare("
            INSERT INTO pppoe_sessions (router_id, username, ip_address, mac_address, start_time)
            VALUES (?, ?, ?, ?, NOW())
        ");
        $stmt->execute([$routerId, $username, $ipAddress, $macAddress]);
        return $pdo->lastInsertId();
    } catch (PDOException $e) {
        error_log("Error creating session: " . $e->getMessage());
        return null;
    }
}

/**
 * Update PPPoE session end time
 */
function closePppoeSession($username, $ipAddress) {
    $pdo = getRadiusDB();
    if (!$pdo) return false;
    
    try {
        $stmt = $pdo->prepare("
            UPDATE pppoe_sessions 
            SET end_time = NOW() 
            WHERE username = ? AND ip_address = ? AND end_time IS NULL
            ORDER BY start_time DESC 
            LIMIT 1
        ");
        return $stmt->execute([$username, $ipAddress]);
    } catch (PDOException $e) {
        error_log("Error closing session: " . $e->getMessage());
        return false;
    }
}

/**
 * Get active session by username and IP
 */
function getActiveSession($username, $ipAddress) {
    $pdo = getRadiusDB();
    if (!$pdo) return null;
    
    try {
        $stmt = $pdo->prepare("
            SELECT * FROM pppoe_sessions 
            WHERE username = ? AND ip_address = ? AND end_time IS NULL
            ORDER BY start_time DESC 
            LIMIT 1
        ");
        $stmt->execute([$username, $ipAddress]);
        return $stmt->fetch();
    } catch (PDOException $e) {
        error_log("Error getting session: " . $e->getMessage());
        return null;
    }
}

/**
 * Add statistics record
 */
function addStatistics($sessionId, $ipAddress, $inBytes, $outBytes) {
    $pdo = getRadiusDB();
    if (!$pdo) return false;
    
    try {
        $stmt = $pdo->prepare("
            INSERT INTO statistics (session_id, ipv4_address, in_bytes, out_bytes, timestamp)
            VALUES (?, ?, ?, ?, NOW())
        ");
        return $stmt->execute([$sessionId, $ipAddress, $inBytes, $outBytes]);
    } catch (PDOException $e) {
        error_log("Error adding statistics: " . $e->getMessage());
        return false;
    }
}

/**
 * Log RADIUS request (for debugging)
 */
function logRadiusRequest($type, $data) {
    $logFile = __DIR__ . '/radius.log';
    $timestamp = date('Y-m-d H:i:s');
    $logEntry = "[$timestamp] [$type] " . json_encode($data) . "\n";
    @file_put_contents($logFile, $logEntry, FILE_APPEND);
}

