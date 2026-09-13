<?php
/**
 * Automatic KRA eTIMS invoicing — queue from Splynx/Tonycomm payments, mixed PIN + walk-in.
 *
 * GET  /api/kra-auto/status
 * GET  /api/kra-auto/pending
 * GET  /api/kra-auto/receipts
 * POST /api/kra-auto/process          — process pending payments (cron or manual)
 * POST /api/kra-auto/invoice-payment  — { "payment_id": 123 }
 * GET  /api/kra-auto/customer-pin/:customerId
 * PUT  /api/kra-auto/customer-pin/:customerId  — { "kra_pin": "P..." | "" }
 * GET  /api/kra-auto/track?q=phone-or-id     — Splynx customer + payments + eTIMS status
 */

date_default_timezone_set('Africa/Nairobi');

require_once __DIR__ . '/helpers.php';

setCorsHeaders();
header('Content-Type: application/json');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    exit;
}

checkAuth();
$pdo = getDB();

define('KRA_NODE_API', 'http://78.159.111.191:3500/api');
define('KRA_NODE_KEY', 'tcom-api-key-2024');
define('KRA_DEFAULT_ITEM', 'KE3NTXNOX00002');

function kraAutoEnsureTables(PDO $pdo) {
    $pdo->exec("CREATE TABLE IF NOT EXISTS kra_customer_pins (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        customer_id INT UNSIGNED NOT NULL,
        phone VARCHAR(32) NULL,
        kra_pin VARCHAR(32) NULL,
        walk_in TINYINT(1) NOT NULL DEFAULT 0,
        synced_at DATETIME NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_customer (customer_id),
        KEY idx_phone (phone)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS kra_invoice_records (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        payment_id INT UNSIGNED NULL,
        customer_id INT UNSIGNED NULL,
        phone VARCHAR(32) NULL,
        trans_id VARCHAR(64) NULL,
        trader_invoice_no VARCHAR(128) NULL,
        scu_receipt_no VARCHAR(64) NULL,
        amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        customer_pin VARCHAR(32) NULL,
        walk_in TINYINT(1) NOT NULL DEFAULT 0,
        verification_url TEXT NULL,
        signature TEXT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        error_message TEXT NULL,
        raw_response JSON NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_payment (payment_id),
        KEY idx_trader (trader_invoice_no),
        KEY idx_phone (phone),
        KEY idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS kra_auto_settings (
        id TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        lookback_hours INT NOT NULL DEFAULT 72,
        min_amount DECIMAL(12,2) NOT NULL DEFAULT 1,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("INSERT IGNORE INTO kra_auto_settings (id, enabled) VALUES (1, 1)");
}

function kraAutoNodeRequest($method, $path, $body = null) {
    $url = rtrim(KRA_NODE_API, '/') . $path;
    $ch = curl_init($url);
    $headers = [
        'Accept: application/json',
        'Content-Type: application/json',
        'x-api-key: ' . KRA_NODE_KEY,
    ];
    $token = getAuthToken();
    if ($token) {
        $headers[] = 'Authorization: Bearer ' . $token;
    }
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => strtoupper($method),
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_TIMEOUT => 90,
    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }
    $raw = curl_exec($ch);
    $errno = curl_errno($ch);
    $error = curl_error($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($errno) {
        return ['ok' => false, 'status' => 502, 'data' => ['error' => 'Node API unreachable: ' . $error]];
    }
    $data = json_decode($raw, true);
    if ($data === null && $raw !== '' && $raw !== 'null') {
        return ['ok' => false, 'status' => $status ?: 502, 'data' => ['error' => 'Invalid JSON from Node API', 'raw' => substr((string)$raw, 0, 500)]];
    }
    return ['ok' => $status >= 200 && $status < 300, 'status' => $status, 'data' => $data];
}

function kraAutoMapPaymentType($paymentType) {
    $t = strtolower(trim((string)$paymentType));
    if (strpos($t, 'mpesa') !== false || strpos($t, 'mobile') !== false) {
        return '06';
    }
    if (strpos($t, 'cheque') !== false || strpos($t, 'check') !== false) {
        return '04';
    }
    if (strpos($t, 'card') !== false) {
        return '05';
    }
    if (strpos($t, 'credit') !== false) {
        return '02';
    }
    return '01';
}

function kraAutoBuildVerificationUrl($signature) {
    if (!$signature) {
        return null;
    }
    $config = loadAppConfig();
    $base = $config['kra_receipt_verify_base_url']
        ?? 'https://etims-sbx.kra.go.ke/common/link/etims/receipt/indexEtimsReceiptData?Data=';
    $prefix = $config['kra_receipt_data_prefix'] ?? 'P051885316K08';
    return $base . $prefix . rawurlencode($signature);
}

function kraAutoNormalizePhone($phone) {
    $digits = preg_replace('/\D+/', '', (string)$phone);
    if (strlen($digits) === 12 && strpos($digits, '254') === 0) {
        return '0' . substr($digits, 3);
    }
    if (strlen($digits) === 9) {
        return '0' . $digits;
    }
    return $digits;
}

function kraAutoGetBackupSyncConfig() {
    $res = kraAutoNodeRequest('GET', '/backup-sync/config');
    if (!$res['ok']) {
        return ['ok' => false, 'error' => $res['data']['error'] ?? 'Backup sync config unavailable', 'data' => null];
    }
    return ['ok' => true, 'data' => $res['data'] ?? []];
}

function kraAutoGetAllowlistedIds(array $config = null) {
    if ($config === null) {
        $loaded = kraAutoGetBackupSyncConfig();
        $config = $loaded['data'] ?? [];
    }
    $ids = $config['customerIds'] ?? [];
    if (!is_array($ids)) {
        return [];
    }
    return array_values(array_unique(array_map('intval', $ids)));
}

function kraAutoIsAllowlisted($customerId, array $allowlist) {
    if (empty($allowlist)) {
        return false;
    }
    return in_array((int)$customerId, $allowlist, true);
}

function kraAutoPaymentCustomerId(PDO $pdo, $paymentId) {
    $stmt = $pdo->prepare('SELECT customer_id FROM payments WHERE id = ? LIMIT 1');
    $stmt->execute([(int)$paymentId]);
    return (int)$stmt->fetchColumn();
}

function kraAutoFetchSplynxContext($query) {
    $q = trim((string)$query);
    if ($q === '') {
        return null;
    }
    $workflow = kraAutoNodeRequest('GET', '/kra/workflow/customer/' . rawurlencode($q));
    if (!$workflow['ok'] || empty($workflow['data']['context'])) {
        return null;
    }
    return $workflow['data']['context'];
}

function kraAutoTrackCustomer(PDO $pdo, $query) {
    $q = trim((string)$query);
    if ($q === '') {
        return ['success' => false, 'error' => 'Search query required (phone or customer ID)'];
    }

    $backupCfg = kraAutoGetBackupSyncConfig();
    $config = $backupCfg['data'] ?? [];
    $allowlist = kraAutoGetAllowlistedIds($config);
    $inListFromConfig = function ($customerId) use ($config) {
        foreach (($config['customers'] ?? []) as $row) {
            if ((int)($row['id'] ?? 0) === (int)$customerId) {
                return $row;
            }
        }
        return null;
    };

    $splynxCustomers = [];
    $digits = preg_replace('/\D+/', '', $q);
    $looksLikeId = preg_match('/^\d+$/', $q) && strlen($q) <= 8;

    if ($looksLikeId) {
        $ctx = kraAutoFetchSplynxContext($q);
        if ($ctx && !empty($ctx['customer'])) {
            $splynxCustomers[] = $ctx;
        } else {
            $cfgRow = $inListFromConfig((int)$q);
            if ($cfgRow) {
                $splynxCustomers[] = [
                    'customer' => [
                        'id' => (int)$cfgRow['id'],
                        'name' => $cfgRow['name'] ?? '',
                        'phone' => $cfgRow['phone_number'] ?? '',
                    ],
                    'activeServices' => array_map(function ($plan) {
                        return ['title' => $plan, 'planTitle' => $plan, 'active' => true];
                    }, $cfgRow['active_plans'] ?? []),
                    'monthlyAmount' => (float)($cfgRow['monthly_amount'] ?? 0),
                    'payments' => [],
                ];
            }
        }
    } else {
        $lookup = kraAutoNodeRequest('GET', '/backup-sync/customers/lookup?phone=' . rawurlencode($q));
        $lookupRows = is_array($lookup['data']['customers'] ?? null) ? $lookup['data']['customers'] : [];
        foreach ($lookupRows as $row) {
            $phone = $row['phone_number'] ?? $q;
            $ctx = kraAutoFetchSplynxContext($phone);
            if ($ctx) {
                $splynxCustomers[] = $ctx;
            } else {
                $splynxCustomers[] = [
                    'customer' => [
                        'id' => (int)($row['id'] ?? 0),
                        'name' => $row['name'] ?? '',
                        'phone' => $phone,
                    ],
                    'activeServices' => [],
                    'monthlyAmount' => 0,
                    'payments' => [],
                ];
            }
        }
        if (empty($splynxCustomers) && strlen($digits) >= 9) {
            $ctx = kraAutoFetchSplynxContext($q);
            if ($ctx) {
                $splynxCustomers[] = $ctx;
            }
        }
    }

    if (empty($splynxCustomers)) {
        return ['success' => true, 'found' => false, 'query' => $q, 'customers' => []];
    }

    $results = [];
    foreach ($splynxCustomers as $ctx) {
        $cust = $ctx['customer'] ?? [];
        $customerId = (int)($cust['id'] ?? 0);
        $phone = kraAutoNormalizePhone($cust['phone'] ?? '');

        $localStmt = $pdo->prepare('SELECT id, name, phone_number, city FROM customers WHERE id = ? AND deleted_at IS NULL LIMIT 1');
        $localStmt->execute([$customerId]);
        $localCustomer = $localStmt->fetch();

        $pinStmt = $pdo->prepare('SELECT kra_pin, walk_in FROM kra_customer_pins WHERE customer_id = ? LIMIT 1');
        $pinStmt->execute([$customerId]);
        $pinRow = $pinStmt->fetch();

        $tonyPaymentsStmt = $pdo->prepare("
            SELECT p.id AS payment_id, p.trans_id, p.sum AS amount, p.payment_type, p.date,
                   r.status AS kra_status, r.trader_invoice_no, r.scu_receipt_no,
                   r.verification_url, r.error_message AS kra_error, r.created_at AS kra_at
            FROM payments p
            LEFT JOIN kra_invoice_records r ON r.payment_id = p.id
            WHERE p.customer_id = ?
            ORDER BY p.date DESC
            LIMIT 50
        ");
        $tonyPaymentsStmt->execute([$customerId]);
        $tonyPayments = $tonyPaymentsStmt->fetchAll();

        $tonyByTrans = [];
        foreach ($tonyPayments as $tp) {
            $tid = strtoupper(trim((string)($tp['trans_id'] ?? '')));
            if ($tid !== '') {
                $tonyByTrans[$tid] = $tp;
            }
        }

        $merged = [];
        $seenTony = [];
        foreach (($ctx['payments'] ?? []) as $sp) {
            $transId = strtoupper(trim((string)($sp['transId'] ?? $sp['trans_id'] ?? '')));
            $tony = $transId !== '' ? ($tonyByTrans[$transId] ?? null) : null;
            if ($tony) {
                $seenTony[(int)$tony['payment_id']] = true;
            }
            $kraStatus = $tony ? ($tony['kra_status'] ?? 'none') : 'not_synced';
            if ($kraStatus === null || $kraStatus === '') {
                $kraStatus = 'none';
            }
            $merged[] = [
                'splynx_payment_id' => (int)($sp['id'] ?? 0),
                'tonycomm_payment_id' => $tony ? (int)$tony['payment_id'] : null,
                'trans_id' => $transId ?: null,
                'amount' => (float)($tony['amount'] ?? $sp['amount'] ?? 0),
                'date' => $tony['date'] ?? $sp['date'] ?? null,
                'payment_type' => $tony['payment_type'] ?? null,
                'source' => $tony ? 'tonycomm' : 'splynx',
                'kra_status' => $kraStatus,
                'trader_invoice_no' => $tony['trader_invoice_no'] ?? null,
                'scu_receipt_no' => $tony['scu_receipt_no'] ?? null,
                'verification_url' => $tony['verification_url'] ?? null,
                'kra_error' => $tony['kra_error'] ?? null,
                'kra_at' => $tony['kra_at'] ?? null,
            ];
        }

        foreach ($tonyPayments as $tp) {
            $pid = (int)$tp['payment_id'];
            if (!empty($seenTony[$pid])) {
                continue;
            }
            $kraStatus = $tp['kra_status'] ?? 'none';
            if ($kraStatus === null || $kraStatus === '') {
                $kraStatus = 'none';
            }
            $merged[] = [
                'splynx_payment_id' => null,
                'tonycomm_payment_id' => $pid,
                'trans_id' => $tp['trans_id'] ?? null,
                'amount' => (float)$tp['amount'],
                'date' => $tp['date'],
                'payment_type' => $tp['payment_type'] ?? null,
                'source' => 'tonycomm',
                'kra_status' => $kraStatus,
                'trader_invoice_no' => $tp['trader_invoice_no'] ?? null,
                'scu_receipt_no' => $tp['scu_receipt_no'] ?? null,
                'verification_url' => $tp['verification_url'] ?? null,
                'kra_error' => $tp['kra_error'] ?? null,
                'kra_at' => $tp['kra_at'] ?? null,
            ];
        }

        usort($merged, function ($a, $b) {
            return strcmp((string)($b['date'] ?? ''), (string)($a['date'] ?? ''));
        });

        $kraInvoiced = 0;
        $kraPending = 0;
        $totalPaid = 0;
        foreach ($merged as $row) {
            $totalPaid += (float)$row['amount'];
            if ($row['kra_status'] === 'sent') {
                $kraInvoiced++;
            } elseif (in_array($row['kra_status'], ['none', 'failed', 'pending'], true) && $row['tonycomm_payment_id']) {
                $kraPending++;
            }
        }

        $activePlans = [];
        foreach (($ctx['activeServices'] ?? []) as $svc) {
            $title = $svc['planTitle'] ?? $svc['title'] ?? '';
            if ($title !== '') {
                $activePlans[] = $title;
            }
        }

        $cfgRow = $inListFromConfig($customerId);
        $results[] = [
            'id' => $customerId,
            'name' => $cust['name'] ?? ($localCustomer['name'] ?? ''),
            'phone' => $phone ?: kraAutoNormalizePhone($localCustomer['phone_number'] ?? ''),
            'city' => $cust['city'] ?? ($localCustomer['city'] ?? null),
            'address' => $cust['address'] ?? null,
            'active_plans' => $activePlans,
            'monthly_amount' => (float)($ctx['monthlyAmount'] ?? ($cfgRow['monthly_amount'] ?? 0)),
            'in_tonycomm_db' => (bool)$localCustomer,
            'in_backup_sync_list' => kraAutoIsAllowlisted($customerId, $allowlist),
            'kra_eligible' => kraAutoIsAllowlisted($customerId, $allowlist),
            'kra_pin' => $pinRow['kra_pin'] ?? null,
            'walk_in' => !empty($pinRow['walk_in']) || empty($pinRow['kra_pin']),
            'payments' => $merged,
            'summary' => [
                'payment_count' => count($merged),
                'total_paid' => round($totalPaid, 2),
                'kra_invoiced' => $kraInvoiced,
                'kra_pending' => $kraPending,
            ],
        ];
    }

    return [
        'success' => true,
        'found' => true,
        'query' => $q,
        'customers' => $results,
        'backup_sync' => [
            'mode' => $config['mode'] ?? 'selective',
            'selected_count' => count($allowlist),
        ],
    ];
}

function kraAutoResolveCustomerPin(PDO $pdo, $customerId, $phone) {
    $stmt = $pdo->prepare('SELECT kra_pin, walk_in FROM kra_customer_pins WHERE customer_id = ? LIMIT 1');
    $stmt->execute([(int)$customerId]);
    $row = $stmt->fetch();
    if ($row) {
        $pin = trim((string)($row['kra_pin'] ?? ''));
        if ($pin !== '') {
            return ['pin' => $pin, 'walk_in' => false];
        }
        if (!empty($row['walk_in'])) {
            return ['pin' => '', 'walk_in' => true];
        }
    }
    return ['pin' => '', 'walk_in' => true];
}

function kraAutoInvoicePayment(PDO $pdo, $paymentId) {
    $stmt = $pdo->prepare("
        SELECT p.id, p.customer_id, p.trans_id, p.sum, p.payment_type, p.date,
               c.name AS customer_name, c.phone_number
        FROM payments p
        LEFT JOIN customers c ON c.id = p.customer_id
        WHERE p.id = ?
        LIMIT 1
    ");
    $stmt->execute([(int)$paymentId]);
    $payment = $stmt->fetch();
    if (!$payment) {
        return ['success' => false, 'error' => 'Payment not found'];
    }

    $existing = $pdo->prepare('SELECT id, status, trader_invoice_no FROM kra_invoice_records WHERE payment_id = ? LIMIT 1');
    $existing->execute([(int)$paymentId]);
    $done = $existing->fetch();
    if ($done && $done['status'] === 'sent' && !empty($done['trader_invoice_no'])) {
        return ['success' => true, 'skipped' => true, 'traderInvoiceNo' => $done['trader_invoice_no']];
    }

    $phone = preg_replace('/\D+/', '', (string)($payment['phone_number'] ?? ''));
    if (strlen($phone) === 9) {
        $phone = '0' . $phone;
    }
    if ($phone === '') {
        return ['success' => false, 'error' => 'Customer has no phone number for KRA workflow'];
    }

    $customerId = (int)($payment['customer_id'] ?? 0);
    $allowlist = kraAutoGetAllowlistedIds();
    if (!kraAutoIsAllowlisted($customerId, $allowlist)) {
        return ['success' => false, 'error' => 'Customer is not on the Tonycomm DB / KRA billing list. Add them on Backup Sync first.'];
    }

    $pinInfo = kraAutoResolveCustomerPin($pdo, $customerId, $phone);
    $amount = round((float)$payment['sum'], 2);
    if ($amount <= 0) {
        return ['success' => false, 'error' => 'Payment amount must be greater than zero'];
    }

    $workflow = kraAutoNodeRequest('GET', '/kra/workflow/customer/' . rawurlencode($phone));
    $defaults = is_array($workflow['data']['defaults'] ?? null) ? $workflow['data']['defaults'] : [];
    $itemCode = KRA_DEFAULT_ITEM;
    if (!empty($defaults['itemCode']) && $defaults['itemCode'] !== 'ISP_SUBSCRIPTION') {
        $itemCode = $defaults['itemCode'];
    }

    if ($pinInfo['pin'] !== '') {
        kraAutoNodeRequest('POST', '/kra/workflow/customer/' . rawurlencode($phone) . '/sync-customer', [
            'customerPin' => $pinInfo['pin'],
        ]);
    }

    $payload = [
        'customerPin' => $pinInfo['pin'],
        'itemCode' => $itemCode,
        'itemDescription' => 'INTERNET SERVICES',
        'paymentType' => kraAutoMapPaymentType($payment['payment_type'] ?? ''),
        'quantity' => 1,
        'pkg' => 0,
        'unitPrice' => $amount,
        'amount' => $amount,
        'salesStatusCode' => '06',
        'exchangeRate' => 1,
        'syncCustomerFirst' => $pinInfo['pin'] !== '',
        'transId' => $payment['trans_id'] ?? null,
        'paymentId' => (int)$payment['id'],
    ];

    $create = kraAutoNodeRequest(
        'POST',
        '/kra/workflow/customer/' . rawurlencode($phone) . '/create-invoice',
        $payload
    );

    $body = $create['data'] ?? [];
    $inner = $body['data'] ?? $body['invoice'] ?? $body;
    $traderNo = $inner['traderInvoiceNo'] ?? $body['traderInvoiceNo'] ?? null;
    $signature = $inner['signature'] ?? $inner['cuSignature'] ?? $body['signature'] ?? null;
    $verifyUrl = $inner['invoiceVerificationUrl'] ?? $body['invoiceVerificationUrl'] ?? kraAutoBuildVerificationUrl($signature);
    $scuNo = $inner['scuReceiptNo'] ?? $body['scuReceiptNo'] ?? null;
    $ok = $create['ok'] && (
        !empty($body['success'])
        || strtoupper((string)($body['statusCode'] ?? '')) === 'SUCCESS'
        || !empty($traderNo)
    );

    $status = $ok ? 'sent' : 'failed';
    $upsert = $pdo->prepare("
        INSERT INTO kra_invoice_records
            (payment_id, customer_id, phone, trans_id, trader_invoice_no, scu_receipt_no,
             amount, customer_pin, walk_in, verification_url, signature, status, error_message, raw_response)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            trader_invoice_no = VALUES(trader_invoice_no),
            scu_receipt_no = VALUES(scu_receipt_no),
            verification_url = VALUES(verification_url),
            signature = VALUES(signature),
            status = VALUES(status),
            error_message = VALUES(error_message),
            raw_response = VALUES(raw_response)
    ");
    $upsert->execute([
        (int)$payment['id'],
        $customerId ?: null,
        $phone,
        $payment['trans_id'] ?? null,
        $traderNo,
        $scuNo ? (string)$scuNo : null,
        $amount,
        $pinInfo['pin'] ?: null,
        $pinInfo['walk_in'] ? 1 : 0,
        $verifyUrl,
        $signature,
        $status,
        $ok ? null : ($body['error'] ?? $body['message'] ?? 'Invoice creation failed'),
        json_encode($body),
    ]);

    return [
        'success' => $ok,
        'traderInvoiceNo' => $traderNo,
        'verificationUrl' => $verifyUrl,
        'walkIn' => $pinInfo['walk_in'],
        'customerPin' => $pinInfo['pin'] ?: null,
        'error' => $ok ? null : ($body['error'] ?? $body['message'] ?? 'Invoice creation failed'),
        'raw' => $body,
    ];
}

kraAutoEnsureTables($pdo);

$uriPath = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?: '/';
$segments = array_values(array_filter(explode('/', trim($uriPath, '/'))));
$base = array_search('kra-auto', $segments, true);
$sub = ($base !== false && isset($segments[$base + 1])) ? $segments[$base + 1] : '';
$subId = ($base !== false && isset($segments[$base + 2])) ? $segments[$base + 2] : '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    if ($method === 'GET' && ($sub === '' || $sub === 'status')) {
        $settings = $pdo->query('SELECT enabled, lookback_hours, min_amount FROM kra_auto_settings WHERE id = 1')->fetch();
        $counts = $pdo->query("
            SELECT
              SUM(status = 'sent') AS sent,
              SUM(status = 'failed') AS failed,
              SUM(status = 'pending') AS pending
            FROM kra_invoice_records
        ")->fetch();
        echo json_encode([
            'success' => true,
            'enabled' => (bool)($settings['enabled'] ?? true),
            'lookbackHours' => (int)($settings['lookback_hours'] ?? 72),
            'minAmount' => (float)($settings['min_amount'] ?? 1),
            'counts' => $counts,
        ]);
        exit;
    }

    if ($method === 'GET' && $sub === 'track') {
        $q = trim((string)($_GET['q'] ?? ''));
        echo json_encode(kraAutoTrackCustomer($pdo, $q));
        exit;
    }

    if ($method === 'GET' && $sub === 'customers') {
        $q = trim((string)($_GET['q'] ?? ''));
        $limit = min(100, max(1, (int)($_GET['limit'] ?? 50)));
        $sql = "
            SELECT c.id AS customer_id, c.name, c.phone_number, c.city,
                   k.kra_pin, k.walk_in, k.synced_at
            FROM customers c
            LEFT JOIN kra_customer_pins k ON k.customer_id = c.id
            WHERE c.deleted_at IS NULL
        ";
        $params = [];
        if ($q !== '') {
            $sql .= " AND (c.name LIKE ? OR c.phone_number LIKE ? OR CAST(c.id AS CHAR) = ?)";
            $term = '%' . $q . '%';
            $params[] = $term;
            $params[] = $term;
            $params[] = $q;
        }
        $sql .= " ORDER BY c.name ASC LIMIT ?";
        $stmt = $pdo->prepare($sql);
        foreach ($params as $i => $val) {
            $stmt->bindValue($i + 1, $val);
        }
        $stmt->bindValue(count($params) + 1, $limit, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll();
        foreach ($rows as &$row) {
            $row['has_kra_pin'] = !empty($row['kra_pin']);
            $row['billing_type'] = !empty($row['kra_pin']) ? 'kra_registered' : 'walk_in';
        }
        unset($row);
        echo json_encode(['success' => true, 'customers' => $rows]);
        exit;
    }

    if ($method === 'GET' && $sub === 'pending') {
        $settings = $pdo->query('SELECT lookback_hours, min_amount FROM kra_auto_settings WHERE id = 1')->fetch();
        $hours = max(1, (int)($settings['lookback_hours'] ?? 72));
        $min = (float)($settings['min_amount'] ?? 1);
        $allowlist = kraAutoGetAllowlistedIds();
        $placeholders = '';
        $params = [$hours, $min];
        if (!empty($allowlist)) {
            $placeholders = ' AND c.id IN (' . implode(',', array_fill(0, count($allowlist), '?')) . ')';
            $params = array_merge($params, $allowlist);
        } else {
            echo json_encode(['success' => true, 'pending' => [], 'note' => 'No customers on Backup Sync list']);
            exit;
        }
        $stmt = $pdo->prepare("
            SELECT p.id AS payment_id, p.trans_id, p.sum, p.payment_type, p.date,
                   c.id AS customer_id, c.name, c.phone_number,
                   k.kra_pin, k.walk_in,
                   r.status AS kra_status, r.trader_invoice_no
            FROM payments p
            INNER JOIN customers c ON c.id = p.customer_id
            LEFT JOIN kra_customer_pins k ON k.customer_id = c.id
            LEFT JOIN kra_invoice_records r ON r.payment_id = p.id
            WHERE p.date >= DATE_SUB(NOW(), INTERVAL ? HOUR)
              AND p.sum >= ?
              AND (r.id IS NULL OR r.status = 'failed')
              $placeholders
            ORDER BY p.date DESC
            LIMIT 100
        ");
        $stmt->execute($params);
        echo json_encode(['success' => true, 'pending' => $stmt->fetchAll()]);
        exit;
    }

    if ($method === 'GET' && $sub === 'receipts') {
        $limit = min(100, max(1, (int)($_GET['limit'] ?? 50)));
        $stmt = $pdo->prepare("
            SELECT r.*, c.name AS customer_name
            FROM kra_invoice_records r
            LEFT JOIN customers c ON c.id = r.customer_id
            ORDER BY r.created_at DESC
            LIMIT ?
        ");
        $stmt->bindValue(1, $limit, PDO::PARAM_INT);
        $stmt->execute();
        echo json_encode(['success' => true, 'receipts' => $stmt->fetchAll()]);
        exit;
    }

    if ($method === 'POST' && $sub === 'process') {
        $settings = $pdo->query('SELECT enabled, lookback_hours, min_amount FROM kra_auto_settings WHERE id = 1')->fetch();
        if (empty($settings['enabled'])) {
            echo json_encode(['success' => false, 'error' => 'Automatic KRA invoicing is disabled']);
            exit;
        }
        $hours = max(1, (int)($settings['lookback_hours'] ?? 72));
        $min = (float)($settings['min_amount'] ?? 1);
        $allowlist = kraAutoGetAllowlistedIds();
        if (empty($allowlist)) {
            echo json_encode(['success' => true, 'processed' => 0, 'results' => [], 'note' => 'No customers on Backup Sync list']);
            exit;
        }
        $inList = implode(',', array_map('intval', $allowlist));
        $stmt = $pdo->prepare("
            SELECT p.id FROM payments p
            INNER JOIN customers c ON c.id = p.customer_id
            LEFT JOIN kra_invoice_records r ON r.payment_id = p.id
            WHERE p.date >= DATE_SUB(NOW(), INTERVAL ? HOUR)
              AND p.sum >= ?
              AND c.id IN ($inList)
              AND (r.id IS NULL OR r.status = 'failed')
            ORDER BY p.date ASC
            LIMIT 25
        ");
        $stmt->execute([$hours, $min]);
        $ids = $stmt->fetchAll(PDO::FETCH_COLUMN);
        $results = [];
        foreach ($ids as $pid) {
            $results[] = array_merge(['paymentId' => (int)$pid], kraAutoInvoicePayment($pdo, (int)$pid));
        }
        echo json_encode(['success' => true, 'processed' => count($results), 'results' => $results]);
        exit;
    }

    if ($method === 'POST' && $sub === 'invoice-payment') {
        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        $pid = (int)($input['payment_id'] ?? 0);
        if (!$pid) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'payment_id required']);
            exit;
        }
        echo json_encode(kraAutoInvoicePayment($pdo, $pid));
        exit;
    }

    if ($sub === 'customer-pin' && $subId !== '') {
        $customerId = (int)$subId;
        if ($method === 'GET') {
            $stmt = $pdo->prepare('SELECT customer_id, phone, kra_pin, walk_in, synced_at FROM kra_customer_pins WHERE customer_id = ? LIMIT 1');
            $stmt->execute([$customerId]);
            $row = $stmt->fetch();
            echo json_encode(['success' => true, 'customerPin' => $row ?: null]);
            exit;
        }
        if ($method === 'PUT') {
            $input = json_decode(file_get_contents('php://input'), true) ?: [];
            $pin = strtoupper(trim((string)($input['kra_pin'] ?? '')));
            $walkIn = $pin === '' ? 1 : 0;
            $phoneStmt = $pdo->prepare('SELECT phone_number FROM customers WHERE id = ? LIMIT 1');
            $phoneStmt->execute([$customerId]);
            $phone = $phoneStmt->fetchColumn();
            $upsert = $pdo->prepare("
                INSERT INTO kra_customer_pins (customer_id, phone, kra_pin, walk_in)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE kra_pin = VALUES(kra_pin), walk_in = VALUES(walk_in), phone = VALUES(phone)
            ");
            $upsert->execute([$customerId, $phone, $pin ?: null, $walkIn]);
            echo json_encode(['success' => true, 'customerId' => $customerId, 'kra_pin' => $pin ?: null, 'walk_in' => (bool)$walkIn]);
            exit;
        }
    }

    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'Unknown kra-auto endpoint']);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
