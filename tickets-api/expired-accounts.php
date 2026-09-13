<?php
/**
 * Expired Accounts Tracking API
 * Proxies live data from VPS Splynx API + manages local tracking marks
 */

require_once __DIR__ . '/helpers.php';

setCorsHeaders();
$user = checkAuth();
$pdo = getDB();
$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$pathParts = explode('/', trim($path, '/'));

// VPS API config
$VPS_API_URL = 'http://78.159.111.191:3500/api/splynx';
$VPS_API_KEY = 'tcom-splynx-proxy-2026';

/**
 * Call VPS Splynx proxy API
 */
function callVpsApi($endpoint, $params = []) {
    global $VPS_API_URL, $VPS_API_KEY;
    
    $url = $VPS_API_URL . $endpoint;
    if (!empty($params)) {
        $url .= '?' . http_build_query($params);
    }
    
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => [
            'X-Api-Key: ' . $VPS_API_KEY,
            'Content-Type: application/json'
        ]
    ]);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    
    if ($error) {
        return ['error' => 'VPS API unreachable: ' . $error, 'status' => 503];
    }
    
    return ['data' => json_decode($response, true), 'status' => $httpCode];
}

// Ensure tracking table exists
$pdo->exec("
    CREATE TABLE IF NOT EXISTS expired_account_tracking (
        id INT AUTO_INCREMENT PRIMARY KEY,
        service_id BIGINT NOT NULL,
        customer_id BIGINT NOT NULL,
        customer_name VARCHAR(255),
        phone_number VARCHAR(50),
        plan_name VARCHAR(255),
        price DECIMAL(10,2) DEFAULT 0,
        balance DECIMAL(10,2) DEFAULT 0,
        expired_date DATE NOT NULL,
        status ENUM('pending','paid','unpaid') DEFAULT 'pending',
        marked_by VARCHAR(255) DEFAULT NULL,
        marked_at DATETIME DEFAULT NULL,
        notes TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_service_date (service_id, expired_date),
        KEY idx_expired_date (expired_date),
        KEY idx_status (status),
        KEY idx_customer (customer_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");

// ============ ROUTES ============

// GET /api/expired-accounts?date=2026-03-12
// Fetch expired accounts for a date (live from VPS + merge local tracking)
if ($method === 'GET' && in_array('expired-accounts', $pathParts) && !in_array('stats', $pathParts) && !in_array('mark', $pathParts)) {
    $date = $_GET['date'] ?? date('Y-m-d');
    
    // 1. Fetch live data from VPS
    $result = callVpsApi('/expired', ['date' => $date]);
    
    if ($result['status'] !== 200 || isset($result['data']['error'])) {
        // Fallback: try local DB
        $stmt = $pdo->prepare("
            SELECT * FROM expired_account_tracking 
            WHERE expired_date = ? 
            ORDER BY customer_name
        ");
        $stmt->execute([$date]);
        $localData = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        jsonResponse([
            'date' => $date,
            'source' => 'local',
            'total' => count($localData),
            'data' => $localData
        ]);
    }
    
    $expired = $result['data']['data'] ?? [];
    
    // 2. Get existing tracking marks for this date
    $stmt = $pdo->prepare("
        SELECT service_id, status, marked_by, marked_at, notes 
        FROM expired_account_tracking 
        WHERE expired_date = ?
    ");
    $stmt->execute([$date]);
    $marks = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $mark) {
        $marks[$mark['service_id']] = $mark;
    }
    
    // 3. Merge live data with tracking marks + upsert new entries
    $upsertStmt = $pdo->prepare("
        INSERT INTO expired_account_tracking 
            (service_id, customer_id, customer_name, phone_number, plan_name, price, balance, expired_date, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        ON DUPLICATE KEY UPDATE 
            customer_name = VALUES(customer_name),
            phone_number = VALUES(phone_number),
            plan_name = VALUES(plan_name),
            price = VALUES(price),
            balance = VALUES(balance)
    ");
    
    $merged = [];
    foreach ($expired as $item) {
        $sid = $item['service_id'];
        
        // Upsert into local tracking
        $upsertStmt->execute([
            $sid,
            $item['customer_id'],
            $item['customer_name'],
            $item['phone_number'],
            $item['plan_name'],
            $item['price'],
            $item['balance'],
            $date
        ]);
        
        // Merge with existing mark
        $item['tracking_status'] = $marks[$sid]['status'] ?? 'pending';
        $item['marked_by'] = $marks[$sid]['marked_by'] ?? null;
        $item['marked_at'] = $marks[$sid]['marked_at'] ?? null;
        $item['notes'] = $marks[$sid]['notes'] ?? null;
        $merged[] = $item;
    }
    
    // Count by status
    $pending = count(array_filter($merged, fn($i) => $i['tracking_status'] === 'pending'));
    $paid = count(array_filter($merged, fn($i) => $i['tracking_status'] === 'paid'));
    $unpaid = count(array_filter($merged, fn($i) => $i['tracking_status'] === 'unpaid'));
    
    jsonResponse([
        'date' => $date,
        'source' => 'live',
        'total' => count($merged),
        'summary' => ['pending' => $pending, 'paid' => $paid, 'unpaid' => $unpaid],
        'data' => $merged
    ]);
}

// POST /api/expired-accounts/mark
// Mark an expired account as paid/unpaid
// Body: { service_id, date, status: 'paid'|'unpaid'|'pending', notes? }
if ($method === 'POST' && in_array('mark', $pathParts)) {
    $body = getRequestBody();
    
    $serviceId = $body['service_id'] ?? null;
    $date = $body['date'] ?? null;
    $status = $body['status'] ?? null;
    $notes = $body['notes'] ?? null;
    
    if (!$serviceId || !$date || !$status) {
        jsonResponse(['error' => 'service_id, date, and status are required'], 400);
    }
    
    if (!in_array($status, ['paid', 'unpaid', 'pending'])) {
        jsonResponse(['error' => 'status must be paid, unpaid, or pending'], 400);
    }
    
    $markedBy = $user['name'] ?? ($user['email'] ?? 'admin');
    
    $stmt = $pdo->prepare("
        UPDATE expired_account_tracking 
        SET status = ?, marked_by = ?, marked_at = NOW(), notes = ?
        WHERE service_id = ? AND expired_date = ?
    ");
    $stmt->execute([$status, $markedBy, $notes, $serviceId, $date]);
    
    if ($stmt->rowCount() === 0) {
        jsonResponse(['error' => 'Record not found'], 404);
    }
    
    jsonResponse(['success' => true, 'message' => "Marked as $status"]);
}

// POST /api/expired-accounts/mark-bulk
// Bulk mark multiple accounts
// Body: { service_ids: [1,2,3], date, status: 'paid'|'unpaid', notes? }
if ($method === 'POST' && in_array('mark-bulk', $pathParts)) {
    $body = getRequestBody();
    
    $serviceIds = $body['service_ids'] ?? [];
    $date = $body['date'] ?? null;
    $status = $body['status'] ?? null;
    $notes = $body['notes'] ?? null;
    
    if (empty($serviceIds) || !$date || !$status) {
        jsonResponse(['error' => 'service_ids, date, and status are required'], 400);
    }
    
    if (!in_array($status, ['paid', 'unpaid', 'pending'])) {
        jsonResponse(['error' => 'status must be paid, unpaid, or pending'], 400);
    }
    
    $markedBy = $user['name'] ?? ($user['email'] ?? 'admin');
    $placeholders = implode(',', array_fill(0, count($serviceIds), '?'));
    
    $stmt = $pdo->prepare("
        UPDATE expired_account_tracking 
        SET status = ?, marked_by = ?, marked_at = NOW(), notes = ?
        WHERE service_id IN ($placeholders) AND expired_date = ?
    ");
    $params = [$status, $markedBy, $notes, ...$serviceIds, $date];
    $stmt->execute($params);
    
    jsonResponse(['success' => true, 'updated' => $stmt->rowCount()]);
}

// GET /api/expired-accounts/stats?from=2026-03-01&to=2026-03-12
// Daily summary stats for date range
if ($method === 'GET' && in_array('stats', $pathParts)) {
    $from = $_GET['from'] ?? date('Y-m-01');
    $to = $_GET['to'] ?? date('Y-m-d');
    
    $stmt = $pdo->prepare("
        SELECT 
            expired_date as date,
            COUNT(*) as total,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid,
            SUM(CASE WHEN status = 'unpaid' THEN 1 ELSE 0 END) as unpaid
        FROM expired_account_tracking
        WHERE expired_date BETWEEN ? AND ?
        GROUP BY expired_date
        ORDER BY expired_date DESC
    ");
    $stmt->execute([$from, $to]);
    
    jsonResponse([
        'from' => $from,
        'to' => $to,
        'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)
    ]);
}
