<?php
/**
 * Customer Creators API
 * Location: api/customer-creators.php
 * Description: Handles CRUD operations for potential customers (prospects)
 * Access: api.tonycommgroupltd.com/api/customer-creators.php
 */

require_once __DIR__ . '/helpers.php';

/**
 * Log user activity
 */
function logActivity($activityType, $description, $targetType = null, $targetId = null, $user = null) {
    try {
        $db = getDB();
        
        // Check if table exists first
        $stmt = $db->query("SHOW TABLES LIKE 'activity_logs'");
        if ($stmt->rowCount() === 0) {
            return; // Skip logging if table doesn't exist
        }
        
        $stmt = $db->prepare("
            INSERT INTO activity_logs (user_id, user_name, user_email, activity_type, activity_description, target_type, target_id, ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        
        $stmt->execute([
            $user['id'] ?? null,
            $user['name'] ?? $user['display_name'] ?? null,
            $user['email'] ?? null,
            $activityType,
            $description,
            $targetType,
            $targetId,
            $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? null,
            $_SERVER['HTTP_USER_AGENT'] ?? null
        ]);
    } catch (Exception $e) {
        // Don't break the main flow if logging fails
        error_log("Activity logging failed: " . $e->getMessage());
    }
}

setCorsHeaders();

header('Content-Type: application/json');

// Authentication and Authorization Check
try {
    $token = getAuthToken();
    if (!$token) {
        jsonResponse(['error' => 'Unauthorized - Token required'], 401);
    }

    $decoded = verifyToken($token);
    if (!$decoded) {
        jsonResponse(['error' => 'Unauthorized - Invalid or expired token'], 401);
    }

    // Get current user
    $currentUser = getUserWithRoles($decoded['user_id']);
    if (!$currentUser) {
        jsonResponse(['error' => 'User not found'], 404);
    }
    
    // Make currentUser globally accessible for logging
    $GLOBALS['currentUser'] = $currentUser;

    // Ensure all_roles is set (in case user has no roles)
    if (!isset($currentUser['all_roles'])) {
        $currentUser['all_roles'] = [];
    }

    // Allow access for customer creators, technicians, engineers, and admins
    $allowedRoles = ['customer-creator', 'technician', 'engineer', 'administrator', 'super-administrator'];
    $hasAccess = false;
    foreach ($allowedRoles as $role) {
        if (in_array($role, $currentUser['all_roles'])) {
            $hasAccess = true;
            break;
        }
    }

    if (!$hasAccess) {
        jsonResponse(['error' => 'Forbidden - Customer creator, technician, engineer, or admin access required'], 403);
    }
} catch (Exception $e) {
    jsonResponse([
        'error' => 'Authentication error',
        'message' => $e->getMessage(),
        'file' => basename($e->getFile()),
        'line' => $e->getLine()
    ], 500);
}

$method = $_SERVER['REQUEST_METHOD'];
$request = explode('/', trim($_SERVER['PATH_INFO'] ?? '', '/'));
$action = $request[0] ?? '';
$id = $request[1] ?? null;

// If accessing customer-creators.php directly without action, show API info
if (empty($action) || $action === 'customer-creators.php') {
    if ($method === 'GET') {
        echo json_encode([
            'success' => true,
            'name' => 'Customer Creators API',
            'version' => '1.0',
            'endpoints' => [
                'GET /api/customer-creators.php/list' => 'Get all customer creators',
                'POST /api/customer-creators.php/add' => 'Create new customer creator',
                'GET /api/customer-creators.php/view/{id}' => 'Get customer creator by ID',
                'PUT /api/customer-creators.php/update/{id}' => 'Update customer creator',
                'DELETE /api/customer-creators.php/delete/{id}' => 'Delete customer creator',
                'GET /api/customer-creators.php/stats' => 'Get customer creator statistics',
                'GET /api/customer-creators.php/by-user/{email}' => 'Get customer creators by created_by email'
            ],
            'database' => 'tonycommgroupltd_db'
        ]);
        exit();
    }
}

try {
    $db = getDB();
    
    switch ($action) {
        case 'list':
            if ($method === 'GET') {
                listCustomerCreators($db);
            }
            break;

        case 'add':
            if ($method === 'POST') {
                addCustomerCreator($db);
            }
            break;

        case 'view':
            if ($method === 'GET' && $id) {
                viewCustomerCreator($db, $id);
            }
            break;

        case 'update':
            if ($method === 'PUT' && $id) {
                updateCustomerCreator($db, $id);
            }
            break;

        case 'delete':
            if ($method === 'DELETE' && $id) {
                deleteCustomerCreator($db, $id);
            }
            break;

        case 'stats':
            if ($method === 'GET') {
                getCustomerCreatorStats($db);
            }
            break;

        case 'by-user':
            if ($method === 'GET' && $id) {
                getCustomerCreatorsByUser($db, $id);
            }
            break;

        default:
            echo json_encode([
                'success' => false,
                'error' => 'Invalid action',
                'requested_action' => $action,
                'available_endpoints' => [
                    'GET /api/customer-creators.php/list',
                    'POST /api/customer-creators.php/add',
                    'GET /api/customer-creators.php/view/{id}',
                    'PUT /api/customer-creators.php/update/{id}',
                    'DELETE /api/customer-creators.php/delete/{id}',
                    'GET /api/customer-creators.php/stats',
                    'GET /api/customer-creators.php/by-user/{email}'
                ]
            ]);
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}

/**
 * Find duplicate phone in customers, customer_creators, or tickets.
 */
function customerCreatorFindPhoneConflict($db, $phone, $excludeCreatorId = null, $excludeTicketId = null) {
    $phone = normalizeKenyanPhone($phone);
    if ($phone === '') {
        return [
            'conflict' => true,
            'message' => 'Valid Kenyan phone number is required (e.g. 0712345678)',
        ];
    }

    $subscriberDigits = getKenyanSubscriberDigits($phone);
    if ($subscriberDigits === '') {
        return [
            'conflict' => true,
            'message' => 'Valid Kenyan phone number is required (e.g. 0712345678)',
        ];
    }

    $suffixMatch = "RIGHT(REPLACE(REPLACE(REPLACE(%s, '+', ''), ' ', ''), '-', ''), 9) = ?";

    try {
        $stmt = $db->prepare(sprintf(
            "SELECT id FROM customers WHERE deleted_at IS NULL AND {$suffixMatch} LIMIT 1",
            'phone_number'
        ));
        $stmt->execute([$subscriberDigits]);
        if ($stmt->fetch()) {
            return [
                'conflict' => true,
                'message' => "Customer with phone {$phone} already exists in the system.",
            ];
        }
    } catch (Exception $e) {
        error_log('customerCreatorFindPhoneConflict customers: ' . $e->getMessage());
    }

    try {
        $sql = sprintf(
            "SELECT id FROM customer_creators WHERE deleted_at IS NULL AND {$suffixMatch}",
            'phone'
        );
        $params = [$subscriberDigits];
        if ($excludeCreatorId !== null) {
            $sql .= ' AND id != ?';
            $params[] = (int)$excludeCreatorId;
        }
        $sql .= ' LIMIT 1';
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        if ($stmt->fetch()) {
            return [
                'conflict' => true,
                'message' => "A customer request with phone {$phone} already exists. Check the Customer Creator list.",
            ];
        }
    } catch (Exception $e) {
        error_log('customerCreatorFindPhoneConflict customer_creators: ' . $e->getMessage());
    }

    try {
        $stmt = $db->prepare(sprintf(
            "SELECT id, number FROM tickets WHERE {$suffixMatch} LIMIT 1",
            'customer_phone'
        ));
        $stmt->execute([$subscriberDigits]);
        $existingTicket = $stmt->fetch();
        if ($existingTicket) {
            if ($excludeTicketId !== null && (int)$existingTicket['id'] === (int)$excludeTicketId) {
                return ['conflict' => false, 'phone' => $phone];
            }
            $ticketRef = $existingTicket['number'] ?? $existingTicket['id'];
            return [
                'conflict' => true,
                'message' => "Phone {$phone} is already used on ticket #{$ticketRef}.",
            ];
        }
    } catch (Exception $e) {
        error_log('customerCreatorFindPhoneConflict tickets: ' . $e->getMessage());
    }

    return ['conflict' => false, 'phone' => $phone];
}

// =============================================
// LIST ALL CUSTOMER CREATORS
// =============================================
function listCustomerCreators($db) {
    try {
        $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
        $perPage = isset($_GET['per_page']) ? (int)$_GET['per_page'] : 100;
        $offset = ($page - 1) * $perPage;
        
        $status = $_GET['status'] ?? '';
        $search = $_GET['search'] ?? '';
        $createdBy = $_GET['created_by'] ?? '';
        
        // Build query with runtime-safe column detection.
        // Some deployments have older customer_creators/tickets schemas.
        $creatorColsStmt = $db->query("SHOW COLUMNS FROM customer_creators");
        $creatorColsRows = $creatorColsStmt ? $creatorColsStmt->fetchAll(PDO::FETCH_ASSOC) : [];
        $creatorCols = [];
        foreach ($creatorColsRows as $r) {
            $creatorCols[$r['Field']] = true;
        }

        $ticketColsStmt = $db->query("SHOW COLUMNS FROM tickets");
        $ticketColsRows = $ticketColsStmt ? $ticketColsStmt->fetchAll(PDO::FETCH_ASSOC) : [];
        $ticketCols = [];
        foreach ($ticketColsRows as $r) {
            $ticketCols[$r['Field']] = true;
        }

        $phoneCol = isset($creatorCols['phone']) ? 'phone' : (isset($creatorCols['phone_number']) ? 'phone_number' : 'phone');
        $hasDeletedAt = isset($creatorCols['deleted_at']);
        $hasTicketId = isset($creatorCols['ticket_id']);

        // Build WHERE
        $where = [];
        if ($hasDeletedAt) {
            $where[] = 'c.deleted_at IS NULL';
        }
        $params = [];
        
        if (!empty($status)) {
            $where[] = 'c.status = ?';
            $params[] = $status;
        }
        
        if (!empty($createdBy)) {
            $where[] = 'c.created_by = ?';
            $params[] = $createdBy;
        }
        
        if (!empty($search)) {
            $searchTerm = '%' . $search . '%';
            $subscriberDigits = getKenyanSubscriberDigits($search);
            if (strlen($subscriberDigits) >= 9) {
                $phoneSuffix = "RIGHT(REPLACE(REPLACE(REPLACE(c.{$phoneCol}, '+', ''), ' ', ''), '-', ''), 9) = ?";
                $where[] = "(c.name LIKE ? OR c.{$phoneCol} LIKE ? OR c.email LIKE ? OR c.address LIKE ? OR {$phoneSuffix})";
                $params[] = $searchTerm;
                $params[] = $searchTerm;
                $params[] = $searchTerm;
                $params[] = $searchTerm;
                $params[] = $subscriberDigits;
            } else {
                $where[] = "(c.name LIKE ? OR c.{$phoneCol} LIKE ? OR c.email LIKE ? OR c.address LIKE ?)";
                $params[] = $searchTerm;
                $params[] = $searchTerm;
                $params[] = $searchTerm;
                $params[] = $searchTerm;
            }
        }
        
        $whereClause = !empty($where) ? implode(' AND ', $where) : '1=1';
        
        // Get total count
        $countStmt = $db->prepare("SELECT COUNT(*) as total FROM customer_creators c WHERE $whereClause");
        $countStmt->execute($params);
        $total = $countStmt->fetch()['total'];
        
        // Get data with ticket information
        // NOTE: tickets schema differs per deployment (assigned_to vs assignedTo)
        $ticketAssignedExpr = 'NULL';
        if (isset($ticketCols['assigned_to'])) {
            $ticketAssignedExpr = 't.assigned_to';
        } elseif (isset($ticketCols['assignedTo'])) {
            $ticketAssignedExpr = 't.assignedTo';
        }

        $ticketJoin = $hasTicketId ? 'LEFT JOIN tickets t ON c.ticket_id = t.id' : '';
        $ticketPriceExpr = isset($ticketCols['installation_price']) ? 't.installation_price' : 'NULL';
        $ticketSelect = $hasTicketId
            ? "t.id as ticket_id,
               t.number as ticket_number,
               t.subject as ticket_subject,
               t.status as ticket_status,
               t.priority as ticket_priority,
               {$ticketAssignedExpr} as ticket_assigned_to,
               {$ticketPriceExpr} as ticket_installation_price,
               t.type as ticket_type,
               t.created_at as ticket_created_at,
               t.updated_at as ticket_updated_at"
            : "NULL as ticket_id,
               NULL as ticket_number,
               NULL as ticket_subject,
               NULL as ticket_status,
               NULL as ticket_priority,
               NULL as ticket_assigned_to,
               NULL as ticket_installation_price,
               NULL as ticket_type,
               NULL as ticket_created_at,
               NULL as ticket_updated_at";

        $sql = "SELECT c.*, 
                   {$ticketSelect}
            FROM customer_creators c
            {$ticketJoin}
            WHERE $whereClause 
            ORDER BY c.created_at DESC 
            LIMIT ? OFFSET ?";
        $params[] = $perPage;
        $params[] = $offset;
        
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $creators = $stmt->fetchAll();
        
        // Format data for JavaScript (snake_case to camelCase)
        $formatted = array_map(function($creator) {
            return [
                'id' => (int)$creator['id'],
                'name' => $creator['name'],
                'phone' => !empty($creator['phone'] ?? $creator['phone_number'] ?? null)
                    ? normalizeKenyanPhone($creator['phone'] ?? $creator['phone_number'])
                    : null,
                'email' => $creator['email'],
                'address' => $creator['address'],
                'status' => $creator['status'],
                'createdBy' => $creator['created_by'],
                'notes' => $creator['notes'],
                'ticketId' => $creator['ticket_id'] ? (int)$creator['ticket_id'] : null,
                'ticketNumber' => $creator['ticket_number'],
                'ticketSubject' => $creator['ticket_subject'],
                'ticketStatus' => $creator['ticket_status'],
                'ticketPriority' => $creator['ticket_priority'],
                'ticketAssignedTo' => $creator['ticket_assigned_to'],
                'ticketInstallationPrice' => isset($creator['ticket_installation_price']) && $creator['ticket_installation_price'] !== null
                    ? (float)$creator['ticket_installation_price']
                    : null,
                'ticketType' => $creator['ticket_type'] ?? null,
                'created_at' => formatDateField($creator['ticket_created_at'] ?? $creator['created_at']),
                'updated_at' => formatDateField($creator['ticket_updated_at'] ?? $creator['updated_at']),
                'ticket_created_at' => formatDateField($creator['ticket_created_at'] ?? null),
                'ticket_updated_at' => formatDateField($creator['ticket_updated_at'] ?? null)
            ];
        }, $creators);
        
        echo json_encode([
            'success' => true,
            'data' => $formatted,
            'pagination' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => (int)$total,
                'total_pages' => ceil($total / $perPage)
            ]
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => $e->getMessage()
        ]);
    }
}

// =============================================
// ADD CUSTOMER CREATOR
// =============================================
function addCustomerCreator($db) {
    try {
        $data = getRequestBody();
        
        // Validate required fields
        if (empty($data['name'])) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'error' => 'Name is required'
            ]);
            return;
        }

        if (empty($data['phone'])) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'error' => 'Phone number is required'
            ]);
            return;
        }

        $linkedTicketId = !empty($data['ticket_id']) ? (int)$data['ticket_id'] : null;
        $ticketTypeRaw = strtolower(trim((string)($data['ticket_type'] ?? $data['ticketType'] ?? 'installation')));
        $strictUniquePhone = ($ticketTypeRaw === 'installation');

        if ($strictUniquePhone) {
            $phoneCheck = customerCreatorFindPhoneConflict($db, $data['phone'], null, $linkedTicketId);
            if ($phoneCheck['conflict']) {
                http_response_code(400);
                echo json_encode([
                    'success' => false,
                    'error' => $phoneCheck['message']
                ]);
                return;
            }
            $phone = $phoneCheck['phone'];
        } else {
            $phone = normalizeKenyanPhone($data['phone']);
            if ($phone === '' || getKenyanSubscriberDigits($phone) === '') {
                http_response_code(400);
                echo json_encode([
                    'success' => false,
                    'error' => 'Valid Kenyan phone number is required (e.g. 0712345678)'
                ]);
                return;
            }
        }

        // Insert customer creator
        $sql = "INSERT INTO customer_creators (name, phone, email, address, status, created_by, notes, ticket_id) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
        
        $stmt = $db->prepare($sql);
        $stmt->execute([
            $data['name'],
            $phone,
            $data['email'] ?? '',
            $data['address'] ?? '',
            $data['status'] ?? 'pending',
            $data['createdBy'] ?? $data['created_by'] ?? 'Unknown',
            $data['notes'] ?? '',
            $data['ticket_id'] ?? null
        ]);
        
        $id = $db->lastInsertId();
        
        // Log customer creation activity
        global $currentUser;
        logActivity('create', "Created new customer: {$data['name']}", 'customer', $id, $currentUser);
        
        // Fetch the created record with ticket information
        $stmt = $db->prepare("
            SELECT c.*, 
                   t.id as ticket_id,
                   t.subject as ticket_subject,
                   t.status as ticket_status,
                   t.priority as ticket_priority,
                   t.assigned_to as ticket_assigned_to,
                   t.created_at as ticket_created_at,
                   t.updated_at as ticket_updated_at
            FROM customer_creators c
            LEFT JOIN tickets t ON c.ticket_id = t.id
            WHERE c.id = ?
        ");
        $stmt->execute([$id]);
        $creator = $stmt->fetch();
        
        // Format for JavaScript
        $formatted = [
            'id' => (int)$creator['id'],
            'name' => $creator['name'],
            'phone' => $creator['phone'],
            'email' => $creator['email'],
            'address' => $creator['address'],
            'status' => $creator['status'],
            'createdBy' => $creator['created_by'],
            'notes' => $creator['notes'],
            'created_at' => formatDateField($creator['ticket_created_at'] ?? $creator['created_at']),
            'updated_at' => formatDateField($creator['ticket_updated_at'] ?? $creator['updated_at'])
        ];
        
        echo json_encode([
            'success' => true,
            'data' => $formatted,
            'message' => 'Customer creator added successfully'
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => $e->getMessage()
        ]);
    }
}

// =============================================
// VIEW CUSTOMER CREATOR
// =============================================
function viewCustomerCreator($db, $id) {
    try {
        $stmt = $db->prepare("
            SELECT c.*, t.created_at as ticket_created_at, t.updated_at as ticket_updated_at
            FROM customer_creators c
            LEFT JOIN tickets t ON c.ticket_id = t.id
            WHERE c.id = ? AND c.deleted_at IS NULL
        ");
        $stmt->execute([$id]);
        $creator = $stmt->fetch();
        
        if (!$creator) {
            http_response_code(404);
            echo json_encode([
                'success' => false,
                'error' => 'Customer creator not found'
            ]);
            return;
        }
        
        // Format for JavaScript
        $formatted = [
            'id' => (int)$creator['id'],
            'name' => $creator['name'],
            'phone' => $creator['phone'],
            'email' => $creator['email'],
            'address' => $creator['address'],
            'status' => $creator['status'],
            'createdBy' => $creator['created_by'],
            'notes' => $creator['notes'],
            'created_at' => formatDateField($creator['ticket_created_at'] ?? $creator['created_at']),
            'updated_at' => formatDateField($creator['ticket_updated_at'] ?? $creator['updated_at'])
        ];
        
        echo json_encode([
            'success' => true,
            'data' => $formatted
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => $e->getMessage()
        ]);
    }
}

// =============================================
// UPDATE CUSTOMER CREATOR
// =============================================
function updateCustomerCreator($db, $id) {
    try {
        $data = getRequestBody();
        
        // Check if exists
        $stmt = $db->prepare("SELECT id, ticket_id FROM customer_creators WHERE id = ? AND deleted_at IS NULL");
        $stmt->execute([$id]);
        $existingRow = $stmt->fetch();
        if (!$existingRow) {
            http_response_code(404);
            echo json_encode([
                'success' => false,
                'error' => 'Customer creator not found'
            ]);
            return;
        }
        $existingTicketId = !empty($existingRow['ticket_id']) ? (int)$existingRow['ticket_id'] : null;
        
        // Build update query dynamically
        $updates = [];
        $params = [];
        
        $allowedFields = ['name', 'phone', 'email', 'address', 'status', 'notes'];
        
        foreach ($allowedFields as $field) {
            $jsField = $field;
            // Handle camelCase from JavaScript
            if ($field === 'created_by') $jsField = 'createdBy';
            
            if (isset($data[$jsField]) || isset($data[$field])) {
                $updates[] = "$field = ?";
                $value = $data[$jsField] ?? $data[$field];
                if ($field === 'phone' && $value !== null && trim((string)$value) !== '') {
                    $normalized = normalizeKenyanPhone($value);
                    $phoneCheck = customerCreatorFindPhoneConflict($db, $normalized, (int)$id, $existingTicketId);
                    if ($phoneCheck['conflict']) {
                        http_response_code(400);
                        echo json_encode([
                            'success' => false,
                            'error' => $phoneCheck['message']
                        ]);
                        return;
                    }
                    $value = $phoneCheck['phone'];
                }
                $params[] = $value;
            }
        }
        
        if (empty($updates)) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'error' => 'No valid fields to update'
            ]);
            return;
        }
        
        $params[] = $id;
        $sql = "UPDATE customer_creators SET " . implode(', ', $updates) . " WHERE id = ?";
        
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        
        // Fetch updated record
        $stmt = $db->prepare("
            SELECT c.*, t.created_at as ticket_created_at, t.updated_at as ticket_updated_at
            FROM customer_creators c
            LEFT JOIN tickets t ON c.ticket_id = t.id
            WHERE c.id = ?
        ");
        $stmt->execute([$id]);
        $creator = $stmt->fetch();
        
        // Format for JavaScript
        $formatted = [
            'id' => (int)$creator['id'],
            'name' => $creator['name'],
            'phone' => $creator['phone'],
            'email' => $creator['email'],
            'address' => $creator['address'],
            'status' => $creator['status'],
            'createdBy' => $creator['created_by'],
            'notes' => $creator['notes'],
            'created_at' => formatDateField($creator['ticket_created_at'] ?? $creator['created_at']),
            'updated_at' => formatDateField($creator['ticket_updated_at'] ?? $creator['updated_at'])
        ];
        
        echo json_encode([
            'success' => true,
            'data' => $formatted,
            'message' => 'Customer creator updated successfully'
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => $e->getMessage()
        ]);
    }
}

// =============================================
// DELETE CUSTOMER CREATOR
// =============================================
function deleteCustomerCreator($db, $id) {
    try {
        // Soft delete
        $stmt = $db->prepare("UPDATE customer_creators SET deleted_at = NOW() WHERE id = ?");
        $stmt->execute([$id]);
        
        if ($stmt->rowCount() > 0) {
            echo json_encode([
                'success' => true,
                'message' => 'Customer creator deleted successfully'
            ]);
        } else {
            http_response_code(404);
            echo json_encode([
                'success' => false,
                'error' => 'Customer creator not found'
            ]);
        }
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => $e->getMessage()
        ]);
    }
}

// =============================================
// GET CUSTOMER CREATOR STATISTICS
// =============================================
function getCustomerCreatorStats($db) {
    try {
        $createdBy = $_GET['created_by'] ?? '';
        
        // Build WHERE clause
        $where = 'deleted_at IS NULL';
        $params = [];
        
        if (!empty($createdBy)) {
            $where .= ' AND created_by = ?';
            $params[] = $createdBy;
        }
        
        // Count by status
        $sql = "SELECT status, COUNT(*) as count FROM customer_creators WHERE $where GROUP BY status";
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $statuses = $stmt->fetchAll();
        
        $stats = [
            'total' => 0,
            'pending' => 0,
            'scheduled' => 0,
            'installed' => 0,
            'cancelled' => 0
        ];
        
        foreach ($statuses as $row) {
            $count = (int)$row['count'];
            $stats['total'] += $count;
            $status = $row['status'];
            if (isset($stats[$status])) {
                $stats[$status] = $count;
            }
        }
        
        echo json_encode([
            'success' => true,
            'data' => $stats
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => $e->getMessage()
        ]);
    }
}

// =============================================
// GET CUSTOMER CREATORS BY USER
// =============================================
function getCustomerCreatorsByUser($db, $email) {
    try {
        $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
        $perPage = isset($_GET['per_page']) ? (int)$_GET['per_page'] : 100;
        $offset = ($page - 1) * $perPage;
        
        // Get total count
        $countStmt = $db->prepare("SELECT COUNT(*) as total FROM customer_creators WHERE created_by = ? AND deleted_at IS NULL");
        $countStmt->execute([$email]);
        $total = $countStmt->fetch()['total'];
        
        // Get data with ticket information (so it always reflects latest ticket status/assignee/number)
        $sql = "SELECT c.*, 
                       t.id as ticket_id,
                       t.number as ticket_number,
                       t.subject as ticket_subject,
                       t.status as ticket_status,
                       t.priority as ticket_priority,
                       t.assigned_to as ticket_assigned_to,
                       t.created_at as ticket_created_at,
                       t.updated_at as ticket_updated_at
                FROM customer_creators c
                LEFT JOIN tickets t ON c.ticket_id = t.id
                WHERE c.created_by = ? AND c.deleted_at IS NULL
                ORDER BY COALESCE(t.updated_at, c.updated_at) DESC
                LIMIT ? OFFSET ?";
        $stmt = $db->prepare($sql);
        $stmt->execute([$email, $perPage, $offset]);
        $creators = $stmt->fetchAll();
        
        // Format data for JavaScript
        $formatted = array_map(function($creator) {
            return [
                'id' => (int)$creator['id'],
                'name' => $creator['name'],
                'phone' => $creator['phone'],
                'email' => $creator['email'],
                'address' => $creator['address'],
                'status' => $creator['status'],
                'createdBy' => $creator['created_by'],
                'notes' => $creator['notes'],
                'ticketId' => $creator['ticket_id'] ? (int)$creator['ticket_id'] : null,
                'ticketNumber' => $creator['ticket_number'],
                'ticketSubject' => $creator['ticket_subject'],
                'ticketStatus' => $creator['ticket_status'],
                'ticketPriority' => $creator['ticket_priority'],
                'ticketAssignedTo' => $creator['ticket_assigned_to'],
                'ticketInstallationPrice' => isset($creator['ticket_installation_price']) && $creator['ticket_installation_price'] !== null
                    ? (float)$creator['ticket_installation_price']
                    : null,
                'ticketType' => $creator['ticket_type'] ?? null,
                'created_at' => formatDateField($creator['ticket_created_at'] ?? $creator['created_at']),
                'updated_at' => formatDateField($creator['ticket_updated_at'] ?? $creator['updated_at']),
                'ticket_created_at' => formatDateField($creator['ticket_created_at'] ?? null),
                'ticket_updated_at' => formatDateField($creator['ticket_updated_at'] ?? null)
            ];
        }, $creators);
        
        echo json_encode([
            'success' => true,
            'data' => $formatted,
            'pagination' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => (int)$total,
                'total_pages' => ceil($total / $perPage)
            ]
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => $e->getMessage()
        ]);
    }
}
