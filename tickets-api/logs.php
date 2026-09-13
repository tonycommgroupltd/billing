<?php
/**
 * Activity Logs API
 * Location: api/logs.php
 * Description: System activity logging and retrieval
 * Access: api.tonycommgroupltd.com/api/logs.php
 */

require_once __DIR__ . '/helpers.php';

// Set timezone to Africa/Nairobi for correct local time
date_default_timezone_set('Africa/Nairobi');

setCorsHeaders();

header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];
$request = explode('/', trim($_SERVER['PATH_INFO'] ?? '', '/'));
$action = $request[0] ?? '';
$id = $request[1] ?? null;

try {
    $db = getDB();
    
    // Auto-create table if it doesn't exist
    createActivityLogsTableIfNotExists($db);

    switch ($action) {
        case '':
        case 'logs.php':
            if ($method === 'GET') {
                echo json_encode([
                    'success' => true,
                    'name' => 'Activity Logs API',
                    'version' => '1.0',
                    'endpoints' => [
                        'GET /api/logs.php/list' => 'Get all activity logs with filters',
                        'POST /api/logs.php/log' => 'Create new log entry',
                        'GET /api/logs.php/stats' => 'Get activity statistics',
                        'GET /api/logs.php/user/{id}' => 'Get logs for specific user',
                        'GET /api/logs.php/types' => 'Get available activity types'
                    ]
                ]);
            }
            break;

        case 'list':
            if ($method === 'GET') {
                listActivityLogs($db);
            }
            break;

        case 'log':
            if ($method === 'POST') {
                createLogEntry($db);
            }
            break;

        case 'stats':
            if ($method === 'GET') {
                getActivityStats($db);
            }
            break;

        case 'user':
            if ($method === 'GET' && $id) {
                getUserLogs($db, $id);
            }
            break;

        case 'types':
            if ($method === 'GET') {
                getActivityTypes($db);
            }
            break;

        default:
            http_response_code(404);
            echo json_encode([
                'success' => false,
                'error' => 'Endpoint not found'
            ]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Internal server error',
        'message' => $e->getMessage()
    ]);
}

function listActivityLogs($db) {
    try {
        $page = $_GET['page'] ?? 1;
        $limit = min($_GET['limit'] ?? 50, 100); // Max 100 per page
        $offset = ($page - 1) * $limit;
        
        $filters = [];
        $params = [];
        
        // Filter by activity type
        if (!empty($_GET['activity_type'])) {
            $filters[] = "activity_type = ?";
            $params[] = $_GET['activity_type'];
        }
        
        // Filter by user
        if (!empty($_GET['user_name'])) {
            $filters[] = "user_name LIKE ?";
            $params[] = '%' . $_GET['user_name'] . '%';
        }
        
        // Filter by target type
        if (!empty($_GET['target_type'])) {
            $filters[] = "target_type = ?";
            $params[] = $_GET['target_type'];
        }
        
        // Date range filters
        if (!empty($_GET['start_date'])) {
            $filters[] = "created_at >= ?";
            $params[] = $_GET['start_date'] . ' 00:00:00';
        }
        
        if (!empty($_GET['end_date'])) {
            $filters[] = "created_at <= ?";
            $params[] = $_GET['end_date'] . ' 23:59:59';
        }
        
        // Search in description
        if (!empty($_GET['search'])) {
            $filters[] = "activity_description LIKE ?";
            $params[] = '%' . $_GET['search'] . '%';
        }
        
        $whereClause = $filters ? 'WHERE ' . implode(' AND ', $filters) : '';
        
        // Get total count
        $countSql = "SELECT COUNT(*) as total FROM activity_logs $whereClause";
        $countStmt = $db->prepare($countSql);
        $countStmt->execute($params);
        $total = $countStmt->fetch()['total'];
        
        // Get logs
        $sql = "
            SELECT * FROM activity_logs 
            $whereClause 
            ORDER BY created_at DESC 
            LIMIT $limit OFFSET $offset
        ";
        
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $logs = $stmt->fetchAll();
        
        echo json_encode([
            'success' => true,
            'data' => $logs,
            'pagination' => [
                'page' => (int)$page,
                'limit' => (int)$limit,
                'total' => (int)$total,
                'pages' => ceil($total / $limit)
            ]
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Failed to retrieve logs',
            'message' => $e->getMessage()
        ]);
    }
}

function createLogEntry($db) {
    try {
        $data = getRequestBody();
        
        // Debug: Log the received data
        error_log('Activity Log - Received data: ' . json_encode($data));
        
        $required = ['activity_type', 'activity_description'];
        foreach ($required as $field) {
            if (empty($data[$field])) {
                error_log("Activity Log - Missing required field: $field");
                http_response_code(400);
                echo json_encode([
                    'success' => false,
                    'error' => "Field '$field' is required",
                    'received_data' => $data
                ]);
                return;
            }
        }
        
        // Get IP address and User Agent
        $ipAddress = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? null;
        $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? null;
        
        $sql = "
            INSERT INTO activity_logs (
                user_id, user_name, user_email, activity_type, 
                activity_description, target_type, target_id, 
                ip_address, user_agent
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ";
        
        $stmt = $db->prepare($sql);
        $stmt->execute([
            $data['user_id'] ?? null,
            $data['user_name'] ?? null,
            $data['user_email'] ?? null,
            $data['activity_type'],
            $data['activity_description'],
            $data['target_type'] ?? null,
            $data['target_id'] ?? null,
            $ipAddress,
            $userAgent
        ]);
        
        $logId = $db->lastInsertId();
        
        echo json_encode([
            'success' => true,
            'message' => 'Activity logged successfully',
            'log_id' => $logId
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Failed to create log entry',
            'message' => $e->getMessage()
        ]);
    }
}

function getActivityStats($db) {
    try {
        // Get stats for the last 30 days
        $sql = "
            SELECT 
                activity_type,
                COUNT(*) as count,
                DATE(created_at) as date
            FROM activity_logs 
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY activity_type, DATE(created_at)
            ORDER BY date DESC, count DESC
        ";
        
        $stmt = $db->prepare($sql);
        $stmt->execute();
        $dailyStats = $stmt->fetchAll();
        
        // Get overall stats
        $overallSql = "
            SELECT 
                activity_type,
                COUNT(*) as total_count
            FROM activity_logs 
            GROUP BY activity_type 
            ORDER BY total_count DESC
        ";
        
        $overallStmt = $db->prepare($overallSql);
        $overallStmt->execute();
        $overallStats = $overallStmt->fetchAll();
        
        // Get most active users
        $usersSql = "
            SELECT 
                user_name,
                user_email,
                COUNT(*) as activity_count
            FROM activity_logs 
            WHERE user_name IS NOT NULL
            AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY user_name, user_email 
            ORDER BY activity_count DESC 
            LIMIT 10
        ";
        
        $usersStmt = $db->prepare($usersSql);
        $usersStmt->execute();
        $topUsers = $usersStmt->fetchAll();
        
        echo json_encode([
            'success' => true,
            'data' => [
                'daily_stats' => $dailyStats,
                'overall_stats' => $overallStats,
                'top_users' => $topUsers
            ]
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Failed to retrieve stats',
            'message' => $e->getMessage()
        ]);
    }
}

function getUserLogs($db, $userId) {
    try {
        $sql = "
            SELECT * FROM activity_logs 
            WHERE user_id = ? OR user_name LIKE ?
            ORDER BY created_at DESC 
            LIMIT 100
        ";
        
        $stmt = $db->prepare($sql);
        $stmt->execute([$userId, "%$userId%"]);
        $logs = $stmt->fetchAll();
        
        echo json_encode([
            'success' => true,
            'data' => $logs
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Failed to retrieve user logs',
            'message' => $e->getMessage()
        ]);
    }
}

function getActivityTypes($db) {
    try {
        $sql = "
            SELECT DISTINCT activity_type, COUNT(*) as count 
            FROM activity_logs 
            GROUP BY activity_type 
            ORDER BY activity_type
        ";
        
        $stmt = $db->prepare($sql);
        $stmt->execute();
        $types = $stmt->fetchAll();
        
        echo json_encode([
            'success' => true,
            'data' => $types
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Failed to retrieve activity types',
            'message' => $e->getMessage()
        ]);
    }
}

/**
 * Auto-create activity_logs table if it doesn't exist
 */
function createActivityLogsTableIfNotExists($db) {
    try {
        $stmt = $db->query("SHOW TABLES LIKE 'activity_logs'");
        if ($stmt->rowCount() === 0) {
            $createSQL = "
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
                INDEX idx_user_id (user_id),
                INDEX idx_activity_type (activity_type),
                INDEX idx_target_type (target_type),
                INDEX idx_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ";
            
            $db->exec($createSQL);
            
            // Add sample data
            $db->exec("
                INSERT INTO activity_logs (user_name, user_email, activity_type, activity_description, target_type, target_id, ip_address) VALUES
                ('System', 'system@tonycommgroupltd.com', 'system', 'Activity logging system initialized', 'system', NULL, '127.0.0.1'),
                ('Admin User', 'admin@tonycommgroupltd.com', 'login', 'Administrator logged in', 'user', 1, '192.168.1.100'),
                ('Manager User', 'manager@tonycommgroupltd.com', 'view', 'Viewed activity logs page', 'logs', NULL, '192.168.1.101')
            ");
        }
    } catch (Exception $e) {
        // Log error but don't fail the request
        error_log("Failed to create activity_logs table: " . $e->getMessage());
    }
}
?>