<?php
/**
 * Service Endpoints with RADIUS Integration
 * POST /api/add-service - Create PPPoE service with RADIUS sync
 * PUT /api/update-service/{id} - Update service
 * DELETE /api/delete-service/{id} - Delete service
 * POST /api/activate-service/{id} - Activate service
 * POST /api/suspend-service/{id} - Suspend service
 * GET /api/list-services - List services
 * GET /api/view-service/{id} - View service details
 */

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/radius/PPPoERadiusSync.php';

setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$pathParts = explode('/', trim($path, '/'));

// If accessing directly, show API info
$lastPart = end($pathParts);
if ($lastPart === 'services.php' || ($lastPart === 'api' && $method === 'GET')) {
    if ($method === 'GET') {
        jsonResponse([
            'success' => true,
            'name' => 'Services API',
            'version' => '1.0',
            'description' => 'PPPoE service management with RADIUS integration',
            'endpoints' => [
                'POST /api/add-service' => 'Create new PPPoE service (syncs with RADIUS)',
                'PUT /api/update-service/{id}' => 'Update service details',
                'DELETE /api/delete-service/{id}' => 'Delete service',
                'POST /api/activate-service/{id}' => 'Activate suspended service',
                'POST /api/suspend-service/{id}' => 'Suspend active service',
                'GET /api/list-services' => 'List all services with pagination',
                'GET /api/view-service/{id}' => 'Get service details by ID',
            ],
            'authentication' => 'Required - Bearer token',
            'radius_integration' => true,
            'features' => [
                'Automatic RADIUS user creation',
                'Password management',
                'Plan-based speed limits',
                'Service activation/suspension',
                'Real-time status sync',
            ]
        ]);
    }
}

$user = checkAuth();
$pdo = getDB();

// Remove 'api' from path if present (for consistent routing)
if (!empty($pathParts) && $pathParts[0] === 'api') {
    array_shift($pathParts);
}

try {
    // Initialize RADIUS sync
    $pppoeRadius = new PPPoERadiusSync();
    
    // POST /api/add-service or /api/add-services (support both for compatibility)
    if ($method === 'POST' && (end($pathParts) === 'add-service' || end($pathParts) === 'add-services')) {
        $data = getRequestBody();
        
        // Handle plan object format (frontend may send plan object or plan_id)
        if (isset($data['plan']) && is_array($data['plan'])) {
            $data['plan_id'] = $data['plan']['id'] ?? $data['plan']['value'] ?? $data['plan_id'] ?? null;
        }
        
        // Validation
        $errors = [];
        if (empty($data['customer_id'])) {
            $errors['customer_id'] = ['Customer ID is required.'];
        }
        if (empty($data['plan_id'])) {
            $errors['plan'] = ['Plan is required.'];
            $errors['plan_id'] = ['Plan ID is required.'];
        }
        if (empty($data['mikrotik_name'])) {
            $errors['mikrotik_name'] = ['Username is required.'];
        } elseif (!preg_match('/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/', $data['mikrotik_name'])) {
            $errors['mikrotik_name'] = ['Invalid username format. Only letters, numbers, and dashes allowed.'];
        }
        if (empty($data['mikrotik_password'])) {
            $errors['mikrotik_password'] = ['Password is required.'];
        } elseif (strlen($data['mikrotik_password']) < 4) {
            $errors['mikrotik_password'] = ['Password must be at least 4 characters.'];
        }
        if (empty($data['price'])) {
            $errors['price'] = ['Price is required.'];
        }
        
        // Check username uniqueness
        if (!empty($data['mikrotik_name'])) {
            $stmt = $pdo->prepare("SELECT id FROM services WHERE mikrotik_name = ? AND deleted_at IS NULL LIMIT 1");
            $stmt->execute([$data['mikrotik_name']]);
            if ($stmt->fetch()) {
                $errors['mikrotik_name'] = ['This username is already taken.'];
            }
        }
        
        // Check customer exists
        if (!empty($data['customer_id'])) {
            $stmt = $pdo->prepare("SELECT id FROM customers WHERE id = ? AND deleted_at IS NULL LIMIT 1");
            $stmt->execute([$data['customer_id']]);
            if (!$stmt->fetch()) {
                $errors['customer_id'] = ['Customer not found.'];
            }
        }
        
        if (!empty($errors)) {
            jsonResponse($errors, 422);
        }
        
        // Get plan details (for rate limits)
        $planStmt = $pdo->prepare("SELECT * FROM plans WHERE id = ? AND deleted_at IS NULL");
        $planStmt->execute([$data['plan_id']]);
        $plan = $planStmt->fetch();
        
        if (!$plan) {
            jsonResponse(['plan_id' => ['Plan not found.']], 404);
        }
        
        // Parse rate_limit JSON
        $rateLimit = json_decode($plan['rate_limit'], true);
        $groupName = !empty($rateLimit['label']) ? $rateLimit['label'] : 'default'; // Use label as group name (e.g., "5mbps")
        $rateLimitValue = !empty($rateLimit['value']) ? $rateLimit['value'] : '5M/5M'; // e.g., "5M/5M"
        
        // Get router ID from plan
        $routerId = $plan['router_id'];
        
        // Parse rate limits (format: "5M/5M" or "5M")
        $uploadSpeed = '5M';
        $downloadSpeed = '5M';
        if (preg_match('/^(\d+M)\/(\d+M)$/i', $rateLimitValue, $matches)) {
            $uploadSpeed = strtoupper($matches[1]);
            $downloadSpeed = strtoupper($matches[2]);
        } elseif (preg_match('/^(\d+M)$/i', $rateLimitValue, $matches)) {
            $uploadSpeed = strtoupper($matches[1]);
            $downloadSpeed = strtoupper($matches[1]);
        }
        
        // Create rate limit group in RADIUS (if doesn't exist)
        try {
            $pppoeRadius->createRateLimitGroup($groupName, $uploadSpeed, $downloadSpeed);
        } catch (Exception $e) {
            error_log("Warning: Could not create rate limit group: " . $e->getMessage());
            // Continue anyway - group might exist or will be created later
        }
        
        // Prepare status
        $statusValue = isset($data['status']) && is_array($data['status']) 
            ? ($data['status']['value'] ?? 2) 
            : (isset($data['status']) ? $data['status'] : 2);
        $statusJson = json_encode(['value' => $statusValue]);
        
        // Create service in BOTH databases (main DB + RADIUS)
        $serviceId = $pppoeRadius->createOrUpdateService(
            customerId: $data['customer_id'],
            mikrotikName: $data['mikrotik_name'],
            mikrotikPassword: $data['mikrotik_password'],
            planId: $data['plan_id'],
            routerId: $routerId,
            price: floatval($data['price']),
            groupName: $groupName
        );
        
        // Update additional fields if provided
        $updateFields = [];
        $updateParams = [];
        
        if (!empty($data['start_date'])) {
            $updateFields[] = "start_date = ?";
            $updateParams[] = $data['start_date'];
        }
        if (!empty($data['end_date'])) {
            $updateFields[] = "end_date = ?";
            $updateParams[] = $data['end_date'];
        }
        if (!empty($data['billing_type'])) {
            $billingTypeJson = is_array($data['billing_type']) ? json_encode($data['billing_type']) : $data['billing_type'];
            $updateFields[] = "billing_type = ?";
            $updateParams[] = $billingTypeJson;
        }
        if (isset($statusJson)) {
            $updateFields[] = "status = ?";
            $updateParams[] = $statusJson;
        }
        
        if (!empty($updateFields)) {
            $updateParams[] = $serviceId;
            $stmt = $pdo->prepare("UPDATE services SET " . implode(", ", $updateFields) . " WHERE id = ?");
            $stmt->execute($updateParams);
        }
        
        // Get created service
        $stmt = $pdo->prepare("
            SELECT s.*, p.title as plan_title, r.nas_ip as router_ip, r.title as router_title, c.name as customer_name
            FROM services s
            LEFT JOIN plans p ON s.plan_id = p.id
            LEFT JOIN routers r ON s.router_id = r.id
            LEFT JOIN customers c ON s.customer_id = c.id
            WHERE s.id = ?
        ");
        $stmt->execute([$serviceId]);
        $service = $stmt->fetch();
        
        // Parse JSON fields and validate dates
        if ($service) {
            if (!empty($service['status'])) {
                $service['status'] = json_decode($service['status'], true);
            }
            if (!empty($service['billing_type'])) {
                $service['billing_type'] = json_decode($service['billing_type'], true);
            }
            
            // Validate and format date fields using helper function
            $service = formatDateFields($service);
        }
        
        jsonResponse([
            'message' => 'Service created successfully with RADIUS sync',
            'service' => $service
        ], 201);
    }
    
    // GET /api/list-services/{customer_id} or /api/list-services
    // Handle dynamic route: /api/list-services/{id}
    $isListServicesRoute = in_array('list-services', $pathParts);
    $customerIdFromRoute = null;
    
    if ($isListServicesRoute && count($pathParts) > 1) {
        // Dynamic route: /api/list-services/{customer_id}
        $lastPart = end($pathParts);
        $secondLastPart = $pathParts[count($pathParts) - 2];
        
        // Check if last part is a number (customer ID) and second last is 'list-services'
        if ($secondLastPart === 'list-services' && is_numeric($lastPart)) {
            $customerIdFromRoute = intval($lastPart);
        }
    }
    
    if ($method === 'GET' && ($isListServicesRoute || end($pathParts) === 'services')) {
        $page = isset($_GET['page']) ? max(1, intval($_GET['page'])) : 1;
        $perPage = isset($_GET['per_page']) ? max(1, min(100, intval($_GET['per_page']))) : 20;
        $offset = ($page - 1) * $perPage;
        
        // Build query
        $where = ["s.deleted_at IS NULL"];
        $params = [];
        
        // Priority: customer_id from route > query parameter
        $customerId = $customerIdFromRoute ?? (!empty($_GET['customer_id']) ? intval($_GET['customer_id']) : null);
        
        // Filter by customer_id if provided
        if ($customerId !== null) {
            $where[] = "s.customer_id = :customer_id";
            $params[':customer_id'] = $customerId;
        }
        
        // Filter by router_id if provided
        if (!empty($_GET['router_id'])) {
            $where[] = "s.router_id = :router_id";
            $params[':router_id'] = intval($_GET['router_id']);
        }
        
        // Search query
        $searchQuery = !empty($_GET['q']) ? trim($_GET['q']) : '';
        if (!empty($searchQuery)) {
            $where[] = "(p.title LIKE :search OR s.mikrotik_name LIKE :search)";
            $params[':search'] = '%' . $searchQuery . '%';
        }
        
        $whereClause = implode(' AND ', $where);
        
        // Get sort parameters
        $sortCol = !empty($_GET['sort_col']) ? $_GET['sort_col'] : 'id';
        $sort = !empty($_GET['sort']) ? strtoupper($_GET['sort']) : 'ASC';
        
        // Validate sort column (prevent SQL injection)
        $allowedSortCols = ['id', 'created_at', 'updated_at', 'mikrotik_name', 'price', 'start_date', 'end_date'];
        if (!in_array($sortCol, $allowedSortCols)) {
            $sortCol = 'id';
        }
        if ($sort !== 'ASC' && $sort !== 'DESC') {
            $sort = 'ASC';
        }
        
        // Add table prefix to sort column if needed
        if (in_array($sortCol, ['id', 'created_at', 'updated_at', 'mikrotik_name', 'price', 'start_date', 'end_date'])) {
            $sortCol = 's.' . $sortCol;
        }
        
        $limitValue = intval($perPage);
        $offsetValue = intval($offset);
        
        try {
            // Count total
            $countSql = "
                SELECT COUNT(*) as total
                FROM services s
                LEFT JOIN plans p ON s.plan_id = p.id
                LEFT JOIN customers c ON s.customer_id = c.id
                WHERE $whereClause
            ";
            $countStmt = $pdo->prepare($countSql);
            foreach ($params as $key => $value) {
                $countStmt->bindValue($key, $value);
            }
            $countStmt->execute();
            $total = $countStmt->fetch()['total'];
            
            // Get services
            $sql = "
                SELECT s.*, 
                       p.title as plan_title, 
                       p.id as plan_id,
                       r.nas_ip as router_ip, 
                       r.title as router_title, 
                       c.name as customer_name, 
                       c.phone_number as customer_phone
                FROM services s
                LEFT JOIN plans p ON s.plan_id = p.id
                LEFT JOIN routers r ON s.router_id = r.id
                LEFT JOIN customers c ON s.customer_id = c.id
                WHERE $whereClause
                ORDER BY $sortCol $sort
                LIMIT :limit_val OFFSET :offset_val
            ";
            
            $stmt = $pdo->prepare($sql);
            
            // Bind all parameters
            foreach ($params as $key => $value) {
                $stmt->bindValue($key, $value);
            }
            $stmt->bindValue(':limit_val', $limitValue, PDO::PARAM_INT);
            $stmt->bindValue(':offset_val', $offsetValue, PDO::PARAM_INT);
            
            $stmt->execute();
            $services = $stmt->fetchAll();
        } catch (PDOException $e) {
            error_log("List services query error: " . $e->getMessage() . " | SQL: $sql");
            throw $e;
        }
        
        // Parse JSON fields and validate dates
        foreach ($services as &$service) {
            if (!empty($service['status'])) {
                $service['status'] = json_decode($service['status'], true);
            }
            if (!empty($service['billing_type'])) {
                $service['billing_type'] = json_decode($service['billing_type'], true);
            }
            
            // Validate and format date fields using helper function
            $service = formatDateFields($service);
        }
        
        jsonResponse([
            'data' => $services,
            'total' => $total,
            'page' => $page,
            'per_page' => $perPage,
            'total_pages' => ceil($total / $perPage)
        ], 200);
    }
    
    // GET /api/view-service/{id} or /api/view-services/{id}
    if ($method === 'GET' && (in_array('view-service', $pathParts) || in_array('view-services', $pathParts))) {
        // Extract service ID - it's the last part after 'view-service' or 'view-services'
        $lastPart = end($pathParts);
        $secondLastPart = $pathParts[count($pathParts) - 2] ?? '';
        
        // Check if we have a numeric ID after the route name
        if (($secondLastPart === 'view-service' || $secondLastPart === 'view-services') && is_numeric($lastPart)) {
            $serviceId = intval($lastPart);
        } elseif (is_numeric($lastPart)) {
            // Fallback: if last part is numeric, use it
            $serviceId = intval($lastPart);
        } else {
            jsonResponse(['error' => 'Invalid service ID'], 400);
        }
        
        $stmt = $pdo->prepare("
            SELECT s.*, p.title as plan_title, p.rate_limit as plan_rate_limit, 
                   r.nas_ip as router_ip, r.title as router_title, r.host as router_host,
                   c.name as customer_name, c.phone_number as customer_phone, c.email as customer_email
            FROM services s
            LEFT JOIN plans p ON s.plan_id = p.id
            LEFT JOIN routers r ON s.router_id = r.id
            LEFT JOIN customers c ON s.customer_id = c.id
            WHERE s.id = ? AND s.deleted_at IS NULL
        ");
        $stmt->execute([$serviceId]);
        $service = $stmt->fetch();
        
        if (!$service) {
            jsonResponse(['error' => 'Service not found'], 404);
        }
        
        // Parse JSON fields and validate dates
        if (!empty($service['status'])) {
            $service['status'] = json_decode($service['status'], true);
        }
        if (!empty($service['billing_type'])) {
            $service['billing_type'] = json_decode($service['billing_type'], true);
        }
        if (!empty($service['plan_rate_limit'])) {
            $service['plan_rate_limit'] = json_decode($service['plan_rate_limit'], true);
        }
        
        // Validate and format date fields using helper function
        $service = formatDateFields($service);
        
        jsonResponse(['service' => $service], 200);
    }
    
    // PUT or POST /api/update-service/{id} or /api/update-services/{id}
    if (($method === 'PUT' || $method === 'POST') && 
        (in_array('update-service', $pathParts) || in_array('update-services', $pathParts))) {
        // Extract service ID - it's the last part after 'update-service' or 'update-services'
        $lastPart = end($pathParts);
        $secondLastPart = $pathParts[count($pathParts) - 2] ?? '';
        
        // Check if we have a numeric ID after the route name
        if (($secondLastPart === 'update-service' || $secondLastPart === 'update-services') && is_numeric($lastPart)) {
            $serviceId = intval($lastPart);
        } elseif (is_numeric($lastPart)) {
            // Fallback: if last part is numeric, use it
            $serviceId = intval($lastPart);
        } else {
            jsonResponse(['error' => 'Invalid service ID'], 400);
        }
        
        $data = getRequestBody();
        
        // Get existing service
        $stmt = $pdo->prepare("SELECT * FROM services WHERE id = ? AND deleted_at IS NULL");
        $stmt->execute([$serviceId]);
        $existingService = $stmt->fetch();
        
        if (!$existingService) {
            jsonResponse(['error' => 'Service not found'], 404);
        }
        
        // Determine if RADIUS sync is needed
        $needsRadiusSync = false;
        $newMikrotikName = $data['mikrotik_name'] ?? $existingService['mikrotik_name'];
        $newMikrotikPassword = $data['mikrotik_password'] ?? $existingService['mikrotik_password'];
        $newPlanId = !empty($data['plan_id']) ? intval($data['plan_id']) : $existingService['plan_id'];
        
        // Check what changed that requires RADIUS sync
        if (!empty($data['mikrotik_password']) && $data['mikrotik_password'] !== $existingService['mikrotik_password']) {
            $needsRadiusSync = true;
        }
        if (!empty($data['mikrotik_name']) && $data['mikrotik_name'] !== $existingService['mikrotik_name']) {
            $needsRadiusSync = true;
        }
        if ($newPlanId != $existingService['plan_id']) {
            $needsRadiusSync = true;
        }
        
        // Get plan details for RADIUS sync and router assignment
        $plan = null;
        $routerId = $existingService['router_id'];
        $groupName = 'default';
        
        if ($newPlanId) {
            $planStmt = $pdo->prepare("SELECT rate_limit, router_id FROM plans WHERE id = ?");
            $planStmt->execute([$newPlanId]);
            $plan = $planStmt->fetch();
            
            if ($plan) {
                $rateLimit = json_decode($plan['rate_limit'] ?? '{}', true);
                $groupName = !empty($rateLimit['label']) ? $rateLimit['label'] : 'default';
                
                // If plan has a router_id, use it; otherwise keep existing router_id
                if (!empty($plan['router_id'])) {
                    $routerId = intval($plan['router_id']);
                }
            }
        }
        
        // Sync to RADIUS if needed
        if ($needsRadiusSync) {
            try {
                $pppoeRadius->createOrUpdateService(
                    customerId: $existingService['customer_id'],
                    mikrotikName: $newMikrotikName,
                    mikrotikPassword: $newMikrotikPassword,
                    planId: $newPlanId,
                    routerId: $routerId,
                    price: !empty($data['price']) ? floatval($data['price']) : floatval($existingService['price']),
                    groupName: $groupName
                );
            } catch (Exception $e) {
                error_log("RADIUS sync error during service update: " . $e->getMessage());
                // Continue with DB update even if RADIUS sync fails
            }
        }
        
        // Build update fields for main DB
        $updateFields = [];
        $updateParams = [];
        
        // Update plan_id if changed
        if (!empty($data['plan_id']) && intval($data['plan_id']) != $existingService['plan_id']) {
            $updateFields[] = "plan_id = ?";
            $updateParams[] = intval($data['plan_id']);
            
            // Update router_id if plan has one
            if ($routerId && $routerId != $existingService['router_id']) {
                $updateFields[] = "router_id = ?";
                $updateParams[] = $routerId;
            }
        }
        
        // Update mikrotik_name if changed
        if (!empty($data['mikrotik_name']) && $data['mikrotik_name'] !== $existingService['mikrotik_name']) {
            $updateFields[] = "mikrotik_name = ?";
            $updateParams[] = $data['mikrotik_name'];
        }
        
        // Update mikrotik_password if provided
        if (!empty($data['mikrotik_password'])) {
            $updateFields[] = "mikrotik_password = ?";
            $updateParams[] = $data['mikrotik_password'];
        }
        
        // Update price
        if (isset($data['price'])) {
            $updateFields[] = "price = ?";
            $updateParams[] = floatval($data['price']);
        }
        
        // Update start_date
        if (isset($data['start_date'])) {
            if (!empty($data['start_date']) && $data['start_date'] !== 'null' && $data['start_date'] !== 'NULL') {
                // Parse the date string from frontend (may be in various formats)
                $timestamp = strtotime($data['start_date']);
                if ($timestamp !== false && $timestamp > 0) {
                    $startDate = date('Y-m-d H:i:s', $timestamp);
                    if ($startDate && $startDate !== '1970-01-01 00:00:00') {
                        $updateFields[] = "start_date = ?";
                        $updateParams[] = $startDate;
                    }
                }
            } else {
                // Set to NULL using separate UPDATE statement or handle in SQL
                $updateFields[] = "start_date = NULL";
            }
        }
        
        // Update end_date
        if (isset($data['end_date'])) {
            if (!empty($data['end_date']) && $data['end_date'] !== 'null' && $data['end_date'] !== 'NULL') {
                $timestamp = strtotime($data['end_date']);
                if ($timestamp !== false && $timestamp > 0) {
                    $endDate = date('Y-m-d H:i:s', $timestamp);
                    if ($endDate && $endDate !== '1970-01-01 00:00:00') {
                        $updateFields[] = "end_date = ?";
                        $updateParams[] = $endDate;
                    }
                }
            } else {
                $updateFields[] = "end_date = NULL";
            }
        }
        
        // Update bill_to
        if (isset($data['bill_to'])) {
            if (!empty($data['bill_to']) && $data['bill_to'] !== 'null' && $data['bill_to'] !== 'NULL') {
                $timestamp = strtotime($data['bill_to']);
                if ($timestamp !== false && $timestamp > 0) {
                    $billToDate = date('Y-m-d H:i:s', $timestamp);
                    if ($billToDate && $billToDate !== '1970-01-01 00:00:00') {
                        $updateFields[] = "bill_to = ?";
                        $updateParams[] = $billToDate;
                    }
                }
            } else {
                $updateFields[] = "bill_to = NULL";
            }
        }
        
        // Update billing_type
        if (!empty($data['billing_type'])) {
            $billingTypeJson = is_array($data['billing_type']) ? json_encode($data['billing_type']) : $data['billing_type'];
            $updateFields[] = "billing_type = ?";
            $updateParams[] = $billingTypeJson;
        }
        
        // Note: billing_period column doesn't exist in services table, so we skip it
        // If you need billing_period, it would need to be added to the database schema first
        
        // Update status
        if (isset($data['status'])) {
            $statusJson = is_array($data['status']) ? json_encode($data['status']) : $data['status'];
            $updateFields[] = "status = ?";
            $updateParams[] = $statusJson;
        }
        
        // Execute update if there are fields to update
        if (!empty($updateFields)) {
            // Build SQL parts and parameters - keep them in sync
            $sqlParts = [];
            $params = [];
            
            // Iterate through updateFields and match with updateParams
            $paramIndex = 0;
            foreach ($updateFields as $field) {
                if (strpos($field, '= NULL') !== false || strpos($field, '=NULL') !== false) {
                    // Direct NULL assignment (no parameter needed)
                    $sqlParts[] = $field;
                    // Don't increment paramIndex - no parameter for this field
                } else {
                    // Parameterized query (has ? placeholder)
                    $sqlParts[] = $field;
                    // Make sure we have a parameter for this placeholder
                    if (!isset($updateParams[$paramIndex])) {
                        error_log("Parameter mismatch: Field '$field' needs parameter but updateParams[$paramIndex] not set. Total params: " . count($updateParams));
                        jsonResponse(['error' => 'Internal error: Parameter mismatch'], 500);
                    }
                    $params[] = $updateParams[$paramIndex];
                    $paramIndex++;
                }
            }
            
            // Verify we used exactly the right number of parameters
            // $paramIndex should equal count($updateParams) since each parameter corresponds to a ? placeholder
            if ($paramIndex !== count($updateParams)) {
                $errorMsg = "Parameter count mismatch: Used $paramIndex placeholders but have " . count($updateParams) . " parameters";
                error_log("Update service error: $errorMsg");
                error_log("SQL parts: " . json_encode($sqlParts));
                error_log("Update params: " . json_encode($updateParams));
                jsonResponse(['error' => 'Internal error: Parameter count mismatch'], 500);
            }
            
            // Add service ID as last parameter
            $params[] = $serviceId;
            
            // Build SQL with NULL handling
            $sql = "UPDATE services SET " . implode(", ", $sqlParts) . ", updated_at = NOW() WHERE id = ?";
            
            try {
                $stmt = $pdo->prepare($sql);
                $stmt->execute($params);
            } catch (PDOException $e) {
                error_log("Update service SQL error: " . $e->getMessage());
                error_log("SQL: $sql");
                error_log("Params count: " . count($params) . " | Values: " . json_encode($params));
                error_log("UpdateFields count: " . count($updateFields) . " | Fields: " . json_encode($updateFields));
                error_log("SQL parts: " . json_encode($sqlParts));
                jsonResponse(['error' => 'Failed to update service: ' . $e->getMessage()], 500);
            }
        } else {
            // No fields to update, but still return success
            jsonResponse(['message' => 'No changes detected', 'service' => $existingService], 200);
        }
        
        // Get and return updated service
        $stmt = $pdo->prepare("
            SELECT s.*, p.title as plan_title, r.nas_ip as router_ip, r.title as router_title, c.name as customer_name
            FROM services s
            LEFT JOIN plans p ON s.plan_id = p.id
            LEFT JOIN routers r ON s.router_id = r.id
            LEFT JOIN customers c ON s.customer_id = c.id
            WHERE s.id = ?
        ");
        $stmt->execute([$serviceId]);
        $updatedService = $stmt->fetch();
        
        // Parse JSON fields and format dates
        if ($updatedService) {
            if (!empty($updatedService['status'])) {
                $updatedService['status'] = json_decode($updatedService['status'], true);
            }
            if (!empty($updatedService['billing_type'])) {
                $updatedService['billing_type'] = json_decode($updatedService['billing_type'], true);
            }
            // Note: billing_period column doesn't exist in services table
            if (!empty($updatedService['plan_rate_limit'])) {
                $updatedService['plan_rate_limit'] = json_decode($updatedService['plan_rate_limit'], true);
            }
            
            // Format date fields
            $updatedService = formatDateFields($updatedService);
        }
        
        jsonResponse([
            'message' => 'Service updated successfully',
            'service' => $updatedService
        ], 200);
    }
    
    // POST /api/activate-service/{id}
    if ($method === 'POST' && in_array('activate-service', $pathParts)) {
        $serviceId = end($pathParts);
        
        if (!is_numeric($serviceId)) {
            jsonResponse(['error' => 'Invalid service ID'], 400);
        }
        
        $pppoeRadius->activateService($serviceId);
        jsonResponse(['message' => 'Service activated successfully'], 200);
    }
    
    // POST /api/suspend-service/{id}
    if ($method === 'POST' && in_array('suspend-service', $pathParts)) {
        $serviceId = end($pathParts);
        
        if (!is_numeric($serviceId)) {
            jsonResponse(['error' => 'Invalid service ID'], 400);
        }
        
        $pppoeRadius->suspendService($serviceId);
        jsonResponse(['message' => 'Service suspended successfully'], 200);
    }
    
    // DELETE /api/delete-service/{id}
    if ($method === 'DELETE' && in_array('delete-service', $pathParts)) {
        $serviceId = end($pathParts);
        
        if (!is_numeric($serviceId)) {
            jsonResponse(['error' => 'Invalid service ID'], 400);
        }
        
        $pppoeRadius->deleteService($serviceId);
        jsonResponse(['message' => 'Service deleted successfully'], 200);
    }
    
    jsonResponse(['error' => 'Endpoint not found'], 404);
    
} catch (Exception $e) {
    error_log("Service API Error: " . $e->getMessage() . "\n" . $e->getTraceAsString());
    jsonResponse(['error' => $e->getMessage()], 500);
}

