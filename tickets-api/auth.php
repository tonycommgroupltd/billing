<?php
/**
 * Authentication API
 * - POST /api/auth.php?action=login
 * - GET  /api/auth.php?action=user
 * - GET  /api/auth.php?action=users (admin)
 */

// ── CORS must be the VERY FIRST thing, before any other output ──
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigins = [
    'https://tickets.tonycommgroupltd.com',
    'https://test.tonycommgroupltd.com',
    'http://localhost:3001',
    'http://localhost:3000',
];

$isAllowed = in_array($origin, $allowedOrigins)
    || strpos($origin, 'localhost') !== false
    || strpos($origin, '127.0.0.1') !== false
    || strpos($origin, 'tonycommgroupltd.com') !== false
    || preg_match('/^https?:\/\/(192\.168\.|10\.)/', $origin);

if ($isAllowed && !empty($origin)) {
    header("Access-Control-Allow-Origin: $origin");
    header('Access-Control-Allow-Credentials: true');
}
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Authorization, Content-Type, X-Requested-With');
header('Access-Control-Max-Age: 86400');

// Handle preflight immediately — nothing else is needed
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header('Content-Type: application/json');

require_once __DIR__ . '/helpers.php';

/**
 * Log user activity
 */
function logActivity($activityType, $description, $targetType = null, $targetId = null, $user = null) {
    try {
        $db = getDB();
        
        // Auto-create table if needed
        $stmt = $db->query("SHOW TABLES LIKE 'activity_logs'");
        if ($stmt->rowCount() === 0) {
            return; // Skip logging if table doesn't exist
        }
        
        $stmt = $db->prepare("
            INSERT INTO activity_logs (user_id, user_name, user_email, activity_type, activity_description, target_type, target_id, ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        
        $stmt->execute([
            $user['id'] ?? null,
            $user['name'] ?? $user['display_name'] ?? null,
            $user['email'] ?? null,
            $activityType,
            $description,
            $targetType,
            $targetId,
            $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? null,
            $_SERVER['HTTP_USER_AGENT'] ?? null
        ]);
    } catch (Exception $e) {
        // Don't break the main flow if logging fails
        error_log("Activity logging failed: " . $e->getMessage());
    }
}

// If this file is included by another endpoint, don't execute routing logic.
// (auth.php is an endpoint; includes should not produce output.)
$__script = isset($_SERVER['SCRIPT_FILENAME']) ? realpath($_SERVER['SCRIPT_FILENAME']) : '';
$__self = realpath(__FILE__);
if ($__script && $__self && $__script !== $__self) {
    return;
}

// CORS is already handled at the top of this file — no duplicate headers needed.
// Preflight is also handled above (line 33-36).

if (!function_exists('generateToken')) {
    function generateToken($userId, $expiryDays = 7)
    {
        $payload = [
            'user_id' => (int)$userId,
            'iat' => time(),
            'exp' => time() + ($expiryDays * 24 * 3600),
        ];

        return base64_encode(json_encode($payload));
    }
}

if (!function_exists('getRequestData')) {
    function getRequestData()
    {
        $contentType = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]));
        $rawBody = file_get_contents('php://input');

        if ($contentType === 'application/json') {
            $decoded = json_decode($rawBody, true);
            return is_array($decoded) ? $decoded : [];
        }

        if ($contentType === 'application/x-www-form-urlencoded' || $contentType === 'multipart/form-data') {
            return $_POST;
        }

        if (!empty($_POST)) {
            return $_POST;
        }

        $decoded = json_decode($rawBody, true);
        return is_array($decoded) ? $decoded : [];
    }
}

$method = $_SERVER['REQUEST_METHOD'];

// Accept action from query or path
$action = $_GET['action'] ?? '';
if ($action === '') {
    $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    $parts = array_values(array_filter(explode('/', (string)$path)));
    $last = end($parts);
    if ($last && $last !== 'auth.php' && $last !== 'api') {
        $action = $last;
    } elseif ($last === 'auth.php') {
        $action = 'info';
    }
}
if ($action === '') {
    $action = 'info';
}

$logError = function ($e) {
    try {
        $logPath = __DIR__ . '/error.log';
        $message = sprintf(
            "[%s] auth.php: %s in %s on line %d\nTrace:\n%s\n\n",
            date('c'),
            $e->getMessage(),
            $e->getFile(),
            $e->getLine(),
            $e->getTraceAsString()
        );
        file_put_contents($logPath, $message, FILE_APPEND | LOCK_EX);
    } catch (Exception $ignored) {
    }
};

try {
    switch ($action) {
        case 'info':
            $cfg = require __DIR__ . '/config.php';
            echo json_encode([
                'success' => true,
                'name' => 'Authentication API',
                'version' => '1.0',
                'endpoints' => [
                    'POST /api/auth.php?action=login' => 'User login with email/username and password',
                    'GET /api/auth.php?action=exchange-laravel' => 'Exchange APP.TCOM Laravel JWT for tickets token',
                    'GET /api/auth.php?action=user' => 'Get current authenticated user (Bearer token)',
                    'GET /api/auth.php?action=users' => 'List all users (admin only)',
                ],
                'authentication' => 'Bearer token required for protected endpoints',
                'database' => 'Connected to ' . ($cfg['db']['database'] ?? 'unknown'),
            ]);
            break;

        case 'login':
            if ($method !== 'POST') {
                http_response_code(405);
                echo json_encode(['error' => 'Method not allowed']);
                exit;
            }

            $data = getRequestData();
            $username = isset($data['username']) ? trim((string)$data['username']) : '';
            if ($username === '' && isset($data['email'])) {
                $username = trim((string)$data['email']);
            }
            $password = isset($data['password']) ? (string)$data['password'] : '';

            if ($username === '' || $password === '') {
                http_response_code(400);
                echo json_encode(['error' => 'Username/Email and password required']);
                exit;
            }

            $db = getDB();
            $stmt = $db->prepare('SELECT id, name, email, password FROM users WHERE (name = ? OR email = ?) AND deleted_at IS NULL LIMIT 1');
            $stmt->execute([$username, $username]);
            $user = $stmt->fetch();

            if (!$user || !password_verify($password, $user['password'])) {
                http_response_code(401);
                echo json_encode(['error' => 'Invalid username or password']);
                exit;
            }

            // Update last login (best-effort)
            try {
                $stmt = $db->prepare('UPDATE users SET last_login = NOW() WHERE id = ?');
                $stmt->execute([$user['id']]);
            } catch (Exception $ignored) {
            }

            $fullUser = getUserWithRoles($user['id']);
            $token = generateToken($user['id']);

            // Log login activity
            logActivity('login', "User logged into the system", 'user', $user['id'], $user);

            echo json_encode([
                'success' => true,
                'token' => $token,
                'user' => $fullUser,
            ]);
            break;

        case 'exchange-laravel':
            if ($method !== 'GET' && $method !== 'POST') {
                http_response_code(405);
                echo json_encode(['error' => 'Method not allowed']);
                exit;
            }

            $laravelToken = getAuthToken();
            if (!$laravelToken) {
                http_response_code(401);
                echo json_encode(['success' => false, 'error' => 'Laravel Bearer token required']);
                exit;
            }

            if (!verifyLaravelJwt($laravelToken)) {
                http_response_code(401);
                echo json_encode(['success' => false, 'error' => 'Invalid or expired Laravel token']);
                exit;
            }

            $profile = fetchIspUserProfile($laravelToken);
            if (!$profile || empty($profile['id'])) {
                http_response_code(401);
                echo json_encode(['success' => false, 'error' => 'Could not load ISP user profile']);
                exit;
            }

            $ticketsUserId = resolveTicketsUserIdFromIspProfile($profile);
            if (!$ticketsUserId) {
                http_response_code(503);
                echo json_encode(['success' => false, 'error' => 'Could not map ISP user to tickets database']);
                exit;
            }

            $fullUser = getUserWithRoles($ticketsUserId);
            $token = generateToken($ticketsUserId);

            echo json_encode([
                'success' => true,
                'token' => $token,
                'tickets_token' => $token,
                'user' => $fullUser,
                'source' => 'exchange-laravel',
            ]);
            break;

        case 'user':
            if ($method !== 'GET') {
                http_response_code(405);
                echo json_encode(['error' => 'Method not allowed']);
                exit;
            }

            $token = getAuthToken();
            if (!$token) {
                http_response_code(401);
                echo json_encode(['error' => 'Unauthorized']);
                exit;
            }

            $decoded = verifyToken($token);
            if (!$decoded) {
                http_response_code(401);
                echo json_encode(['error' => 'Invalid or expired token']);
                exit;
            }

            $user = getUserWithRoles($decoded['user_id']);
            if (!$user) {
                http_response_code(404);
                echo json_encode(['error' => 'User not found']);
                exit;
            }

            echo json_encode(['success' => true, 'user' => $user]);
            break;

        case 'users':
            if ($method !== 'GET') {
                http_response_code(405);
                echo json_encode(['error' => 'Method not allowed']);
                exit;
            }

            $token = getAuthToken();
            if (!$token) {
                http_response_code(401);
                echo json_encode(['error' => 'Unauthorized']);
                exit;
            }

            $decoded = verifyToken($token);
            if (!$decoded) {
                http_response_code(401);
                echo json_encode(['error' => 'Invalid or expired token']);
                exit;
            }

            $currentUser = getUserWithRoles($decoded['user_id']);
            $roles = isset($currentUser['all_roles']) && is_array($currentUser['all_roles']) ? $currentUser['all_roles'] : [];
            $isAdmin = in_array('administrator', $roles, true) || in_array('super-administrator', $roles, true) || in_array('manager', $roles, true);

            if (!$isAdmin) {
                http_response_code(403);
                echo json_encode(['error' => 'Forbidden: Admin access required']);
                exit;
            }

            $db = getDB();
            $stmt = $db->prepare('SELECT id, name, email, phone, created_at FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC');
            $stmt->execute();
            $users = $stmt->fetchAll();

            // Attach roles
            foreach ($users as &$u) {
                $u['all_roles'] = [];
                $stmt2 = $db->prepare('SELECT r.name FROM roles r JOIN model_has_roles mr ON r.id = mr.role_id WHERE mr.model_id = ? AND mr.model_type = "App\\Models\\User"');
                $stmt2->execute([$u['id']]);
                $rws = $stmt2->fetchAll();
                $u['all_roles'] = array_map(function ($r) { return $r['name']; }, $rws);
            }

            echo json_encode(['success' => true, 'users' => $users]);
            break;

        default:
            http_response_code(400);
            echo json_encode(['error' => 'Invalid action']);
            break;
    }
} catch (Throwable $e) {
    $logError($e);
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}

