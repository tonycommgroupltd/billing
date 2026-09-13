<?php
/**
 * Customer Groups API for SMS functionality
 * Provides customer groups for group SMS sending
 */

require_once __DIR__ . '/helpers.php';

setCorsHeaders();

header('Content-Type: application/json');

// Check authentication - support both session and token-based auth
session_start();

$user_id = null;
$user = null;

// First, try session-based authentication
if (isset($_SESSION['user_id'])) {
    $user_id = $_SESSION['user_id'];
    $user = $_SESSION['user'] ?? null;
} else {
    // Try token-based authentication
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $auth_header = '';
    
    // Get authorization header (case insensitive)
    foreach ($headers as $key => $value) {
        if (strtolower($key) === 'authorization') {
            $auth_header = $value;
            break;
        }
    }
    
    if ($auth_header && strpos($auth_header, 'Bearer ') === 0) {
        $token = substr($auth_header, 7); // Remove 'Bearer ' prefix
        
        // For testing, allow any non-empty token and use mock user
        if (!empty($token)) {
            $user_id = 1; // Mock user ID
            $user = [
                'id' => 1,
                'name' => 'Test User',
                'email' => 'test@test.com'
            ];
            
            // Set session for compatibility
            $_SESSION['user_id'] = $user_id;
            $_SESSION['user'] = $user;
        }
    }
}

if (!$user_id) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized - Please login']);
    exit();
}

$method = $_SERVER['REQUEST_METHOD'];

// Database connection
$conn = getDBConnection();

try {
    if ($method === 'GET') {
        // For now, return some sample customer groups
        // In a real implementation, these would come from the database
        $groups = [
            [
                'id' => 1,
                'name' => 'Active Customers',
                'description' => 'All active internet customers',
                'customer_count' => 150
            ],
            [
                'id' => 2,
                'name' => 'New Customers',
                'description' => 'Customers who joined in the last 30 days',
                'customer_count' => 25
            ],
            [
                'id' => 3,
                'name' => 'Payment Due',
                'description' => 'Customers with pending payments',
                'customer_count' => 45
            ],
            [
                'id' => 4,
                'name' => 'Premium Customers',
                'description' => 'Customers on premium plans',
                'customer_count' => 30
            ]
        ];
        
        echo json_encode([
            'success' => true,
            'data' => $groups
        ]);
    } else {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
    }
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}

$conn->close();
?>