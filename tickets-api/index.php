<?php
/**
 * API Router
 * Routes all API requests to appropriate handlers
 */

// Set error reporting (disable in production)
error_reporting(E_ALL);
ini_set('display_errors', 0);

// Set CORS headers FIRST (before any routing)
$config = require __DIR__ . '/config.php';
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

// Handle CORS
if (!empty($origin) && in_array($origin, $config['allowed_origins'])) {
    header("Access-Control-Allow-Origin: $origin");
} elseif (!empty($origin) && strpos($origin, 'homelinknetworkservices.co.ke') !== false) {
    // Allow Homelink billing subdomains
    header("Access-Control-Allow-Origin: $origin");
} elseif (!empty($origin) && (strpos($origin, 'localhost') !== false || strpos($origin, '127.0.0.1') !== false)) {
    // Allow localhost for development
    header("Access-Control-Allow-Origin: $origin");
}

header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Authorization, Content-Type, X-Requested-With, X-VSCU-Authorization, If-Modified-Since, If-None-Match');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Max-Age: 86400');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Get the request path
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$pathParts = explode('/', trim($path, '/'));

// Remove /api or /tickets-api (and index.php) prefix segments from path
while (!empty($pathParts) && in_array($pathParts[0], ['api', 'tickets-api', 'index.php'], true)) {
    array_shift($pathParts);
}

// Get the endpoint (first part after /api)
$endpoint = $pathParts[0] ?? '';

// If accessing index.php directly or no endpoint, show API info
if (empty($endpoint) || $endpoint === 'index.php') {
    header('Content-Type: application/json');
    
    // Check database connection
    $dbStatus = 'unknown';
    try {
        require_once __DIR__ . '/helpers.php';
        $db = loadAppConfig()['db'];
        $port = $db['port'] ?? 3306;
        $pdo = new PDO(
            "mysql:host={$db['host']};port={$port};dbname={$db['database']};charset={$db['charset']}",
            $db['username'],
            $db['password'],
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
        );
        $dbStatus = 'connected';
    } catch (PDOException $e) {
        $dbStatus = 'error';
    }
    
    echo json_encode([
        'success' => true,
        'name' => 'Homelink Tickets API',
        'version' => '1.0',
        'status' => 'online',
        'timestamp' => date('Y-m-d H:i:s'),
        'database' => $dbStatus,
        'endpoints' => [
            'auth' => '/api/auth.php - Authentication (login, users)',
            'customers' => '/api/customers.php - Customer management',
            'tickets' => '/api/tickets.php - Ticket management',
            'payments' => '/api/payments.php - Payment processing',
            'services' => '/api/services.php - Service management',
            'invoices' => '/api/invoices.php - Invoice management',
            'plans' => '/api/plans.php - Plan management',
            'sessions' => '/api/sessions.php - Session management',
            'statistics' => '/api/statistics.php - Analytics',
            'dashboard' => '/api/dashboard.php - Dashboard data',
            'sms' => '/api/sms-api.php - Bulk SMS management (AdvantaSMS)'
        ],
        'documentation' => 'Access each endpoint for detailed API info'
    ], JSON_PRETTY_PRINT);
    exit;
}

// Route to appropriate handler
switch ($endpoint) {
    case 'dashboard-stats':
        require_once __DIR__ . '/dashboard.php';
        break;

    // Authentication
    case 'auth':
    case 'auth.php':
    case 'login':
    case 'user':
    case 'users':
        require_once __DIR__ . '/auth.php';
        break;
        
    case 'finance-dashboard-stats':
        require_once __DIR__ . '/finance_dashboard.php';
        break;
        
    // SMS endpoints
    case 'sms-dashboard-stats':
    case 'send-single-sms':
    case 'send-group-sms':
    case 'send-bulk-sms':
    case 'sms-reports':
    case 'sms-balance':
        require_once __DIR__ . '/sms-api.php';
        break;

    case 'list-messages':
        require_once __DIR__ . '/sms-outbox.php';
        break;

    case 'bulk-sms':
    case 'bulk-sms.php':
        require_once __DIR__ . '/bulk-sms.php';
        break;
        
    case 'add-customers':
    case 'list-customers':
    case 'view-customer':
    case 'customers':
    case 'cust-dashboard-stats':
    case 'search-customer-by-phone':
    case 'test-customer-phones':
    case 'update-customer':
    case 'update-customer-location':
    case 'upsert-customer-location':
    case 'get-customer-location':
    case 'fix-ticket-customer':
    case 'get-customer-locations':
        require_once __DIR__ . '/customers.php';
        break;
        
    case 'list-invoices':
    case 'view-invoices':
    case 'list-customer-invoices':
    case 'invoices':
        require_once __DIR__ . '/invoices.php';
        break;
        
    case 'list-online-sessions':
    case 'list-daily-sessions':
    case 'list-total-sessions':
        require_once __DIR__ . '/sessions.php';
        break;
        
    case 'service-statistics':
    case 'customer-statistics':
    case 'router-statistics':
    case 'network-statistics':
        require_once __DIR__ . '/statistics.php';
        break;
        
    case 'list-payments':
    case 'payments':
        require_once __DIR__ . '/payments.php';
        break;
        
    case 'add-service':
    case 'add-services':
    case 'list-services':
    case 'view-service':
    case 'view-services':
    case 'update-service':
    case 'update-services':
    case 'activate-service':
    case 'suspend-service':
    case 'delete-service':
    case 'services':
        require_once __DIR__ . '/services.php';
        break;
        
    case 'get-plans':
    case 'get-router-plans':
    case 'view-plans':
        require_once __DIR__ . '/plans.php';
        break;
        
    case 'user-profile':
        // Mock user profile endpoint
        require_once __DIR__ . '/helpers.php';
        setCorsHeaders();
        $user = checkAuth();
        jsonResponse(['user' => $user]);
        break;
        
    case 'debug-online-customers':
        require_once __DIR__ . '/debug-online-customers.php';
        break;
        
    case 'verify-accounting':
        require_once __DIR__ . '/verify-accounting.php';
        break;
        
    case 'forgot-password':
        require_once __DIR__ . '/forgot-password.php';
        break;
        
    case 'reset-password':
        require_once __DIR__ . '/reset-password.php';
        break;

    case 'change-password':
        // Sub-routes: phone-status, register-phone, verify-phone, request-otp, verify-change
        require_once __DIR__ . '/change-password.php';
        break;

    case 'ticket-snapshots':
        // Sub-routes: today, date/{date}, range?from=&to=, sync
        require_once __DIR__ . '/ticket-snapshots.php';
        break;
        
    // Inventory endpoints
    case 'inventory':
        require_once __DIR__ . '/inventory.php';
        break;

    // In-app notifications
    case 'notifications':
        require_once __DIR__ . '/notifications.php';
        break;

    // Technician AI assistant (OpenAI — key in config.local.php only)
    case 'assistant':
        require_once __DIR__ . '/assistant.php';
        break;

    // Expired Accounts Tracking
    case 'expired-accounts':
        require_once __DIR__ . '/expired-accounts.php';
        break;

    // Live Splynx Services (proxy to VPS)
    case 'splynx-services':
        require_once __DIR__ . '/splynx-services.php';
        break;

    // Daily Schedule - Team coordination (router in daily-schedule.php)
    case 'daily-schedule':
        require_once __DIR__ . '/daily-schedule.php';
        break;

    // Daily Team Roster - manager bulletin for WhatsApp
    case 'daily-roster':
        require_once __DIR__ . '/daily-roster.php';
        break;

    // Fleet vehicle daily logbook
    case 'fleet':
        require_once __DIR__ . '/fleet.php';
        break;

    // KRA eTIMS VSCU proxy (item catalog + invoice reads)
    case 'kra-etims':
        require_once __DIR__ . '/kra-etims.php';
        break;

    // Automatic KRA invoicing from Splynx payments
    case 'kra-auto':
        require_once __DIR__ . '/kra-auto.php';
        break;
        
    default:
        // Check if it's a dynamic route (like /api/view-customer/123)
        if (in_array('view-customer', $pathParts) || in_array('cust-dashboard-stats', $pathParts) || 
            in_array('search-customer-by-phone', $pathParts) || in_array('test-customer-phones', $pathParts) ||
            in_array('update-customer', $pathParts) || in_array('get-customer-location', $pathParts) ||
            in_array('update-customer-location', $pathParts) || in_array('upsert-customer-location', $pathParts) ||
            in_array('view-invoices', $pathParts) || in_array('list-customer-invoices', $pathParts) ||
            in_array('view-service', $pathParts) || in_array('view-services', $pathParts) || in_array('update-service', $pathParts) ||
            in_array('activate-service', $pathParts) || in_array('suspend-service', $pathParts) ||
            in_array('delete-service', $pathParts) || in_array('view-plans', $pathParts) ||
            in_array('get-router-plans', $pathParts) || in_array('list-online-sessions', $pathParts) ||
            in_array('list-daily-sessions', $pathParts) || in_array('list-total-sessions', $pathParts) ||
            in_array('inventory', $pathParts) ||
            in_array('notifications', $pathParts) ||
            in_array('daily-roster', $pathParts) ||
            in_array('daily-schedule', $pathParts) ||
            in_array('fleet', $pathParts)) {
            
            // Try customers first
            if (in_array('view-customer', $pathParts) || in_array('cust-dashboard-stats', $pathParts) || 
                in_array('search-customer-by-phone', $pathParts) || in_array('test-customer-phones', $pathParts) ||
                in_array('update-customer', $pathParts) || in_array('get-customer-location', $pathParts) ||
                in_array('update-customer-location', $pathParts) || in_array('upsert-customer-location', $pathParts) ||
                (in_array('customers', $pathParts) && count($pathParts) > 1)) {
                require_once __DIR__ . '/customers.php';
                break;
            }
            
            // Try plans
            if (in_array('view-plans', $pathParts) || in_array('get-router-plans', $pathParts)) {
                require_once __DIR__ . '/plans.php';
                break;
            }
            
            // Try services
            if (in_array('view-service', $pathParts) || in_array('view-services', $pathParts) || in_array('update-service', $pathParts) || in_array('update-services', $pathParts) ||
                in_array('activate-service', $pathParts) || in_array('suspend-service', $pathParts) ||
                in_array('delete-service', $pathParts) || in_array('list-services', $pathParts) ||
                (in_array('services', $pathParts) && count($pathParts) > 1)) {
                require_once __DIR__ . '/services.php';
                break;
            }
            
            // Try statistics
            if (in_array('service-statistics', $pathParts) || in_array('customer-statistics', $pathParts) ||
                in_array('router-statistics', $pathParts) || in_array('network-statistics', $pathParts)) {
                require_once __DIR__ . '/statistics.php';
                break;
            }
            
            // Try sessions
            if (in_array('list-online-sessions', $pathParts) || in_array('list-daily-sessions', $pathParts) ||
                in_array('list-total-sessions', $pathParts)) {
                require_once __DIR__ . '/sessions.php';
                break;
            }
            
            // Try invoices
            if (in_array('view-invoices', $pathParts) || in_array('list-customer-invoices', $pathParts) ||
                (in_array('invoices', $pathParts) && count($pathParts) > 1)) {
                require_once __DIR__ . '/invoices.php';
                break;
            }
            
            // Try inventory
            if (in_array('inventory', $pathParts)) {
                require_once __DIR__ . '/inventory.php';
                break;
            }

            // Try notifications
            if (in_array('notifications', $pathParts)) {
                require_once __DIR__ . '/notifications.php';
                break;
            }

            if (in_array('daily-roster', $pathParts)) {
                require_once __DIR__ . '/daily-roster.php';
                break;
            }

            if (in_array('daily-schedule', $pathParts)) {
                require_once __DIR__ . '/daily-schedule.php';
                break;
            }

            if (in_array('fleet', $pathParts)) {
                require_once __DIR__ . '/fleet.php';
                break;
            }
            
            // Try expired accounts
            if (in_array('expired-accounts', $pathParts)) {
                require_once __DIR__ . '/expired-accounts.php';
                break;
            }

            // Try splynx services
            if (in_array('splynx-services', $pathParts)) {
                require_once __DIR__ . '/splynx-services.php';
                break;
            }

            // SMS outbox (Splynx message_details)
            if (in_array('view-messages', $pathParts) || in_array('resend-sms', $pathParts)
                || ($pathParts[0] === 'messages' && count($pathParts) > 1)) {
                require_once __DIR__ . '/sms-outbox.php';
                break;
            }
        }
        
        // 404 - Not found
        http_response_code(404);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Endpoint not found']);
        break;
}

