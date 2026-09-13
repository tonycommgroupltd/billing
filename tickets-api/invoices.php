<?php
/**
 * Invoice Endpoints
 * GET /api/list-invoices
 * GET /api/view-invoices/{id}
 */

require_once __DIR__ . '/helpers.php';

setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$pathParts = explode('/', trim($path, '/'));

// If accessing directly, show API info
$lastPart = end($pathParts);
if ($lastPart === 'invoices.php' || ($lastPart === 'api' && $method === 'GET')) {
    if ($method === 'GET') {
        jsonResponse([
            'success' => true,
            'name' => 'Invoices API',
            'version' => '1.0',
            'endpoints' => [
                'GET /api/list-invoices' => 'List all invoices with search, status filter, date filter, pagination',
                'GET /api/view-invoices/{id}' => 'Get invoice details by ID',
            ],
            'authentication' => 'Required - Bearer token',
            'query_parameters' => [
                'q' => 'Search by customer name',
                'status' => 'Filter by status (1=paid, 0=unpaid)',
                'start' => 'Start date for date range filter',
                'end' => 'End date for date range filter',
                'page' => 'Page number (default: 1)',
                'per_page' => 'Results per page (default: 10)',
                'sort' => 'Sort order: asc or desc (default: asc)',
                'sort_col' => 'Sort column: invoice_date, due_date, amount (default: invoice_date)',
            ]
        ]);
    }
}

checkAuth();
$pdo = getDB();

// Remove 'api' from path if present
if (!empty($pathParts) && $pathParts[0] === 'api') {
    array_shift($pathParts);
}

try {
    // Route: GET /api/list-invoices
    if ($method === 'GET' && end($pathParts) === 'list-invoices') {
        $query = getQueryParam('q', '');
        $status = getQueryParam('status', '');
        $start = getQueryParam('start', '');
        $end = getQueryParam('end', '');
        $page = (int)getQueryParam('page', 1);
        $perPage = (int)getQueryParam('per_page', 10);
        $sort = getQueryParam('sort', 'asc');
        $sortCol = getQueryParam('sort_col', 'invoice_date');
        
        $offset = ($page - 1) * $perPage;
        
        // Build WHERE clause with joins
        $where = [];
        $params = [];
        
        if ($query) {
            $where[] = "customers.name LIKE ?";
            $params[] = "%$query%";
        }
        
        if ($status) {
            $where[] = "JSON_EXTRACT(invoices.status, '$.value') = ?";
            $params[] = $status;
        }
        
        if ($start && $end) {
            $where[] = "invoices.invoice_date BETWEEN ? AND ?";
            $params[] = $start;
            $params[] = $end;
        }
        
        $whereClause = !empty($where) ? 'WHERE ' . implode(' AND ', $where) : '';
        
        // Get total count
        $countSql = "SELECT COUNT(*) as total 
                     FROM invoices 
                     LEFT JOIN services ON invoices.services_id = services.id 
                     LEFT JOIN customers ON services.customer_id = customers.id 
                     $whereClause";
        $countStmt = $pdo->prepare($countSql);
        $countStmt->execute($params);
        $total = $countStmt->fetch()['total'];
        
        // Get data
        $orderBy = in_array($sortCol, ['id', 'invoice_date', 'due_date', 'total']) ? $sortCol : 'invoice_date';
        $orderDir = strtoupper($sort) === 'DESC' ? 'DESC' : 'ASC';
        
        $sql = "SELECT invoices.*, customers.name, customers.id as customer_id 
                FROM invoices 
                LEFT JOIN services ON invoices.services_id = services.id 
                LEFT JOIN customers ON services.customer_id = customers.id 
                $whereClause 
                ORDER BY invoices.$orderBy $orderDir 
                LIMIT $perPage OFFSET $offset";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $invoices = $stmt->fetchAll();
        
        // Parse JSON fields and ensure date formats are valid
        foreach ($invoices as &$invoice) {
            if (isset($invoice['status']) && $invoice['status']) {
                $invoice['status'] = json_decode($invoice['status'], true);
            }
            
            // Ensure date fields are either valid ISO strings or null
            if (isset($invoice['invoice_date']) && $invoice['invoice_date'] !== null && $invoice['invoice_date'] !== '') {
                $date = strtotime($invoice['invoice_date']);
                $invoice['invoice_date'] = $date ? date('Y-m-d H:i:s', $date) : null;
            } else {
                $invoice['invoice_date'] = null;
            }
            
            if (isset($invoice['due_date']) && $invoice['due_date'] !== null && $invoice['due_date'] !== '') {
                $date = strtotime($invoice['due_date']);
                $invoice['due_date'] = $date ? date('Y-m-d H:i:s', $date) : null;
            } else {
                $invoice['due_date'] = null;
            }
            
            if (isset($invoice['payment_date']) && $invoice['payment_date'] !== null && $invoice['payment_date'] !== '') {
                $date = strtotime($invoice['payment_date']);
                $invoice['payment_date'] = $date ? date('Y-m-d H:i:s', $date) : null;
            } else {
                $invoice['payment_date'] = null;
            }
        }
        
        jsonResponse([
            'page' => $page,
            'per_page' => $perPage,
            'total' => (int)$total,
            'total_pages' => (int)ceil($total / $perPage),
            'data' => $invoices
        ]);
    }
    
    // Route: GET /api/view-invoices/{id}
    if ($method === 'GET' && in_array('view-invoices', $pathParts)) {
        $id = end($pathParts);
        
        $stmt = $pdo->prepare("
            SELECT invoices.*, services.customer_id, customers.name as customer_name, customers.phone_number as customer_phone
            FROM invoices
            LEFT JOIN services ON invoices.services_id = services.id
            LEFT JOIN customers ON services.customer_id = customers.id
            WHERE invoices.id = ?
        ");
        $stmt->execute([$id]);
        $invoice = $stmt->fetch();
        
        if (!$invoice) {
            jsonResponse(['error' => 'Invoice not found'], 404);
        }
        
        // Parse JSON fields and ensure date formats are valid
        if (isset($invoice['status']) && $invoice['status']) {
            $invoice['status'] = json_decode($invoice['status'], true);
        }
        
        // Ensure date fields are either valid ISO strings or null
        if (isset($invoice['invoice_date']) && $invoice['invoice_date'] !== null && $invoice['invoice_date'] !== '') {
            $date = strtotime($invoice['invoice_date']);
            $invoice['invoice_date'] = $date ? date('Y-m-d H:i:s', $date) : null;
        } else {
            $invoice['invoice_date'] = null;
        }
        
        if (isset($invoice['due_date']) && $invoice['due_date'] !== null && $invoice['due_date'] !== '') {
            $date = strtotime($invoice['due_date']);
            $invoice['due_date'] = $date ? date('Y-m-d H:i:s', $date) : null;
        } else {
            $invoice['due_date'] = null;
        }
        
        if (isset($invoice['payment_date']) && $invoice['payment_date'] !== null && $invoice['payment_date'] !== '') {
            $date = strtotime($invoice['payment_date']);
            $invoice['payment_date'] = $date ? date('Y-m-d H:i:s', $date) : null;
        } else {
            $invoice['payment_date'] = null;
        }
        
        jsonResponse(['invoice' => $invoice]);
    }
    
    // GET /api/list-customer-invoices/{customer_id}
    if ($method === 'GET' && in_array('list-customer-invoices', $pathParts)) {
        // Extract customer ID from the end of the path
        // Path format: /api/list-customer-invoices/{customer_id}
        // After split: ['api', 'list-customer-invoices', '{customer_id}']
        $customerId = end($pathParts);
        
        // Make sure it's actually the customer ID, not 'list-customer-invoices'
        if ($customerId === 'list-customer-invoices') {
            jsonResponse(['error' => 'Customer ID is required'], 400);
        }
        
        if (!is_numeric($customerId)) {
            jsonResponse(['error' => 'Invalid customer ID'], 400);
        }
        
        $customerId = intval($customerId);
        
        $query = getQueryParam('q', '');
        $status = getQueryParam('status', '');
        $start = getQueryParam('start', '');
        $end = getQueryParam('end', '');
        $page = (int)getQueryParam('page', 1);
        $perPage = (int)getQueryParam('per_page', 10);
        $sort = getQueryParam('sort', 'asc');
        $sortCol = getQueryParam('sort_col', 'id');
        
        $offset = ($page - 1) * $perPage;
        
        // Build WHERE clause
        $where = ["services.customer_id = ?"];
        $params = [$customerId];
        
        if ($query) {
            $where[] = "customers.name LIKE ?";
            $params[] = "%$query%";
        }
        
        if ($status) {
            $where[] = "JSON_EXTRACT(invoices.status, '$.value') = ?";
            $params[] = $status;
        }
        
        if ($start && $end) {
            // Parse dates (handle various formats)
            try {
                $startDate = date('Y-m-d H:i:s', strtotime($start));
                $endDate = date('Y-m-d H:i:s', strtotime($end));
                if ($startDate && $endDate) {
                    $where[] = "invoices.invoice_date BETWEEN ? AND ?";
                    $params[] = $startDate;
                    $params[] = $endDate;
                }
            } catch (Exception $e) {
                // Skip date filter if parsing fails
            }
        }
        
        $whereClause = 'WHERE ' . implode(' AND ', $where);
        
        // Get total count
        $countSql = "SELECT COUNT(*) as total 
                     FROM invoices 
                     LEFT JOIN services ON invoices.services_id = services.id 
                     LEFT JOIN customers ON services.customer_id = customers.id 
                     $whereClause";
        $countStmt = $pdo->prepare($countSql);
        $countStmt->execute($params);
        $total = $countStmt->fetch()['total'];
        
        // Get data
        $orderBy = in_array($sortCol, ['id', 'invoice_date', 'due_date', 'total']) ? $sortCol : 'id';
        $orderDir = strtoupper($sort) === 'DESC' ? 'DESC' : 'ASC';
        
        $limitValue = intval($perPage);
        $offsetValue = intval($offset);
        
        // Use positional parameters for LIMIT/OFFSET to match the WHERE clause params
        $sql = "SELECT invoices.*, customers.name as customer_name, customers.id as customer_id, customers.phone_number as customer_phone
                FROM invoices 
                LEFT JOIN services ON invoices.services_id = services.id 
                LEFT JOIN customers ON services.customer_id = customers.id 
                $whereClause 
                ORDER BY invoices.$orderBy $orderDir 
                LIMIT ? OFFSET ?";
        
        // Add limit and offset to params array
        $params[] = $limitValue;
        $params[] = $offsetValue;
        
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $invoices = $stmt->fetchAll();
        
        // Parse JSON fields and ensure date formats are valid
        foreach ($invoices as &$invoice) {
            if (isset($invoice['status']) && $invoice['status']) {
                $invoice['status'] = json_decode($invoice['status'], true);
            }
            
            // Ensure date fields are either valid ISO strings or null
            if (isset($invoice['invoice_date']) && $invoice['invoice_date'] !== null && $invoice['invoice_date'] !== '') {
                $date = strtotime($invoice['invoice_date']);
                $invoice['invoice_date'] = $date ? date('Y-m-d H:i:s', $date) : null;
            } else {
                $invoice['invoice_date'] = null;
            }
            
            if (isset($invoice['due_date']) && $invoice['due_date'] !== null && $invoice['due_date'] !== '') {
                $date = strtotime($invoice['due_date']);
                $invoice['due_date'] = $date ? date('Y-m-d H:i:s', $date) : null;
            } else {
                $invoice['due_date'] = null;
            }
            
            if (isset($invoice['payment_date']) && $invoice['payment_date'] !== null && $invoice['payment_date'] !== '') {
                $date = strtotime($invoice['payment_date']);
                $invoice['payment_date'] = $date ? date('Y-m-d H:i:s', $date) : null;
            } else {
                $invoice['payment_date'] = null;
            }
        }
        
        jsonResponse([
            'page' => $page,
            'per_page' => $perPage,
            'total' => (int)$total,
            'total_pages' => (int)ceil($total / $perPage),
            'data' => $invoices
        ]);
    }
    
    jsonResponse(['error' => 'Endpoint not found'], 404);
    
} catch (PDOException $e) {
    error_log("Invoices API Error: " . $e->getMessage());
    jsonResponse(['error' => 'Database error: ' . $e->getMessage()], 500);
}

