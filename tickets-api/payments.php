<?php
/**
 * Payment Endpoints
 * GET /api/list-payments
 */

require_once __DIR__ . '/helpers.php';

setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$pathParts = explode('/', trim($path, '/'));

// If accessing directly, show API info
$lastPart = end($pathParts);
if ($lastPart === 'payments.php' || ($lastPart === 'api' && $method === 'GET')) {
    if ($method === 'GET') {
        jsonResponse([
            'success' => true,
            'name' => 'Payments API',
            'version' => '1.0',
            'endpoints' => [
                'GET /api/list-payments' => 'List all payments with search, date filter, pagination',
            ],
            'authentication' => 'Required - Bearer token',
            'query_parameters' => [
                'q' => 'Search by transaction ID, customer name, or phone',
                'start' => 'Start date for date range filter',
                'end' => 'End date for date range filter',
                'page' => 'Page number (default: 1)',
                'per_page' => 'Results per page (default: 10)',
                'sort' => 'Sort order: asc or desc (default: asc)',
                'sort_col' => 'Sort column: id, date, sum, payment_type (default: date)',
            ]
        ]);
    }
}

checkAuth();
$pdo = getDB();

try {
    // Route: GET /api/list-payments
    if ($method === 'GET' && end($pathParts) === 'list-payments') {
        $query = getQueryParam('q', '');
        $start = getQueryParam('start', '');
        $end = getQueryParam('end', '');
        $page = (int)getQueryParam('page', 1);
        $perPage = (int)getQueryParam('per_page', 10);
        $sort = getQueryParam('sort', 'asc');
        $sortCol = getQueryParam('sort_col', 'date');
        
        $offset = ($page - 1) * $perPage;
        
        // Build WHERE clause
        $where = [];
        $params = [];
        
        if ($query) {
            $where[] = "(payments.trans_id LIKE ? OR customers.name LIKE ? OR customers.phone_number LIKE ?)";
            $searchTerm = "%$query%";
            $params[] = $searchTerm;
            $params[] = $searchTerm;
            $params[] = $searchTerm;
        }
        
        if ($start && $end) {
            $where[] = "payments.date BETWEEN ? AND ?";
            $params[] = $start;
            $params[] = $end;
        }
        
        $whereClause = !empty($where) ? 'WHERE ' . implode(' AND ', $where) : '';
        
        // Get total count
        $countSql = "SELECT COUNT(*) as total 
                     FROM payments 
                     LEFT JOIN customers ON payments.customer_id = customers.id 
                     $whereClause";
        $countStmt = $pdo->prepare($countSql);
        $countStmt->execute($params);
        $total = $countStmt->fetch()['total'];
        
        // Get data
        $orderBy = in_array($sortCol, ['id', 'date', 'sum', 'payment_type']) ? $sortCol : 'date';
        $orderDir = strtoupper($sort) === 'DESC' ? 'DESC' : 'ASC';
        
        $sql = "SELECT payments.*, customers.name as customer_name, customers.phone_number 
                FROM payments 
                LEFT JOIN customers ON payments.customer_id = customers.id 
                $whereClause 
                ORDER BY payments.$orderBy $orderDir 
                LIMIT $perPage OFFSET $offset";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $payments = $stmt->fetchAll();
        
        jsonResponse([
            'page' => $page,
            'per_page' => $perPage,
            'total' => (int)$total,
            'total_pages' => (int)ceil($total / $perPage),
            'data' => $payments
        ]);
    }
    
    jsonResponse(['error' => 'Endpoint not found'], 404);
    
} catch (PDOException $e) {
    jsonResponse(['error' => 'Database error: ' . $e->getMessage()], 500);
}

