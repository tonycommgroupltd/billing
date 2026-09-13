<?php
/**
 * Shared SMS outbox helpers — Splynx message_details table.
 */

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/advantasms-helper.php';

function smsOutboxResolveUserId() {
    $config = loadAppConfig();
    $mockTokens = $config['mock_tokens'] ?? [];
    $authHeader = '';

    if (function_exists('getallheaders')) {
        foreach (getallheaders() as $key => $value) {
            if (strtolower($key) === 'authorization') {
                $authHeader = $value;
                break;
            }
        }
    }
    if ($authHeader === '' && !empty($_SERVER['HTTP_AUTHORIZATION'])) {
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
    }

    if ($authHeader && stripos($authHeader, 'Bearer ') === 0) {
        $token = trim(substr($authHeader, 7));
        if ($token !== '' && (in_array($token, $mockTokens, true) || $token !== '')) {
            return 1;
        }
    }

    if (session_status() !== PHP_SESSION_ACTIVE) {
        @session_start();
    }
    if (!empty($_SESSION['user_id'])) {
        return (int)$_SESSION['user_id'];
    }

    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit();
}

function smsOutboxGetPdo() {
    static $pdo = null;
    static $failed = false;
    if ($failed) {
        return null;
    }
    if ($pdo !== null) {
        return $pdo;
    }
    try {
        $pdo = getDB();
        return $pdo;
    } catch (Exception $e) {
        $failed = true;
        error_log('SMS outbox DB: ' . $e->getMessage());
        return null;
    }
}

function smsOutboxDbUnavailable() {
    http_response_code(503);
    echo json_encode([
        'data' => [],
        'total' => 0,
        'error' => 'Cannot reach Splynx database. Use production API or set api/config.local.php with remote MySQL host.',
    ]);
    exit();
}

function smsOutboxMethodNotAllowed() {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit();
}

function smsOutboxDecodeJsonField($raw) {
    if ($raw === null || $raw === '') {
        return null;
    }
    if (is_array($raw)) {
        return $raw;
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : null;
}

function smsOutboxFormatRecipient($recipient) {
    $recipient = trim((string)$recipient);
    if ($recipient === '') {
        return '';
    }
    $digits = preg_replace('/\D/', '', $recipient);
    if (strlen($digits) >= 9 && (strlen($digits) <= 12 || str_starts_with($digits, '254'))) {
        return normalizeKenyanPhone($recipient) ?: $recipient;
    }
    return $recipient;
}

function smsOutboxFormatRow(array $row) {
    $networkReport = smsOutboxDecodeJsonField($row['network_report'] ?? null);
    $notice = smsOutboxDecodeJsonField($row['notice'] ?? null);

    $customerId = (int)($row['customer_id'] ?? 0);
    $name = trim((string)($row['customer_name'] ?? ''));
    if ($name === '') {
        $name = null;
    }

    return [
        'id' => (int)$row['id'],
        'message_id' => $row['message_id'] ?? null,
        'template_id' => isset($row['template_id']) ? (int)$row['template_id'] : null,
        'customer_id' => $customerId > 0 ? $customerId : null,
        'name' => $name,
        'recipient' => smsOutboxFormatRecipient($row['recipient'] ?? ''),
        'message' => $row['message'] ?? '',
        'status' => $row['status'] ?? '',
        'cost' => isset($row['cost']) ? (float)$row['cost'] : 0,
        'dlr' => $row['dlr'] ?? '',
        'notice' => $notice,
        'network_report' => $networkReport,
        'created_at' => $row['created_at'] ?? null,
        'updated_at' => $row['updated_at'] ?? null,
    ];
}

function smsOutboxListMessages($pdo) {
    $page = max(1, (int)($_GET['page'] ?? 1));
    $perPage = min(100, max(1, (int)($_GET['per_page'] ?? 10)));
    $offset = ($page - 1) * $perPage;
    $search = trim($_GET['q'] ?? '');
    $sort = strtolower($_GET['sort'] ?? 'desc') === 'asc' ? 'ASC' : 'DESC';
    $sortCol = $_GET['sort_col'] ?? 'id';

    $sortMap = [
        'id' => 'md.id',
        'name' => 'c.name',
        'message' => 'md.message',
        'status' => 'md.status',
        'created_at' => 'md.created_at',
    ];
    $orderBy = $sortMap[$sortCol] ?? 'md.id';

    $where = ['md.deleted_at IS NULL'];
    $params = [];

    if ($search !== '') {
        $where[] = '(md.message LIKE ? OR md.recipient LIKE ? OR c.name LIKE ? OR CAST(md.id AS CHAR) LIKE ?)';
        $like = '%' . $search . '%';
        $params = array_merge($params, [$like, $like, $like, $like]);
    }

    $whereSql = implode(' AND ', $where);

    $countSql = "
        SELECT COUNT(*) AS total
        FROM message_details md
        LEFT JOIN customers c ON c.id = md.customer_id AND c.deleted_at IS NULL
        WHERE {$whereSql}
    ";
    $countStmt = $pdo->prepare($countSql);
    $countStmt->execute($params);
    $total = (int)$countStmt->fetchColumn();

    $sql = "
        SELECT
            md.id,
            md.message_id,
            md.template_id,
            md.customer_id,
            md.message,
            md.recipient,
            md.status,
            md.cost,
            md.dlr,
            md.notice,
            md.network_report,
            md.created_at,
            md.updated_at,
            COALESCE(NULLIF(c.name, ''), NULLIF(c.full_name, '')) AS customer_name
        FROM message_details md
        LEFT JOIN customers c ON c.id = md.customer_id AND c.deleted_at IS NULL
        WHERE {$whereSql}
        ORDER BY {$orderBy} {$sort}
        LIMIT " . (int)$perPage . ' OFFSET ' . (int)$offset;

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $rows = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $rows[] = smsOutboxFormatRow($row);
    }

    echo json_encode([
        'data' => $rows,
        'total' => $total,
        'source' => 'splynx',
        'pagination' => [
            'page' => $page,
            'per_page' => $perPage,
            'total' => $total,
            'total_pages' => $perPage > 0 ? (int)ceil($total / $perPage) : 0,
        ],
    ]);
}

function smsOutboxFetchMessage($pdo, $id) {
    $stmt = $pdo->prepare("
        SELECT
            md.*,
            COALESCE(NULLIF(c.name, ''), NULLIF(c.full_name, '')) AS customer_name
        FROM message_details md
        LEFT JOIN customers c ON c.id = md.customer_id AND c.deleted_at IS NULL
        WHERE md.id = ? AND md.deleted_at IS NULL
        LIMIT 1
    ");
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function smsOutboxViewMessage($pdo, $id) {
    $row = smsOutboxFetchMessage($pdo, $id);
    if (!$row) {
        http_response_code(404);
        echo json_encode(['error' => 'Message not found']);
        return;
    }

    echo json_encode([
        'message' => smsOutboxFormatRow($row),
        'source' => 'splynx',
    ]);
}

function smsOutboxResendMessage($pdo, $id) {
    $row = smsOutboxFetchMessage($pdo, $id);
    if (!$row) {
        http_response_code(404);
        echo json_encode(['message' => 'Message not found', 'error' => true]);
        return;
    }

    $recipient = smsOutboxFormatRecipient($row['recipient'] ?? '');
    $message = $row['message'] ?? '';
    $digits = preg_replace('/\D/', '', $recipient);

    if ($message === '') {
        echo json_encode(['message' => 'Message body is empty', 'error' => true]);
        return;
    }
    if (strlen($digits) < 9) {
        echo json_encode(['message' => 'Recipient is not a valid phone number', 'error' => true]);
        return;
    }

    $sms = new AdvantaSMSAPI();
    $clientSmsId = 'resend_' . $id . '_' . time();
    $response = $sms->sendSingleSMS($recipient, $message, $clientSmsId);
    $tally = $sms->tallySendResults($response, [[
        'id' => null,
        'mobile' => $recipient,
        'phone_number' => $recipient,
        'message' => $message,
        'clientsmsid' => $clientSmsId,
    ]]);
    $ok = ($tally['sent'] ?? 0) > 0;

    if ($ok) {
        echo json_encode([
            'message' => 'SMS resent successfully',
            'error' => false,
        ]);
        return;
    }

    $err = !empty($tally['errors'][0]) ? $tally['errors'][0] : $sms->getErrorMessage($response);
    echo json_encode([
        'message' => 'Resend failed: ' . $err,
        'error' => true,
    ]);
}

function smsOutboxDeleteMessage($pdo, $id) {
    $stmt = $pdo->prepare('UPDATE message_details SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$id]);
    if ($stmt->rowCount() === 0) {
        http_response_code(404);
        echo json_encode(['message' => 'Message not found']);
        return;
    }

    echo json_encode(['message' => 'Message deleted successfully']);
}
