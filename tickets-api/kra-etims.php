<?php
/**
 * KRA eTIMS VSCU proxy — routes catalog/invoice reads to the configured Virtual FD.
 * Workflow (Splynx customer sync, create invoice) stays on Node /api/kra/workflow/*.
 *
 * GET /api/kra-etims/health
 * GET /api/kra-etims/items
 * GET /api/kra-etims/invoices/{traderInvoiceNo}
 */

date_default_timezone_set('Africa/Nairobi');

if (!function_exists('loadAppConfig')) {
    require_once __DIR__ . '/helpers.php';
}

function kraEtimsConfig() {
    $config = loadAppConfig();
    $kra = $config['kra_etims'] ?? [];
    $base = rtrim((string)($kra['base_url'] ?? 'http://127.0.0.1:8888/api/v1'), '/');
    return [
        'base_url' => $base,
        'auth_user' => (string)($kra['auth_user'] ?? 'admin'),
        'auth_pass' => (string)($kra['auth_pass'] ?? 'admin'),
        'timeout' => max(5, (int)($kra['timeout_seconds'] ?? 30)),
    ];
}

function kraEtimsRequestAuthHeader() {
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $vscuHeader = '';
    foreach ($headers as $name => $value) {
        if (strcasecmp($name, 'X-VSCU-Authorization') === 0) {
            $vscuHeader = trim((string)$value);
            break;
        }
    }
    if ($vscuHeader !== '') {
        return $vscuHeader;
    }

    $incoming = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if ($incoming === '') {
        foreach ($headers as $name => $value) {
            if (strcasecmp($name, 'Authorization') === 0) {
                $incoming = $value;
                break;
            }
        }
    }
    $incoming = trim((string)$incoming);
    // Never forward ticketing JWT (Bearer) to the Virtual FD.
    if ($incoming !== '' && stripos($incoming, 'Basic ') === 0) {
        return $incoming;
    }

    $cfg = kraEtimsConfig();
    return 'Basic ' . base64_encode($cfg['auth_user'] . ':' . $cfg['auth_pass']);
}

function kraEtimsClientStatus(array $result) {
    if (!empty($result['ok'])) {
        return 200;
    }
    $status = (int)($result['status'] ?? 502);
    // VSCU auth failures must not surface as 401 to the ticketing app (triggers logout).
    if ($status === 401 || $status === 403) {
        return 502;
    }
    return $status >= 400 ? $status : 502;
}

function kraEtimsProxy($method, $path, $query = '') {
    $cfg = kraEtimsConfig();
    $url = $cfg['base_url'] . $path;
    if ($query !== '') {
        $url .= (strpos($url, '?') === false ? '?' : '&') . ltrim($query, '?');
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => strtoupper($method),
        CURLOPT_HTTPHEADER => [
            'Accept: application/json',
            'Authorization: ' . kraEtimsRequestAuthHeader(),
        ],
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => $cfg['timeout'],
    ]);

    $body = curl_exec($ch);
    $errno = curl_errno($ch);
    $error = curl_error($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($errno) {
        return [
            'ok' => false,
            'status' => 502,
            'payload' => [
                'success' => false,
                'error' => 'VSCU unreachable: ' . $error,
                'vscuUrl' => $url,
            ],
        ];
    }

    $json = json_decode($body, true);
    if ($json === null && $body !== '' && $body !== 'null') {
        return [
            'ok' => false,
            'status' => 502,
            'payload' => [
                'success' => false,
                'error' => 'Invalid JSON from VSCU',
                'vscuUrl' => $url,
                'raw' => substr((string)$body, 0, 500),
            ],
        ];
    }

    return [
        'ok' => $status >= 200 && $status < 300,
        'status' => $status ?: 502,
        'payload' => [
            'success' => $status >= 200 && $status < 300,
            'upstreamStatus' => $status,
            'vscuBaseUrl' => $cfg['base_url'],
            'data' => $json,
            'error' => ($status === 401 || $status === 403)
                ? 'VSCU rejected credentials — check api/config.local.php kra_etims auth_user/auth_pass'
                : null,
        ],
    ];
}

if (!defined('KRA_ETIMS_LIB_ONLY')) {
    setCorsHeaders();
    header('Content-Type: application/json');

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
        exit;
    }

    $uriPath = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?: '/';
    $segments = array_values(array_filter(explode('/', trim($uriPath, '/'))));
    if (!empty($segments) && $segments[0] === 'api') {
        array_shift($segments);
    }

    $base = array_search('kra-etims', $segments, true);
    if ($base === false) {
        $base = array_search('kra-etims.php', $segments, true);
    }
    $subPath = ($base !== false && isset($segments[$base + 1])) ? $segments[$base + 1] : '';
    $subId = ($base !== false && isset($segments[$base + 2])) ? $segments[$base + 2] : '';

    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $query = $_SERVER['QUERY_STRING'] ?? '';

    if ($method === 'GET' && ($subPath === '' || $subPath === 'kra-etims.php')) {
        echo json_encode([
            'success' => true,
            'name' => 'KRA eTIMS VSCU Proxy',
            'vscuBaseUrl' => kraEtimsConfig()['base_url'],
            'endpoints' => [
                'GET /api/kra-etims/health' => 'Probe VSCU connectivity',
                'GET /api/kra-etims/items' => 'Item catalog from Virtual FD',
                'GET /api/kra-etims/invoices/{traderInvoiceNo}' => 'Invoice detail',
            ],
        ]);
        exit;
    }

    if ($method === 'GET' && $subPath === 'health') {
        $result = kraEtimsProxy('GET', '/items', 'limit=1&page=0');
        $items = [];
        if (!empty($result['payload']['data']['data']) && is_array($result['payload']['data']['data'])) {
            $items = $result['payload']['data']['data'];
        }
        http_response_code(kraEtimsClientStatus($result));
        echo json_encode([
            'success' => $result['ok'],
            'vscuReachable' => $result['ok'],
            'vscuBaseUrl' => kraEtimsConfig()['base_url'],
            'itemSampleCount' => count($items),
            'upstream' => $result['payload'],
            'error' => $result['payload']['error'] ?? null,
        ]);
        exit;
    }

    if ($method === 'GET' && $subPath === 'items') {
        $result = kraEtimsProxy('GET', '/items', $query !== '' ? $query : 'limit=200&page=0');
        http_response_code(kraEtimsClientStatus($result));
        echo json_encode($result['payload']);
        exit;
    }

    if ($method === 'GET' && $subPath === 'invoices' && $subId !== '') {
        $traderNo = rawurldecode($subId);
        $result = kraEtimsProxy('GET', '/invoices/' . rawurlencode($traderNo));
        http_response_code(kraEtimsClientStatus($result));
        echo json_encode($result['payload']);
        exit;
    }

    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'Unknown kra-etims endpoint']);
}
