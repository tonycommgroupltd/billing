<?php
/**
 * SMS Outbox API — reads sent messages from Splynx DB (message_details).
 */

require_once __DIR__ . '/sms-outbox-lib.php';

setCorsHeaders();
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

smsOutboxResolveUserId();
$method = $_SERVER['REQUEST_METHOD'];

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$pathParts = array_values(array_filter(explode('/', trim($path, '/'))));
if (!empty($pathParts) && $pathParts[0] === 'api') {
    array_shift($pathParts);
}

$route = $pathParts[0] ?? '';
$id = isset($pathParts[1]) && $pathParts[1] !== '' ? (int)$pathParts[1] : null;

try {
    $pdo = smsOutboxGetPdo();
    if (!$pdo) {
        smsOutboxDbUnavailable();
    }

    switch ($route) {
        case 'list-messages':
            if ($method !== 'GET') {
                smsOutboxMethodNotAllowed();
            }
            smsOutboxListMessages($pdo);
            break;

        case 'view-messages':
            if ($method !== 'GET' || !$id) {
                http_response_code($method !== 'GET' ? 405 : 400);
                echo json_encode(['error' => 'Message id required']);
                break;
            }
            smsOutboxViewMessage($pdo, $id);
            break;

        case 'resend-sms':
            if ($method !== 'POST' || !$id) {
                http_response_code($method !== 'POST' ? 405 : 400);
                echo json_encode(['error' => 'Message id required']);
                break;
            }
            smsOutboxResendMessage($pdo, $id);
            break;

        case 'messages':
            if ($method !== 'DELETE' || !$id) {
                http_response_code($method !== 'DELETE' ? 405 : 400);
                echo json_encode(['error' => 'Message id required']);
                break;
            }
            smsOutboxDeleteMessage($pdo, $id);
            break;

        default:
            http_response_code(404);
            echo json_encode(['error' => 'Endpoint not found']);
            break;
    }
} catch (Exception $e) {
    error_log('SMS outbox error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'SMS outbox error: ' . $e->getMessage()]);
}
