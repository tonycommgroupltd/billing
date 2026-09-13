<?php
/**
 * Bulk SMS API Endpoint
 * Handles bulk SMS sending to customers via AdvantaSMS
 * 
 * Endpoints:
 *   GET  ?action=customers     - List customers from Customer Services (Splynx VPS)
 *   GET  ?action=templates     - Get saved SMS templates
 *   GET  ?action=balance       - Get AdvantaSMS credit balance
 *   GET  ?action=stats         - Get sending statistics
 *   POST ?action=send          - Send bulk SMS to recipients
 *   POST ?action=send-manual   - Send to manually entered numbers
 *   POST ?action=send-csv      - Send to CSV-parsed numbers
 */

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/advantasms-helper.php';

setCorsHeaders();
header('Content-Type: application/json');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$user_id = bulkSmsResolveUserId();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$pdo = bulkSmsOptionalPdo();

try {
    switch ($action) {

        // ─────────────────────────────────────────────
        // GET: List customers with filtering
        // ─────────────────────────────────────────────
        case 'customers':
            if ($method !== 'GET') { methodNotAllowed(); }

            $search  = trim($_GET['search'] ?? '');
            $status  = $_GET['status'] ?? 'Active';
            $page    = max(1, (int)($_GET['page'] ?? 1));
            $perPage = min(500, max(10, (int)($_GET['per_page'] ?? 100)));

            try {
                $splynx = bulkSmsFetchSplynxPage($search, $status, $page, $perPage);
                $stats = $splynx['stats'] ?? [];
                echo json_encode([
                    'success' => true,
                    'source' => 'splynx',
                    'data' => $splynx['rows'],
                    'pagination' => [
                        'page' => $splynx['page'],
                        'per_page' => $splynx['per_page'],
                        'total' => $splynx['total'],
                        'total_pages' => $splynx['total_pages'],
                    ],
                    'status_counts' => [
                        'active' => (int)($stats['active'] ?? 0),
                        'expired' => (int)($stats['expired'] ?? 0),
                        'disabled' => (int)($stats['disabled'] ?? 0),
                        'with_balance' => (int)($stats['with_balance'] ?? 0),
                    ],
                ]);
            } catch (Exception $e) {
                http_response_code(503);
                echo json_encode([
                    'success' => false,
                    'message' => 'Failed to load Customer Services: ' . $e->getMessage(),
                ]);
            }
            break;

        // ─────────────────────────────────────────────
        // GET: Message templates
        // ─────────────────────────────────────────────
        case 'templates':
            if ($method !== 'GET') { methodNotAllowed(); }

            $templates = $pdo ? bulkSmsFetchSplynxTemplates($pdo) : [];
            $source = 'splynx';
            if (empty($templates)) {
                $templates = getDefaultTemplates();
                $source = $pdo ? 'default' : 'default-offline';
            }

            echo json_encode([
                'success' => true,
                'source' => $source,
                'data' => $templates
            ]);
            break;

        // ─────────────────────────────────────────────
        // GET: SMS Balance
        // ─────────────────────────────────────────────
        case 'balance':
            if ($method !== 'GET') { methodNotAllowed(); }

            $smsAPI = new AdvantaSMSAPI();
            try {
                $balanceResponse = $smsAPI->getBalance();
                $balance = 0;
                if (isset($balanceResponse['response']['credit'])) {
                    $balance = $balanceResponse['response']['credit'];
                } elseif (isset($balanceResponse['response']['balance'])) {
                    $balance = $balanceResponse['response']['balance'];
                }
                echo json_encode([
                    'success' => true,
                    'balance' => $balance,
                    'raw' => $balanceResponse
                ]);
            } catch (Exception $e) {
                echo json_encode([
                    'success' => false,
                    'balance' => 0,
                    'message' => 'Failed to get balance: ' . $e->getMessage()
                ]);
            }
            break;

        // ─────────────────────────────────────────────
        // GET: Sending statistics
        // ─────────────────────────────────────────────
        case 'stats':
            if ($method !== 'GET') { methodNotAllowed(); }
            if (!$pdo) {
                echo json_encode(['success' => true, 'stats' => [
                    'total_sent' => 0, 'delivered' => 0, 'failed' => 0, 'pending' => 0, 'total_campaigns' => 0,
                ]]);
                break;
            }

            $stats = [
                'total_sent' => 0,
                'delivered' => 0,
                'failed' => 0,
                'pending' => 0,
                'today_sent' => 0,
                'total_campaigns' => 0
            ];

            try {
                $r = $pdo->query("SELECT COUNT(*) as c FROM sms_messages")->fetch();
                $stats['total_sent'] = (int)$r['c'];

                $r = $pdo->query("SELECT COUNT(*) as c FROM sms_messages WHERE status IN ('sent','delivered')")->fetch();
                $stats['delivered'] = (int)$r['c'];

                $r = $pdo->query("SELECT COUNT(*) as c FROM sms_messages WHERE status = 'failed'")->fetch();
                $stats['failed'] = (int)$r['c'];

                $r = $pdo->query("SELECT COUNT(*) as c FROM sms_messages WHERE status = 'pending'")->fetch();
                $stats['pending'] = (int)$r['c'];

                $r = $pdo->query("SELECT COUNT(*) as c FROM sms_messages WHERE DATE(created_at) = CURDATE()")->fetch();
                $stats['today_sent'] = (int)$r['c'];

                $r = $pdo->query("SELECT COUNT(*) as c FROM sms_campaigns")->fetch();
                $stats['total_campaigns'] = (int)$r['c'];
            } catch (Exception $e) {
                // Tables may not exist yet
            }

            echo json_encode(['success' => true, 'stats' => $stats]);
            break;

        // ─────────────────────────────────────────────
        // POST: Send Bulk SMS to selected customers
        // ─────────────────────────────────────────────
        case 'send':
            if ($method !== 'POST') { methodNotAllowed(); }
            $pdo = bulkSmsRequirePdo();
            ensureTables($pdo);

            $input = json_decode(file_get_contents('php://input'), true);
            $message     = trim($input['message'] ?? '');
            $recipients  = $input['recipients'] ?? [];    // [{id, phone_number, full_name}]
            $filter      = $input['filter'] ?? null;      // { status, search, sms_alerts }
            $campaignName = trim($input['campaign_name'] ?? 'Bulk SMS ' . date('Y-m-d H:i'));

            // Validation
            if (empty($message)) {
                echo json_encode(['success' => false, 'message' => 'Message is required']);
                break;
            }

            // Only expand filter when no explicit recipient list was provided
            if (empty($recipients) && !empty($filter) && is_array($filter)) {
                $recipients = bulkSmsFetchSplynxRecipients(
                    trim($filter['search'] ?? ''),
                    $filter['status'] ?? 'Active'
                );
                if (empty($campaignName) || strpos($campaignName, 'Bulk SMS') === 0) {
                    $campaignName = 'Bulk SMS to ' . ($filter['status'] ?? 'filtered') . ' customers - ' . date('Y-m-d H:i');
                }
            }

            if (empty($recipients)) {
                echo json_encode(['success' => false, 'message' => 'At least one recipient is required']);
                break;
            }

            $recipients = bulkSmsDedupeRecipientsByPhone($recipients);

            // Append opt-out footer if not already present
            if (strpos($message, 'STOP') === false) {
                $message .= "\nSTOP *456*9*5#";
            }

            $smsAPI = new AdvantaSMSAPI();

            // Create campaign record
            $campaignId = null;
            try {
                $stmt = $pdo->prepare("INSERT INTO sms_campaigns (name, message, target_type, total_recipients, status, created_by, created_at) 
                                       VALUES (?, ?, 'custom', ?, 'sending', ?, NOW())");
                $stmt->execute([$campaignName, $message, count($recipients), $user_id]);
                $campaignId = $pdo->lastInsertId();
            } catch (Exception $e) {
                error_log('Campaign create error: ' . $e->getMessage());
            }

            $successCount = 0;
            $failedCount  = 0;
            $errors = [];

            // Batch sending: AdvantaSMS supports up to 20 per bulk request
            $batches = array_chunk($recipients, 20);

            foreach ($batches as $batchIndex => $batch) {
                $smsList = [];
                $batchRecipients = [];

                foreach ($batch as $recipient) {
                    $mobile = $recipient['phone_number'] ?? $recipient['mobile'] ?? $recipient['phone'] ?? '';
                    $name   = $recipient['full_name'] ?? $recipient['name'] ?? '';
                    
                    if (empty($mobile)) {
                        $failedCount++;
                        $errors[] = "Empty phone number for: {$name}";
                        continue;
                    }

                    $personalizedMsg = bulkSmsPersonalizeMessage($message, $recipient);

                    $clientSmsId = 'bulk_' . ($campaignId ?? 0) . '_' . ($recipient['id'] ?? uniqid());

                    $smsList[] = [
                        'mobile'      => $mobile,
                        'message'     => $personalizedMsg,
                        'clientsmsid' => $clientSmsId
                    ];

                    $batchRecipients[] = [
                        'id'      => $recipient['id'] ?? null,
                        'mobile'  => $mobile,
                        'name'    => $name,
                        'message' => $personalizedMsg,
                        'clientsmsid' => $clientSmsId
                    ];
                }

                if (empty($smsList)) continue;

                // Send via AdvantaSMS
                try {
                    if (count($smsList) === 1) {
                        $response = $smsAPI->sendSingleSMS(
                            $smsList[0]['mobile'],
                            $smsList[0]['message'],
                            $smsList[0]['clientsmsid']
                        );
                    } else {
                        $response = $smsAPI->sendBulkSMS($smsList);
                    }

                    $tally = $smsAPI->tallySendResults($response, $batchRecipients);
                    $successCount += $tally['sent'];
                    $failedCount += $tally['failed'];
                    $errors = array_merge($errors, $tally['errors']);

                    foreach ($batchRecipients as $idx => $recipient) {
                        $match = $tally['matched'][$idx] ?? null;
                        $ok = $match['success'] ?? false;
                        logSmsMessage($pdo, [
                            'customer_id' => $recipient['id'],
                            'recipient'   => $recipient['mobile'],
                            'message'     => $recipient['message'],
                            'status'      => $ok ? 'sent' : 'failed',
                            'api_message_id' => $match['message_id'] ?? null,
                            'api_response'   => json_encode($match['api_response'] ?? $response),
                            'campaign_id'    => $campaignId
                        ]);
                    }
                } catch (Exception $e) {
                    error_log('Bulk SMS send error: ' . $e->getMessage());
                    $failedCount += count($batchRecipients);
                    $errors[] = "Batch {$batchIndex} exception: " . $e->getMessage();

                    // Still log failures
                    foreach ($batchRecipients as $r) {
                        logSmsMessage($pdo, [
                            'customer_id' => $r['id'],
                            'recipient'   => $r['mobile'],
                            'message'     => $r['message'],
                            'status'      => 'failed',
                            'api_message_id' => null,
                            'api_response'   => json_encode(['error' => $e->getMessage()]),
                            'campaign_id'    => $campaignId
                        ]);
                    }
                }

                // Small delay between batches to avoid rate limiting
                if (count($batches) > 1) {
                    usleep(500000); // 0.5 seconds
                }
            }

            // Update campaign status
            if ($campaignId) {
                try {
                    $finalStatus = ($failedCount === 0) ? 'completed' : (($successCount === 0) ? 'failed' : 'partial');
                    $stmt = $pdo->prepare("UPDATE sms_campaigns SET status = ?, sent_count = ?, failed_count = ?, completed_at = NOW() WHERE id = ?");
                    $stmt->execute([$finalStatus, $successCount, $failedCount, $campaignId]);
                } catch (Exception $e) {
                    error_log('Campaign update error: ' . $e->getMessage());
                }
            }

            // Log activity
            try {
                $pdo->prepare("INSERT INTO activity_logs (user_id, action, description, created_at) VALUES (?, 'bulk_sms', ?, NOW())")
                     ->execute([$user_id, "Sent bulk SMS: {$successCount} sent, {$failedCount} failed"]);
            } catch (Exception $e) {
                // activity_logs table may not exist
            }

            echo json_encode([
                'success' => true,
                'message' => "Bulk SMS complete: {$successCount} sent, {$failedCount} failed",
                'sent'    => $successCount,
                'failed'  => $failedCount,
                'total'   => $successCount + $failedCount,
                'errors'  => array_slice($errors, 0, 10), // Limit error details
                'campaign_id' => $campaignId
            ]);
            break;

        // ─────────────────────────────────────────────
        // POST: Send to manually entered numbers
        // ─────────────────────────────────────────────
        case 'send-manual':
            if ($method !== 'POST') { methodNotAllowed(); }
            $pdo = bulkSmsRequirePdo();
            ensureTables($pdo);

            $input = json_decode(file_get_contents('php://input'), true);
            $message = trim($input['message'] ?? '');
            $numbers = $input['numbers'] ?? [];  // Array of phone numbers

            if (empty($message)) {
                echo json_encode(['success' => false, 'message' => 'Message is required']);
                break;
            }
            if (empty($numbers)) {
                echo json_encode(['success' => false, 'message' => 'At least one phone number is required']);
                break;
            }

            // Append opt-out footer
            if (strpos($message, 'STOP') === false) {
                $message .= "\nSTOP *456*9*5#";
            }

            // Convert to recipients format
            $recipients = [];
            foreach ($numbers as $num) {
                $num = normalizeKenyanPhone(trim((string)$num));
                if ($num !== '') {
                    $recipients[] = [
                        'id' => null,
                        'phone_number' => $num,
                        'full_name' => ''
                    ];
                }
            }
            $recipients = bulkSmsDedupeRecipientsByPhone($recipients);

            // Reuse the send logic
            $smsAPI = new AdvantaSMSAPI();
            $successCount = 0;
            $failedCount = 0;

            foreach ($recipients as $recipient) {
                $mobile = $recipient['phone_number'];
                $clientSmsId = 'manual_' . uniqid();
                try {
                    $response = $smsAPI->sendSingleSMS($mobile, $message, $clientSmsId);
                    $batchRow = [[
                        'id' => null,
                        'mobile' => $mobile,
                        'phone_number' => $mobile,
                        'message' => $message,
                        'clientsmsid' => $clientSmsId,
                    ]];
                    $tally = $smsAPI->tallySendResults($response, $batchRow);
                    $successCount += $tally['sent'];
                    $failedCount += $tally['failed'];
                    $match = $tally['matched'][0] ?? null;
                    $ok = $match['success'] ?? false;

                    logSmsMessage($pdo, [
                        'customer_id' => null,
                        'recipient'   => $mobile,
                        'message'     => $message,
                        'status'      => $ok ? 'sent' : 'failed',
                        'api_message_id' => $match['message_id'] ?? null,
                        'api_response'   => json_encode($match['api_response'] ?? $response),
                        'campaign_id'    => null
                    ]);
                } catch (Exception $e) {
                    $failedCount++;
                    logSmsMessage($pdo, [
                        'customer_id' => null,
                        'recipient'   => $mobile,
                        'message'     => $message,
                        'status'      => 'failed',
                        'api_message_id' => null,
                        'api_response'   => json_encode(['error' => $e->getMessage()]),
                        'campaign_id'    => null
                    ]);
                }
            }

            echo json_encode([
                'success' => true,
                'message' => "{$successCount} sent, {$failedCount} failed",
                'sent'    => $successCount,
                'failed'  => $failedCount
            ]);
            break;

        default:
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Invalid action. Use: customers, templates, balance, stats, send, send-manual']);
            break;
    }

} catch (Exception $e) {
    error_log('Bulk SMS API error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Server error: ' . $e->getMessage()
    ]);
}


// ═══════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════

function methodNotAllowed() {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit();
}

/**
 * Active = customer has at least one service with status value 2 (same as dashboard).
 */
function bulkSmsActiveServiceExistsSql() {
    return "EXISTS (
        SELECT 1 FROM services s
        WHERE s.customer_id = c.id
        AND JSON_EXTRACT(s.status, '$.value') = 2
        AND (s.deleted_at IS NULL OR s.deleted_at = '0000-00-00 00:00:00')
    )";
}

function bulkSmsBuildCustomerFilter($search, $status, $smsOnly) {
    $where = [];
    $params = [];

    $where[] = "c.phone_number IS NOT NULL AND TRIM(c.phone_number) != ''";
    $where[] = "(c.deleted_at IS NULL OR c.deleted_at = '0000-00-00 00:00:00')";

    if ($status && $status !== 'all') {
        if ($status === 'active') {
            $where[] = bulkSmsActiveServiceExistsSql();
        } else {
            $where[] = "c.status = ?";
            $params[] = $status;
        }
    }

    if ($smsOnly) {
        $where[] = "c.sms_alerts = 1";
    }

    if ($search !== '') {
        $where[] = "(COALESCE(NULLIF(c.full_name, ''), c.name) LIKE ?
            OR c.phone_number LIKE ?
            OR c.email LIKE ?)";
        $searchTerm = "%{$search}%";
        $params[] = $searchTerm;
        $params[] = $searchTerm;
        $params[] = $searchTerm;
    }

    $whereClause = !empty($where) ? 'WHERE ' . implode(' AND ', $where) : '';
    return [$whereClause, $params];
}

/** VPS Customer Services (same source as /admin/splynx-data). */
function bulkSmsSplynxVpsCall($endpoint, $params = []) {
    $vpsUrl = 'http://78.159.111.191:3500/api/splynx';
    $vpsKey = 'tcom-splynx-proxy-2026';

    $url = $vpsUrl . $endpoint;
    if (!empty($params)) {
        $url .= '?' . http_build_query($params);
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_HTTPHEADER => [
            'X-Api-Key: ' . $vpsKey,
            'Content-Type: application/json',
        ],
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($error) {
        return ['error' => 'Customer Services API unreachable: ' . $error, 'status' => 503];
    }

    $data = json_decode($response, true);
    if ($httpCode >= 400) {
        $msg = is_array($data) ? ($data['message'] ?? $data['error'] ?? 'HTTP ' . $httpCode) : 'HTTP ' . $httpCode;
        return ['error' => $msg, 'status' => $httpCode];
    }

    return ['data' => $data, 'status' => $httpCode];
}

function bulkSmsSplynxStatusParam($status) {
    $s = strtolower(trim((string)$status));
    if ($s === 'all' || $s === '') {
        return null;
    }
    if ($s === 'active') {
        return 'Active';
    }
    if ($s === 'expired') {
        return 'Expired';
    }
    if ($s === 'disabled') {
        return 'Disabled';
    }
    if (in_array($status, ['Active', 'Expired', 'Disabled'], true)) {
        return $status;
    }
    return null;
}

function bulkSmsSplynxRowToCustomer(array $row) {
    $statusLabel = is_array($row['status'] ?? null)
        ? ($row['status']['label'] ?? '')
        : (string)($row['status'] ?? '');

    $phone = !empty($row['phone_number']) ? normalizeKenyanPhone($row['phone_number']) : '';

    return [
        'id' => (int)($row['service_id'] ?? $row['customer_id'] ?? 0),
        'service_id' => (int)($row['service_id'] ?? 0),
        'customer_id' => (int)($row['customer_id'] ?? 0),
        'full_name' => $row['customer_name'] ?? '',
        'customer_name' => $row['customer_name'] ?? '',
        'phone_number' => $phone,
        'city' => $row['city'] ?? null,
        'status' => $statusLabel,
        'plan_name' => $row['plan_name'] ?? '',
        'balance' => isset($row['balance']) ? (float)$row['balance'] : 0,
        'source' => 'splynx',
    ];
}

function bulkSmsDedupeRecipientsByPhone(array $rows) {
    $seen = [];
    $out = [];
    foreach ($rows as $row) {
        $phone = $row['phone_number'] ?? '';
        if ($phone === '') {
            continue;
        }
        $key = getKenyanSubscriberDigits($phone) ?: $phone;
        if (isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;
        $out[] = $row;
    }
    return $out;
}

function bulkSmsFetchSplynxPage($search, $status, $page, $perPage) {
    $params = [
        'page' => max(1, (int)$page),
        'per_page' => min(500, max(10, (int)$perPage)),
    ];
    if ($search !== '') {
        $params['search'] = $search;
    }
    $statusParam = bulkSmsSplynxStatusParam($status);
    if ($statusParam) {
        $params['status'] = $statusParam;
    }

    $result = bulkSmsSplynxVpsCall('/services', $params);
    if (isset($result['error'])) {
        throw new Exception($result['error']);
    }

    $body = $result['data'] ?? [];
    $rows = [];
    foreach (($body['data'] ?? []) as $item) {
        if (!is_array($item)) {
            continue;
        }
        $mapped = bulkSmsSplynxRowToCustomer($item);
        if ($mapped['phone_number'] !== '') {
            $rows[] = $mapped;
        }
    }

    return [
        'rows' => $rows,
        'total' => (int)($body['total'] ?? count($rows)),
        'total_pages' => max(1, (int)($body['total_pages'] ?? 1)),
        'page' => (int)($body['page'] ?? $page),
        'per_page' => (int)($body['per_page'] ?? $perPage),
        'stats' => $body['stats'] ?? [],
    ];
}

function bulkSmsFetchSplynxRecipients($search, $status, $maxRecipients = 15000) {
    $recipients = [];
    $page = 1;
    $perPage = 500;
    $totalPages = 1;

    do {
        $batch = bulkSmsFetchSplynxPage($search, $status, $page, $perPage);
        $totalPages = (int)($batch['total_pages'] ?? 1);

        foreach ($batch['rows'] as $row) {
            $recipients[] = [
                'id' => $row['customer_id'] ?: $row['id'],
                'phone_number' => $row['phone_number'],
                'full_name' => $row['full_name'] ?? $row['customer_name'] ?? '',
            ];
        }

        $recipients = bulkSmsDedupeRecipientsByPhone($recipients);
        if (count($recipients) >= $maxRecipients) {
            break;
        }
        $page++;
    } while ($page <= $totalPages);

    return array_slice($recipients, 0, $maxRecipients);
}

function logSmsMessage($pdo, $data) {
    try {
        $stmt = $pdo->prepare("INSERT INTO sms_messages 
            (customer_id, recipient, message, status, api_message_id, api_response, sent_at, created_at) 
            VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())");
        $stmt->execute([
            $data['customer_id'],
            $data['recipient'],
            $data['message'],
            $data['status'],
            $data['api_message_id'],
            $data['api_response']
        ]);
    } catch (Exception $e) {
        error_log('Log SMS error: ' . $e->getMessage());
    }
}

function bulkSmsResolveUserId() {
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
        if ($token !== '' && in_array($token, $mockTokens, true)) {
            return 1;
        }
        if ($token !== '') {
            $pdo = bulkSmsOptionalPdo();
            if ($pdo) {
                try {
                    $stmt = $pdo->prepare('SELECT id FROM users WHERE remember_token = ? OR api_token = ? LIMIT 1');
                    $stmt->execute([$token, $token]);
                    $user = $stmt->fetch();
                    if ($user) {
                        return (int)$user['id'];
                    }
                } catch (Exception $e) {
                    // Dev fallback when DB is offline
                    return 1;
                }
            }
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
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit();
}

function bulkSmsOptionalPdo() {
    static $pdo = null;
    static $failed = false;
    if ($failed) {
        return null;
    }
    if ($pdo !== null) {
        return $pdo;
    }
    try {
        $config = loadAppConfig();
        $db = $config['db'];
        $dsn = "mysql:host={$db['host']};dbname={$db['database']};charset={$db['charset']}";
        if (!empty($db['port'])) {
            $dsn .= ';port=' . (int)$db['port'];
        }
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ];
        if (defined('PDO::MYSQL_ATTR_CONNECT_TIMEOUT')) {
            $options[PDO::MYSQL_ATTR_CONNECT_TIMEOUT] = 3;
        }
        $pdo = new PDO($dsn, $db['username'], $db['password'], $options);
        $pdo->exec("SET time_zone = '+03:00'");
        return $pdo;
    } catch (Exception $e) {
        $failed = true;
        error_log('Bulk SMS DB unavailable: ' . $e->getMessage());
        return null;
    }
}

function bulkSmsRequirePdo() {
    $pdo = bulkSmsOptionalPdo();
    if ($pdo) {
        return $pdo;
    }
    http_response_code(503);
    echo json_encode([
        'success' => false,
        'message' => 'Database unavailable. For local dev, copy api/config.local.php.example to api/config.local.php with your MySQL host, or deploy bulk-sms.php to production.',
    ]);
    exit();
}

/**
 * SMS templates from Splynx message_templates (Advanta / SMS channel).
 */
function bulkSmsFetchSplynxTemplates($pdo) {
    try {
        $stmt = $pdo->query("
            SELECT id, name, message, message_class
            FROM message_templates
            WHERE deleted_at IS NULL
              AND LOWER(TRIM(render_engine)) = 'advanta'
            ORDER BY name ASC
        ");
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Exception $e) {
        return [];
    }

    $templates = [];
    foreach ($rows as $row) {
        $body = bulkSmsNormalizeCustomerGreeting(bulkSmsExtractTemplateBody($row['message'] ?? ''));
        if (trim($body) === '') {
            continue;
        }
        $templates[] = [
            'id' => (int)$row['id'],
            'name' => $row['name'],
            'message' => $body,
            'variables' => bulkSmsExtractTemplateVariables($body),
            'message_class' => $row['message_class'] ?? '',
            'source' => 'splynx',
        ];
    }
    return $templates;
}

function bulkSmsExtractTemplateBody($raw) {
    if ($raw === null || $raw === '') {
        return '';
    }
    $decoded = json_decode($raw, true);
    if (is_array($decoded)) {
        if (isset($decoded['en'])) {
            return (string)$decoded['en'];
        }
        $first = reset($decoded);
        return is_string($first) ? $first : '';
    }
    return (string)$raw;
}

function bulkSmsExtractTemplateVariables($text) {
    $vars = [];
    if (preg_match_all('/\[\[([^\]]+)\]\]/', $text, $m)) {
        foreach ($m[1] as $v) {
            $vars[] = '[[' . $v . ']]';
        }
    }
    if (preg_match_all('/\{([a-zA-Z_]+)\}/', $text, $m2)) {
        foreach ($m2[1] as $v) {
            $vars[] = '{' . $v . '}';
        }
    }
    return implode(', ', array_unique($vars));
}

function bulkSmsNormalizeCustomerGreeting($message) {
    $message = preg_replace('/Dear\s+\{[^}]+\},?\s*/i', 'Dear customer, ', $message);
    $message = preg_replace('/Dear\s+\[\[[^\]]+\]\],?\s*/i', 'Dear customer, ', $message);
    $message = preg_replace('/Welcome\s+to\s+[^,]+,\s*\{[^}]+\}!/i', 'Welcome to TonyCom Networks!', $message);
    return $message;
}

function bulkSmsPersonalizeMessage($message, array $recipient) {
    $message = bulkSmsNormalizeCustomerGreeting($message);
    $phone = $recipient['phone_number'] ?? $recipient['mobile'] ?? $recipient['phone'] ?? '';
    $account = $recipient['account'] ?? $recipient['login'] ?? '';
    if ($account === '' && $phone !== '') {
        $digits = getKenyanSubscriberDigits($phone);
        $account = $digits !== '' ? $digits : preg_replace('/\D/', '', $phone);
    }

    return str_replace(
        ['{customer_name}', '{name}', '[[customer_name]]', '[[account]]'],
        ['customer', 'customer', 'customer', $account],
        $message
    );
}

function getDefaultTemplates() {
    return [
        [
            'id' => 1,
            'name' => 'Payment Reminder',
            'message' => 'Dear customer, this is a friendly reminder that your internet subscription payment is due. Please pay to avoid service interruption. Thank you - TonyCom Networks',
            'variables' => ''
        ],
        [
            'id' => 2,
            'name' => 'Service Activation',
            'message' => 'Dear customer, your internet service has been activated successfully. Welcome to TonyCom Networks! For support call us or visit our office.',
            'variables' => ''
        ],
        [
            'id' => 3,
            'name' => 'Maintenance Notice',
            'message' => 'Dear customer, we will be carrying out scheduled maintenance on our network. You may experience brief interruptions. We apologize for the inconvenience. - TonyCom Networks',
            'variables' => ''
        ],
        [
            'id' => 4,
            'name' => 'Service Suspension Warning',
            'message' => 'Dear customer, your account is overdue. Your service will be suspended if payment is not received within 24 hours. Please pay now to continue enjoying our services. - TonyCom Networks',
            'variables' => ''
        ],
        [
            'id' => 5,
            'name' => 'Welcome Message',
            'message' => 'Dear customer, welcome to TonyCom Networks! We are excited to have you on board. For support, reach us on our support line. Enjoy fast and reliable internet!',
            'variables' => ''
        ],
        [
            'id' => 6,
            'name' => 'Service Restored',
            'message' => 'Dear customer, your internet service has been restored. Thank you for your payment. Enjoy browsing! - TonyCom Networks',
            'variables' => ''
        ],
        [
            'id' => 7,
            'name' => 'Downtime Apology',
            'message' => 'Dear customer, we apologize for the recent downtime on our network. Service has been fully restored. Thank you for your patience. - TonyCom Networks',
            'variables' => ''
        ],
        [
            'id' => 8,
            'name' => 'New Package Promo',
            'message' => 'Dear customer, exciting news! We have new internet packages at amazing prices. Visit our office or call us to upgrade your plan today. - TonyCom Networks',
            'variables' => ''
        ]
    ];
}

function ensureTables($pdo) {
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS `sms_messages` (
            `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            `customer_id` int(11) DEFAULT NULL,
            `recipient` varchar(20) NOT NULL,
            `message` text NOT NULL,
            `status` enum('pending','sent','failed','delivered') DEFAULT 'pending',
            `api_message_id` varchar(100) DEFAULT NULL,
            `api_response` json DEFAULT NULL,
            `campaign_id` bigint(20) UNSIGNED DEFAULT NULL,
            `scheduled_at` datetime DEFAULT NULL,
            `sent_at` datetime DEFAULT NULL,
            `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
            `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_status` (`status`),
            KEY `idx_created_at` (`created_at`),
            KEY `idx_campaign_id` (`campaign_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        $pdo->exec("CREATE TABLE IF NOT EXISTS `sms_campaigns` (
            `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            `name` varchar(255) NOT NULL,
            `message` text NOT NULL,
            `target_type` enum('all','active','expired','group','custom') DEFAULT 'custom',
            `total_recipients` int(11) DEFAULT 0,
            `sent_count` int(11) DEFAULT 0,
            `failed_count` int(11) DEFAULT 0,
            `status` enum('draft','sending','completed','failed','partial') DEFAULT 'draft',
            `created_by` int(11) DEFAULT NULL,
            `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
            `completed_at` datetime DEFAULT NULL,
            PRIMARY KEY (`id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        $pdo->exec("CREATE TABLE IF NOT EXISTS `sms_templates` (
            `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            `name` varchar(255) NOT NULL,
            `message` text NOT NULL,
            `variables` varchar(255) DEFAULT NULL,
            `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    } catch (Exception $e) {
        error_log('Ensure tables error: ' . $e->getMessage());
    }
}
