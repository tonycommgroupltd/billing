<?php
/**
 * Finance Dashboard Statistics Endpoint
 * GET /api/finance-dashboard-stats
 */

require_once __DIR__ . '/helpers.php';

setCorsHeaders();
checkAuth();

$pdo = getDB();

// Date calculations
$firstDayLastMonth = date('Y-m-01 00:00:00', strtotime('first day of last month'));
$lastDayLastMonth = date('Y-m-t 23:59:59', strtotime('last day of last month'));
$firstDayThisMonth = date('Y-m-01 00:00:00');
$lastDayThisMonth = date('Y-m-t 23:59:59');

try {
    // Payment statistics
    $thisMonthPayments = $pdo->query("SELECT COUNT(*) as count FROM payments WHERE date BETWEEN '$firstDayThisMonth' AND '$lastDayThisMonth'")->fetch()['count'];
    $lastMonthPayments = $pdo->query("SELECT COUNT(*) as count FROM payments WHERE date BETWEEN '$firstDayLastMonth' AND '$lastDayLastMonth'")->fetch()['count'];
    $sumThisMonthPayments = $pdo->query("SELECT COALESCE(SUM(sum), 0) as total FROM payments WHERE date BETWEEN '$firstDayThisMonth' AND '$lastDayThisMonth'")->fetch()['total'] ?? 0;
    $sumLastMonthPayments = $pdo->query("SELECT COALESCE(SUM(sum), 0) as total FROM payments WHERE date BETWEEN '$firstDayLastMonth' AND '$lastDayLastMonth'")->fetch()['total'] ?? 0;
    
    // Invoice statistics
    $thisMonthUnpaidInvoices = $pdo->query("SELECT COUNT(*) as count FROM invoices WHERE JSON_EXTRACT(status, '$.value') = 1 AND invoice_date BETWEEN '$firstDayThisMonth' AND '$lastDayThisMonth'")->fetch()['count'];
    $thisMonthPaidInvoices = $pdo->query("SELECT COUNT(*) as count FROM invoices WHERE JSON_EXTRACT(status, '$.value') = 2 AND invoice_date BETWEEN '$firstDayThisMonth' AND '$lastDayThisMonth'")->fetch()['count'];
    $lastMonthUnpaidInvoices = $pdo->query("SELECT COUNT(*) as count FROM invoices WHERE JSON_EXTRACT(status, '$.value') = 1 AND invoice_date BETWEEN '$firstDayLastMonth' AND '$lastDayLastMonth'")->fetch()['count'];
    $lastMonthPaidInvoices = $pdo->query("SELECT COUNT(*) as count FROM invoices WHERE JSON_EXTRACT(status, '$.value') = 2 AND invoice_date BETWEEN '$firstDayLastMonth' AND '$lastDayLastMonth'")->fetch()['count'];
    
    $sumThisMonthUnpaidInvoices = $pdo->query("SELECT COALESCE(SUM(total), 0) as total FROM invoices WHERE JSON_EXTRACT(status, '$.value') = 1 AND invoice_date BETWEEN '$firstDayThisMonth' AND '$lastDayThisMonth'")->fetch()['total'] ?? 0;
    $sumThisMonthPaidInvoices = $pdo->query("SELECT COALESCE(SUM(total), 0) as total FROM invoices WHERE JSON_EXTRACT(status, '$.value') = 2 AND invoice_date BETWEEN '$firstDayThisMonth' AND '$lastDayThisMonth'")->fetch()['total'] ?? 0;
    $sumLastMonthUnpaidInvoices = $pdo->query("SELECT COALESCE(SUM(total), 0) as total FROM invoices WHERE JSON_EXTRACT(status, '$.value') = 1 AND invoice_date BETWEEN '$firstDayLastMonth' AND '$lastDayLastMonth'")->fetch()['total'] ?? 0;
    $sumLastMonthPaidInvoices = $pdo->query("SELECT COALESCE(SUM(total), 0) as total FROM invoices WHERE JSON_EXTRACT(status, '$.value') = 2 AND invoice_date BETWEEN '$firstDayLastMonth' AND '$lastDayLastMonth'")->fetch()['total'] ?? 0;
    
    jsonResponse([
        'this_month_payments' => (int)$thisMonthPayments,
        'last_month_payments' => (int)$lastMonthPayments,
        'sum_this_month_payments' => number_format($sumThisMonthPayments, 2),
        'sum_last_month_payments' => number_format($sumLastMonthPayments, 2),
        'this_month_unpaid_invoices' => (int)$thisMonthUnpaidInvoices,
        'this_month_paid_invoices' => (int)$thisMonthPaidInvoices,
        'last_month_unpaid_invoices' => (int)$lastMonthUnpaidInvoices,
        'last_month_paid_invoices' => (int)$lastMonthPaidInvoices,
        'sum_this_month_unpaid_invoices' => number_format($sumThisMonthUnpaidInvoices, 2),
        'sum_this_month_paid_invoices' => number_format($sumThisMonthPaidInvoices, 2),
        'sum_last_month_unpaid_invoices' => number_format($sumLastMonthUnpaidInvoices, 2),
        'sum_last_month_paid_invoices' => number_format($sumLastMonthPaidInvoices, 2)
    ]);
    
} catch (PDOException $e) {
    jsonResponse(['error' => 'Database error: ' . $e->getMessage()], 500);
}

