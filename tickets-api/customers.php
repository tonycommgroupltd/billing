<?php
/**
 * Customer Endpoints
 * GET /api/list-customers
 * GET /api/view-customer/{id}
 * GET /api/cust-dashboard-stats/{id}
 */

require_once __DIR__ . '/helpers.php';

setCorsHeaders();
$user = checkAuth();
$pdo = getDB();

$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$pathParts = explode('/', trim($path, '/'));

// If accessing customers.php directly, show API info
$lastPart = end($pathParts);
if ($lastPart === 'customers.php' || empty($lastPart) || $lastPart === 'api') {
    if ($method === 'GET') {
        jsonResponse([
            'success' => true,
            'name' => 'Customers API',
            'version' => '1.0',
            'endpoints' => [
                'GET /api/list-customers' => 'List all customers with pagination',
                'GET /api/search-customer-by-phone?phone={phone}' => 'Search customer by phone number',
                'GET /api/test-customer-phones' => 'Test - Show sample phone numbers',
                'GET /api/view-customer/{id}' => 'Get customer details by ID',
                'POST /api/add-customers' => 'Create new customer',
                'PUT /api/update-customer/{id}' => 'Update customer',
                'GET /api/cust-dashboard-stats/{id}' => 'Get customer dashboard statistics',
            ],
            'database' => 'tonycommgroupltd_db'
        ]);
    }
}

try {
    // Route: POST /api/add-customers
    if ($method === 'POST' && end($pathParts) === 'add-customers') {
        $data = getRequestBody();
        
        // Validation
        $errors = [];
        if (empty($data['name'])) {
            $errors['name'] = ['The name field is required.'];
        }
        
        if (!empty($data['phone_number'])) {
            $data['phone_number'] = normalizeKenyanPhone($data['phone_number']);
        }

        // Empty email must be NULL — unique index on users.email rejects repeated ''.
        if (!isset($data['email']) || trim((string)$data['email']) === '') {
            $data['email'] = null;
        } else {
            $data['email'] = trim((string)$data['email']);
        }

        // Check phone uniqueness
        if (!empty($data['phone_number'])) {
            $subscriberDigits = getKenyanSubscriberDigits($data['phone_number']);
            $stmt = $pdo->prepare("
                SELECT id FROM customers
                WHERE deleted_at IS NULL
                AND RIGHT(REPLACE(REPLACE(REPLACE(phone_number, '+', ''), ' ', ''), '-', ''), 9) = ?
                LIMIT 1
            ");
            $stmt->execute([$subscriberDigits]);
            if ($stmt->fetch()) {
                $errors['phone_number'] = ['The phone number has already been taken.'];
            }
            
            // Also check in users table
            $stmt = $pdo->prepare("
                SELECT id FROM users
                WHERE RIGHT(REPLACE(REPLACE(REPLACE(phone, '+', ''), ' ', ''), '-', ''), 9) = ?
                LIMIT 1
            ");
            $stmt->execute([$subscriberDigits]);
            if ($stmt->fetch()) {
                $errors['phone_number'] = ['The phone number has already been taken.'];
            }
        }
        
        // Check email uniqueness (in users table)
        if (!empty($data['email'])) {
            if (!filter_var($data['email'], FILTER_VALIDATE_EMAIL)) {
                $errors['email'] = ['The email must be a valid email address.'];
            } else {
                $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ? LIMIT 1");
                $stmt->execute([$data['email']]);
                if ($stmt->fetch()) {
                    $errors['email'] = ['The email has already been taken.'];
                }
            }
        }
        
        // Validate password if provided
        if (!empty($data['password']) && strlen($data['password']) < 6) {
            $errors['password'] = ['The password must be at least 6 characters.'];
        }
        
        if (!empty($errors)) {
            jsonResponse($errors, 422);
        }
        
        try {
            $pdo->beginTransaction();
            
            $userId = null;
            
            // Create user if email or phone provided
            if (!empty($data['email']) || !empty($data['phone_number'])) {
                $password = !empty($data['password']) 
                    ? password_hash($data['password'], PASSWORD_BCRYPT)
                    : password_hash(bin2hex(random_bytes(12)), PASSWORD_BCRYPT);
                
                $stmt = $pdo->prepare("
                    INSERT INTO users (name, email, phone, password, created_at, updated_at)
                    VALUES (?, ?, ?, ?, NOW(), NOW())
                ");
                $stmt->execute([
                    $data['name'],
                    $data['email'] ?? null,
                    $data['phone_number'] ?? null,
                    $password
                ]);
                $userId = $pdo->lastInsertId();
                
                // Assign role (customer or reseller based on category)
                $categoryValue = isset($data['category']) && is_array($data['category']) 
                    ? ($data['category']['value'] ?? null) 
                    : null;
                $roleName = ($categoryValue === 3) ? 'reseller' : 'customer';
                
                // Get role ID
                $stmt = $pdo->prepare("SELECT id FROM roles WHERE name = ? AND guard_name = 'api' LIMIT 1");
                $stmt->execute([$roleName]);
                $role = $stmt->fetch();
                
                if ($role) {
                    // Assign role to user
                    $stmt = $pdo->prepare("
                        INSERT INTO model_has_roles (role_id, model_type, model_id)
                        VALUES (?, 'App\\\\Models\\\\User', ?)
                        ON DUPLICATE KEY UPDATE role_id = VALUES(role_id)
                    ");
                    $stmt->execute([$role['id'], $userId]);
                }
            }
            
            // Create customer
            $billingTypeJson = !empty($data['billing_type']) ? json_encode($data['billing_type']) : null;
            $categoryJson = !empty($data['category']) ? json_encode($data['category']) : null;
            
            $stmt = $pdo->prepare("
                INSERT INTO customers (user_id, name, billing_type, category, phone_number, email, dob, address, city, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            ");
            $stmt->execute([
                $userId,
                $data['name'],
                $billingTypeJson,
                $categoryJson,
                $data['phone_number'] ?? null,
                $data['email'] ?? null,
                $data['dob'] ?? null,
                $data['address'] ?? null,
                $data['city'] ?? null
            ]);
            
            $customerId = $pdo->lastInsertId();
            
            $pdo->commit();
            
            // Fetch created customer with email
            $stmt = $pdo->prepare("
                SELECT customers.*, users.email
                FROM customers
                LEFT JOIN users ON customers.user_id = users.id
                WHERE customers.id = ?
            ");
            $stmt->execute([$customerId]);
            $customer = $stmt->fetch();
            
            // Parse JSON fields
            if (isset($customer['billing_type']) && $customer['billing_type']) {
                $customer['billing_type'] = json_decode($customer['billing_type'], true);
            }
            if (isset($customer['category']) && $customer['category']) {
                $customer['category'] = json_decode($customer['category'], true);
            }
            
            jsonResponse([
                'message' => 'Customer added',
                'customer' => $customer
            ], 201);
            
        } catch (PDOException $e) {
            $pdo->rollBack();
            jsonResponse(['error' => 'Database error: ' . $e->getMessage()], 500);
        }
    }
    
    // Route: GET /api/list-customers
    if ($method === 'GET' && end($pathParts) === 'list-customers') {
        $query = getQueryParam('q', '');
        $status = getQueryParam('status', '');
        $page = (int)getQueryParam('page', 1);
        $perPage = (int)getQueryParam('per_page', 10);
        $sort = getQueryParam('sort', 'desc');
        $sortCol = getQueryParam('sort_col', 'updated_at');
        
        $offset = ($page - 1) * $perPage;
        
        // Build WHERE clause
        $where = [];
        $params = [];
        
        if ($query) {
            $searchTerm = "%$query%";
            $queryFilter = "(customers.name LIKE ? OR customers.phone_number LIKE ?";
            $params[] = $searchTerm;
            $params[] = $searchTerm;

            // Also match phones after stripping symbols (+, spaces, dashes)
            $normalizedQuery = normalizePhoneDigits($query);
            if ($normalizedQuery !== '') {
                $queryFilter .= " OR REPLACE(REPLACE(REPLACE(customers.phone_number, '+', ''), ' ', ''), '-', '') LIKE ?";
                $params[] = "%$normalizedQuery%";

                // Match by subscriber suffix (last 9 digits), e.g. +2547..., 2547..., 07...
                $subscriberDigits = getKenyanSubscriberDigits($query);
                if ($subscriberDigits !== '') {
                    $queryFilter .= " OR RIGHT(REPLACE(REPLACE(REPLACE(customers.phone_number, '+', ''), ' ', ''), '-', ''), 9) = ?";
                    $params[] = $subscriberDigits;
                }
            }

            $queryFilter .= ")";
            $where[] = $queryFilter;
        }
        
        if ($status === 'new') {
            $where[] = "customers.created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)";
        }
        
        $whereClause = !empty($where) ? 'WHERE ' . implode(' AND ', $where) : '';
        
        // Get total count
        $countStmt = $pdo->prepare("SELECT COUNT(*) as total FROM customers $whereClause");
        $countStmt->execute($params);
        $total = $countStmt->fetch()['total'];
        
        // Latest ticket per customer (by customer_id or matching phone) — same source as tickets list
        $orderDir = strtoupper($sort) === 'DESC' ? 'DESC' : 'ASC';
        $ticketMatch = "t.deleted_at IS NULL AND (
            t.customer_id = customers.id
            OR (
                (t.customer_id IS NULL OR t.customer_id = 0)
                AND customers.phone_number IS NOT NULL
                AND CHAR_LENGTH(TRIM(customers.phone_number)) > 0
                AND RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(t.customer_phone, ''), '+', ''), ' ', ''), '-', ''), '.', ''), 9)
                  = RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(customers.phone_number, ''), '+', ''), ' ', ''), '-', ''), '.', ''), 9)
            )
        )";
        $latestTicketOrder = "ORDER BY t.updated_at DESC LIMIT 1";
        $ticketUpdatedSub = "(SELECT t.updated_at FROM tickets t WHERE $ticketMatch $latestTicketOrder)";
        $ticketCreatedSub = "(SELECT t.created_at FROM tickets t WHERE $ticketMatch $latestTicketOrder)";
        if ($sortCol === 'updated_at') {
            $orderExpr = "COALESCE($ticketUpdatedSub, customers.updated_at)";
        } elseif ($sortCol === 'created_at') {
            $orderExpr = "COALESCE($ticketCreatedSub, customers.created_at)";
        } elseif (in_array($sortCol, ['id', 'name', 'phone_number'])) {
            $orderExpr = "customers.$sortCol";
        } else {
            $orderExpr = "COALESCE($ticketUpdatedSub, customers.updated_at)";
        }
        
        $sql = "
            SELECT 
                customers.*,
                users.email,
                $ticketCreatedSub as ticket_created_at,
                $ticketUpdatedSub as ticket_updated_at,
                COALESCE((
                    SELECT SUM(amount) 
                    FROM balances 
                    WHERE balanceable_type = 'App\\\\Models\\\\Customer' 
                    AND balanceable_id = customers.id
                ), 0) as balance
            FROM customers
            LEFT JOIN users ON customers.user_id = users.id
            $whereClause 
            ORDER BY $orderExpr $orderDir 
            LIMIT $perPage OFFSET $offset
        ";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $customers = $stmt->fetchAll();
        
        // Get services for each customer and format response
        foreach ($customers as &$customer) {
            // Parse JSON fields if they exist
            if (isset($customer['billing_type']) && $customer['billing_type']) {
                $customer['billing_type'] = json_decode($customer['billing_type'], true);
            }
            if (isset($customer['category']) && $customer['category']) {
                $customer['category'] = json_decode($customer['category'], true);
            }
            
            // Get services array (with plan_title from plan_name or joined plans table)
            $servicesStmt = $pdo->prepare("
                SELECT 
                    services.id,
                    services.plan_name,
                    services.mikrotik_ipv4,
                    services.status,
                    services.online,
                    plans.title as plan_title_from_plan,
                    COALESCE(plans.title, services.plan_name) as plan_title
                FROM services
                LEFT JOIN plans ON services.plan_id = plans.id
                WHERE services.customer_id = ?
                ORDER BY services.created_at DESC
            ");
            $servicesStmt->execute([$customer['id']]);
            $services = $servicesStmt->fetchAll();
            
            // Parse status JSON for services and ensure plan_title exists
            foreach ($services as &$service) {
                if (isset($service['status']) && $service['status']) {
                    $service['status'] = json_decode($service['status'], true);
                }
                // Ensure plan_title exists (use plan_name as fallback)
                if (empty($service['plan_title'])) {
                    $service['plan_title'] = $service['plan_name'] ?? 'Custom Plan';
                }
            }
            
            $customer['services'] = $services;
            
            // Format balance (ensure it's a number)
            $customer['balance'] = (float)($customer['balance'] ?? 0);
            
            // Validate and format date fields
            $customer = formatDateFields($customer, ['created_at', 'updated_at', 'ticket_created_at', 'ticket_updated_at', 'dob', 'verification_date']);
        }
        
        jsonResponse([
            'page' => $page,
            'per_page' => $perPage,
            'total' => (int)$total,
            'total_pages' => (int)ceil($total / $perPage),
            'data' => $customers
        ]);
    }
    
    // Route: GET /api/test-customer-phones (for debugging)
    if ($method === 'GET' && end($pathParts) === 'test-customer-phones') {
        $sql = "SELECT id, name, phone_number FROM customers WHERE phone_number IS NOT NULL AND deleted_at IS NULL LIMIT 20";
        $stmt = $pdo->query($sql);
        $samples = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        jsonResponse([
            'success' => true,
            'message' => 'Sample phone numbers from database',
            'total_customers' => count($samples),
            'samples' => $samples
        ]);
    }
    
    // Route: GET /api/search-customer-by-phone?phone={phone}
    if ($method === 'GET' && end($pathParts) === 'search-customer-by-phone') {
        $phone = $_GET['phone'] ?? '';
        
        error_log("Customer search - Phone: " . $phone);
        
        if (empty($phone)) {
            jsonResponse([
                'success' => false,
                'message' => 'Phone number is required'
            ], 400);
        }

        $phone = normalizeKenyanPhone($phone);
        
        // Search for customer by phone number with normalized matching (+254 / 254 / 0 formats)
        $normalizedPhone = normalizePhoneDigits($phone);
        $subscriberDigits = getKenyanSubscriberDigits($phone);
        $sql = "
            SELECT 
                customers.id,
                customers.name,
                customers.full_name,
                customers.phone_number,
                customers.email,
                customers.address,
                customers.location,
                customers.city,
                customers.billing_type,
                customers.category,
                customers.created_at,
                users.email as user_email
            FROM customers
            LEFT JOIN users ON customers.user_id = users.id
            WHERE (
                customers.phone_number = ? 
                OR REPLACE(REPLACE(REPLACE(customers.phone_number, '+', ''), ' ', ''), '-', '') = ?
                OR RIGHT(REPLACE(REPLACE(REPLACE(customers.phone_number, '+', ''), ' ', ''), '-', ''), 9) = ?
            )
            AND customers.deleted_at IS NULL
            LIMIT 1
        ";
        
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$phone, $normalizedPhone, $subscriberDigits]);
        $customer = $stmt->fetch(PDO::FETCH_ASSOC);
        
        error_log("Customer search - Found: " . ($customer ? 'YES (ID: ' . $customer['id'] . ')' : 'NO'));
        
        if ($customer) {
            // Parse JSON fields
            if (isset($customer['billing_type']) && $customer['billing_type']) {
                $customer['billing_type'] = json_decode($customer['billing_type'], true);
            }
            if (isset($customer['category']) && $customer['category']) {
                $customer['category'] = json_decode($customer['category'], true);
            }
            if (!empty($customer['phone_number'])) {
                $customer['phone_number'] = normalizeKenyanPhone($customer['phone_number']);
            }
            
            jsonResponse([
                'success' => true,
                'found' => true,
                'data' => $customer
            ]);
        } else {
            jsonResponse([
                'success' => true,
                'found' => false,
                'message' => 'Customer not found with this phone number'
            ]);
        }
    }
    
    // Route: GET /api/view-customer/{id} or /api/customers/{id}
    if ($method === 'GET' && (in_array('view-customer', $pathParts) || (in_array('customers', $pathParts) && count($pathParts) > 1))) {
        $id = end($pathParts);
        
        // Get customer with email and balance
        $stmt = $pdo->prepare("
            SELECT 
                customers.*,
                users.email,
                COALESCE((
                    SELECT SUM(amount) 
                    FROM balances 
                    WHERE balanceable_type = 'App\\\\Models\\\\Customer' 
                    AND balanceable_id = customers.id
                ), 0) as balance
            FROM customers
            LEFT JOIN users ON customers.user_id = users.id
            WHERE customers.id = ?
        ");
        $stmt->execute([$id]);
        $customer = $stmt->fetch();
        
        if (!$customer) {
            jsonResponse(['error' => 'Customer not found'], 404);
        }
        
        // Get services array (for customer list display)
        $servicesStmt = $pdo->prepare("
            SELECT 
                services.id,
                services.plan_name,
                services.mikrotik_ipv4,
                services.status,
                services.online,
                COALESCE(plans.title, services.plan_name) as plan_title
            FROM services
            LEFT JOIN plans ON services.plan_id = plans.id
            WHERE services.customer_id = ?
            ORDER BY services.created_at DESC
        ");
        $servicesStmt->execute([$customer['id']]);
        $services = $servicesStmt->fetchAll();
        
        // Parse status JSON for services
        foreach ($services as &$service) {
            if (isset($service['status']) && $service['status']) {
                $service['status'] = json_decode($service['status'], true);
            }
            // Ensure plan_title exists
            if (empty($service['plan_title'])) {
                $service['plan_title'] = $service['plan_name'] ?? 'Custom Plan';
            }
        }
        
        $customer['services'] = $services;
        
        // Get balances history
        $balancesStmt = $pdo->prepare("
            SELECT * FROM balances 
            WHERE balanceable_type = 'App\\\\Models\\\\Customer' 
            AND balanceable_id = ? 
            ORDER BY created_at DESC 
            LIMIT 20
        ");
        $balancesStmt->execute([$customer['id']]);
        $customer['balances'] = $balancesStmt->fetchAll();
        
        // Parse JSON fields
        if (isset($customer['billing_type']) && $customer['billing_type']) {
            $customer['billing_type'] = json_decode($customer['billing_type'], true);
        }
        if (isset($customer['category']) && $customer['category']) {
            $customer['category'] = json_decode($customer['category'], true);
        }
        
        // Format balance
        $customer['balance'] = (float)($customer['balance'] ?? 0);
        
        // Validate and format date fields
        $customer = formatDateFields($customer, ['created_at', 'updated_at', 'dob', 'verification_date']);
        
        // Also format dates in services and balances arrays
        foreach ($customer['services'] as &$service) {
            $service = formatDateFields($service, ['start_date', 'end_date', 'bill_to', 'created_at', 'updated_at']);
        }
        foreach ($customer['balances'] as &$balance) {
            $balance = formatDateFields($balance, ['created_at', 'updated_at']);
        }
        
        jsonResponse(['customer' => $customer]);
    }
    
    // Route: GET /api/cust-dashboard-stats/{id}
    if ($method === 'GET' && in_array('cust-dashboard-stats', $pathParts)) {
        $userId = end($pathParts);
        
        // Find customer by user_id
        $stmt = $pdo->prepare("SELECT * FROM customers WHERE user_id = ? LIMIT 1");
        $stmt->execute([$userId]);
        $customer = $stmt->fetch();
        
        if (!$customer) {
            jsonResponse(['error' => 'Customer not found'], 404);
        }
        
        // Get services (limit 20, active only)
        $servicesStmt = $pdo->prepare("SELECT * FROM services WHERE customer_id = ? AND JSON_EXTRACT(status, '$.value') != 0 ORDER BY created_at DESC LIMIT 20");
        $servicesStmt->execute([$customer['id']]);
        $services = $servicesStmt->fetchAll();
        
        // Parse status JSON for services
        foreach ($services as &$service) {
            if (isset($service['status']) && $service['status']) {
                $service['status'] = json_decode($service['status'], true);
            }
            if (isset($service['billing_type']) && $service['billing_type']) {
                $service['billing_type'] = json_decode($service['billing_type'], true);
            }
        }
        
        // Get unpaid invoices (limit 10)
        $invoicesStmt = $pdo->prepare("
            SELECT invoices.* 
            FROM invoices 
            LEFT JOIN services ON invoices.services_id = services.id 
            WHERE JSON_EXTRACT(invoices.status, '$.value') = 1 
            AND services.customer_id = ? 
            ORDER BY invoices.created_at DESC 
            LIMIT 10
        ");
        $invoicesStmt->execute([$customer['id']]);
        $invoices = $invoicesStmt->fetchAll();
        
        // Parse status JSON for invoices
        foreach ($invoices as &$invoice) {
            if (isset($invoice['status']) && $invoice['status']) {
                $invoice['status'] = json_decode($invoice['status'], true);
            }
        }
        
        // Parse JSON fields for customer
        if (isset($customer['billing_type']) && $customer['billing_type']) {
            $customer['billing_type'] = json_decode($customer['billing_type'], true);
        }
        if (isset($customer['category']) && $customer['category']) {
            $customer['category'] = json_decode($customer['category'], true);
        }
        
        // Validate and format date fields
        $customer = formatDateFields($customer, ['created_at', 'updated_at', 'dob', 'verification_date']);
        foreach ($services as &$service) {
            $service = formatDateFields($service, ['start_date', 'end_date', 'bill_to', 'created_at', 'updated_at']);
        }
        foreach ($invoices as &$invoice) {
            $invoice = formatDateFields($invoice, ['invoice_date', 'due_date', 'payment_date', 'created_at', 'updated_at']);
        }
        
        jsonResponse([
            'customer' => $customer,
            'services' => $services,
            'invoices' => $invoices
        ]);
    }

    // Route: POST /api/fix-ticket-customer/{ticket_id}
    if ($method === 'POST' && in_array('fix-ticket-customer', $pathParts)) {
        $ticketId = end($pathParts);
        
        if (!$ticketId || !is_numeric($ticketId)) {
            jsonResponse(['error' => 'Invalid ticket ID'], 400);
        }
        
        // Get ticket information
        $stmt = $pdo->prepare("
            SELECT id, customer_phone, subject, number
            FROM tickets 
            WHERE id = ?
        ");
        $stmt->execute([$ticketId]);
        $ticket = $stmt->fetch();
        
        if (!$ticket) {
            jsonResponse(['error' => 'Ticket not found'], 404);
        }
        
        if (empty($ticket['customer_phone'])) {
            jsonResponse(['error' => 'Ticket has no phone number to match'], 400);
        }
        
        // Try to find existing customer by phone
        $customerPhone = $ticket['customer_phone'];
        
        // Prepare different phone format variations
        $phoneFormats = [];
        
        // Only add non-empty phone numbers
        if (!empty($customerPhone)) {
            $phoneFormats[] = $customerPhone; // Original
            $phoneFormats[] = preg_replace('/[^0-9+]/', '', $customerPhone); // Clean
            
            // Handle Kenyan format conversions
            $cleanPhone = preg_replace('/[^0-9+]/', '', $customerPhone);
            
            if (preg_match('/^07\d{8}$/', $cleanPhone)) {
                $phoneFormats[] = '254' . substr($cleanPhone, 1);
                $phoneFormats[] = '+254' . substr($cleanPhone, 1);
            }
            if (preg_match('/^254\d{9}$/', $cleanPhone)) {
                $phoneFormats[] = '0' . substr($cleanPhone, 3);
                $phoneFormats[] = '+' . $cleanPhone;
            }
            if (preg_match('/^\+254\d{9}$/', $cleanPhone)) {
                $phoneFormats[] = substr($cleanPhone, 1);
                $phoneFormats[] = '0' . substr($cleanPhone, 4);
            }
        }
        
        // Remove duplicates and empty values
        $phoneFormats = array_unique(array_filter($phoneFormats));
        
        // Build SQL to search for customer - safer approach
        $customer = null;
        if (!empty($phoneFormats)) {
            $placeholders = str_repeat('?,', count($phoneFormats) - 1) . '?';
            $sql = "SELECT id, name, phone_number FROM customers WHERE phone_number IN ($placeholders) ORDER BY id ASC LIMIT 1";
            $stmt = $pdo->prepare($sql);
            $stmt->execute(array_values($phoneFormats));
            $customer = $stmt->fetch();
        }
        
        if ($customer) {
            // Update ticket with customer ID
            $stmt = $pdo->prepare("UPDATE tickets SET customer_id = ? WHERE id = ?");
            $stmt->execute([$customer['id'], $ticketId]);
            
            jsonResponse([
                'status' => 'success',
                'message' => 'Ticket linked to existing customer',
                'customer_id' => $customer['id'],
                'customer_name' => $customer['name'],
                'customer' => $customer,
                'ticket' => $ticket,
                'phone_formats_tried' => $phoneFormats
            ]);
        } else {
            // Create new customer with better name generation
            $customerName = '';
            
            // Try to extract a meaningful name from ticket subject
            if (!empty($ticket['subject'])) {
                $cleanSubject = preg_replace('/[^\w\s\-\.]/', '', trim($ticket['subject']));
                if (strlen($cleanSubject) >= 3 && !preg_match('/^\d+$/', $cleanSubject)) {
                    $customerName = $cleanSubject;
                }
            }
            
            // If no good name from subject, use phone-based name
            if (empty($customerName)) {
                $customerName = 'Phone: ' . $customerPhone;
            }
            
            $stmt = $pdo->prepare("
                INSERT INTO customers (name, phone_number, created_at, updated_at) 
                VALUES (?, ?, NOW(), NOW())
            ");
            $stmt->execute([$customerName, $customerPhone]);
            $newCustomerId = $pdo->lastInsertId();
            
            // Update ticket with new customer ID
            $stmt = $pdo->prepare("UPDATE tickets SET customer_id = ? WHERE id = ?");
            $stmt->execute([$newCustomerId, $ticketId]);
            
            jsonResponse([
                'status' => 'success',
                'message' => 'Created new customer and linked to ticket',
                'customer_id' => $newCustomerId,
                'customer_name' => $customerName,
                'customer' => [
                    'id' => $newCustomerId,
                    'name' => $customerName,
                    'phone_number' => $customerPhone
                ],
                'ticket' => $ticket,
                'phone_formats_tried' => $phoneFormats
            ]);
        }
    }

    // Route: GET /api/get-customer-locations
    if ($method === 'GET' && end($pathParts) === 'get-customer-locations') {
        $stmt = $pdo->prepare("
            SELECT 
                id,
                name,
                phone_number as phone,
                latitude,
                longitude,
                address
            FROM customers 
            WHERE latitude IS NOT NULL 
            AND longitude IS NOT NULL 
            AND latitude != 0 
            AND longitude != 0
            ORDER BY id ASC
        ");
        $stmt->execute();
        $customers = $stmt->fetchAll();
        
        jsonResponse([
            'success' => true,
            'customers' => $customers,
            'count' => count($customers)
        ]);
    }

    // Route: POST /api/upsert-customer-location
    // Find or create tickets customer by phone, then save GPS (used from billing Add Customer).
    if ($method === 'POST' && end($pathParts) === 'upsert-customer-location') {
        $data = getRequestBody();

        if (!isset($data['latitude']) || !isset($data['longitude'])) {
            jsonResponse(['error' => 'Latitude and longitude are required'], 400);
        }

        $latitude = (float) $data['latitude'];
        $longitude = (float) $data['longitude'];
        if ($latitude < -90 || $latitude > 90 || $longitude < -180 || $longitude > 180) {
            jsonResponse(['error' => 'Invalid coordinates'], 400);
        }

        $phone = !empty($data['phone']) ? normalizeKenyanPhone($data['phone']) : (
            !empty($data['phone_number']) ? normalizeKenyanPhone($data['phone_number']) : ''
        );
        if ($phone === '') {
            jsonResponse(['error' => 'Phone number is required'], 400);
        }

        $name = trim((string)($data['name'] ?? ''));
        if ($name === '') {
            $name = 'Customer ' . $phone;
        }
        $address = isset($data['address']) ? trim((string)$data['address']) : null;
        $city = isset($data['city']) ? trim((string)$data['city']) : null;
        if ($address === '') $address = null;
        if ($city === '') $city = null;

        $subscriberDigits = getKenyanSubscriberDigits($phone);
        $stmt = $pdo->prepare("
            SELECT id, name, phone_number FROM customers
            WHERE deleted_at IS NULL
            AND RIGHT(REPLACE(REPLACE(REPLACE(COALESCE(phone_number,''), '+', ''), ' ', ''), '-', ''), 9) = ?
            ORDER BY id DESC
            LIMIT 1
        ");
        $stmt->execute([$subscriberDigits]);
        $customer = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($customer) {
            $customerId = (int)$customer['id'];
            $stmt = $pdo->prepare("
                UPDATE customers
                SET latitude = ?, longitude = ?,
                    address = COALESCE(NULLIF(?, ''), address),
                    city = COALESCE(NULLIF(?, ''), city),
                    name = CASE WHEN name IS NULL OR name = '' OR name LIKE 'Phone:%' THEN ? ELSE name END,
                    updated_at = NOW()
                WHERE id = ?
            ");
            $stmt->execute([$latitude, $longitude, $address, $city, $name, $customerId]);
        } else {
            $stmt = $pdo->prepare("
                INSERT INTO customers (name, phone_number, address, city, latitude, longitude, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
            ");
            $stmt->execute([$name, $phone, $address, $city, $latitude, $longitude]);
            $customerId = (int)$pdo->lastInsertId();
        }

        jsonResponse([
            'status' => 'success',
            'success' => true,
            'message' => 'Customer location saved',
            'customer_id' => $customerId,
            'latitude' => $latitude,
            'longitude' => $longitude,
            'phone' => $phone,
        ]);
    }

    // Route: POST or PUT /api/update-customer-location/{customer_id}
    if (($method === 'PUT' || $method === 'POST') && in_array('update-customer-location', $pathParts)) {
        $customerId = end($pathParts);
        
        if (!$customerId || !is_numeric($customerId)) {
            jsonResponse(['error' => 'Invalid customer ID'], 400);
        }
        
        $data = getRequestBody();
        
        // Validate required fields
        if (!isset($data['latitude']) || !isset($data['longitude'])) {
            jsonResponse(['error' => 'Latitude and longitude are required'], 400);
        }
        
        $latitude = (float) $data['latitude'];
        $longitude = (float) $data['longitude'];
        
        // Validate coordinates
        if ($latitude < -90 || $latitude > 90 || $longitude < -180 || $longitude > 180) {
            jsonResponse(['error' => 'Invalid coordinates'], 400);
        }
        
        // Check if customer exists
        $stmt = $pdo->prepare("SELECT id, name FROM customers WHERE id = ?");
        $stmt->execute([$customerId]);
        $customer = $stmt->fetch();
        
        if (!$customer) {
            jsonResponse(['error' => 'Customer not found'], 404);
        }
        
        // Update customer location
        $stmt = $pdo->prepare("
            UPDATE customers 
            SET latitude = ?, longitude = ?, updated_at = NOW() 
            WHERE id = ?
        ");
        $stmt->execute([$latitude, $longitude, $customerId]);
        
        jsonResponse([
            'status' => 'success',
            'message' => 'Customer location updated successfully',
            'customer_id' => $customerId,
            'customer_name' => $customer['name'],
            'latitude' => $latitude,
            'longitude' => $longitude
        ]);
    }

    // Route: GET /api/get-customer-location/{customer_id}
    if ($method === 'GET' && in_array('get-customer-location', $pathParts)) {
        $customerId = end($pathParts);
        
        if (!$customerId || !is_numeric($customerId)) {
            jsonResponse(['error' => 'Invalid customer ID'], 400);
        }
        
        // Check if customer exists and get location
        $stmt = $pdo->prepare("SELECT id, name, latitude, longitude, updated_at FROM customers WHERE id = ?");
        $stmt->execute([$customerId]);
        $customer = $stmt->fetch();
        
        if (!$customer) {
            jsonResponse(['error' => 'Customer not found'], 404);
        }
        
        // Check if location exists
        $hasLocation = !empty($customer['latitude']) && !empty($customer['longitude']) && 
                       $customer['latitude'] != 0 && $customer['longitude'] != 0;
        
        jsonResponse([
            'status' => 'success',
            'customer_id' => $customer['id'],
            'customer_name' => $customer['name'],
            'has_location' => $hasLocation,
            'latitude' => $hasLocation ? (float)$customer['latitude'] : null,
            'longitude' => $hasLocation ? (float)$customer['longitude'] : null,
            'updated_at' => $customer['updated_at']
        ]);
    }
    
    // Route not found - show API documentation
    jsonResponse([
        'success' => true,
        'name' => 'Customers API',
        'version' => '1.0',
        'description' => 'Manage customer data and operations',
        'endpoints' => [
            'GET /api/list-customers' => [
                'description' => 'List all customers with pagination and filters',
                'method' => 'GET',
                'parameters' => [
                    'q' => 'Search query (optional)',
                    'status' => 'Filter by status (optional)',
                    'page' => 'Page number (default: 1)',
                    'per_page' => 'Items per page (default: 10)',
                    'sort' => 'Sort direction: asc/desc (default: asc)',
                    'sort_col' => 'Sort column (default: id)'
                ],
                'authentication' => 'Bearer token required'
            ],
            'POST /api/add-customers' => [
                'description' => 'Create a new customer',
                'method' => 'POST',
                'body' => [
                    'name' => 'Customer name (required)',
                    'phone_number' => 'Phone number (optional)',
                    'email' => 'Email address (optional)',
                    'password' => 'Password (optional, min 6 chars)',
                    'billing_type' => 'Billing type object (optional)',
                    'category' => 'Category object (optional)',
                    'dob' => 'Date of birth (optional)',
                    'address' => 'Address (optional)',
                    'city' => 'City (optional)'
                ],
                'authentication' => 'Bearer token required'
            ],
            'GET /api/view-customer/{id}' => [
                'description' => 'Get detailed customer information by ID',
                'method' => 'GET',
                'authentication' => 'Bearer token required'
            ],
            'PUT /api/update-customer/{id}' => [
                'description' => 'Update customer information',
                'method' => 'PUT',
                'body' => 'Same fields as add-customers',
                'authentication' => 'Bearer token required'
            ],
            'GET /api/cust-dashboard-stats/{id}' => [
                'description' => 'Get customer dashboard statistics including services and invoices',
                'method' => 'GET',
                'authentication' => 'Bearer token required',
                'response' => 'Returns customer details, active services (max 20), and unpaid invoices (max 10)'
            ]
        ],
        'authentication' => 'Bearer token in Authorization header',
        'example_usage' => [
            'list_customers' => 'GET /api/list-customers?page=1&per_page=20&q=john',
            'view_customer' => 'GET /api/view-customer/123',
            'customer_stats' => 'GET /api/cust-dashboard-stats/123'
        ],
        'database' => 'tonycommgroupltd_db',
        'note' => 'All endpoints require authentication. Invalid route requested.'
    ]);
    
} catch (PDOException $e) {
    jsonResponse(['error' => 'Database error: ' . $e->getMessage()], 500);
}

