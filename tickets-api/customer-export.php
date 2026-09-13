<?php
/**
 * Customer Export API
 * Provides customer data for viewing and CSV download
 * 
 * GET ?action=list     - Paginated customer list with search/filter
 * GET ?action=export   - Full CSV export (streams download)
 * GET ?action=stats    - Quick customer stats
 */

require_once __DIR__ . '/helpers.php';

setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$user = checkAuth();
$pdo = getDB();

$action = $_GET['action'] ?? 'list';

try {
    switch ($action) {
        case 'list':
            getCustomerList($pdo);
            break;
        case 'export':
            exportCustomersCSV($pdo);
            break;
        case 'stats':
            getCustomerStats($pdo);
            break;
        default:
            jsonResponse(['success' => false, 'message' => 'Invalid action. Use: list, export, stats'], 400);
    }
} catch (Exception $e) {
    jsonResponse(['success' => false, 'message' => $e->getMessage()], 500);
}

/**
 * Get paginated customer list with search, filter, sort
 */
function getCustomerList($pdo) {
    $search = $_GET['search'] ?? '';
    $status = $_GET['status'] ?? '';
    $page = max(1, (int)($_GET['page'] ?? 1));
    $perPage = min(100, max(10, (int)($_GET['per_page'] ?? 50)));
    $sortBy = $_GET['sort_by'] ?? 'name';
    $sortDir = strtoupper($_GET['sort_dir'] ?? 'ASC') === 'DESC' ? 'DESC' : 'ASC';
    
    $offset = ($page - 1) * $perPage;
    
    // Build WHERE
    $where = ["c.deleted_at IS NULL"];
    $params = [];
    
    if (!empty($search)) {
        $where[] = "(c.name LIKE ? OR c.phone_number LIKE ? OR u.email LIKE ?)";
        $term = "%$search%";
        $params = array_merge($params, [$term, $term, $term]);
    }
    
    if ($status === 'active') {
        $where[] = "c.status = 'active'";
    } elseif ($status === 'inactive') {
        $where[] = "(c.status != 'active' OR c.status IS NULL)";
    }
    
    $whereSQL = 'WHERE ' . implode(' AND ', $where);
    
    // Allowed sort columns
    $allowedSort = ['name', 'phone_number', 'created_at', 'updated_at', 'id', 'status', 'address', 'location'];
    $ticketMatch = "t.deleted_at IS NULL AND (
        t.customer_id = c.id
        OR (
            (t.customer_id IS NULL OR t.customer_id = 0)
            AND c.phone_number IS NOT NULL
            AND CHAR_LENGTH(TRIM(c.phone_number)) > 0
            AND RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(t.customer_phone, ''), '+', ''), ' ', ''), '-', ''), '.', ''), 9)
              = RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(c.phone_number, ''), '+', ''), ' ', ''), '-', ''), '.', ''), 9)
        )
    )";
    $latestTicketOrder = "ORDER BY t.updated_at DESC LIMIT 1";
    $ticketUpdatedSub = "(SELECT t.updated_at FROM tickets t WHERE $ticketMatch $latestTicketOrder)";
    $ticketCreatedSub = "(SELECT t.created_at FROM tickets t WHERE $ticketMatch $latestTicketOrder)";
    if ($sortBy === 'updated_at') {
        $sortCol = "COALESCE($ticketUpdatedSub, c.updated_at)";
    } elseif ($sortBy === 'created_at') {
        $sortCol = "COALESCE($ticketCreatedSub, c.created_at)";
    } else {
        $sortCol = in_array($sortBy, $allowedSort) ? "c.$sortBy" : 'c.name';
    }
    
    // Count
    $countStmt = $pdo->prepare("SELECT COUNT(*) as total FROM customers c LEFT JOIN users u ON c.user_id = u.id $whereSQL");
    $countStmt->execute($params);
    $total = (int)$countStmt->fetch()['total'];
    
    // Data
    $sql = "
        SELECT 
            c.id,
            c.name,
            c.phone_number,
            u.email,
            c.address,
            c.location,
            c.city,
            c.status,
            c.latitude,
            c.longitude,
            c.referral_code,
            c.notes,
            c.created_at,
            c.updated_at,
            $ticketCreatedSub as ticket_created_at,
            $ticketUpdatedSub as ticket_updated_at,
            COALESCE(
                (SELECT GROUP_CONCAT(COALESCE(p.title, s.plan_name) SEPARATOR ', ')
                 FROM services s LEFT JOIN plans p ON s.plan_id = p.id
                 WHERE s.customer_id = c.id), ''
            ) as plans,
            COALESCE(
                (SELECT JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'plan', COALESCE(p.title, s.plan_name),
                        'ip', s.mikrotik_ipv4,
                        'status', s.status,
                        'online', s.online
                    )
                )
                FROM services s LEFT JOIN plans p ON s.plan_id = p.id
                WHERE s.customer_id = c.id), '[]'
            ) as services_json,
            COALESCE((
                SELECT SUM(amount) FROM balances 
                WHERE balanceable_type = 'App\\\\Models\\\\Customer' AND balanceable_id = c.id
            ), 0) as balance
        FROM customers c
        LEFT JOIN users u ON c.user_id = u.id
        $whereSQL
        ORDER BY $sortCol $sortDir
        LIMIT $perPage OFFSET $offset
    ";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Parse services JSON
    foreach ($rows as &$row) {
        $row['balance'] = (float)$row['balance'];
        $services = json_decode($row['services_json'] ?? '[]', true);
        if (is_array($services)) {
            foreach ($services as &$svc) {
                if (isset($svc['status'])) {
                    $parsed = json_decode($svc['status'], true);
                    $svc['status_label'] = $parsed['label'] ?? $svc['status'];
                } else {
                    $svc['status_label'] = 'Unknown';
                }
            }
        }
        $row['services'] = $services ?: [];
        unset($row['services_json']);
    }
    
    jsonResponse([
        'success' => true,
        'data' => $rows,
        'pagination' => [
            'page' => $page,
            'per_page' => $perPage,
            'total' => $total,
            'total_pages' => (int)ceil($total / $perPage)
        ]
    ]);
}

/**
 * Export all customers as CSV download
 */
function exportCustomersCSV($pdo) {
    $search = $_GET['search'] ?? '';
    $status = $_GET['status'] ?? '';
    
    $where = ["c.deleted_at IS NULL"];
    $params = [];
    
    if (!empty($search)) {
        $where[] = "(c.name LIKE ? OR c.phone_number LIKE ? OR u.email LIKE ?)";
        $term = "%$search%";
        $params = array_merge($params, [$term, $term, $term]);
    }
    
    if ($status === 'active') {
        $where[] = "c.status = 'active'";
    } elseif ($status === 'inactive') {
        $where[] = "(c.status != 'active' OR c.status IS NULL)";
    }
    
    $whereSQL = 'WHERE ' . implode(' AND ', $where);
    
    $sql = "
        SELECT 
            c.id,
            c.name,
            c.phone_number,
            u.email,
            c.address,
            c.location,
            c.city,
            c.status,
            c.latitude,
            c.longitude,
            c.referral_code,
            c.notes,
            c.created_at,
            COALESCE(
                (SELECT GROUP_CONCAT(COALESCE(p.title, s.plan_name) SEPARATOR ' | ')
                 FROM services s LEFT JOIN plans p ON s.plan_id = p.id
                 WHERE s.customer_id = c.id), ''
            ) as plans,
            COALESCE((
                SELECT SUM(amount) FROM balances 
                WHERE balanceable_type = 'App\\\\Models\\\\Customer' AND balanceable_id = c.id
            ), 0) as balance
        FROM customers c
        LEFT JOIN users u ON c.user_id = u.id
        $whereSQL
        ORDER BY c.name ASC
    ";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    
    // Stream CSV
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="customers_' . date('Y-m-d_His') . '.csv"');
    header('Cache-Control: no-cache, no-store, must-revalidate');
    
    $output = fopen('php://output', 'w');
    
    // BOM for Excel UTF-8
    fprintf($output, chr(0xEF).chr(0xBB).chr(0xBF));
    
    // Header row
    fputcsv($output, [
        'ID', 'Name', 'Phone', 'Email', 'Address', 'Location', 'City',
        'Status', 'Latitude', 'Longitude', 'Referral Code', 'Notes',
        'Plans', 'Balance (KSh)', 'Created'
    ]);
    
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        fputcsv($output, [
            $row['id'],
            $row['name'],
            $row['phone_number'],
            $row['email'],
            $row['address'],
            $row['location'],
            $row['city'],
            $row['status'],
            $row['latitude'],
            $row['longitude'],
            $row['referral_code'],
            $row['notes'],
            $row['plans'],
            number_format((float)$row['balance'], 2),
            $row['created_at']
        ]);
    }
    
    fclose($output);
    exit;
}

/**
 * Direct main-database customer report (not dashboard aggregates).
 */
function getCustomerStats($pdo) {
    $q1 = function (string $sql) use ($pdo) {
        return (int)$pdo->query($sql)->fetch(PDO::FETCH_ASSOC)['c'];
    };
    $qAll = function (string $sql) use ($pdo) {
        return $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
    };

    $stats = [
        'database' => 'tonycommgroupltd_db',
        'source' => 'direct_sql',
        'generated_at' => date('c'),
        'customers_table' => [
            'total_all_rows' => $q1('SELECT COUNT(*) AS c FROM customers'),
            'total_not_deleted' => $q1("SELECT COUNT(*) AS c FROM customers WHERE deleted_at IS NULL"),
            'total_deleted' => $q1("SELECT COUNT(*) AS c FROM customers WHERE deleted_at IS NOT NULL"),
            'with_phone' => $q1("SELECT COUNT(*) AS c FROM customers WHERE deleted_at IS NULL AND phone_number IS NOT NULL AND TRIM(phone_number) != ''"),
            'without_phone' => $q1("SELECT COUNT(*) AS c FROM customers WHERE deleted_at IS NULL AND (phone_number IS NULL OR TRIM(phone_number) = '')"),
            'new_last_7_days' => $q1("SELECT COUNT(*) AS c FROM customers WHERE deleted_at IS NULL AND created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)"),
            'new_this_month' => $q1("SELECT COUNT(*) AS c FROM customers WHERE deleted_at IS NULL AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')"),
            'by_account_status' => $qAll("
                SELECT COALESCE(status, '(null)') AS status, COUNT(*) AS count
                FROM customers WHERE deleted_at IS NULL
                GROUP BY status ORDER BY count DESC
            "),
        ],
        'services_table' => [
            'total_service_rows' => $q1('SELECT COUNT(*) AS c FROM services'),
            'total_not_deleted' => $q1("SELECT COUNT(*) AS c FROM services WHERE deleted_at IS NULL"),
            'distinct_customers_with_any_service' => $q1("SELECT COUNT(DISTINCT customer_id) AS c FROM services WHERE deleted_at IS NULL"),
            'distinct_active_service' => $q1("
                SELECT COUNT(DISTINCT customer_id) AS c FROM services
                WHERE deleted_at IS NULL AND JSON_EXTRACT(status, '$.value') = 2
            "),
            'distinct_blocked_service' => $q1("
                SELECT COUNT(DISTINCT customer_id) AS c FROM services
                WHERE deleted_at IS NULL AND JSON_EXTRACT(status, '$.value') = 1
            "),
            'by_service_status' => $qAll("
                SELECT JSON_UNQUOTE(JSON_EXTRACT(status, '$.label')) AS status_label,
                       JSON_EXTRACT(status, '$.value') AS status_value,
                       COUNT(*) AS service_count,
                       COUNT(DISTINCT customer_id) AS customer_count
                FROM services WHERE deleted_at IS NULL AND status IS NOT NULL
                GROUP BY status_value, status_label ORDER BY customer_count DESC
            "),
        ],
        'cross_reference' => [
            'customers_with_no_service' => $q1("
                SELECT COUNT(*) AS c FROM customers c
                WHERE c.deleted_at IS NULL
                AND NOT EXISTS (SELECT 1 FROM services s WHERE s.customer_id = c.id AND s.deleted_at IS NULL)
            "),
            'customers_with_active_service' => $q1("
                SELECT COUNT(DISTINCT c.id) AS c FROM customers c
                INNER JOIN services s ON s.customer_id = c.id AND s.deleted_at IS NULL
                WHERE c.deleted_at IS NULL AND JSON_EXTRACT(s.status, '$.value') = 2
            "),
        ],
        // Legacy fields kept for existing UI
        'total' => $q1("SELECT COUNT(*) AS c FROM customers WHERE deleted_at IS NULL"),
        'active' => $q1("SELECT COUNT(*) AS c FROM customers WHERE deleted_at IS NULL AND status = 'active'"),
        'inactive' => 0,
        'with_services' => $q1("SELECT COUNT(DISTINCT customer_id) AS c FROM services WHERE deleted_at IS NULL"),
    ];
    $stats['inactive'] = $stats['total'] - $stats['active'];

    jsonResponse(['success' => true, 'stats' => $stats]);
}
