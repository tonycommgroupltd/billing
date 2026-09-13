<?php
/**
 * Splynx Services API - Proxy to VPS for live customer services data
 */

require_once __DIR__ . '/helpers.php';

setCorsHeaders();
$user = checkAuth();
$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// VPS API config
$VPS_API_URL = 'http://78.159.111.191:3500/api/splynx';
$VPS_API_KEY = 'tcom-splynx-proxy-2026';

function callVpsApi($endpoint, $params = []) {
    global $VPS_API_URL, $VPS_API_KEY;
    
    $url = $VPS_API_URL . $endpoint;
    if (!empty($params)) {
        $url .= '?' . http_build_query($params);
    }
    
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_HTTPHEADER => [
            'X-Api-Key: ' . $VPS_API_KEY,
            'Content-Type: application/json'
        ]
    ]);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    
    if ($error) {
        return ['error' => 'VPS API unreachable: ' . $error, 'status' => 503];
    }
    
    return ['data' => json_decode($response, true), 'status' => $httpCode];
}

if ($method === 'GET') {
    // Check if this is an export request
    $isExport = strpos($path, '/export') !== false || ($_GET['action'] ?? '') === 'export';
    
    $params = [];
    if (isset($_GET['page'])) $params['page'] = (int)$_GET['page'];
    if (isset($_GET['per_page'])) $params['per_page'] = (int)$_GET['per_page'];
    if (isset($_GET['search'])) $params['search'] = $_GET['search'];
    if (isset($_GET['status'])) $params['status'] = $_GET['status'];
    if (isset($_GET['has_balance'])) $params['has_balance'] = $_GET['has_balance'];
    
    $endpoint = $isExport ? '/services/export' : '/services';
    $result = callVpsApi($endpoint, $params);
    
    if (isset($result['error'])) {
        http_response_code($result['status']);
        echo json_encode(['success' => false, 'message' => $result['error']]);
        exit;
    }
    
    if ($isExport && isset($result['data']['data'])) {
        // Generate CSV for download
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="splynx_services_' . date('Y-m-d') . '.csv"');
        
        $output = fopen('php://output', 'w');
        // BOM for Excel
        fprintf($output, chr(0xEF).chr(0xBB).chr(0xBF));
        
        fputcsv($output, ['Customer ID', 'Customer Name', 'Phone', 'City', 'Plan', 'Price', 'Balance', 'Status', 'Start Date', 'Bill To', 'Billing Type', 'PPPoE Username']);
        
        foreach ($result['data']['data'] as $row) {
            fputcsv($output, [
                $row['customer_id'] ?? '',
                $row['customer_name'] ?? '',
                $row['phone_number'] ?? '',
                $row['city'] ?? '',
                $row['plan_name'] ?? '',
                $row['price'] ?? 0,
                $row['balance'] ?? 0,
                is_array($row['status'] ?? null) ? ($row['status']['label'] ?? '') : ($row['status'] ?? ''),
                isset($row['start_date']) ? substr($row['start_date'], 0, 10) : '',
                isset($row['bill_to']) ? substr($row['bill_to'], 0, 10) : '',
                is_array($row['billing_type'] ?? null) ? ($row['billing_type']['label'] ?? '') : ($row['billing_type'] ?? ''),
                $row['mikrotik_name'] ?? ''
            ]);
        }
        
        fclose($output);
        exit;
    }
    
    echo json_encode($result['data']);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
