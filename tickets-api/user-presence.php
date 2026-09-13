<?php
/**
 * User presence for the ticketing app — who is online, role, device.
 * POST /api/user-presence.php/heartbeat
 * GET  /api/user-presence.php/list   (admin / manager only)
 */

require_once __DIR__ . '/helpers.php';

date_default_timezone_set('Africa/Nairobi');
setCorsHeaders();
header('Content-Type: application/json');

const PRESENCE_ONLINE_SECONDS = 120;

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$request = explode('/', trim($_SERVER['PATH_INFO'] ?? '', '/'));
$action = $request[0] ?? '';

try {
    $db = getDB();
    ensureUserPresenceTable($db);

    switch ($action) {
        case '':
        case 'user-presence.php':
            echo json_encode([
                'success' => true,
                'name' => 'User Presence API',
                'endpoints' => [
                    'POST /api/user-presence.php/heartbeat' => 'Update current user presence',
                    'GET /api/user-presence.php/list' => 'List users with online status (admin/manager)',
                ],
            ]);
            break;

        case 'heartbeat':
            if ($method === 'POST') {
                postPresenceHeartbeat($db);
            } else {
                methodNotAllowed();
            }
            break;

        case 'list':
            if ($method === 'GET') {
                listUserPresence($db);
            } else {
                methodNotAllowed();
            }
            break;

        default:
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Endpoint not found']);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}

function methodNotAllowed() {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
}

function ensureUserPresenceTable($db) {
    $db->exec("CREATE TABLE IF NOT EXISTS user_presence (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        user_name VARCHAR(255) NULL,
        user_email VARCHAR(255) NULL,
        roles_json TEXT NULL,
        device_type VARCHAR(32) NULL,
        device_label VARCHAR(128) NULL,
        browser VARCHAR(64) NULL,
        os VARCHAR(64) NULL,
        user_agent TEXT NULL,
        last_path VARCHAR(512) NULL,
        last_seen_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_user_presence (user_id),
        KEY idx_last_seen (last_seen_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function presenceCurrentUser() {
    $token = getAuthToken();
    if (!$token) {
        return null;
    }
    $decoded = verifyToken($token);
    if (!$decoded || empty($decoded['user_id'])) {
        return null;
    }
    return getUserWithRoles((int)$decoded['user_id']);
}

function presenceUserCanViewList($user) {
    if (!$user) {
        return false;
    }
    $roles = array_map('strtolower', $user['all_roles'] ?? []);
    foreach (['administrator', 'super-administrator', 'super-admin', 'manager'] as $allowed) {
        if (in_array($allowed, $roles, true)) {
            return true;
        }
    }
    return false;
}

function ticketingRoleNames($user) {
    $roles = $user['all_roles'] ?? [];
    if (empty($roles) && !empty($user['roles'])) {
        $roles = array_map(function ($r) {
            return is_array($r) ? ($r['name'] ?? '') : $r;
        }, $user['roles']);
    }
    return array_values(array_filter(array_unique($roles)));
}

function postPresenceHeartbeat($db) {
    $user = presenceCurrentUser();
    if (!$user) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Unauthorized']);
        return;
    }

    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    $roles = ticketingRoleNames($user);
    $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? ($data['user_agent'] ?? null);

    $stmt = $db->prepare("INSERT INTO user_presence
        (user_id, user_name, user_email, roles_json, device_type, device_label, browser, os, user_agent, last_path, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
            user_name = VALUES(user_name),
            user_email = VALUES(user_email),
            roles_json = VALUES(roles_json),
            device_type = VALUES(device_type),
            device_label = VALUES(device_label),
            browser = VALUES(browser),
            os = VALUES(os),
            user_agent = VALUES(user_agent),
            last_path = VALUES(last_path),
            last_seen_at = NOW()");

    $stmt->execute([
        (int)$user['id'],
        $user['name'] ?? '',
        $user['email'] ?? '',
        json_encode($roles),
        substr((string)($data['device_type'] ?? ''), 0, 32),
        substr((string)($data['device_label'] ?? ''), 0, 128),
        substr((string)($data['browser'] ?? ''), 0, 64),
        substr((string)($data['os'] ?? ''), 0, 64),
        $userAgent,
        substr((string)($data['path'] ?? ''), 0, 512),
    ]);

    echo json_encode(['success' => true]);
}

function listUserPresence($db) {
    $viewer = presenceCurrentUser();
    if (!$viewer) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Unauthorized']);
        return;
    }
    if (!presenceUserCanViewList($viewer)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Forbidden']);
        return;
    }

    $ticketRoles = [
        'technician', 'engineer', 'administrator', 'super-administrator',
        'super-admin', 'manager', 'customer-creator', 'cust-creator',
    ];
    $placeholders = implode(',', array_fill(0, count($ticketRoles), '?'));

    $sql = "
        SELECT
            u.id AS user_id,
            u.name AS user_name,
            u.email AS user_email,
            GROUP_CONCAT(DISTINCT r.name ORDER BY r.name SEPARATOR ', ') AS role_names,
            p.device_type,
            p.device_label,
            p.browser,
            p.os,
            p.user_agent,
            p.last_path,
            p.last_seen_at
        FROM users u
        INNER JOIN model_has_roles mr ON mr.model_id = u.id AND mr.model_type = 'App\\\\Models\\\\User'
        INNER JOIN roles r ON r.id = mr.role_id AND r.guard_name IN ('api', 'web')
        LEFT JOIN user_presence p ON p.user_id = u.id
        WHERE u.deleted_at IS NULL
          AND LOWER(r.name) IN ($placeholders)
        GROUP BY u.id, u.name, u.email, p.device_type, p.device_label, p.browser, p.os, p.user_agent, p.last_path, p.last_seen_at
        ORDER BY
            CASE WHEN p.last_seen_at IS NOT NULL AND p.last_seen_at >= DATE_SUB(NOW(), INTERVAL " . (int)PRESENCE_ONLINE_SECONDS . " SECOND) THEN 0 ELSE 1 END,
            p.last_seen_at DESC,
            u.name ASC
    ";

    $stmt = $db->prepare($sql);
    $stmt->execute($ticketRoles);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $now = time();
    $onlineCount = 0;
    $data = [];

    foreach ($rows as $row) {
        $lastSeenAt = $row['last_seen_at'] ?? null;
        $lastSeenTs = $lastSeenAt ? strtotime($lastSeenAt) : null;
        $isOnline = $lastSeenTs && ($now - $lastSeenTs) <= PRESENCE_ONLINE_SECONDS;
        if ($isOnline) {
            $onlineCount++;
        }

        $data[] = [
            'user_id' => (int)$row['user_id'],
            'user_name' => $row['user_name'] ?? '',
            'user_email' => $row['user_email'] ?? '',
            'roles' => $row['role_names'] ? array_map('trim', explode(',', $row['role_names'])) : [],
            'device_type' => $row['device_type'] ?? null,
            'device_label' => $row['device_label'] ?? null,
            'browser' => $row['browser'] ?? null,
            'os' => $row['os'] ?? null,
            'user_agent' => $row['user_agent'] ?? null,
            'last_path' => $row['last_path'] ?? null,
            'last_seen_at' => $lastSeenAt,
            'is_online' => $isOnline,
        ];
    }

    echo json_encode([
        'success' => true,
        'data' => $data,
        'stats' => [
            'total' => count($data),
            'online' => $onlineCount,
            'offline' => count($data) - $onlineCount,
            'online_threshold_seconds' => PRESENCE_ONLINE_SECONDS,
        ],
    ]);
}
