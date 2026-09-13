<?php
/**
 * User Options API
 * Provides user lists for ticket assignments and watchers based on roles
 * Location: api/user-options.php
 * Access: api.tonycommgroupltd.com/api/user-options.php
 */

require_once __DIR__ . '/helpers.php';

setCorsHeaders();
header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];
$request = explode('/', trim($_SERVER['PATH_INFO'] ?? '', '/'));
$action = $request[0] ?? '';

// If accessing user-options.php directly without action, show API info
if (empty($action) || $action === 'user-options.php') {
    if ($method === 'GET') {
        echo json_encode([
            'success' => true,
            'name' => 'User Options API',
            'version' => '1.0',
            'endpoints' => [
                'GET /api/user-options.php/assignment-options' => 'Get users available for ticket assignment (technicians & engineers)',
                'GET /api/user-options.php/watcher-options' => 'Get users available as ticket watchers (managers & administrators)'
            ],
            'description' => 'Provides role-based user lists for ticket management'
        ]);
        exit();
    }
}

try {
    $db = getDB();
    
    switch ($action) {
        case 'assignment-options':
            if ($method === 'GET') {
                getAssignmentOptions($db);
            }
            break;

        case 'watcher-options':
            if ($method === 'GET') {
                getWatcherOptions($db);
            }
            break;

        default:
            echo json_encode([
                'success' => false,
                'error' => 'Invalid action',
                'requested_action' => $action,
                'available_endpoints' => [
                    'GET /api/user-options.php/assignment-options',
                    'GET /api/user-options.php/watcher-options'
                ]
            ]);
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Database connection failed: ' . $e->getMessage()
    ]);
}

// =============================================
// GET ASSIGNMENT OPTIONS
// Get users with technician and engineer roles for ticket assignment
// =============================================
function getAssignmentOptions($db) {
    try {
        $sql = "SELECT DISTINCT u.id, u.name, u.email 
                FROM users u 
                INNER JOIN model_has_roles mhr ON u.id = mhr.model_id 
                INNER JOIN roles r ON mhr.role_id = r.id 
                WHERE r.name IN ('technician', 'engineer') 
                AND u.deleted_at IS NULL 
                AND mhr.model_type = 'App\\\\Models\\\\User'
                ORDER BY u.name ASC";
        
        $stmt = $db->prepare($sql);
        $stmt->execute();
        $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Format for dropdown usage
        $options = [];
        foreach ($users as $user) {
            $options[] = [
                'id' => $user['id'],
                'value' => $user['email'],
                'label' => $user['name'] . ' (' . $user['email'] . ')',
                'name' => $user['name'],
                'email' => $user['email']
            ];
        }
        
        echo json_encode([
            'success' => true,
            'data' => $options,
            'count' => count($options),
            'roles' => ['technician', 'engineer'],
            'description' => 'Users available for ticket assignment'
        ]);
        
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Failed to fetch assignment options: ' . $e->getMessage()
        ]);
    }
}

// =============================================
// GET WATCHER OPTIONS
// Get users with manager, administration and super admin roles for watchers
// =============================================
function getWatcherOptions($db) {
    try {
        $sql = "SELECT DISTINCT u.id, u.name, u.email 
                FROM users u 
                INNER JOIN model_has_roles mhr ON u.id = mhr.model_id 
                INNER JOIN roles r ON mhr.role_id = r.id 
                WHERE r.name IN ('manager', 'administration', 'super-administrator') 
                AND u.deleted_at IS NULL 
                AND mhr.model_type = 'App\\\\Models\\\\User'
                ORDER BY u.name ASC";
        
        $stmt = $db->prepare($sql);
        $stmt->execute();
        $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Format for dropdown usage
        $options = [];
        foreach ($users as $user) {
            $options[] = [
                'id' => $user['id'],
                'value' => $user['email'],
                'label' => $user['name'] . ' (' . $user['email'] . ')',
                'name' => $user['name'],
                'email' => $user['email']
            ];
        }
        
        echo json_encode([
            'success' => true,
            'data' => $options,
            'count' => count($options),
            'roles' => ['manager', 'administration', 'super-administrator'],
            'description' => 'Users available as ticket watchers'
        ]);
        
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Failed to fetch watcher options: ' . $e->getMessage()
        ]);
    }
}
?>