<?php
/**
 * ============================================
 * TCOM Mobile App Webhook Receiver
 * ============================================
 * 
 * Standalone API endpoint on the cPanel ticketing
 * app that receives tickets, replies, and status
 * changes from the VPS mobile Express API.
 *
 * Secured with a shared API key.
 *
 * Endpoints (PATH_INFO based):
 *   POST /mobile-api.php/ticket       — Create ticket
 *   POST /mobile-api.php/reply        — Add reply/comment
 *   POST /mobile-api.php/status       — Update status
 *   GET  /mobile-api.php/ping         — Health check
 * ============================================
 */

// ── Config ──
$API_KEY = 'tcom_mobile_bridge_2026_secure';

// ── DB Connection (same cPanel database) ──
function getMobileDB() {
    static $pdo = null;
    if ($pdo === null) {
        $config = require __DIR__ . '/config.php';
        $db = $config['db'];
        $dsn = "mysql:host={$db['host']};dbname={$db['database']};charset={$db['charset']}";
        $pdo = new PDO($dsn, $db['username'], $db['password'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
        $pdo->exec("SET time_zone = '+03:00'");
    }
    return $pdo;
}

// ── Helpers ──
function jsonResponse($data, $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function jsonError($msg, $code = 400) {
    jsonResponse(['success' => false, 'error' => $msg], $code);
}

function getInput() {
    return json_decode(file_get_contents('php://input'), true) ?: [];
}

function generateTicketNumber($db) {
    // Match the existing system: #<MAX_ID + 1>
    $stmt = $db->query("SELECT MAX(id) as max_id FROM tickets");
    $row  = $stmt->fetch();
    $next = ($row && $row['max_id'] !== null) ? ((int)$row['max_id'] + 1) : 1;
    
    for ($i = 0; $i < 100; $i++) {
        $candidate = '#' . ($next + $i);
        $check = $db->prepare("SELECT id FROM tickets WHERE number = ? LIMIT 1");
        $check->execute([$candidate]);
        if (!$check->fetch()) return $candidate;
    }
    // Fallback
    return '#M' . time() . '-' . rand(1000, 9999);
}

// ── CORS (allow VPS) ──
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Routing ──
$path = trim($_SERVER['PATH_INFO'] ?? '', '/');
$method = $_SERVER['REQUEST_METHOD'];

// ── Health Check (no auth) ──
if ($path === 'ping' && $method === 'GET') {
    jsonResponse([
        'success' => true,
        'message' => 'TCOM Mobile API bridge is alive',
        'time'    => date('Y-m-d H:i:s'),
    ]);
}

// ── Auth Check ──
$providedKey = $_SERVER['HTTP_X_API_KEY'] ?? ($_GET['api_key'] ?? '');
if ($providedKey !== $API_KEY) {
    jsonError('Invalid or missing API key', 401);
}

// ── Only POST from here ──
if ($method !== 'POST') {
    jsonError('Method not allowed', 405);
}

try {
    $db   = getMobileDB();
    $data = getInput();

    switch ($path) {

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // CREATE TICKET
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        case 'ticket':
            $subject = trim($data['subject'] ?? '');
            if (!$subject) jsonError('subject is required');

            $number = generateTicketNumber($db);

            $sql = "INSERT INTO tickets (
                        number, subject, description, customer_name, customer_email,
                        customer_phone, address, type, priority, status, `group`,
                        assigned_to, created_by, watched_by
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

            $stmt = $db->prepare($sql);
            $stmt->execute([
                $number,
                $subject,
                $data['description']    ?? '',
                $data['customer_name']  ?? 'Mobile Customer',
                $data['customer_email'] ?? null,
                $data['customer_phone'] ?? null,
                $data['address']        ?? null,
                $data['type']           ?? 'Support',
                $data['priority']       ?? 'medium',
                'new',                 // always start as "new"
                $data['group']          ?? 'Any',
                $data['assigned_to']    ?? null,
                $data['created_by']     ?? 'TCOM Mobile App',
                $data['watched_by']     ?? null,
            ]);

            $ticketId = (int)$db->lastInsertId();

            jsonResponse([
                'success' => true,
                'ticket'  => [
                    'id'     => $ticketId,
                    'number' => $number,
                ],
                'message' => 'Ticket created',
            ], 201);
            break;

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // ADD REPLY / COMMENT
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        case 'reply':
            $ticketId = (int)($data['ticket_id'] ?? 0);
            $message  = trim($data['message'] ?? '');
            if (!$ticketId) jsonError('ticket_id is required');
            if (!$message)  jsonError('message is required');

            // Verify ticket exists
            $check = $db->prepare("SELECT id FROM tickets WHERE id = ? LIMIT 1");
            $check->execute([$ticketId]);
            if (!$check->fetch()) jsonError('Ticket not found', 404);

            $sql = "INSERT INTO ticket_comments 
                        (ticket_id, user_id, type, comment, created_at, updated_at)
                    VALUES (?, ?, 'reply', ?, NOW(), NOW())";

            $stmt = $db->prepare($sql);
            $stmt->execute([
                $ticketId,
                $data['user_id'] ?? 0,
                $message,
            ]);

            $commentId = (int)$db->lastInsertId();

            // Update ticket updated_at
            $db->prepare("UPDATE tickets SET updated_at = NOW() WHERE id = ?")->execute([$ticketId]);

            jsonResponse([
                'success'    => true,
                'comment_id' => $commentId,
                'message'    => 'Reply added',
            ]);
            break;

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // UPDATE STATUS
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        case 'status':
            $ticketId = (int)($data['ticket_id'] ?? 0);
            $status   = trim($data['status'] ?? '');
            if (!$ticketId) jsonError('ticket_id is required');
            if (!$status)   jsonError('status is required');

            $allowed = ['new','open','in_progress','resolved','closed'];
            if (!in_array($status, $allowed)) {
                jsonError("Invalid status. Allowed: " . implode(', ', $allowed));
            }

            // Verify ticket exists
            $check = $db->prepare("SELECT id, status FROM tickets WHERE id = ? LIMIT 1");
            $check->execute([$ticketId]);
            $ticket = $check->fetch();
            if (!$ticket) jsonError('Ticket not found', 404);

            $db->prepare("UPDATE tickets SET status = ?, updated_at = NOW() WHERE id = ?")
               ->execute([$status, $ticketId]);

            // Log activity
            try {
                $db->prepare("INSERT INTO ticket_activities 
                    (ticket_id, user_id, action, old_value, new_value, description, created_at) 
                    VALUES (?, 0, 'status_change', ?, ?, ?, NOW())")
                   ->execute([
                       $ticketId,
                       $ticket['status'],
                       $status,
                       "Status changed from {$ticket['status']} to {$status} via Mobile App",
                   ]);
            } catch (Exception $e) {
                // Activity logging is best-effort
                error_log('Activity log failed: ' . $e->getMessage());
            }

            jsonResponse([
                'success' => true,
                'message' => "Status updated to {$status}",
            ]);
            break;

        default:
            jsonError("Unknown endpoint: /{$path}", 404);
    }

} catch (PDOException $e) {
    error_log('Mobile API DB error: ' . $e->getMessage());
    jsonError('Database error', 500);
} catch (Exception $e) {
    error_log('Mobile API error: ' . $e->getMessage());
    jsonError('Server error', 500);
}
