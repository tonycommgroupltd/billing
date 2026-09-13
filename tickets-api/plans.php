<?php
/**
 * Plans Endpoints
 * GET /api/get-plans - List all plans (for service creation)
 * GET /api/get-router-plans/{id} - List plans for a specific router
 * GET /api/view-plans/{id} - View plan details
 */

require_once __DIR__ . '/helpers.php';

setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$pathParts = explode('/', trim($path, '/'));

// If accessing directly, show API info
$lastPart = end($pathParts);
if ($lastPart === 'plans.php' || ($lastPart === 'api' && $method === 'GET')) {
    if ($method === 'GET') {
        jsonResponse([
            'success' => true,
            'name' => 'Plans API',
            'version' => '1.0',
            'endpoints' => [
                'GET /api/get-plans' => 'List all plans with pagination and search',
                'GET /api/get-router-plans/{id}' => 'Get plans for specific router',
                'GET /api/view-plans/{id}' => 'Get plan details by ID',
            ],
            'authentication' => 'Required - Bearer token',
            'query_parameters' => [
                'q' => 'Search by plan title',
                'page' => 'Page number (default: 1)',
                'per_page' => 'Results per page (default: 10)',
            ]
        ]);
    }
}

$user = checkAuth();
$pdo = getDB();

try {
    // GET /api/get-plans
    if ($method === 'GET' && end($pathParts) === 'get-plans') {
        $page = isset($_GET['page']) ? max(1, intval($_GET['page'])) : 1;
        $perPage = isset($_GET['per_page']) ? max(1, min(100, intval($_GET['per_page']))) : 10;
        $offset = ($page - 1) * $perPage;
        $search = isset($_GET['q']) ? trim($_GET['q']) : '';
        
        // Build WHERE clause with named parameters
        $where = ["(p.deleted_at IS NULL OR p.deleted_at = '0000-00-00 00:00:00')"];
        $params = [];
        
        // Search query
        if (!empty($search)) {
            $where[] = "p.title LIKE :search";
            $params[':search'] = '%' . $search . '%';
        }
        
        $whereClause = implode(' AND ', $where);
        $limitValue = intval($perPage);
        $offsetValue = intval($offset);
        
        try {
            // Count total
            $countSql = "SELECT COUNT(*) as total FROM plans p WHERE $whereClause";
            $countStmt = $pdo->prepare($countSql);
            foreach ($params as $key => $value) {
                $countStmt->bindValue($key, $value);
            }
            $countStmt->execute();
            $total = $countStmt->fetch()['total'];
        } catch (PDOException $e) {
            error_log("Count query error: " . $e->getMessage() . " | SQL: $countSql");
            throw $e;
        }
        
        try {
            // Get plans
            $sql = "
                SELECT 
                    p.*,
                    r.title as router_title,
                    r.host as router_host
                FROM plans p
                LEFT JOIN routers r ON p.router_id = r.id
                WHERE $whereClause
                ORDER BY p.title ASC
                LIMIT :limit_val OFFSET :offset_val
            ";
            
            $stmt = $pdo->prepare($sql);
            
            // Bind all parameters
            foreach ($params as $key => $value) {
                $stmt->bindValue($key, $value);
            }
            $stmt->bindValue(':limit_val', $limitValue, PDO::PARAM_INT);
            $stmt->bindValue(':offset_val', $offsetValue, PDO::PARAM_INT);
            
            $stmt->execute();
            $plans = $stmt->fetchAll();
        } catch (PDOException $e) {
            error_log("Select query error: " . $e->getMessage() . " | SQL: $sql");
            throw $e;
        }
        
        // Format plans to match frontend expectation (PlanCollection format)
        $formattedPlans = [];
        foreach ($plans as $plan) {
            // Parse rate_limit JSON if exists
            $rateLimit = null;
            if (!empty($plan['rate_limit'])) {
                $rateLimit = json_decode($plan['rate_limit'], true);
            }
            
            // Format for frontend select component
            // Frontend expects: {value: id, label: title, ...other fields}
            $formattedPlans[] = [
                'id' => intval($plan['id']),
                'value' => intval($plan['id']), // For select component
                'label' => $plan['title'], // For select component
                'title' => $plan['title'],
                'price' => floatval($plan['price']),
                'router_id' => $plan['router_id'] ? intval($plan['router_id']) : null,
                'router_title' => $plan['router_title'] ?? null,
                'router_host' => $plan['router_host'] ?? null,
                'rate_limit' => $rateLimit,
                'created_at' => $plan['created_at'],
                'updated_at' => $plan['updated_at']
            ];
        }
        
        // Check if there are more pages
        $hasMore = ($page * $perPage) < $total;
        
        jsonResponse([
            'options' => $formattedPlans,
            'has_more' => $hasMore
        ], 200);
    }
    
    // GET /api/get-router-plans/{id}
    if ($method === 'GET' && in_array('get-router-plans', $pathParts)) {
        $routerId = end($pathParts);
        
        if (!is_numeric($routerId)) {
            jsonResponse(['error' => 'Invalid router ID'], 400);
        }
        
        $page = isset($_GET['page']) ? max(1, intval($_GET['page'])) : 1;
        $perPage = isset($_GET['per_page']) ? max(1, min(100, intval($_GET['per_page']))) : 10;
        $offset = ($page - 1) * $perPage;
        $search = isset($_GET['q']) ? trim($_GET['q']) : '';
        
        // Build query
        $where = ["p.router_id = ?", "p.deleted_at IS NULL"];
        $params = [$routerId];
        
        // Search query
        if (!empty($search)) {
            $where[] = "p.title LIKE ?";
            $params[] = '%' . $search . '%';
        }
        
        $whereClause = implode(' AND ', $where);
        
        // Count total
        $countStmt = $pdo->prepare("SELECT COUNT(*) as total FROM plans p WHERE $whereClause");
        $countStmt->execute($params);
        $total = $countStmt->fetch()['total'];
        
        // Get plans
        $stmt = $pdo->prepare("
            SELECT 
                p.*,
                r.title as router_title,
                r.host as router_host
            FROM plans p
            LEFT JOIN routers r ON p.router_id = r.id
            WHERE $whereClause
            ORDER BY p.title ASC
            LIMIT ? OFFSET ?
        ");
        
        // Combine params for LIMIT and OFFSET
        $allParams = array_merge($params, [$perPage, $offset]);
        $stmt->execute($allParams);
        $plans = $stmt->fetchAll();
        
        // Format plans
        $formattedPlans = [];
        foreach ($plans as $plan) {
            $rateLimit = null;
            if (!empty($plan['rate_limit'])) {
                $rateLimit = json_decode($plan['rate_limit'], true);
            }
            
            $formattedPlans[] = [
                'id' => intval($plan['id']),
                'value' => intval($plan['id']),
                'label' => $plan['title'],
                'title' => $plan['title'],
                'price' => floatval($plan['price']),
                'router_id' => intval($plan['router_id']),
                'router_title' => $plan['router_title'] ?? null,
                'router_host' => $plan['router_host'] ?? null,
                'rate_limit' => $rateLimit,
                'created_at' => $plan['created_at'],
                'updated_at' => $plan['updated_at']
            ];
        }
        
        $hasMore = ($page * $perPage) < $total;
        
        jsonResponse([
            'options' => $formattedPlans,
            'has_more' => $hasMore
        ], 200);
    }
    
    // GET /api/view-plans/{id}
    if ($method === 'GET' && in_array('view-plans', $pathParts)) {
        $planId = end($pathParts);
        
        if (!is_numeric($planId)) {
            jsonResponse(['error' => 'Invalid plan ID'], 400);
        }
        
        $stmt = $pdo->prepare("
            SELECT 
                p.*,
                r.title as router_title,
                r.host as router_host,
                r.nas_ip as router_nas_ip
            FROM plans p
            LEFT JOIN routers r ON p.router_id = r.id
            WHERE p.id = ? AND p.deleted_at IS NULL
        ");
        $stmt->execute([$planId]);
        $plan = $stmt->fetch();
        
        if (!$plan) {
            jsonResponse(['error' => 'Plan not found'], 404);
        }
        
        // Parse rate_limit JSON
        if (!empty($plan['rate_limit'])) {
            $plan['rate_limit'] = json_decode($plan['rate_limit'], true);
        }
        
        jsonResponse(['plan' => $plan], 200);
    }
    
    jsonResponse(['error' => 'Endpoint not found'], 404);
    
} catch (Exception $e) {
    error_log("Plans API Error: " . $e->getMessage() . "\n" . $e->getTraceAsString());
    
    // Try to get more detailed error info
    if ($pdo && method_exists($pdo, 'errorInfo')) {
        $errorInfo = $pdo->errorInfo();
        error_log("PDO Error Info: " . print_r($errorInfo, true));
    }
    
    jsonResponse([
        'error' => $e->getMessage(),
        'message' => 'An error occurred while fetching plans'
    ], 500);
}

