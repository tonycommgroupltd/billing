<?php
/**
 * Dashboard Statistics Endpoint
 * GET /api/dashboard-stats
 */

require_once __DIR__ . '/helpers.php';

// Set CORS headers
setCorsHeaders();

// If accessing directly, show API info
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$pathParts = explode('/', trim($path, '/'));
$lastPart = end($pathParts);
if ($lastPart === 'dashboard.php' || $lastPart === 'api') {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        jsonResponse([
            'success' => true,
            'name' => 'Dashboard API',
            'version' => '1.0',
            'endpoints' => [
                'GET /api/dashboard-stats' => 'Get comprehensive dashboard statistics (requires authentication)',
            ],
            'authentication' => 'Required - Bearer token',
            'statistics_included' => [
                'customers' => 'New, all, active, blocked, online, last month, last year',
                'routers' => 'Total routers, PPPoE logins, online routers',
                'services' => 'Active services, suspended services',
                'tickets' => 'Open tickets, pending tickets',
                'payments' => 'Today, this month, last month, this year, last year',
                'expenses' => 'Today, this month, last month',
                'invoices' => 'Unpaid total',
                'sms' => 'Balance',
            ]
        ]);
    }
}

checkAuth(); // Require authentication

$pdo = getDB();

// Date calculations
$firstDayLastMonth = date('Y-m-01 00:00:00', strtotime('first day of last month'));
$lastDayLastMonth = date('Y-m-t 23:59:59', strtotime('last day of last month'));
$firstDayThisMonth = date('Y-m-01 00:00:00');
$lastDayThisMonth = date('Y-m-t 23:59:59');

try {
    // Customer statistics
    $newCustomers = $pdo->query("SELECT COUNT(*) as count FROM customers WHERE created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)")->fetch()['count'];
    $allCustomers = $pdo->query("SELECT COUNT(*) as count FROM customers")->fetch()['count'];
    $activeCustomers = $pdo->query("SELECT COUNT(DISTINCT customer_id) as count FROM services WHERE JSON_EXTRACT(status, '$.value') = 2")->fetch()['count'];
    $blockedCustomers = $pdo->query("SELECT COUNT(DISTINCT customer_id) as count FROM services WHERE JSON_EXTRACT(status, '$.value') = 1")->fetch()['count'];
    
    // Online customers - get active PPPoE sessions count directly from RADIUS
    $onlineCustomers = 0;
    try {
        require_once __DIR__ . '/radius/PPPoERadiusSync.php';
        $pppoeRadius = new PPPoERadiusSync();
        $radiusDb = $pppoeRadius->getRadiusConnection();
        
        // Simply count all active PPPoE sessions from RADIUS
        $stmt = $radiusDb->query("SELECT COUNT(DISTINCT username) as count FROM radacct WHERE acctstoptime IS NULL AND username IS NOT NULL AND username != ''");
        $result = $stmt->fetch();
        $onlineCustomers = intval($result['count'] ?? 0);
    } catch (Exception $e) {
        error_log("Error fetching online customers from RADIUS: " . $e->getMessage());
        // Fallback: Count active services in main DB
        try {
            $stmt = $pdo->query("
                SELECT COUNT(DISTINCT customer_id) as count 
                FROM services 
                WHERE JSON_EXTRACT(status, '$.value') = 2 
                AND deleted_at IS NULL
            ");
            $result = $stmt->fetch();
            $onlineCustomers = intval($result['count'] ?? 0);
        } catch (Exception $e2) {
            error_log("Error in fallback online customers count: " . $e2->getMessage());
            $onlineCustomers = 0;
        }
    }
    
    $lastMonthCustomers = $pdo->query("SELECT COUNT(*) as count FROM customers WHERE created_at BETWEEN '$firstDayLastMonth' AND '$lastDayLastMonth'")->fetch()['count'];
    $lastYearCustomers = $pdo->query("SELECT COUNT(*) as count FROM customers WHERE YEAR(created_at) = " . (date('Y') - 1))->fetch()['count'];
    
    // Router statistics
    $allRouters = $pdo->query("SELECT COUNT(*) as count FROM routers")->fetch()['count'];
    
    // Simple ticket statistics with proper status grouping
    $todayNewTickets = $pdo->query("
        SELECT COUNT(*) as count FROM tickets 
        WHERE DATE(created_at) = CURDATE()
    ")->fetch()['count'];
    
    $openTicketsTotal = $pdo->query("
        SELECT COUNT(*) as count FROM tickets 
        WHERE status IN ('new', 'New', 'open', 'in_progress', 'waiting_on_agent', 'waiting_agent')
    ")->fetch()['count'];
    
    $pendingTicketsTotal = $pdo->query("
        SELECT COUNT(*) as count FROM tickets 
        WHERE status IN ('waiting_on_customer', 'waiting_customer', 'booked_to_further_date', 'booked_later', 'waiting_power', 'pole_needed')
    ")->fetch()['count'];
    
    // Completed tickets = resolved + installation complete + other closed statuses
    $completedTicketsTotal = $pdo->query("
        SELECT COUNT(*) as count FROM tickets 
        WHERE status IN ('resolved', 'installation complete', 'installed_elsewhere', 'customer_out_of_range', 'out_of_range', 'customer_unreachable', 'long_distance')
    ")->fetch()['count'];
    
    // Payment statistics
    $thisMonthPayments = $pdo->query("SELECT COUNT(*) as count FROM payments WHERE date BETWEEN '$firstDayThisMonth' AND '$lastDayThisMonth'")->fetch()['count'];
    $lastMonthPayments = $pdo->query("SELECT COUNT(*) as count FROM payments WHERE date BETWEEN '$firstDayLastMonth' AND '$lastDayLastMonth'")->fetch()['count'];
    $sumThisMonthPayments = $pdo->query("SELECT COALESCE(SUM(sum), 0) as total FROM payments WHERE date BETWEEN '$firstDayThisMonth' AND '$lastDayThisMonth'")->fetch()['total'] ?? 0;
    $sumLastMonthPayments = $pdo->query("SELECT COALESCE(SUM(sum), 0) as total FROM payments WHERE date BETWEEN '$firstDayLastMonth' AND '$lastDayLastMonth'")->fetch()['total'] ?? 0;
    
    // Invoice statistics
    $thisMonthPaidInvoices = $pdo->query("SELECT COUNT(*) as count FROM invoices WHERE JSON_EXTRACT(status, '$.value') = 2 AND invoice_date BETWEEN '$firstDayThisMonth' AND '$lastDayThisMonth'")->fetch()['count'];
    $thisMonthPaidInvoicesSum = $pdo->query("SELECT COALESCE(SUM(total), 0) as total FROM invoices WHERE JSON_EXTRACT(status, '$.value') = 2 AND invoice_date BETWEEN '$firstDayThisMonth' AND '$lastDayThisMonth'")->fetch()['total'] ?? 0;
    $lastMonthPaidInvoices = $pdo->query("SELECT COUNT(*) as count FROM invoices WHERE JSON_EXTRACT(status, '$.value') = 2 AND invoice_date BETWEEN '$firstDayLastMonth' AND '$lastDayLastMonth'")->fetch()['count'];
    $lastMonthPaidInvoicesSum = $pdo->query("SELECT COALESCE(SUM(total), 0) as total FROM invoices WHERE JSON_EXTRACT(status, '$.value') = 2 AND invoice_date BETWEEN '$firstDayLastMonth' AND '$lastDayLastMonth'")->fetch()['total'] ?? 0;
    
    $thisMonthUnpaidInvoices = $pdo->query("SELECT COUNT(*) as count FROM invoices WHERE JSON_EXTRACT(status, '$.value') = 1 AND invoice_date BETWEEN '$firstDayThisMonth' AND '$lastDayThisMonth'")->fetch()['count'];
    $thisMonthUnpaidInvoicesSum = $pdo->query("SELECT COALESCE(SUM(total), 0) as total FROM invoices WHERE JSON_EXTRACT(status, '$.value') = 1 AND invoice_date BETWEEN '$firstDayThisMonth' AND '$lastDayThisMonth'")->fetch()['total'] ?? 0;
    $lastMonthUnpaidInvoices = $pdo->query("SELECT COUNT(*) as count FROM invoices WHERE JSON_EXTRACT(status, '$.value') = 1 AND invoice_date BETWEEN '$firstDayLastMonth' AND '$lastDayLastMonth'")->fetch()['count'];
    $lastMonthUnpaidInvoicesSum = $pdo->query("SELECT COALESCE(SUM(total), 0) as total FROM invoices WHERE JSON_EXTRACT(status, '$.value') = 1 AND invoice_date BETWEEN '$firstDayLastMonth' AND '$lastDayLastMonth'")->fetch()['total'] ?? 0;
    
    // Server statistics (simplified)
    $memoryTotal = disk_total_space('.') ?? 0;
    $memoryFree = disk_free_space('.') ?? 0;
    $memoryUsed = $memoryTotal - $memoryFree;
    $memoryPercentage = $memoryTotal > 0 ? number_format(($memoryFree / $memoryTotal) * 100, 2) : 0;
    
    jsonResponse([
        'new_customers' => (int)$newCustomers,
        'all_customers' => (int)$allCustomers,
        'online_customers' => (int)$onlineCustomers,
        'online_today_customers' => (int)$onlineCustomers, // Simplified
        'active_customers' => (int)$activeCustomers,
        'blocked_customers' => (int)$blockedCustomers,
        'inactive_customers' => (int)($allCustomers - $activeCustomers - $blockedCustomers),
        'last_month_customers' => (int)$lastMonthCustomers,
        'last_year_customers' => (int)$lastYearCustomers,
        'all_routers' => (int)$allRouters,
        'new_tickets_today' => (int)$todayNewTickets,
        'open_tickets_total' => (int)$openTicketsTotal,
        'pending_tickets_total' => (int)$pendingTicketsTotal,
        'completed_tickets_total' => (int)$completedTicketsTotal,
        'this_month_payments' => (int)$thisMonthPayments,
        'last_month_payments' => (int)$lastMonthPayments,
        'sum_this_month_payments' => number_format($sumThisMonthPayments, 2),
        'sum_last_month_payments' => number_format($sumLastMonthPayments, 2),
        'this_month_paid_invoices' => (int)$thisMonthPaidInvoices,
        'this_month_paid_invoices_sum' => number_format($thisMonthPaidInvoicesSum, 2),
        'last_month_paid_invoices' => (int)$lastMonthPaidInvoices,
        'last_month_paid_invoices_sum' => number_format($lastMonthPaidInvoicesSum, 2),
        'this_month_unpaid_invoices' => (int)$thisMonthUnpaidInvoices,
        'this_month_unpaid_invoices_sum' => number_format($thisMonthUnpaidInvoicesSum, 2),
        'last_month_unpaid_invoices' => (int)$lastMonthUnpaidInvoices,
        'last_month_unpaid_invoices_sum' => number_format($lastMonthUnpaidInvoicesSum, 2),
        'server' => [
            'cores' => 'N/A',
            'load_average' => 'N/A',
            'memory' => [
                'total_bytes' => $memoryTotal,
                'free_bytes' => $memoryFree,
                'used_bytes' => $memoryUsed,
                'total' => humanFilesize($memoryTotal),
                'free' => humanFilesize($memoryFree),
                'used' => humanFilesize($memoryUsed),
                'percent' => $memoryPercentage
            ],
            'disk' => [
                'total_bytes' => $memoryTotal,
                'free_bytes' => $memoryFree,
                'used_bytes' => $memoryUsed,
                'total' => humanFilesize($memoryTotal),
                'free' => humanFilesize($memoryFree),
                'used' => humanFilesize($memoryUsed),
                'percent' => $memoryPercentage
            ]
        ]
    ]);
    
} catch (PDOException $e) {
    jsonResponse(['error' => 'Database error: ' . $e->getMessage()], 500);
}

