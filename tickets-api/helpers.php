<?php
/**
 * Common Helper Functions for API
 */

require_once __DIR__ . '/config.php';

/**
 * Load config with optional local overrides (api/config.local.php, gitignored).
 */
function loadAppConfig() {
    static $config = null;
    if ($config !== null) {
        return $config;
    }
    $config = require __DIR__ . '/config.php';
    $localPath = __DIR__ . '/config.local.php';
    if (is_file($localPath)) {
        $local = require $localPath;
        if (is_array($local)) {
            $config = array_replace_recursive($config, $local);
        }
    }
    return $config;
}

/**
 * Get database connection
 */
function getDB() {
    static $pdo = null;
    
    if ($pdo === null) {
        $config = loadAppConfig();
        $db = $config['db'];
        
        try {
            $port = $db['port'] ?? 3306;
            $dsn = "mysql:host={$db['host']};port={$port};dbname={$db['database']};charset={$db['charset']}";
            $pdo = new PDO($dsn, $db['username'], $db['password'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false
            ]);
            
            // Set MySQL timezone to Africa/Nairobi for correct NOW() timestamps
            $pdo->exec("SET time_zone = '+03:00'");
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Database connection failed']);
            exit;
        }
    }
    
    return $pdo;
}

/**
 * Set CORS headers - Enhanced for production subdomain
 */
function setCorsHeaders() {
    $config = loadAppConfig();
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    
    // If no origin in header, try to extract from referer
    if (empty($origin) && !empty($_SERVER['HTTP_REFERER'])) {
        $parsed = parse_url($_SERVER['HTTP_REFERER']);
        $origin = ($parsed['scheme'] ?? 'https') . '://' . ($parsed['host'] ?? '');
    }
    
    // Allow if origin is in whitelist
    $allowedOrigins = $config['allowed_origins'] ?? [];
    $isAllowed = false;
    
    if (!empty($origin)) {
        // Check exact match
        if (in_array($origin, $allowedOrigins)) {
            $isAllowed = true;
        }
        // Check localhost for development
        else if (strpos($origin, 'localhost') !== false || strpos($origin, '127.0.0.1') !== false) {
            $isAllowed = true;
        }
        // Check local network IPs for mobile testing (192.168.x.x, 10.x.x.x)
        else if (preg_match('/^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/', $origin)) {
            $isAllowed = true;
        }
        // Check Homelink billing domains
        else if (strpos($origin, 'homelinknetworkservices.co.ke') !== false) {
            $isAllowed = true;
        }
    }
    
    if ($isAllowed && !empty($origin)) {
        header("Access-Control-Allow-Origin: $origin");
        header('Access-Control-Allow-Credentials: true');
    } else {
        // Fallback for debugging (remove in strict production)
        if (!empty($origin)) {
            error_log("CORS: Origin not allowed: $origin");
        }
    }
    
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Authorization, Content-Type, X-Requested-With, X-VSCU-Authorization, If-Modified-Since, If-None-Match');
    header('Access-Control-Max-Age: 86400');
    
    // Prevent caching of API responses
    header('Cache-Control: no-cache, no-store, must-revalidate');
    header('Pragma: no-cache');
    header('Expires: 0');
    
    // Handle preflight OPTIONS request
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(200);
        exit;
    }
}

/**
 * Get all HTTP headers (compatible with all servers)
 */
function getAllHeadersCompat() {
    if (function_exists('getallheaders')) {
        return getallheaders();
    }
    
    // Fallback for servers that don't have getallheaders()
    $headers = [];
    foreach ($_SERVER as $key => $value) {
        if (strpos($key, 'HTTP_') === 0) {
            $header = str_replace('_', '-', substr($key, 5));
            $headers[$header] = $value;
            // Also add lowercase version
            $headers[strtolower($header)] = $value;
        }
    }
    return $headers;
}

/**
 * Check if user is authenticated
 */
function checkAuth() {
    $headers = getAllHeadersCompat();
    $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    
    // Remove 'Bearer ' prefix if present
    $token = preg_replace('/^Bearer\s+/', '', $authHeader);
    
    // For now, allow access without token for testing
    // In production, uncomment the strict check below
    
    /*
    if (empty($token)) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }
    
    // Verify token
    $decoded = verifyToken($token);
    if (!$decoded) {
        http_response_code(401);
        echo json_encode(['error' => 'Invalid or expired token']);
        exit;
    }
    
    // Get user from database
    $db = getDB();
    $stmt = $db->prepare('SELECT id, name, email FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([$decoded['user_id']]);
    $user = $stmt->fetch();
    
    if (!$user) {
        http_response_code(401);
        echo json_encode(['error' => 'User not found']);
        exit;
    }
    
    return $user;
    */
    
    // Mock user for testing
    return [
        'id' => 1,
        'name' => 'Test User',
        'email' => 'test@test.com'
    ];
}

/**
 * Get authorization token from headers
 */
function getAuthToken() {
    // Try getallheaders() first if available
    if (function_exists('getallheaders')) {
        $headers = getallheaders();
        if (isset($headers['Authorization'])) {
            $parts = explode(' ', $headers['Authorization']);
            if (count($parts) === 2 && $parts[0] === 'Bearer') {
                return $parts[1];
            }
        }
        // Also check lowercase header (some servers)
        if (isset($headers['authorization'])) {
            $parts = explode(' ', $headers['authorization']);
            if (count($parts) === 2 && $parts[0] === 'Bearer') {
                return $parts[1];
            }
        }
    }
    
    // Fallback to $_SERVER (works on all servers)
    if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $parts = explode(' ', $_SERVER['HTTP_AUTHORIZATION']);
        if (count($parts) === 2 && $parts[0] === 'Bearer') {
            return $parts[1];
        }
    }
    
    // Also check REDIRECT_HTTP_AUTHORIZATION (for some server configs)
    if (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        $parts = explode(' ', $_SERVER['REDIRECT_HTTP_AUTHORIZATION']);
        if (count($parts) === 2 && $parts[0] === 'Bearer') {
            return $parts[1];
        }
    }
    
    return null;
}

/**
 * Verify JWT token
 */
function verifyToken($token) {
    try {
        // Simple token format: base64(json)
        $decoded = json_decode(base64_decode($token), true);
        
        if (!$decoded || !isset($decoded['user_id'], $decoded['exp'])) {
            return null;
        }
        
        // Check expiration
        if ($decoded['exp'] < time()) {
            return null;
        }
        
        return $decoded;
    } catch (Exception $e) {
        return null;
    }
}

/**
 * Get user with roles and permissions
 */
function getUserWithRoles($userId) {
    $db = getDB();
    
    // Get user
    $stmt = $db->prepare('SELECT id, name, email, phone, avatar, reset_token, password_change_at FROM users WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$userId]);
    $user = $stmt->fetch();

    if (!$user) {
        return null;
    }

    // Determine if password reset is required: if password_change_at is NULL, user must reset
    $resetRequired = empty($user['password_change_at']);

    // If reset is required but reset_token is missing, generate one (prevents /recovery/undefined)
    if ($resetRequired && empty($user['reset_token'])) {
        try {
            $newToken = bin2hex(random_bytes(16));
            $stmtTok = $db->prepare('UPDATE users SET reset_token = ? WHERE id = ?');
            $stmtTok->execute([$newToken, $user['id']]);
            $user['reset_token'] = $newToken;
        } catch (Exception $e) {
            // If token generation fails, leave it null; frontend should not build an undefined URL.
            $user['reset_token'] = $user['reset_token'] ?? null;
        }
    } else {
        $user['reset_token'] = $user['reset_token'] ?? null;
    }

    // IMPORTANT: frontend RequireResetPassword treats reset_password=true as "allowed to proceed"
    $user['reset_password'] = !$resetRequired;

    // Get roles using model_has_roles (Laravel Spatie) - Check both api and web guards
    $stmt = $db->prepare('
        SELECT r.id, r.name, r.display_name 
        FROM roles r
        JOIN model_has_roles mr ON r.id = mr.role_id
        WHERE mr.model_id = ? AND mr.model_type = "App\\\\Models\\\\User" AND r.guard_name IN ("api", "web")
    ');
    $stmt->execute([$userId]);
    $roles = $stmt->fetchAll();
    
    $user['all_roles'] = array_map(function($r) { return $r['name']; }, $roles);
    $user['roles'] = $roles;
    
    // Get permissions for all roles using role_has_permissions (Laravel Spatie)
    $roleIds = array_map(function($r) { return $r['id']; }, $roles);
    if (!empty($roleIds)) {
        $placeholders = implode(',', array_fill(0, count($roleIds), '?'));
        $stmt = $db->prepare("
            SELECT DISTINCT p.id, p.name
            FROM permissions p
            JOIN role_has_permissions rp ON p.id = rp.permission_id
            WHERE rp.role_id IN ($placeholders)
        ");
        $stmt->execute($roleIds);
        $permissions = $stmt->fetchAll();
        $user['permissions'] = array_map(function($p) { return $p['name']; }, $permissions);
    } else {
        $user['permissions'] = [];
    }
    
    return $user;
}

/**
 * Send JSON response
 */
function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    header('Content-Type: application/json');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Get query parameters
 */
function getQueryParam($key, $default = null) {
    return $_GET[$key] ?? $default;
}

/**
 * Get request body as JSON
 */
function getRequestBody() {
    $data = file_get_contents('php://input');
    return json_decode($data, true) ?? [];
}

/**
 * Format file size to human readable
 */
function humanFilesize($bytes, $dec = 2) {
    $size = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    $factor = floor((strlen($bytes) - 1) / 3);
    if ($factor == 0) $dec = 0;
    return sprintf("%.{$dec}f %s", $bytes / (1024 ** $factor), $size[$factor]);
}

/**
 * Validate and format date field for JavaScript compatibility
 * ROBUST SOLUTION: Assumes database stores dates in UTC, converts to Africa/Nairobi (UTC+3)
 * 
 * This function:
 * 1. Parses the date as UTC (standard database practice)
 * 2. Converts to Africa/Nairobi timezone (UTC+3)
 * 3. Formats with timezone offset so JavaScript knows the timezone
 */
function formatDateField($dateValue) {
    if (empty($dateValue) || 
        $dateValue === '0000-00-00 00:00:00' || 
        $dateValue === '0000-00-00' ||
        trim($dateValue) === '' ||
        strtotime($dateValue) === false) {
        return null;
    }
    
    try {
        // Create Nairobi timezone object (UTC+3)
        $nairobiTimezone = new DateTimeZone('Africa/Nairobi');
        
        // Database is now storing times in Africa/Nairobi timezone
        // Parse the date directly in Nairobi timezone (no conversion needed)
        $date = new DateTime($dateValue, $nairobiTimezone);
        
        // Format with timezone offset (e.g., 2024-01-15T14:30:00+03:00)
        // This tells JavaScript exactly what timezone the date is in
        $formatted = $date->format('Y-m-d\TH:i:sP');
        
        if ($formatted && $formatted !== '1970-01-01T00:00:00+03:00') {
            return $formatted;
        }
    } catch (Exception $e) {
        // Fallback: just return with +03:00 offset
        try {
            $timestamp = strtotime($dateValue);
            
            if ($timestamp !== false && $timestamp !== -1) {
                // Format in Nairobi timezone (already correct)
                $originalTimezone = date_default_timezone_get();
                date_default_timezone_set('Africa/Nairobi');
                $formatted = date('Y-m-d\TH:i:s', $timestamp) . '+03:00';
                date_default_timezone_set($originalTimezone);
                return $formatted;
            }
        } catch (Exception $e2) {
            // Ignore fallback errors
        }
    }
    
    return null;
}

/**
 * Validate and format date fields in an array/object
 */
function formatDateFields($data, $dateFields = ['start_date', 'end_date', 'bill_to', 'created_at', 'updated_at', 'invoice_date', 'due_date', 'payment_date', 'dob', 'verification_date']) {
    if (!is_array($data)) {
        return $data;
    }
    
    foreach ($dateFields as $field) {
        if (isset($data[$field])) {
            $data[$field] = formatDateField($data[$field]);
        }
    }
    return $data;
}

/**
 * Strip non-digits from a phone string.
 */
function normalizePhoneDigits($phone) {
    return preg_replace('/\D+/', '', (string)$phone);
}

/**
 * Last 9 subscriber digits (7XXXXXXXX) for cross-format matching.
 */
function getKenyanSubscriberDigits($phone) {
    $digits = normalizePhoneDigits($phone);
    if ($digits === '') {
        return '';
    }
    return strlen($digits) > 9 ? substr($digits, -9) : $digits;
}

/**
 * Normalize Kenyan mobile to local format: 07XXXXXXXX or 01XXXXXXXX.
 * Accepts +254..., 254..., 07..., 7...
 */
/**
 * Installation or Installation 2 (installations menu / stats; not pole-enclosure type).
 */
function isInstallationMenuType($type) {
    $typeLower = strtolower(trim((string)$type));
    return in_array($typeLower, ['installation', 'installation 2'], true);
}

/**
 * SQL fragment: ticket type is Installation or Installation 2.
 */
function sqlWhereInstallationMenuTypes($column = 'type') {
    return "LOWER({$column}) IN ('installation', 'installation 2')";
}

/**
 * Apply type filter; type=Installation includes Installation 2 for the installations menu.
 */
function applyTicketTypeFilter(array &$where, array &$params, $type) {
    if (empty($type)) {
        return;
    }
    $typeLower = strtolower(trim((string)$type));
    if ($typeLower === 'installation') {
        $where[] = sqlWhereInstallationMenuTypes('type');
        return;
    }
    $where[] = 'type = ?';
    $params[] = $type;
}

function normalizeKenyanPhone($phone) {
    if ($phone === null || trim((string)$phone) === '') {
        return '';
    }
    $digits = normalizePhoneDigits($phone);
    if ($digits === '') {
        return trim((string)$phone);
    }
    if (strpos($digits, '254') === 0 && strlen($digits) >= 12) {
        $digits = '0' . substr($digits, 3);
    } elseif (strlen($digits) === 9 && preg_match('/^[17]\d{8}$/', $digits)) {
        $digits = '0' . $digits;
    }
    if (preg_match('/^0[17]\d{8}$/', $digits)) {
        return $digits;
    }
    return trim((string)$phone);
}

/**
 * Ensure the otps table has the columns needed by the password/OTP flows.
 * The original table only has (id, identifier, token, validity, valid, created_at, updated_at).
 * We need: phone, user_id, otp, purpose, provider, status, max_attempts, expires_at.
 */
function ensureOtpTableReady($db) {
    static $checked = false;
    if ($checked) return;

    $cols = array_column(
        $db->query("SHOW COLUMNS FROM otps")->fetchAll(PDO::FETCH_ASSOC),
        'Field'
    );

    if (!in_array('phone', $cols)) {
        $db->exec("ALTER TABLE otps
            ADD COLUMN phone VARCHAR(20) DEFAULT NULL,
            ADD COLUMN user_id INT UNSIGNED DEFAULT NULL,
            ADD COLUMN otp VARCHAR(10) DEFAULT NULL,
            ADD COLUMN purpose VARCHAR(50) DEFAULT NULL,
            ADD COLUMN provider VARCHAR(50) DEFAULT NULL,
            ADD COLUMN status VARCHAR(20) DEFAULT 'sent',
            ADD COLUMN max_attempts INT DEFAULT 0,
            ADD COLUMN expires_at DATETIME DEFAULT NULL,
            MODIFY identifier VARCHAR(255) DEFAULT '',
            MODIFY token VARCHAR(255) DEFAULT '',
            MODIFY validity INT DEFAULT 0
        ");
    }

    $checked = true;
}

/**
 * Base64url decode (JWT).
 */
function base64UrlDecode($data) {
    $remainder = strlen($data) % 4;
    if ($remainder) {
        $data .= str_repeat('=', 4 - $remainder);
    }
    return base64_decode(strtr($data, '-_', '+/'));
}

/**
 * Verify Laravel JWT (tymon/jwt-auth HS256) using shared JWT_SECRET.
 */
function verifyLaravelJwt($token) {
    $config = loadAppConfig();
    $secret = trim((string)($config['isp_api']['jwt_secret'] ?? ''));
    if ($secret === '' || !$token) {
        return null;
    }

    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        return null;
    }

    [$headerB64, $payloadB64, $signatureB64] = $parts;
    $expected = rtrim(strtr(base64_encode(hash_hmac('sha256', $headerB64 . '.' . $payloadB64, $secret, true)), '+/', '-_'), '=');
    if (!hash_equals($expected, $signatureB64)) {
        return null;
    }

    $payload = json_decode(base64UrlDecode($payloadB64), true);
    if (!is_array($payload)) {
        return null;
    }

    $exp = $payload['exp'] ?? 0;
    if ($exp && (int)$exp < time()) {
        return null;
    }

    return $payload;
}

/**
 * Fetch APP.TCOM user profile using a valid Laravel JWT.
 */
function fetchIspUserProfile($laravelToken) {
    $config = loadAppConfig();
    $baseUrl = rtrim((string)($config['isp_api']['base_url'] ?? 'https://isp.tonycommgroupltd.com/api/v1'), '/');
    $url = $baseUrl . '/user-profile';

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $laravelToken,
            'Accept: application/json',
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $body = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($status !== 200 || !$body) {
        return null;
    }

    $json = json_decode($body, true);
    return is_array($json) ? $json : null;
}

/**
 * Find tickets DB user by ISP profile (email / phone / name).
 */
function findTicketsUserByIspProfile(PDO $db, array $profile) {
    $email = trim((string)($profile['email'] ?? ''));
    $phone = trim((string)($profile['phone'] ?? ''));
    $name = trim((string)($profile['name'] ?? ''));

    if ($email !== '') {
        $stmt = $db->prepare('SELECT id, name, email, phone, password FROM users WHERE deleted_at IS NULL AND email = ? LIMIT 1');
        $stmt->execute([$email]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            return $row;
        }

        // Match legacy TonyComm email rows when logging in with Homelink Laravel email.
        if (stripos($email, '@homelink.local') !== false) {
            $legacyEmail = str_ireplace('@homelink.local', '@tonycommgroupltd.com', $email);
            $stmt->execute([$legacyEmail]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row) {
                return $row;
            }
        }
    }

    if ($phone !== '') {
        $digits = preg_replace('/\D/', '', $phone);
        $tail = substr($digits, -9);
        $stmt = $db->prepare("
            SELECT id, name, email, phone, password FROM users
            WHERE deleted_at IS NULL AND (
                phone = ? OR phone = ? OR
                RIGHT(REPLACE(REPLACE(REPLACE(phone, '+', ''), ' ', ''), '-', ''), 9) = ?
            )
            LIMIT 1
        ");
        $stmt->execute([$phone, $digits, $tail]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            return $row;
        }
    }

    if ($name !== '') {
        $stmt = $db->prepare('SELECT id, name, email, phone, password FROM users WHERE deleted_at IS NULL AND name = ? LIMIT 1');
        $stmt->execute([$name]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            return $row;
        }
    }

    return null;
}

/**
 * Create tickets user from ISP profile and sync roles by name.
 */
function createTicketsUserFromIspProfile(PDO $db, array $profile) {
    $name = trim((string)($profile['name'] ?? 'ISP User'));
    $email = trim((string)($profile['email'] ?? '')) ?: null;
    $phone = trim((string)($profile['phone'] ?? '')) ?: null;
    $password = (string)($profile['password_hash'] ?? '');
    if ($password === '') {
        $password = password_hash(bin2hex(random_bytes(16)), PASSWORD_BCRYPT);
    }

    $stmt = $db->prepare('
        INSERT INTO users (name, email, phone, password, password_change_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, NOW(), NOW(), NOW())
    ');
    $stmt->execute([$name, $email, $phone, $password]);
    $userId = (int)$db->lastInsertId();

    $roles = $profile['all_roles'] ?? [];
    if (is_array($roles) && !empty($roles)) {
        $placeholders = implode(',', array_fill(0, count($roles), '?'));
        $roleStmt = $db->prepare("SELECT id FROM roles WHERE name IN ($placeholders) AND guard_name IN ('api', 'web')");
        $roleStmt->execute(array_values($roles));
        $roleIds = $roleStmt->fetchAll(PDO::FETCH_COLUMN);
        $insertRole = $db->prepare('INSERT INTO model_has_roles (role_id, model_type, model_id) VALUES (?, ?, ?)');
        foreach ($roleIds as $roleId) {
            $insertRole->execute([(int)$roleId, 'App\\Models\\User', $userId]);
        }
    }

    return $userId;
}

/**
 * Resolve tickets user id for an ISP (Laravel) profile — find or create.
 */
function resolveTicketsUserIdFromIspProfile(array $profile) {
    $db = getDB();
    $existing = findTicketsUserByIspProfile($db, $profile);
    if ($existing) {
        syncTicketsUserFromIspProfile($db, $existing, $profile);
        return (int)$existing['id'];
    }
    return createTicketsUserFromIspProfile($db, $profile);
}

/**
 * Keep tickets user profile aligned with Homelink Laravel (fixes legacy TonyComm emails).
 */
function homelinkStaffEmail($email) {
    $email = trim((string)$email);
    if ($email === '') {
        return '';
    }
    if (stripos($email, '@tonycommgroupltd.com') !== false) {
        return str_ireplace('@tonycommgroupltd.com', '@homelink.local', $email);
    }
    return $email;
}

function syncTicketsUserFromIspProfile(PDO $db, array $existing, array $profile) {
    $name = trim((string)($profile['name'] ?? $existing['name'] ?? ''));
    $email = homelinkStaffEmail(trim((string)($profile['email'] ?? $existing['email'] ?? '')));
    $phone = trim((string)($profile['phone'] ?? $existing['phone'] ?? ''));

    $stmt = $db->prepare('
        UPDATE users
        SET name = ?, email = ?, phone = ?, updated_at = NOW()
        WHERE id = ?
    ');
    $stmt->execute([
        $name !== '' ? $name : ($existing['name'] ?? 'Staff'),
        $email !== '' ? $email : null,
        $phone !== '' ? $phone : null,
        (int)$existing['id'],
    ]);
}

/**
 * Resolve acting user from tickets JWT (preferred) or request payload.
 */
function resolveTicketsActorFromRequest(array $data) {
    $userId = (int)($data['user_id'] ?? 0);
    $userName = trim((string)($data['user_name'] ?? 'Admin'));
    $userEmail = homelinkStaffEmail($data['user_email'] ?? '');

    $token = getAuthToken();
    if ($token) {
        $decoded = verifyToken($token);
        if ($decoded && !empty($decoded['user_id'])) {
            $userId = (int)$decoded['user_id'];
        }
    }

    if ($userId > 0) {
        $db = getDB();
        $userStmt = $db->prepare('SELECT id, name, email FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1');
        $userStmt->execute([$userId]);
        $userInfo = $userStmt->fetch(PDO::FETCH_ASSOC);
        if ($userInfo) {
            return [
                'id' => (int)$userInfo['id'],
                'name' => $userInfo['name'],
                'email' => homelinkStaffEmail($userInfo['email']),
            ];
        }
    }

    return [
        'id' => $userId > 0 ? $userId : 1,
        'name' => $userName !== '' ? $userName : 'Admin',
        'email' => $userEmail,
    ];
}
