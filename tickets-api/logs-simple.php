<?php
/**
 * Activity Logs API - Simplified Version
 * Auto-creates table on first use
 */

require_once __DIR__ . '/helpers.php';
setCorsHeaders();
header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? '';
$parts = explode('/', trim($path, '/'));
$action = $parts[0] ?? '';

try {
    $db = getDB();
    
    // Auto-create table if it doesn't exist
    createTableIfNotExists($db);
    
    if ($action === 'list' && $method === 'GET') {
        // Simple list with pagination
        $page = max(1, (int)($_GET['page'] ?? 1));
        $limit = min(100, max(10, (int)($_GET['limit'] ?? 50)));
        $offset = ($page - 1) * $limit;
        
        $countStmt = $db->query("SELECT COUNT(*) as total FROM activity_logs");
        $total = $countStmt->fetch()['total'];
        
        $logsStmt = $db->prepare("SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT ? OFFSET ?");
        $logsStmt->execute([$limit, $offset]);
        $logs = $logsStmt->fetchAll();
        
        echo json_encode([
            'success' => true,
            'data' => $logs,
            'pagination' => [
                'page' => $page,
                'limit' => $limit,
                'total' => $total,
                'pages' => ceil($total / $limit)
            ]
        ]);
        
    } elseif ($action === 'log' && $method === 'POST') {
        // Create log entry
        $input = json_decode(file_get_contents('php://input'), true);
        
        $stmt = $db->prepare("
            INSERT INTO activity_logs (user_name, user_email, activity_type, activity_description, target_type, target_id, ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");
        
        $stmt->execute([
            $input['user_name'] ?? null,
            $input['user_email'] ?? null,
            $input['activity_type'] ?? 'unknown',
            $input['activity_description'] ?? '',
            $input['target_type'] ?? null,
            $input['target_id'] ?? null,
            $_SERVER['REMOTE_ADDR'] ?? null,
            $_SERVER['HTTP_USER_AGENT'] ?? null
        ]);
        
        echo json_encode(['success' => true, 'message' => 'Log created']);
        
    } else {
        // API Info
        echo json_encode([
            'success' => true,
            'name' => 'Activity Logs API (Simplified)',
            'endpoints' => [
                'GET /api/logs-simple.php/list' => 'Get logs',
                'POST /api/logs-simple.php/log' => 'Create log'
            ]
        ]);
    }
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
        'debug' => [
            'file' => $e->getFile(),
            'line' => $e->getLine()
        ]
    ]);
}

function createTableIfNotExists($db) {
    try {
        // Check if table exists
        $stmt = $db->query("SHOW TABLES LIKE 'activity_logs'");
        if ($stmt->rowCount() === 0) {
            // Create table
            $sql = "
            CREATE TABLE activity_logs (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NULL,
                user_name VARCHAR(255) NULL,
                user_email VARCHAR(255) NULL,
                activity_type VARCHAR(100) NOT NULL DEFAULT 'unknown',
                activity_description TEXT NOT NULL,
                target_type VARCHAR(100) NULL,
                target_id INT NULL,
                ip_address VARCHAR(45) NULL,
                user_agent TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_activity_type (activity_type),
                INDEX idx_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ";
            
            $db->exec($sql);
            
            // Add sample data
            $db->exec("
                INSERT INTO activity_logs (user_name, user_email, activity_type, activity_description, target_type, target_id, ip_address) VALUES
                ('System', 'system@tonycommgroupltd.com', 'system', 'Activity logging system initialized', 'system', NULL, '127.0.0.1'),
                ('Admin User', 'admin@tonycommgroupltd.com', 'login', 'Administrator logged in', 'user', 1, '192.168.1.100'),
                ('Test User', 'test@tonycommgroupltd.com', 'view', 'Viewed activity logs page', 'logs', NULL, '192.168.1.101')
            ");
        }
    } catch (Exception $e) {
        // Ignore table creation errors for now
        error_log("Failed to create activity_logs table: " . $e->getMessage());
    }
}
?>