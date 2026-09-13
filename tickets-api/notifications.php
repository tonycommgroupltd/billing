<?php
/**
 * Notifications API — fully self-contained, no external helper required.
 * Routed via index.php: case 'notifications'
 */

if (!function_exists('getDB')) {
    require_once __DIR__ . '/helpers.php';
}

header('Content-Type: application/json');

$method     = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$requestUri = $_SERVER['REQUEST_URI'] ?? '';
$uriPath    = parse_url($requestUri, PHP_URL_PATH);
if (!$uriPath) $uriPath = '/';
$segments   = array_values(array_filter(explode('/', trim($uriPath, '/'))));

// Locate 'notifications' in the path, then read sub-segments
$base = array_search('notifications', $segments);
$seg1 = ($base !== false && isset($segments[$base + 1])) ? $segments[$base + 1] : null;
$seg2 = ($base !== false && isset($segments[$base + 2])) ? $segments[$base + 2] : null;

// ── Ensure table exists with all required columns ─────────────────────────────
function ensureNotifTable($db) {
    static $done = false;
    if ($done) {
        return;
    }
    $done = true;

    // Create table if it doesn't exist at all
    $db->exec("CREATE TABLE IF NOT EXISTS `notifications` (
        `id`         BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        `user_id`    BIGINT(20) UNSIGNED NOT NULL DEFAULT 0,
        `type`       VARCHAR(50)  NOT NULL DEFAULT 'info',
        `title`      VARCHAR(255) NOT NULL DEFAULT '',
        `message`    TEXT         NOT NULL,
        `icon`       VARCHAR(50)  DEFAULT 'package-fill',
        `link`       VARCHAR(255) DEFAULT NULL,
        `is_read`    TINYINT(1)   NOT NULL DEFAULT 0,
        `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Add missing columns if the table was created by an older version
    $cols = [
        "user_id"    => "BIGINT(20) UNSIGNED NOT NULL DEFAULT 0",
        "type"       => "VARCHAR(50) NOT NULL DEFAULT 'info'",
        "title"      => "VARCHAR(255) NOT NULL DEFAULT ''",
        "icon"       => "VARCHAR(50) DEFAULT 'package-fill'",
        "link"       => "VARCHAR(255) DEFAULT NULL",
        "is_read"    => "TINYINT(1) NOT NULL DEFAULT 0",
        "created_at" => "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP",
    ];
    foreach ($cols as $col => $def) {
        try {
            $db->exec("ALTER TABLE `notifications` ADD COLUMN `{$col}` {$def}");
        } catch (Exception $e) { /* column already exists — ignore */ }
    }

    // Fix: the table may have been created by Laravel with a customer_id NOT NULL FK
    // Drop the FK constraint so we can insert staff-user notifications freely
    try { $db->exec("ALTER TABLE `notifications` DROP FOREIGN KEY `notifications_customer_id_foreign`"); } catch (Exception $e) {}
    // Make customer_id nullable so rows without a customer don't violate the constraint
    try { $db->exec("ALTER TABLE `notifications` MODIFY COLUMN `customer_id` BIGINT(20) UNSIGNED NULL DEFAULT NULL"); } catch (Exception $e) {}

    // Add indexes if missing
    try { $db->exec("ALTER TABLE `notifications` ADD KEY `idx_user_id` (`user_id`)"); } catch (Exception $e) {}
    try { $db->exec("ALTER TABLE `notifications` ADD KEY `idx_is_read` (`is_read`)");  } catch (Exception $e) {}
}

// ── Route ─────────────────────────────────────────────────────────────────────
try {
    $db = getDB();
    ensureNotifTable($db);

    if ($method === 'GET') {
        $userId = intval($_GET['user_id'] ?? 0);
        if (!$userId) {
            echo json_encode(['success' => true, 'data' => [], 'unread' => 0]);
            exit;
        }
        $stmt = $db->prepare(
            "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50"
        );
        $stmt->execute([$userId]);
        $rows   = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $unread = 0;
        foreach ($rows as $r) {
            if (empty($r['is_read'])) $unread++;
        }
        echo json_encode(['success' => true, 'data' => $rows, 'unread' => $unread]);

    } elseif ($method === 'POST' && $seg1 === 'read-all') {
        $body   = json_decode(file_get_contents('php://input'), true);
        $userId = intval(isset($body['user_id']) ? $body['user_id'] : (isset($_GET['user_id']) ? $_GET['user_id'] : 0));
        if (!$userId) { echo json_encode(['success' => false, 'error' => 'user_id required']); exit; }
        $db->prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?")->execute([$userId]);
        echo json_encode(['success' => true]);

    } elseif (($method === 'PATCH' || $method === 'POST') && $seg1 && $seg2 === 'read') {
        $db->prepare("UPDATE notifications SET is_read = 1 WHERE id = ?")->execute([intval($seg1)]);
        echo json_encode(['success' => true]);

    } else {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}

// ── Public helper — called by other API files (inventory.php etc.) ────────────
// Only define if not already defined to prevent redeclaration errors
if (!function_exists('ensureNotificationsTable')) {
    function ensureNotificationsTable($db) {
        ensureNotifTable($db);
    }
}

if (!function_exists('createNotification')) {
    function createNotification($db, $userId, $type, $title, $message, $icon = 'package-fill', $link = null) {
        try {
            ensureNotifTable($db);
            $db->prepare("INSERT INTO notifications (user_id, type, title, message, icon, link) VALUES (?,?,?,?,?,?)")
               ->execute([$userId, $type, $title, $message, $icon, $link]);
        } catch (Exception $e) {
            error_log('createNotification: ' . $e->getMessage());
        }
    }
}
