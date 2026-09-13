<?php
/**
 * Tickets API
 * Location: api/tickets.php
 * Description: Complete ticket management system with database integration
 * Access: api.tonycommgroupltd.com/api/tickets.php
 */

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/mobile-bridge.php';
require_once __DIR__ . '/team-ticket-access.php';
require_once __DIR__ . '/notification-helper.php';
if (is_file(__DIR__ . '/ticket-sms.php')) {
    require_once __DIR__ . '/ticket-sms.php';
}

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

/**
 * Build the browser-facing API URL when PHP runs behind the VPS proxy.
 */
function getPublicApiBaseUrl() {
    $config = loadAppConfig();
    $defaultBase = rtrim((string)($config['isp_api']['base_url'] ?? ''), '/');
    $defaultHost = $defaultBase ? (parse_url($defaultBase, PHP_URL_HOST) ?: 'billing.homelinknetworkservices.co.ke') : 'billing.homelinknetworkservices.co.ke';

    $forwardedProto = trim(explode(',', $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')[0]);
    $protocol = in_array($forwardedProto, ['http', 'https'], true)
        ? $forwardedProto
        : ((isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https' : 'http');

    $forwardedHost = trim(explode(',', $_SERVER['HTTP_X_FORWARDED_HOST'] ?? '')[0]);
    $host = $forwardedHost ?: ($_SERVER['HTTP_HOST'] ?? $defaultHost);
    if (!preg_match('/^[a-z0-9.-]+(?::\d+)?$/i', $host)) {
        $host = $defaultHost;
    }

    $prefix = trim(explode(',', $_SERVER['HTTP_X_FORWARDED_PREFIX'] ?? '')[0]);
    if ($prefix === '' || $prefix === '/api') {
        $script = (string)($_SERVER['SCRIPT_NAME'] ?? '');
        if (preg_match('#^(/[^/]+)/#', $script, $matches) && $matches[1] !== '/api') {
            $prefix = $matches[1];
        } elseif (preg_match('#(/tickets-api)/#', (string)($_SERVER['REQUEST_URI'] ?? ''), $matches)) {
            $prefix = $matches[1];
        } else {
            $prefix = '/tickets-api';
        }
    }
    $prefix = '/' . trim($prefix, '/');

    return $protocol . '://' . $host . $prefix;
}

/** Public base for ticket router uploads (static files under /uploads). */
function getPublicUploadsBaseUrl() {
    $config = loadAppConfig();
    $override = rtrim(trim((string)($config['tickets_public_base_url'] ?? '')), '/');
    if ($override !== '') {
        return $override;
    }

    $base = getPublicApiBaseUrl();
    // Uploads are stored under tickets-api; Laravel /api has no static uploads tree.
    if (preg_match('#/api(/v1)?$#', $base)) {
        return preg_replace('#/api(/v1)?$#', '/tickets-api', $base);
    }

    return $base;
}

// Set timezone to Africa/Nairobi for correct local time
date_default_timezone_set('Africa/Nairobi');

setCorsHeaders();

header('Content-Type: application/json');

// Enable gzip compression for large JSON responses on slow connections
if (!ob_get_level() && extension_loaded('zlib') && !ini_get('zlib.output_compression')) {
    if (strpos($_SERVER['HTTP_ACCEPT_ENCODING'] ?? '', 'gzip') !== false) {
        ob_start('ob_gzhandler');
    }
}

$method = $_SERVER['REQUEST_METHOD'];
$request = explode('/', trim($_SERVER['PATH_INFO'] ?? '', '/'));
$action = $request[0] ?? '';
$id = $request[1] ?? null;

// If accessing tickets.php directly without action, show API info
if (empty($action) || $action === 'tickets.php') {
    if ($method === 'GET') {
        echo json_encode([
            'success' => true,
            'name' => 'Tickets API',
            'version' => '2.0',
            'endpoints' => [
                'GET /api/tickets.php/list' => 'Get all tickets with filters',
                'GET /api/tickets.php/routers-list' => 'Get tickets with router info',
                'GET /api/tickets.php/routers-list-total' => 'Get total count of tickets with routers (including archived)',
                'GET /api/tickets.php/installations-stats' => 'Get installation statistics (including archived)',
                'POST /api/tickets.php/add' => 'Create new ticket',
                'GET /api/tickets.php/view/{id}' => 'Get ticket by ID',
                'PUT /api/tickets.php/update/{id}' => 'Update ticket',
                'DELETE /api/tickets.php/delete/{id}' => 'Delete/archive ticket',
                'GET /api/tickets.php/archived' => 'Get all archived tickets',
                'PUT /api/tickets.php/restore/{id}' => 'Restore archived ticket',
                'DELETE /api/tickets.php/permanent-delete/{id}' => 'Permanently delete ticket',
                'POST /api/tickets.php/reply/{id}' => 'Add reply to ticket',
                'POST /api/tickets.php/note/{id}' => 'Add note to ticket',
                'POST /api/tickets.php/router/{id}' => 'Add router information with images',
                'GET /api/tickets.php/messages/{id}' => 'Get all messages (replies, notes, routers)',
                'GET /api/tickets.php/stats' => 'Get ticket statistics',
                'GET /api/tickets.php/my-tickets/{email}' => 'Get tickets for specific user',
                'GET /api/tickets.php/assignment-options' => 'Get users available for assignment',
                'GET /api/tickets.php/watcher-options' => 'Get users available as watchers'
            ],
            'database' => 'tonycommgroupltd_db'
        ]);
        exit();
    }
}

try {
    $db = getDB();
    ensureTicketInstallationPriceColumn($db);
    
    switch ($action) {
        case 'list':
        case 'tickets':
            if ($method === 'GET') {
                listTickets($db);
            }
            break;

        case 'list-slim':
            if ($method === 'GET') {
                listTicketsSlim($db);
            }
            break;

        case 'add':
            if ($method === 'POST') {
                addTicket($db);
            }
            break;

        case 'view':
        case 'ticket':
            if ($method === 'GET' && $id) {
                viewTicket($db, $id);
            }
            break;

        case 'update':
            if ($method === 'PUT' && $id) {
                updateTicket($db, $id);
            }
            break;

        case 'delete':
        case 'archive':
            if ($method === 'DELETE' && $id) {
                deleteTicket($db, $id);
            }
            break;

        case 'archived':
            if ($method === 'GET') {
                listArchivedTickets($db);
            }
            break;

        case 'restore':
            if ($method === 'PUT' && $id) {
                restoreTicket($db, $id);
            }
            break;

        case 'permanent-delete':
            if ($method === 'DELETE' && $id) {
                permanentDeleteTicket($db, $id);
            }
            break;

        case 'stats':
            if ($method === 'GET') {
                getTicketStats($db);
            }
            break;

        case 'my-tickets':
            if ($method === 'GET' && $id) {
                getMyTickets($db, $id);
            }
            break;

        case 'assignment-options':
            if ($method === 'GET') {
                getAssignmentOptions($db);
            }
            break;

        case 'watcher-options':
            if ($method === 'GET') {
                getWatcherOptions($db);
            }
            break;

        case 'routers-list':
            if ($method === 'GET') {
                listTicketsWithRouters($db);
            }
            break;

        case 'routers-list-total':
            if ($method === 'GET') {
                getRoutersListTotal($db);
            }
            break;

        case 'installations-stats':
            if ($method === 'GET') {
                getInstallationStats($db);
            }
            break;

        case 'los-report':
            if ($method === 'GET') {
                getLOSReport($db);
            }
            break;

        case 'reply':
            if ($method === 'POST' && $id) {
                addTicketReply($db, $id);
            }
            break;

        case 'note':
            if ($method === 'POST' && $id) {
                addTicketNote($db, $id);
            }
            break;

        case 'router':
            if ($method === 'POST' && $id) {
                addRouterInfo($db, $id);
            }
            break;

        case 'messages':
            if ($method === 'GET' && $id) {
                getTicketMessages($db, $id);
            }
            break;

        case 'test-upload':
            if ($method === 'GET') {
                testUploadDirectory();
            }
            break;

        default:
            echo json_encode([
                'success' => false,
                'error' => 'Invalid action',
                'requested_action' => $action,
                'available_endpoints' => [
                    'GET /api/tickets.php/list',
                    'POST /api/tickets.php/add',
                    'GET /api/tickets.php/view/{id}',
                    'PUT /api/tickets.php/update/{id}',
                    'DELETE /api/tickets.php/delete/{id}',
                    'GET /api/tickets.php/stats',
                    'GET /api/tickets.php/my-tickets/{email}',
                    'GET /api/tickets.php/assignment-options',
                    'GET /api/tickets.php/watcher-options'
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

// =============================================
// INSTALLATION SMS TEMPLATES
// Returns the SMS message for a given status, or null if no template exists.
// =============================================
function getInstallationSmsTemplate($status, $customerName, $ticketNumber) {
    return homelinkStatusSms($status, $customerName, $ticketNumber);
}

/**
 * Send an installation SMS (fire-and-forget).
 * Returns true on success, false on failure. Never throws.
 */
function sendInstallationSms($phone, $status, $customerName, $ticketNumber, $ticketId) {
    if (empty($phone)) return false;
    try {
        $message = homelinkStatusSms($status, $customerName, $ticketNumber);
        sendHomelinkSms($phone, $message, 'ticket-' . $status . '-' . $ticketId);
        error_log("Installation SMS sent: ticket={$ticketId} status={$status} phone={$phone}");
        return true;
    } catch (Exception $e) {
        error_log("Installation SMS failed: ticket={$ticketId} status={$status} error=" . $e->getMessage());
        return false;
    }
}

// =============================================
// LIST ALL TICKETS
// =============================================
function listTickets($db) {
    try {
        $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
        $perPage = isset($_GET['per_page']) ? (int)$_GET['per_page'] : 100;
        $noLimit = ($perPage === 0); // per_page=0 means fetch ALL records
        $offset = ($page - 1) * max($perPage, 1);
        
        $status = $_GET['status'] ?? '';
        $priority = $_GET['priority'] ?? '';
        $search = $_GET['search'] ?? '';
        $assignedTo = $_GET['assigned_to'] ?? '';
        $createdBy = $_GET['created_by'] ?? '';
        $type = $_GET['type'] ?? '';
        $group = $_GET['group'] ?? '';
        
        // Build query
        $where = ['deleted_at IS NULL'];
        $params = [];
        
        if (!empty($status) && $status !== 'all') {
            $where[] = 'status = ?';
            $params[] = $status;
        }
        
        if (!empty($priority)) {
            $where[] = 'priority = ?';
            $params[] = $priority;
        }
        
        if (!empty($assignedTo)) {
            $where[] = '(assigned_to = ? OR (assigned_to LIKE "[%" AND JSON_CONTAINS(assigned_to, JSON_QUOTE(?))) OR assigned_to LIKE ?)';
            $params[] = $assignedTo;
            $params[] = $assignedTo;
            $params[] = '%' . $assignedTo . '%';
        }
        
        if (!empty($createdBy)) {
            $where[] = 'created_by = ?';
            $params[] = $createdBy;
        }
        
        if (!empty($type)) {
            applyTicketTypeFilter($where, $params, $type);
        }
        
        if (!empty($group)) {
            $where[] = '`group` = ?';
            $params[] = $group;
        }
        
        if (!empty($search)) {
            $where[] = '(subject LIKE ? OR description LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ? OR address LIKE ? OR number LIKE ?)';
            $searchTerm = '%' . $search . '%';
            $params[] = $searchTerm;
            $params[] = $searchTerm;
            $params[] = $searchTerm;
            $params[] = $searchTerm;
            $params[] = $searchTerm;
            $params[] = $searchTerm;
        }
        
        $whereClause = implode(' AND ', $where);
        
        // Get total count
        $countStmt = $db->prepare("SELECT COUNT(*) as total FROM tickets WHERE $whereClause");
        $countStmt->execute($params);
        $total = $countStmt->fetch()['total'];
        
        // Get data - ORDER BY updated_at to show recently modified tickets first
        if ($noLimit) {
            $sql = "SELECT * FROM tickets WHERE $whereClause ORDER BY updated_at DESC";
        } else {
            $sql = "SELECT * FROM tickets WHERE $whereClause ORDER BY updated_at DESC LIMIT ? OFFSET ?";
            $params[] = $perPage;
            $params[] = $offset;
        }
        
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $tickets = $stmt->fetchAll();
        
        // Format data for JavaScript (snake_case to camelCase)
        $formatted = array_map(function($ticket) {
            return formatTicketForJS($ticket);
        }, $tickets);
        
        echo json_encode([
            'success' => true,
            'data' => $formatted,
            'pagination' => [
                'page' => $page,
                'per_page' => $noLimit ? $total : $perPage,
                'total' => (int)$total,
                'total_pages' => $noLimit ? 1 : ceil($total / max($perPage, 1))
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
// LIST TICKETS SLIM (lightweight for list view)
// Excludes description to reduce payload size
// =============================================
function listTicketsSlim($db) {
    try {
        $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
        $perPage = isset($_GET['per_page']) ? (int)$_GET['per_page'] : 100;
        $noLimit = ($perPage === 0);
        $offset = ($page - 1) * max($perPage, 1);
        
        $status = $_GET['status'] ?? '';
        $priority = $_GET['priority'] ?? '';
        $search = $_GET['search'] ?? '';
        $assignedTo = $_GET['assigned_to'] ?? '';
        $createdBy = $_GET['created_by'] ?? '';
        $type = $_GET['type'] ?? '';
        $group = $_GET['group'] ?? '';
        $includeArchived = isset($_GET['include_archived']) && $_GET['include_archived'] === '1';
        
        // Slim column list — excludes description to cut payload
        $cols = 'id, number, subject, customer_name, customer_email, customer_phone, address, installation_price, type, priority, status, `group`, assigned_to, created_by, watched_by, created_at, updated_at, deleted_at';
        
        // Build WHERE for active tickets
        $where = $includeArchived ? ['1=1'] : ['deleted_at IS NULL'];
        $params = [];
        
        if (!empty($status) && $status !== 'all') {
            $where[] = 'status = ?';
            $params[] = $status;
        }
        if (!empty($priority)) {
            $where[] = 'priority = ?';
            $params[] = $priority;
        }
        if (!empty($assignedTo)) {
            $where[] = '(assigned_to = ? OR (assigned_to LIKE "[%" AND JSON_CONTAINS(assigned_to, JSON_QUOTE(?))) OR assigned_to LIKE ?)';
            $params[] = $assignedTo;
            $params[] = $assignedTo;
            $params[] = '%' . $assignedTo . '%';
        }
        if (!empty($createdBy)) {
            $where[] = 'created_by = ?';
            $params[] = $createdBy;
        }
        if (!empty($type)) {
            applyTicketTypeFilter($where, $params, $type);
        }
        if (!empty($group)) {
            $where[] = '`group` = ?';
            $params[] = $group;
        }
        if (!empty($search)) {
            $where[] = '(subject LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ? OR address LIKE ? OR number LIKE ?)';
            $searchTerm = '%' . $search . '%';
            $params[] = $searchTerm;
            $params[] = $searchTerm;
            $params[] = $searchTerm;
            $params[] = $searchTerm;
            $params[] = $searchTerm;
        }
        
        $whereClause = implode(' AND ', $where);
        
        // Total count
        $countStmt = $db->prepare("SELECT COUNT(*) as total FROM tickets WHERE $whereClause");
        $countStmt->execute($params);
        $total = $countStmt->fetch()['total'];
        
        // Global watermark so soft-delete / restore invalidates slim cache even when
        // the deleted row is excluded by deleted_at IS NULL.
        $wmStmt = $db->query("SELECT GREATEST(
            COALESCE((SELECT MAX(updated_at) FROM tickets), '1970-01-01 00:00:00'),
            COALESCE((SELECT MAX(deleted_at) FROM tickets), '1970-01-01 00:00:00')
        ) AS latest");
        $latest = $wmStmt ? ($wmStmt->fetch()['latest'] ?? null) : null;
        
        // Support If-Modified-Since for 304
        if ($latest && !empty($_SERVER['HTTP_IF_MODIFIED_SINCE'])) {
            $ifModified = strtotime($_SERVER['HTTP_IF_MODIFIED_SINCE']);
            $lastMod = strtotime($latest);
            if ($ifModified && $lastMod && $lastMod <= $ifModified) {
                http_response_code(304);
                header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $lastMod) . ' GMT');
                header('Cache-Control: private, must-revalidate');
                exit();
            }
        }
        if ($latest) {
            header('Last-Modified: ' . gmdate('D, d M Y H:i:s', strtotime($latest)) . ' GMT');
            header('Cache-Control: private, must-revalidate');
        }
        
        // Fetch data
        if ($noLimit) {
            $sql = "SELECT $cols FROM tickets WHERE $whereClause ORDER BY updated_at DESC";
        } else {
            $sql = "SELECT $cols FROM tickets WHERE $whereClause ORDER BY updated_at DESC LIMIT ? OFFSET ?";
            $params[] = $perPage;
            $params[] = $offset;
        }
        
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $tickets = $stmt->fetchAll();
        
        $formatted = array_map(function($ticket) {
            return formatTicketForJS($ticket);
        }, $tickets);
        
        echo json_encode([
            'success' => true,
            'data' => $formatted,
            'pagination' => [
                'page' => $page,
                'per_page' => $noLimit ? $total : $perPage,
                'total' => (int)$total,
                'total_pages' => $noLimit ? 1 : ceil($total / max($perPage, 1))
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
// VIEW TICKET
// =============================================
function viewTicket($db, $id) {
    try {
        $stmt = $db->prepare("SELECT * FROM tickets WHERE id = ? AND deleted_at IS NULL");
        $stmt->execute([$id]);
        $ticket = $stmt->fetch();
        
        if (!$ticket) {
            http_response_code(404);
            echo json_encode([
                'success' => false,
                'error' => 'Ticket not found'
            ]);
            return;
        }

        if (!assertFieldUserTicketAccess($db, $ticket)) {
            return;
        }
        
        // Debug log
        error_log("Ticket raw data - ID: " . $ticket['id'] . ", Number: " . ($ticket['number'] ?? 'NULL'));
        
        // Format for JavaScript
        $formatted = formatTicketForJS($ticket);
        error_log("Formatted ticket - ID: " . $formatted['id'] . ", Number: " . ($formatted['number'] ?? 'NULL'));
        
        // Get comments if table exists
        try {
            $commentsStmt = $db->prepare("SELECT * FROM ticket_comments WHERE ticket_id = ? ORDER BY created_at DESC");
            $commentsStmt->execute([$id]);
            $formatted['comments'] = $commentsStmt->fetchAll();
        } catch (Exception $e) {
            $formatted['comments'] = [];
        }
        
        // Get activities if table exists
        try {
            $activitiesStmt = $db->prepare("SELECT * FROM ticket_activities WHERE ticket_id = ? ORDER BY created_at DESC");
            $activitiesStmt->execute([$id]);
            $formatted['activities'] = $activitiesStmt->fetchAll();
        } catch (Exception $e) {
            $formatted['activities'] = [];
        }
        
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

/**
 * Ensure tickets.installation_price exists (Installation tickets only).
 */
function ensureTicketInstallationPriceColumn($db) {
    try {
        $stmt = $db->query("SHOW COLUMNS FROM tickets LIKE 'installation_price'");
        if (!$stmt->fetch()) {
            $db->exec("ALTER TABLE tickets ADD COLUMN installation_price DECIMAL(10,2) NULL DEFAULT NULL COMMENT 'Installation fee in KES' AFTER address");
        }
    } catch (Exception $e) {
        error_log('ensureTicketInstallationPriceColumn: ' . $e->getMessage());
    }
}

/**
 * Append installation price to ticket subject (e.g. "New install - KES 1,500").
 */
function appendInstallationPriceToSubject($subject, $installationPrice) {
    $subject = trim((string)$subject);
    if ($subject === '' || $installationPrice === null) {
        return $subject;
    }
    $amount = (float)$installationPrice;
    $priceTag = 'KES ' . (fmod($amount, 1.0) == 0.0
        ? number_format($amount, 0, '.', ',')
        : number_format($amount, 2, '.', ','));
    if (stripos($subject, $priceTag) !== false) {
        return $subject;
    }
    return $subject . ' - ' . $priceTag;
}

// =============================================
// ADD TICKET
// =============================================
function addTicket($db) {
    try {
        ensureTicketInstallationPriceColumn($db);
        $data = getRequestBody();
        
        // Validate required fields
        if (empty($data['subject'])) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'error' => 'Subject is required'
            ]);
            return;
        }
        
        // Generate unique ticket number
        // Use a loop to ensure we get a unique number (handle race conditions and gaps)
        $number = null;
        $maxAttempts = 100; // Prevent infinite loop
        $attempt = 0;
        
        try {
            // Start by finding the highest ID
            $stmt = $db->query("SELECT MAX(id) as max_id FROM tickets");
            $result = $stmt->fetch();
            $startId = ($result && isset($result['max_id']) && $result['max_id'] !== null) ? ((int)$result['max_id'] + 1) : 1;
            $nextId = $startId;
            
            // Try to find a unique number
            while ($attempt < $maxAttempts) {
                $candidateNumber = '#' . $nextId;
                
                // Check if this number already exists
                $checkStmt = $db->prepare("SELECT id FROM tickets WHERE number = ? LIMIT 1");
                $checkStmt->execute([$candidateNumber]);
                
                if (!$checkStmt->fetch()) {
                    // Number is unique, use it
                    $number = $candidateNumber;
                    break;
                }
                
                // Number exists, try next one
                $nextId++;
                $attempt++;
            }
            
            // If we couldn't find a unique number, use timestamp-based fallback
            if ($number === null) {
                error_log("Warning: Could not generate unique ticket number after {$maxAttempts} attempts, using timestamp");
                $number = '#' . time() . '-' . rand(1000, 9999);
            }
        } catch (Exception $e) {
            error_log("Error generating ticket number: " . $e->getMessage());
            // Fallback: use timestamp-based number with random suffix
            $number = '#' . time() . '-' . rand(1000, 9999);
        }
        
        // Map JavaScript camelCase to database snake_case
        $customerName = $data['customerName'] ?? $data['customer_name'] ?? ($data['customer']['name'] ?? '');
        $customerEmail = $data['customerEmail'] ?? $data['customer_email'] ?? ($data['customer']['email'] ?? '');
        $customerPhone = $data['customerPhone'] ?? $data['customer_phone'] ?? ($data['customer']['phone'] ?? '');
        if (!empty(trim((string)$customerPhone))) {
            $customerPhone = normalizeKenyanPhone($customerPhone);
        }
        $assignedTo = $data['assignedTo'] ?? $data['assigned_to'] ?? null;
        // Normalize assigned_to: accept arrays or JSON arrays and store as JSON string
        if (is_array($assignedTo)) {
            $assignedTo = json_encode(array_values($assignedTo));
        } elseif (is_string($assignedTo) && trim($assignedTo) !== '' && substr(trim($assignedTo), 0, 1) === '[') {
            // already JSON string - keep as-is (but ensure valid JSON)
            $decoded = json_decode($assignedTo, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                $assignedTo = json_encode(array_values($decoded));
            }
        }
        // Convert empty strings or '0' to null for assigned_to
        if ($assignedTo === '' || $assignedTo === '0' || $assignedTo === null) {
            $assignedTo = null;
        }
        $createdBy = $data['createdBy'] ?? $data['created_by'] ?? 'Unknown';
        $actor = resolveTicketsActorFromRequest($data);
        if (!empty($actor['name'])) {
            $createdBy = trim((string)$actor['name']);
            $actorEmail = trim((string)($actor['email'] ?? ''));
            if ($actorEmail !== '' && stripos($createdBy, '@') === false && stripos($createdBy, $actorEmail) === false) {
                $createdBy = $createdBy . ' (' . $actorEmail . ')';
            }
        }
        $watchedBy = $data['watchedBy'] ?? $data['watched_by'] ?? '';
        // Convert empty strings to null for watched_by
        if (empty($watchedBy) || trim($watchedBy) === '') {
            $watchedBy = null;
        }
        $ticketType = $data['type'] ?? 'Installation';
        $typeLower = strtolower(trim($ticketType));

        $installationPrice = null;
        if (ticketTypeRequiresInstallationPrice($typeLower)) {
            $rawPrice = $data['installation_price'] ?? $data['installationPrice'] ?? null;
            if ($rawPrice === null || $rawPrice === '') {
                http_response_code(400);
                echo json_encode([
                    'success' => false,
                    'error' => 'Installation price is required for Installation and Installation 2 tickets'
                ]);
                return;
            }
            if (!is_numeric($rawPrice) || (float)$rawPrice < 0) {
                http_response_code(400);
                echo json_encode([
                    'success' => false,
                    'error' => 'Installation price must be a valid amount (0 or greater)'
                ]);
                return;
            }
            $installationPrice = round((float)$rawPrice, 2);
        }
        
        // For Installation tickets only: Check if phone number already exists in the system
        if (!empty($customerPhone) && ticketTypeRequiresUniquePhone($typeLower)) {
            $subscriberDigits = getKenyanSubscriberDigits($customerPhone);
            try {
                if ($subscriberDigits !== '') {
                    // Check in customers table (any stored format)
                    try {
                        $stmt = $db->prepare("
                            SELECT id FROM customers
                            WHERE deleted_at IS NULL
                            AND RIGHT(REPLACE(REPLACE(REPLACE(phone_number, '+', ''), ' ', ''), '-', ''), 9) = ?
                            LIMIT 1
                        ");
                        $stmt->execute([$subscriberDigits]);
                        if ($stmt->fetch()) {
                            http_response_code(400);
                            echo json_encode([
                                'success' => false,
                                'error' => "Phone number {$customerPhone} already exists in the customers table. Installation tickets require unique phone numbers."
                            ]);
                            return;
                        }
                    } catch (Exception $e) {
                        error_log("Warning: Error checking customers table for phone validation: " . $e->getMessage());
                    }

                    // Check in customer_creators table (pending requests)
                    try {
                        $stmt = $db->prepare("
                            SELECT id FROM customer_creators
                            WHERE status = 'pending' AND deleted_at IS NULL
                            AND RIGHT(REPLACE(REPLACE(REPLACE(phone, '+', ''), ' ', ''), '-', ''), 9) = ?
                            LIMIT 1
                        ");
                        $stmt->execute([$subscriberDigits]);
                        if ($stmt->fetch()) {
                            http_response_code(400);
                            echo json_encode([
                                'success' => false,
                                'error' => "A pending installation request already exists for phone number {$customerPhone}."
                            ]);
                            return;
                        }
                    } catch (Exception $e) {
                        error_log("Warning: Error checking customer_creators table (table may not exist): " . $e->getMessage());
                    }

                    // Check in tickets table (any existing ticket with this phone)
                    try {
                        $stmt = $db->prepare("
                            SELECT id, number FROM tickets
                            WHERE RIGHT(REPLACE(REPLACE(REPLACE(customer_phone, '+', ''), ' ', ''), '-', ''), 9) = ?
                            LIMIT 1
                        ");
                        $stmt->execute([$subscriberDigits]);
                        $existingTicket = $stmt->fetch();
                        if ($existingTicket) {
                            http_response_code(400);
                            echo json_encode([
                                'success' => false,
                                'error' => "Phone number {$customerPhone} already exists in ticket #{$existingTicket['number']}. Installation tickets require unique phone numbers."
                            ]);
                            return;
                        }
                    } catch (Exception $e) {
                        error_log("Warning: Error checking tickets table for phone validation: " . $e->getMessage());
                    }
                }
            } catch (Exception $e) {
                error_log("Warning: Phone validation failed, but continuing with ticket creation: " . $e->getMessage());
            }
        }
        
        // Insert ticket - let database handle created_at/updated_at if they have defaults
        $sql = "INSERT INTO tickets (
                    number, subject, description, customer_name, customer_email, 
                    customer_phone, address, installation_price, type, priority, status, `group`, 
                    assigned_to, created_by, watched_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
        
        $stmt = $db->prepare($sql);
        
        // Prepare values - ensure proper types
        $subject = trim($data['subject'] ?? '');
        if (ticketTypeRequiresInstallationPrice($typeLower) && $installationPrice !== null) {
            $subject = appendInstallationPriceToSubject($subject, $installationPrice);
        }
        $description = trim($data['description'] ?? '');
        $customerNameFinal = !empty(trim($customerName)) ? trim($customerName) : null;
        $customerEmailFinal = !empty(trim($customerEmail)) ? trim($customerEmail) : null;
        $customerPhoneFinal = !empty(trim($customerPhone)) ? trim($customerPhone) : null;
        $address = !empty($data['address']) && trim($data['address']) !== '' ? trim($data['address']) : null;
        $priority = $data['priority'] ?? 'medium';
        $status = $data['status'] ?? 'new';
        $group = $data['group'] ?? 'Any';
        
        // Ensure watchedBy is null if empty
        if (empty($watchedBy) || trim($watchedBy) === '') {
            $watchedBy = null;
        }
        
        // Retry mechanism for duplicate key errors (race conditions)
        $maxRetries = 3;
        $retryCount = 0;
        $result = false;
        $lastException = null;
        
        while ($retryCount < $maxRetries && !$result) {
            try {
                $result = $stmt->execute([
                    $number,
                    $subject,
                    $description,
                    $customerNameFinal,
                    $customerEmailFinal,
                    $customerPhoneFinal,
                    $address,
                    $installationPrice,
                    $ticketType,
                    $priority,
                    $status,
                    $group,
                    $assignedTo,
                    $createdBy,
                    $watchedBy
                ]);
                
                // If execute succeeded, break out of retry loop
                if ($result) {
                    break;
                }
                
            } catch (PDOException $e) {
                $errorInfo = $e->errorInfo ?? [];
                $errorCode = $errorInfo[1] ?? 0;
                $sqlState = $errorInfo[0] ?? '';
                
                // Check if it's a duplicate key error (1062 = Duplicate entry)
                if ($sqlState === '23000' && $errorCode == 1062) {
                    // Duplicate number - generate a new one and retry
                    error_log("Duplicate ticket number detected: {$number}. Generating new number...");
                    $retryCount++;
                    
                    if ($retryCount < $maxRetries) {
                        // Generate a new unique number
                        try {
                            $stmt = $db->query("SELECT MAX(id) as max_id FROM tickets");
                            $result = $stmt->fetch();
                            $maxId = ($result && isset($result['max_id']) && $result['max_id'] !== null) ? (int)$result['max_id'] : 0;
                            $nextId = $maxId + 1 + $retryCount; // Add retry count to ensure uniqueness
                            
                            // Check if this number exists, keep incrementing until unique
                            $foundUnique = false;
                            $attempts = 0;
                            while (!$foundUnique && $attempts < 50) {
                                $candidateNumber = '#' . $nextId;
                                $checkStmt = $db->prepare("SELECT id FROM tickets WHERE number = ? LIMIT 1");
                                $checkStmt->execute([$candidateNumber]);
                                
                                if (!$checkStmt->fetch()) {
                                    $number = $candidateNumber;
                                    $foundUnique = true;
                                    // Re-prepare the statement with the new number
                                    $stmt = $db->prepare($sql);
                                } else {
                                    $nextId++;
                                    $attempts++;
                                }
                            }
                            
                            if (!$foundUnique) {
                                // Last resort: use timestamp
                                $number = '#' . time() . '-' . rand(10000, 99999);
                                $stmt = $db->prepare($sql);
                            }
                            
                            continue; // Retry with new number
                        } catch (Exception $numGenError) {
                            error_log("Error generating new number for retry: " . $numGenError->getMessage());
                            $number = '#' . time() . '-' . rand(10000, 99999);
                            $stmt = $db->prepare($sql);
                            continue; // Retry with timestamp-based number
                        }
                    } else {
                        // Max retries reached
                        $lastException = $e;
                        break;
                    }
                } else {
                    // Not a duplicate key error - log and throw immediately
                    error_log("PDO Error during ticket INSERT: " . $e->getMessage());
                    error_log("SQL State: " . $sqlState);
                    error_log("Error Code: " . $errorCode);
                    error_log("Error Message: " . ($errorInfo[2] ?? 'N/A'));
                    error_log("SQL Query: " . $sql);
                    error_log("Values: " . json_encode([
                        'number' => $number,
                        'subject' => $subject,
                        'description' => $description,
                        'customer_name' => $customerNameFinal,
                        'customer_email' => $customerEmailFinal,
                        'customer_phone' => $customerPhoneFinal,
                        'address' => $address,
                        'type' => $ticketType,
                        'priority' => $priority,
                        'status' => $status,
                        'group' => $group,
                        'assigned_to' => $assignedTo,
                        'created_by' => $createdBy,
                        'watched_by' => $watchedBy
                    ]));
                    throw $e; // Re-throw non-duplicate errors immediately
                }
            }
        }
        
        // If we exhausted retries, throw the last exception
        if (!$result && $lastException) {
            throw $lastException;
        }
        
        if (!$result) {
            $errorInfo = $stmt->errorInfo();
            error_log("INSERT execute returned false after all retries. Error Info: " . json_encode($errorInfo));
            throw new Exception('Failed to insert ticket after ' . $maxRetries . ' retries: ' . ($errorInfo[2] ?? 'Unknown database error'));
        }
        
        $id = $db->lastInsertId();
        
        if (!$id) {
            throw new Exception('Failed to get ticket ID after insertion');
        }
        
        // Fetch the created record
        $stmt = $db->prepare("SELECT * FROM tickets WHERE id = ?");
        $stmt->execute([$id]);
        $ticket = $stmt->fetch();
        
        if (!$ticket) {
            throw new Exception('Ticket was created but could not be retrieved');
        }
        
        // Format for JavaScript - wrap in try-catch to handle formatting errors
        try {
            $formatted = formatTicketForJS($ticket);
        } catch (Exception $formatError) {
            error_log("Error formatting ticket for JS: " . $formatError->getMessage());
            // Return basic ticket data if formatting fails
            $formatted = [
                'id' => (int)$ticket['id'],
                'number' => $ticket['number'] ?? '',
                'subject' => $ticket['subject'] ?? '',
                'description' => $ticket['description'] ?? '',
                'status' => $ticket['status'] ?? 'new',
                'priority' => $ticket['priority'] ?? 'medium',
                'type' => $ticket['type'] ?? '',
                'customer_name' => $ticket['customer_name'] ?? '',
                'customer_phone' => $ticket['customer_phone'] ?? '',
                'created_at' => $ticket['created_at'] ?? date('Y-m-d H:i:s')
            ];
        }
        
        sendTicketCreatedSms($db, $ticket);

        echo json_encode([
            'success' => true,
            'data' => $formatted,
            'message' => 'Ticket created successfully'
        ]);
    } catch (PDOException $e) {
        $errorInfo = $e->errorInfo ?? [];
        error_log("PDO Error in addTicket: " . $e->getMessage());
        error_log("SQL Error Code: " . $e->getCode());
        error_log("SQL Error Info: " . json_encode($errorInfo));
        error_log("File: " . $e->getFile() . " Line: " . $e->getLine());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Database error: ' . $e->getMessage(),
            'sql_state' => $errorInfo[0] ?? null,
            'sql_code' => $errorInfo[1] ?? null,
            'sql_message' => $errorInfo[2] ?? null
        ]);
    } catch (Exception $e) {
        error_log("Error in addTicket: " . $e->getMessage());
        error_log("File: " . $e->getFile() . " Line: " . $e->getLine());
        error_log("Stack trace: " . $e->getTraceAsString());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => $e->getMessage(),
            'file' => basename($e->getFile()),
            'line' => $e->getLine()
        ]);
    }
}

// =============================================
// UPDATE TICKET
// =============================================
function updateTicket($db, $id) {
    try {
        $data = getRequestBody();
        $currentUser = ticketsCurrentUser();
        if ($currentUser) {
            $data = applyFieldUserUpdateRestrictions($data, $currentUser);
        }
        // Normalize assignedTo and watchedBy if provided as arrays
        if (isset($data['assignedTo']) && is_array($data['assignedTo'])) {
            $data['assignedTo'] = json_encode(array_values($data['assignedTo']));
        }
        if (isset($data['assigned_to']) && is_array($data['assigned_to'])) {
            $data['assigned_to'] = json_encode(array_values($data['assigned_to']));
        }
        if (isset($data['watchedBy']) && is_array($data['watchedBy'])) {
            $data['watchedBy'] = implode(',', array_values($data['watchedBy']));
        }
        
        // Fetch current ticket BEFORE update (to detect status change)
        $stmt = $db->prepare("SELECT * FROM tickets WHERE id = ? AND deleted_at IS NULL");
        $stmt->execute([$id]);
        $ticketBefore = $stmt->fetch();
        if (!$ticketBefore) {
            http_response_code(404);
            echo json_encode([
                'success' => false,
                'error' => 'Ticket not found'
            ]);
            return;
        }

        if (!assertFieldUserTicketAccess($db, $ticketBefore)) {
            return;
        }
        
        // Build update query dynamically
        $updates = [];
        $params = [];
        
        // Map camelCase to snake_case
        $fieldMap = [
            'subject' => 'subject',
            'description' => 'description',
            'status' => 'status',
            'priority' => 'priority',
            'type' => 'type',
            'group' => 'group',
            'address' => 'address',
            'assignedTo' => 'assigned_to',
            'assigned_to' => 'assigned_to',
            'createdBy' => 'created_by',
            'created_by' => 'created_by',
            'watchedBy' => 'watched_by',
            'watched_by' => 'watched_by',
            'customerName' => 'customer_name',
            'customer_name' => 'customer_name',
            'customerEmail' => 'customer_email',
            'customer_email' => 'customer_email',
            'customerPhone' => 'customer_phone',
            'customer_phone' => 'customer_phone',
            'customerId' => 'customer_id',
            'customer_id' => 'customer_id'
        ];
        
        foreach ($fieldMap as $jsField => $dbField) {
            if (isset($data[$jsField])) {
                if ($dbField === 'group') {
                    $updates[] = "`group` = ?";
                } else {
                    $updates[] = "$dbField = ?";
                }
                $value = $data[$jsField];
                if ($dbField === 'customer_phone' && $value !== null && trim((string)$value) !== '') {
                    $value = normalizeKenyanPhone($value);
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
        
        // Always update the updated_at timestamp
        $updates[] = "updated_at = NOW()";
        
        $params[] = $id;
        $sql = "UPDATE tickets SET " . implode(', ', $updates) . " WHERE id = ?";
        
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        
        // Fetch updated record
        $stmt = $db->prepare("SELECT * FROM tickets WHERE id = ?");
        $stmt->execute([$id]);
        $ticket = $stmt->fetch();
        
        // Log ticket update activity
        $updateDescription = "Updated ticket #{$id}";
        if (isset($data['status'])) {
            $updateDescription .= " - Status changed to {$data['status']}";
        }
        if (isset($data['subject'])) {
            $updateDescription .= " - Subject: {$data['subject']}";
        }
        
        // Try to get current user for logging
        try {
            $token = getAuthToken();
            if ($token) {
                $decoded = verifyToken($token);
                if ($decoded) {
                    $currentUser = getUserWithRoles($decoded['user_id']);
                    logActivity('update', $updateDescription, 'ticket', $id, $currentUser);
                }
            }
        } catch (Exception $e) {
            // Ignore logging errors
        }
        
        // Format for JavaScript
        $formatted = formatTicketForJS($ticket);

        // ── SMS on status change ─────────────────────────────────────────
        $newStatus  = strtolower(trim($ticket['status'] ?? ''));
        $prevStatus = strtolower(trim($ticketBefore['status'] ?? ''));

        if ($newStatus !== $prevStatus && $newStatus !== '' && !empty($ticket['customer_phone'])) {
            sendTicketStatusSms($ticket, $newStatus);
        }

        $oldAssign = $ticketBefore['assigned_to'] ?? '';
        $newAssign = $ticket['assigned_to'] ?? '';
        if ($newAssign && $newAssign !== $oldAssign) {
            try {
                $contacts = ticketAssigneeContacts($db, $newAssign);
                $number = $ticket['number'] ?: ('#' . $ticket['id']);
                $subject = trim((string)($ticket['subject'] ?? ''));
                $address = trim((string)($ticket['address'] ?? ''));
                $care = homelinkSmsCareNumber();
                foreach ($contacts as $tech) {
                    $techMsg = "Homelink ticket {$number} has been assigned to you.";
                    if ($subject !== '') {
                        $techMsg .= " Subject: {$subject}.";
                    }
                    if (!empty($ticket['customer_name'])) {
                        $techMsg .= " Customer: {$ticket['customer_name']}.";
                    }
                    if (!empty($ticket['customer_phone'])) {
                        $techMsg .= " Phone: {$ticket['customer_phone']}.";
                    }
                    $techMsg .= $address !== '' ? " Address: {$address}." : " Address: not given — please confirm with the customer.";
                    $techMsg .= " Homelink {$care}";
                    sendHomelinkSms($tech['phone'], $techMsg, 'ticket-reassigned-' . $ticket['id'] . '-' . ($tech['id'] ?? 'x'));
                }
            } catch (Throwable $assignSmsEx) {
                error_log('Ticket assignee SMS error: ' . $assignSmsEx->getMessage());
            }
        }
        // ─────────────────────────────────────────────────────────────────────

        // ── Notify mobile app of status/assignment changes ──────────────────
        if (isMobileTicket($ticket)) {
            try {
                // Status changed?
                if ($newStatus !== $prevStatus && $newStatus !== '') {
                    $statusLabels = ['new'=>'New','open'=>'Open','in_progress'=>'In Progress','resolved'=>'Resolved','closed'=>'Closed'];
                    $label = $statusLabels[$newStatus] ?? $newStatus;
                    notifyMobileStatusChange($id, $newStatus, "Your ticket status has been updated to {$label}.");
                }
                
                // Assignment changed?
                $oldAssign = $ticketBefore['assigned_to'] ?? '';
                $newAssign = $ticket['assigned_to'] ?? '';
                if ($newAssign && $newAssign !== $oldAssign) {
                    // Parse assigned name(s)
                    $assignNames = $newAssign;
                    $decoded = json_decode($newAssign, true);
                    if (is_array($decoded)) {
                        $assignNames = implode(', ', $decoded);
                    }
                    notifyMobileAssignment($id, $assignNames,
                        "Your ticket has been assigned to {$assignNames}. Our team will follow up shortly.");
                }
            } catch (Exception $e) {
                error_log('Mobile notify (update) failed: ' . $e->getMessage());
            }
        }
        // ─────────────────────────────────────────────────────────────────────

        $actor = ticketsCurrentUser();
        $actorId = (int)($actor['id'] ?? 0);
        $actorName = $actor['name'] ?? $actor['display_name'] ?? 'Staff';

        // Header bell: status changes always; other broadcasts only for ops-meaningful fields
        // (skip description / customer-detail pin saves so the bell stays role-relevant).
        if ($newStatus !== $prevStatus && $newStatus !== '') {
            notifyStaffTicketStatusChange(
                $db,
                $ticket,
                $actorId,
                $actorName,
                $prevStatus,
                $newStatus
            );
        } else {
            $broadcastKeys = [
                'assignedTo', 'assigned_to', 'priority', 'type', 'subject', 'group', 'status',
            ];
            $shouldBroadcast = false;
            foreach ($broadcastKeys as $key) {
                if (array_key_exists($key, $data)) {
                    $shouldBroadcast = true;
                    break;
                }
            }
            if ($shouldBroadcast) {
                notifyStaffTicketChange($db, $ticket, $actorId, $actorName, 'updated');
            }
        }

        echo json_encode([
            'success' => true,
            'data' => $formatted,
            'message' => 'Ticket updated successfully'
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
// DELETE TICKET
// =============================================
function deleteTicket($db, $id) {
    try {
        // Soft delete — bump updated_at so list caches / If-Modified-Since invalidate
        $stmt = $db->prepare("UPDATE tickets SET deleted_at = NOW(), updated_at = NOW() WHERE id = ?");
        $stmt->execute([$id]);
        
        if ($stmt->rowCount() > 0) {
            echo json_encode([
                'success' => true,
                'message' => 'Ticket deleted successfully'
            ]);
        } else {
            http_response_code(404);
            echo json_encode([
                'success' => false,
                'error' => 'Ticket not found'
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
// LIST ARCHIVED TICKETS
// =============================================
function listArchivedTickets($db) {
    try {
        $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
        $perPage = isset($_GET['per_page']) ? (int)$_GET['per_page'] : 100;
        $noLimit = ($perPage === 0); // per_page=0 means fetch ALL records
        $offset = ($page - 1) * max($perPage, 1);
        
        $status = $_GET['status'] ?? '';
        $priority = $_GET['priority'] ?? '';
        $search = $_GET['search'] ?? '';
        $assignedTo = $_GET['assigned_to'] ?? '';
        $createdBy = $_GET['created_by'] ?? '';
        $type = $_GET['type'] ?? '';
        
        // Build query - IMPORTANT: deleted_at IS NOT NULL for archived tickets
        $where = ['deleted_at IS NOT NULL'];
        $params = [];
        
        if (!empty($status) && $status !== 'all') {
            $where[] = 'status = ?';
            $params[] = $status;
        }
        
        if (!empty($priority)) {
            $where[] = 'priority = ?';
            $params[] = $priority;
        }
        
        if (!empty($assignedTo)) {
            // Support single value or JSON-array membership. Check equality, JSON_CONTAINS (if stored as JSON),
            // or LIKE fallback for legacy comma/list storage.
            $where[] = '(assigned_to = ? OR (assigned_to LIKE "[%" AND JSON_CONTAINS(assigned_to, JSON_QUOTE(?))) OR assigned_to LIKE ?)';
            $params[] = $assignedTo;
            $params[] = $assignedTo;
            $params[] = '%' . $assignedTo . '%';
        }
        
        if (!empty($createdBy)) {
            $where[] = 'created_by = ?';
            $params[] = $createdBy;
        }
        
        if (!empty($type)) {
            applyTicketTypeFilter($where, $params, $type);
        }
        
        if (!empty($search)) {
            $where[] = '(subject LIKE ? OR description LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ? OR address LIKE ? OR number LIKE ?)';
            $searchTerm = '%' . $search . '%';
            $params[] = $searchTerm;
            $params[] = $searchTerm;
            $params[] = $searchTerm;
            $params[] = $searchTerm;
            $params[] = $searchTerm;
            $params[] = $searchTerm;
        }
        
        $whereClause = implode(' AND ', $where);
        
        // Get total count
        $countStmt = $db->prepare("SELECT COUNT(*) as total FROM tickets WHERE $whereClause");
        $countStmt->execute($params);
        $total = $countStmt->fetch()['total'];
        
        // Get data - order by deleted_at (archived date) descending
        if ($noLimit) {
            $sql = "SELECT * FROM tickets WHERE $whereClause ORDER BY deleted_at DESC";
        } else {
            $sql = "SELECT * FROM tickets WHERE $whereClause ORDER BY deleted_at DESC LIMIT ? OFFSET ?";
            $params[] = $perPage;
            $params[] = $offset;
        }
        
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $tickets = $stmt->fetchAll();
        
        // Format data for JavaScript (snake_case to camelCase)
        $formatted = array_map(function($ticket) {
            $formatted = formatTicketForJS($ticket);
            // Add archived_at field
            $formatted['archived_at'] = formatDateField($ticket['deleted_at']);
            return $formatted;
        }, $tickets);
        
        echo json_encode([
            'success' => true,
            'data' => $formatted,
            'pagination' => [
                'page' => $page,
                'per_page' => $noLimit ? $total : $perPage,
                'total' => (int)$total,
                'total_pages' => $noLimit ? 1 : ceil($total / max($perPage, 1))
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
// RESTORE ARCHIVED TICKET
// =============================================
function restoreTicket($db, $id) {
    try {
        // Restore — bump updated_at so slim list cache refreshes
        $stmt = $db->prepare("UPDATE tickets SET deleted_at = NULL, updated_at = NOW() WHERE id = ? AND deleted_at IS NOT NULL");
        $stmt->execute([$id]);
        
        if ($stmt->rowCount() > 0) {
            // Fetch the restored ticket
            $stmt = $db->prepare("SELECT * FROM tickets WHERE id = ?");
            $stmt->execute([$id]);
            $ticket = $stmt->fetch();
            
            if ($ticket) {
                $formatted = formatTicketForJS($ticket);
                echo json_encode([
                    'success' => true,
                    'data' => $formatted,
                    'message' => 'Ticket restored successfully'
                ]);
            } else {
                echo json_encode([
                    'success' => true,
                    'message' => 'Ticket restored successfully'
                ]);
            }
        } else {
            http_response_code(404);
            echo json_encode([
                'success' => false,
                'error' => 'Ticket not found or not archived'
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
// PERMANENTLY DELETE TICKET
// =============================================
function permanentDeleteTicket($db, $id) {
    try {
        // Permanently delete from database
        $stmt = $db->prepare("DELETE FROM tickets WHERE id = ?");
        $stmt->execute([$id]);
        
        if ($stmt->rowCount() > 0) {
            echo json_encode([
                'success' => true,
                'message' => 'Ticket permanently deleted successfully'
            ]);
        } else {
            http_response_code(404);
            echo json_encode([
                'success' => false,
                'error' => 'Ticket not found'
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
// GET TICKET STATISTICS - INCLUDES ARCHIVED TICKETS
// =============================================
function getTicketStats($db) {
    try {
        // Count by status - REMOVED deleted_at IS NULL to include archived tickets
        $statusStmt = $db->query("
            SELECT status, COUNT(*) as count 
            FROM tickets 
            GROUP BY status
        ");
        $statuses = $statusStmt->fetchAll();
        
        $stats = [
            'total' => 0,
            'newTickets' => 0,
            'workInProgress' => 0,
            'resolved' => 0,
            'waitingOnAgent' => 0,
            'waitingOnCustomer' => 0,
            'byStatus' => [],
            'byPriority' => []
        ];
        
        foreach ($statuses as $row) {
            $count = (int)$row['count'];
            $stats['total'] += $count;
            $status = strtolower($row['status']);
            $stats['byStatus'][$status] = $count;
            
            // Map to specific stat fields
            if ($status === 'new') {
                $stats['newTickets'] = $count;
            } elseif (in_array($status, ['open', 'in_progress', 'work in progress', 'work_in_progress'])) {
                $stats['workInProgress'] += $count;
            } elseif (in_array($status, ['resolved', 'closed', 'installation complete'])) {
                $stats['resolved'] += $count;
            } elseif (in_array($status, ['waiting on agent', 'waiting_agent'])) {
                $stats['waitingOnAgent'] += $count;
            } elseif (in_array($status, ['waiting on customer', 'waiting_customer'])) {
                $stats['waitingOnCustomer'] += $count;
            }
        }
        
        // Count by priority - REMOVED deleted_at IS NULL to include archived tickets
        $priorityStmt = $db->query("
            SELECT priority, COUNT(*) as count 
            FROM tickets 
            GROUP BY priority
        ");
        $priorities = $priorityStmt->fetchAll();
        
        foreach ($priorities as $row) {
            $stats['byPriority'][$row['priority']] = (int)$row['count'];
        }
        
        // Count installations (including archived) - by type
        $installStmt = $db->query("
            SELECT COUNT(*) as count 
            FROM tickets 
            WHERE " . sqlWhereInstallationMenuTypes('type') . "
        ");
        $installResult = $installStmt->fetch();
        $stats['installations'] = (int)($installResult['count'] ?? 0);
        
        echo json_encode([
            'success' => true,
            'data' => $stats
        ]);
    } catch (Exception $e) {
        error_log("Error in getTicketStats: " . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => $e->getMessage()
        ]);
    }
}

// =============================================
// GET MY TICKETS (for specific user)
// =============================================
function getMyTickets($db, $email) {
    try {
        $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
        $perPage = isset($_GET['per_page']) ? (int)$_GET['per_page'] : 100;
        $offset = ($page - 1) * $perPage;
        
        // Get tickets assigned to user OR created by user
        $sql = "SELECT * FROM tickets 
            WHERE deleted_at IS NULL 
            AND (assigned_to = ? OR (assigned_to LIKE '[%' AND JSON_CONTAINS(assigned_to, JSON_QUOTE(?))) OR assigned_to LIKE ? OR created_by = ?)
            ORDER BY created_at DESC 
            LIMIT ? OFFSET ?";
        
        $stmt = $db->prepare($sql);
        $stmt->execute([$email, $email, '%' . $email . '%', $email, $perPage, $offset]);
        $tickets = $stmt->fetchAll();
        
        // Get total count
        $countStmt = $db->prepare("
            SELECT COUNT(*) as total FROM tickets 
            WHERE deleted_at IS NULL 
            AND (assigned_to = ? OR (assigned_to LIKE '[%' AND JSON_CONTAINS(assigned_to, JSON_QUOTE(?))) OR assigned_to LIKE ? OR created_by = ?)
        ");
        $countStmt->execute([$email, $email, '%' . $email . '%', $email]);
        $total = $countStmt->fetch()['total'];
        
        // Format data for JavaScript
        $formatted = array_map(function($ticket) {
            return formatTicketForJS($ticket);
        }, $tickets);
        
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
// HELPER FUNCTION: Normalize ticket type to proper case
// =============================================
/**
 * First-time installation only — phone must be unique in system.
 */
function ticketTypeRequiresUniquePhone($typeLower) {
    return $typeLower === 'installation';
}

/**
 * Installation or Installation 2 — requires price and subject suffix.
 */
function ticketTypeRequiresInstallationPrice($typeLower) {
    return in_array($typeLower, ['installation', 'installation 2'], true);
}

function normalizeTicketType($type) {
    if (empty($type) || is_null($type)) return 'Installation';
    
    // Ensure type is a string
    $type = (string)$type;
    if (trim($type) === '') return 'Installation';
    
    // Map of all valid types with proper capitalization
    $typeMap = [
        'site survey' => 'Site survey',
        'installation' => 'Installation',
        'installation 2' => 'Installation 2',
        'los' => 'LOS',
        'pon blinking/bad signal' => 'PON blinking/bad signal',
        'no los no internet' => 'No LOS no internet',
        'password change' => 'Password change',
        'slow speeds' => 'Slow speeds',
        'help connect tv/ wifi devices' => 'Help connect Tv/ Wifi devices',
        'adss/ pole/ enclosure installation' => 'Adss/ Pole/ Enclosure installation',
        'signal/ power distribution' => 'Signal/ Power distribution',
        'maintenance/ cable sag/ cable cut' => 'Maintenance/ Cable sag/ Cable cut',
        'faulty router change' => 'Faulty Router change',
        'relocation' => 'Relocation',
        'support' => 'Support',
        'technical' => 'Technical',
        'billing' => 'Billing',
        'general inquiry' => 'General inquiry',
        'extension' => 'Extension'
    ];
    
    $typeLower = strtolower(trim($type));
    return isset($typeMap[$typeLower]) ? $typeMap[$typeLower] : $type;
}

// =============================================
// HELPER FUNCTION: Format ticket for JavaScript
// =============================================
function formatTicketForJS($ticket) {
    // Use isset() checks to prevent undefined index warnings
    if (!is_array($ticket)) {
        throw new Exception('Ticket data must be an array');
    }
    
    // Normalize type to ensure proper capitalization - with null safety
    $ticketType = isset($ticket['type']) ? $ticket['type'] : '';
    $normalizedType = normalizeTicketType($ticketType);
    
    $customerName = isset($ticket['customer_name']) && !empty($ticket['customer_name']) 
        ? $ticket['customer_name'] 
        : (isset($ticket['customer_phone']) && !empty($ticket['customer_phone']) 
            ? 'Phone: ' . $ticket['customer_phone'] 
            : 'Customer');
    
    // Parse assigned_to - could be JSON array or single string
    $assignedToRaw = isset($ticket['assigned_to']) ? $ticket['assigned_to'] : null;
    $assignedToFormatted = null;
    
    if (!empty($assignedToRaw)) {
        // Check if it's a JSON array
        if (is_string($assignedToRaw) && substr($assignedToRaw, 0, 1) === '[') {
            try {
                $decoded = json_decode($assignedToRaw, true);
                if (is_array($decoded)) {
                    // It's a JSON array of email addresses
                    $assignedToFormatted = $decoded;
                } else {
                    // JSON decode failed or not array, treat as string
                    $assignedToFormatted = $assignedToRaw;
                }
            } catch (Exception $e) {
                // JSON decode error, treat as string
                $assignedToFormatted = $assignedToRaw;
            }
        } else {
            // Single string value
            $assignedToFormatted = $assignedToRaw;
        }
    }
    
    $formatted = [
        'id' => isset($ticket['id']) ? (int)$ticket['id'] : 0,
        'number' => isset($ticket['number']) ? $ticket['number'] : '',
        'subject' => isset($ticket['subject']) ? $ticket['subject'] : '',
        'description' => isset($ticket['description']) ? $ticket['description'] : '',
        'customer_name' => $customerName,
        'customerName' => $customerName,
        'customer_email' => isset($ticket['customer_email']) ? $ticket['customer_email'] : '',
        'customerEmail' => isset($ticket['customer_email']) ? $ticket['customer_email'] : '',
        'customer_phone' => isset($ticket['customer_phone']) && $ticket['customer_phone'] !== ''
            ? normalizeKenyanPhone($ticket['customer_phone'])
            : '',
        'customerPhone' => isset($ticket['customer_phone']) && $ticket['customer_phone'] !== ''
            ? normalizeKenyanPhone($ticket['customer_phone'])
            : '',
        'address' => isset($ticket['address']) ? $ticket['address'] : '',
        'installation_price' => isset($ticket['installation_price']) && $ticket['installation_price'] !== null && $ticket['installation_price'] !== ''
            ? (float)$ticket['installation_price']
            : null,
        'installationPrice' => isset($ticket['installation_price']) && $ticket['installation_price'] !== null && $ticket['installation_price'] !== ''
            ? (float)$ticket['installation_price']
            : null,
        'type' => $normalizedType,
        'typeLabel' => $normalizedType,  // Add typeLabel for consistency
        'priority' => isset($ticket['priority']) ? $ticket['priority'] : 'medium',
        'status' => isset($ticket['status']) ? $ticket['status'] : 'new',
        'group' => isset($ticket['group']) ? $ticket['group'] : 'Any',
        'assigned_to' => $assignedToFormatted,
        'assignedTo' => $assignedToFormatted,
        'created_by' => isset($ticket['created_by']) ? $ticket['created_by'] : 'Unknown',
        'createdBy' => isset($ticket['created_by']) ? $ticket['created_by'] : 'Unknown',
        'watched_by' => isset($ticket['watched_by']) ? $ticket['watched_by'] : null,
        'watchedBy' => isset($ticket['watched_by']) ? $ticket['watched_by'] : null,
        'created_at' => isset($ticket['created_at']) ? formatDateField($ticket['created_at']) : date('Y-m-d\TH:i:sP'),
        'updated_at' => isset($ticket['updated_at']) ? formatDateField($ticket['updated_at']) : date('Y-m-d\TH:i:sP'),
        'deleted_at' => isset($ticket['deleted_at']) ? formatDateField($ticket['deleted_at']) : null
    ];
    
    // Build customer object for compatibility
    $formatted['customer'] = [
        'name' => $customerName,
        'email' => isset($ticket['customer_email']) ? $ticket['customer_email'] : '',
        'phone' => isset($ticket['customer_phone']) && $ticket['customer_phone'] !== ''
            ? normalizeKenyanPhone($ticket['customer_phone'])
            : '',
        'initial' => generateInitials($customerName)
    ];
    
    return $formatted;
}

// =============================================
// HELPER FUNCTION: Generate initials
// =============================================
function generateInitials($name) {
    if (empty($name)) return 'CU';
    $words = explode(' ', trim($name));
    $initials = '';
    foreach ($words as $word) {
        if (!empty($word)) {
            $initials .= strtoupper(substr($word, 0, 1));
        }
        if (strlen($initials) >= 2) break;
    }
    return $initials ?: 'CU';
}

// =============================================
// ADD TICKET REPLY
// Add a reply/response to a ticket
// =============================================
function addTicketReply($db, $ticketId) {
    try {
        $data = getRequestBody();
        
        if (empty($data['message'])) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'error' => 'Message is required'
            ]);
            return;
        }

        if (!loadTicketForTeamAccess($db, $ticketId)) {
            return;
        }
        
        // Insert reply with enhanced fields
        $sql = "INSERT INTO ticket_comments 
                (ticket_id, user_id, type, comment, to_email, cc_email, bcc_email, is_private, created_at, updated_at) 
                VALUES (?, ?, 'reply', ?, ?, ?, ?, 0, NOW(), NOW())";
        
        $actor = resolveTicketsActorFromRequest($data);
        $userId = (int)$actor['id'];
        $userName = $actor['name'];
        $userEmail = $actor['email'];
        $message = $data['message'];
        $toEmail = $data['to'] ?? null;
        $ccEmail = $data['cc'] ?? null;
        $bccEmail = $data['bcc'] ?? null;
        
        $stmt = $db->prepare($sql);
        $stmt->execute([$ticketId, $userId, $message, $toEmail, $ccEmail, $bccEmail]);
        
        $replyId = $db->lastInsertId();
        
        // Log activity
        logTicketActivity($db, $ticketId, $userId, 'reply_added', null, null, 'Reply added by ' . $userName);
        
        // ── Notify mobile app if this is a mobile ticket ──
        $tkt = null;
        try {
            $tStmt = $db->prepare("SELECT * FROM tickets WHERE id = ? LIMIT 1");
            $tStmt->execute([$ticketId]);
            $tkt = $tStmt->fetch(PDO::FETCH_ASSOC);
            if ($tkt && isMobileTicket($tkt)) {
                notifyMobileReply($ticketId, $message, $userName);
            }
        } catch (Exception $e) {
            error_log('Mobile notify (reply) failed: ' . $e->getMessage());
        }

        notifyStaffTicketChange(
            $db,
            $tkt ?: ['id' => $ticketId],
            $userId,
            $userName,
            'replied on'
        );

        // Update ticket updated_at timestamp (and status if provided)
        if (!empty($data['status'])) {
            $updateSql = "UPDATE tickets SET status = ?, updated_at = NOW() WHERE id = ?";
            $updateStmt = $db->prepare($updateSql);
            $updateStmt->execute([$data['status'], $ticketId]);
        } else {
            // Just update the timestamp
            $updateSql = "UPDATE tickets SET updated_at = NOW() WHERE id = ?";
            $updateStmt = $db->prepare($updateSql);
            $updateStmt->execute([$ticketId]);
        }
        
        // Get current timestamp in proper format
        $createdAt = date('Y-m-d H:i:s');
        
        echo json_encode([
            'success' => true,
            'data' => [
                'id' => $replyId,
                'ticket_id' => $ticketId,
                'message' => $data['message'],
                'user_id' => $userId,
                'author' => $userName,
                'author_email' => $userEmail,
                'created_at' => $createdAt,
                'type' => 'reply'
            ],
            'reply_id' => $replyId,
            'message' => 'Reply added successfully'
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
// ADD TICKET NOTE
// Add an internal note to a ticket
// =============================================
function addTicketNote($db, $ticketId) {
    try {
        $data = getRequestBody();
        
        if (empty($data['message'])) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'error' => 'Message is required'
            ]);
            return;
        }

        if (!loadTicketForTeamAccess($db, $ticketId)) {
            return;
        }
        
        // Insert note with enhanced fields
        $sql = "INSERT INTO ticket_comments 
                (ticket_id, user_id, type, comment, is_private, created_at, updated_at) 
                VALUES (?, ?, 'note', ?, ?, NOW(), NOW())";
        
        // Get user from tickets JWT when available
        $actor = resolveTicketsActorFromRequest($data);
        $userId = (int)$actor['id'];
        $userName = $actor['name'];
        $userEmail = $actor['email'];
        $message = $data['message'];
        $isPrivate = !empty($data['isPrivate']) && $data['isPrivate'] ? 1 : 0;
        
        $stmt = $db->prepare($sql);
        $stmt->execute([$ticketId, $userId, $message, $isPrivate]);
        
        $noteId = $db->lastInsertId();
        
        // Log activity
        $noteType = $isPrivate ? 'Private note' : 'Note';
        logTicketActivity($db, $ticketId, $userId, 'note_added', null, null, $noteType . ' added by ' . $userName);
        
        // Update ticket updated_at timestamp
        $updateSql = "UPDATE tickets SET updated_at = NOW() WHERE id = ?";
        $updateStmt = $db->prepare($updateSql);
        $updateStmt->execute([$ticketId]);

        $tStmt = $db->prepare("SELECT id, number, subject, assigned_to FROM tickets WHERE id = ? LIMIT 1");
        $tStmt->execute([$ticketId]);
        $tkt = $tStmt->fetch(PDO::FETCH_ASSOC) ?: ['id' => $ticketId];
        notifyStaffTicketChange($db, $tkt, $userId, $userName, 'noted on');
        
        // Get current timestamp in proper format
        $createdAt = date('Y-m-d H:i:s');
        
        echo json_encode([
            'success' => true,
            'data' => [
                'id' => $noteId,
                'ticket_id' => $ticketId,
                'message' => $data['message'],
                'user_id' => $userId,
                'author' => $userName,
                'author_email' => $userEmail,
                'is_private' => $isPrivate,
                'created_at' => $createdAt,
                'type' => 'note'
            ],
            'note_id' => $noteId,
            'message' => 'Note added successfully'
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
// GET ASSIGNMENT OPTIONS
// Get users with technician and engineer roles for ticket assignment
// =============================================
function getAssignmentOptions($db) {
    try {
        $sql = "SELECT DISTINCT u.id, u.name, u.email 
                FROM users u 
                INNER JOIN model_has_roles mhr ON u.id = mhr.model_id 
                INNER JOIN roles r ON mhr.role_id = r.id 
                WHERE r.name IN ('technician', 'engineer') 
                AND u.deleted_at IS NULL 
                AND mhr.model_type = 'App\\\\Models\\\\User'
                ORDER BY u.name ASC";
        
        $stmt = $db->prepare($sql);
        $stmt->execute();
        $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Format for dropdown usage - use name (username) as value
        $options = [];
        foreach ($users as $user) {
            $options[] = [
                'id' => $user['id'],
                'value' => $user['name'],
                'label' => $user['name'] . ' (' . $user['email'] . ')',
                'name' => $user['name'],
                'email' => $user['email']
            ];
        }
        
        echo json_encode([
            'success' => true,
            'data' => $options,
            'count' => count($options),
            'roles' => ['technician', 'engineer']
        ]);
        
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Failed to fetch assignment options: ' . $e->getMessage()
        ]);
    }
}

// =============================================
// GET WATCHER OPTIONS
// Get users with manager, administrator and super-administrator roles for watchers
// =============================================
function getWatcherOptions($db) {
    try {
        $sql = "SELECT DISTINCT u.id, u.name, u.email 
                FROM users u 
                INNER JOIN model_has_roles mhr ON u.id = mhr.model_id 
                INNER JOIN roles r ON mhr.role_id = r.id 
                WHERE r.name IN ('manager', 'administrator', 'super-administrator') 
                AND r.guard_name IN ('api', 'web')
                AND u.deleted_at IS NULL 
                AND mhr.model_type = 'App\\\\Models\\\\User'
                ORDER BY u.name ASC";
        
        $stmt = $db->prepare($sql);
        $stmt->execute();
        $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Format for dropdown usage - use name (username) as value
        $options = [];
        foreach ($users as $user) {
            $options[] = [
                'id' => $user['id'],
                'value' => $user['name'],
                'label' => $user['name'] . ' (' . $user['email'] . ')',
                'name' => $user['name'],
                'email' => $user['email']
            ];
        }
        
        echo json_encode([
            'success' => true,
            'data' => $options,
            'count' => count($options),
            'roles' => ['manager', 'administration', 'super-administrator']
        ]);
        
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Failed to fetch watcher options: ' . $e->getMessage()
        ]);
    }
}

// =============================================
// ADD ROUTER INFORMATION
// Add router number and images to ticket
// =============================================
function addRouterInfo($db, $ticketId) {
    try {
        $data = getRequestBody();
        
        if (empty($data['router_number'])) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'error' => 'Router number is required'
            ]);
            return;
        }

        if (!loadTicketForTeamAccess($db, $ticketId)) {
            return;
        }
        
        $db->beginTransaction();
        
        // Insert router information
        $sql = "INSERT INTO ticket_routers
                    (ticket_id, router_number, user_id, created_at, updated_at)
                VALUES (?, ?, ?, NOW(), NOW())";

        // Get user ID from request (sent from frontend auth context)
        $userId      = $data['user_id']       ?? 1;
        $routerNumber= $data['router_number'];

        $stmt = $db->prepare($sql);
        $stmt->execute([$ticketId, $routerNumber, $userId]);

        $routerId = $db->lastInsertId();
        
        // Get the user info for response
        $userName = $data['user_name'] ?? 'Admin';
        $userEmail = $data['user_email'] ?? '';
        
        // If user_id provided, try to get actual user info from database
        if ($userId) {
            $userSql = "SELECT name, email FROM users WHERE id = ?";
            $userStmt = $db->prepare($userSql);
            $userStmt->execute([$userId]);
            $userInfo = $userStmt->fetch(PDO::FETCH_ASSOC);
            if ($userInfo) {
                $userName = $userInfo['name'];
                $userEmail = $userInfo['email'];
            }
        }
        
        // Handle image uploads
        $uploadedImages = [];
        error_log('Processing ' . count($data['images'] ?? []) . ' images');
        if (!empty($data['images']) && is_array($data['images'])) {
            foreach ($data['images'] as $index => $image) {
                error_log("Processing image $index: " . json_encode(array_keys($image)));
                $uploadResult = saveRouterImage($db, $routerId, $image);
                if ($uploadResult) {
                    error_log("Image uploaded successfully: " . json_encode($uploadResult));
                    $uploadedImages[] = $uploadResult;
                } else {
                    error_log("Failed to upload image $index");
                }
            }
        }
        error_log('Total images uploaded: ' . count($uploadedImages));
        
        // Log activity
        logTicketActivity($db, $ticketId, $userId, 'router_added', null, $routerNumber, 'Router ' . $routerNumber . ' added by ' . $userName);
        
        // Update ticket updated_at timestamp
        $updateSql = "UPDATE tickets SET updated_at = NOW() WHERE id = ?";
        $updateStmt = $db->prepare($updateSql);
        $updateStmt->execute([$ticketId]);
        
        $db->commit();
        
        // Get current timestamp in proper format
        $createdAt = date('Y-m-d H:i:s');
        
        echo json_encode([
            'success' => true,
            'data' => [
                'id' => $routerId,
                'router_number' => $routerNumber,
                'images' => $uploadedImages,
                'author' => $userName,
                'author_email' => $userEmail,
                'created_at' => $createdAt,
                'type' => 'router',
                'message' => 'Router information saved successfully'
            ]
        ]);
        
    } catch (PDOException $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Failed to save router information: ' . $e->getMessage()
        ]);
    }
}

// =============================================
// SAVE ROUTER IMAGE
// Save router image file and database record
// =============================================
function saveRouterImage($db, $routerId, $imageData) {
    try {
        // Log incoming data for debugging
        error_log('Processing image data: ' . json_encode($imageData));
        
        // Handle base64 image or file upload
        if (!empty($imageData['base64'])) {
            // Base64 image from camera/upload
            $base64String = $imageData['base64'];
            
            // Extract mime type
            preg_match('/data:image\/(\w+);base64,/', $base64String, $matches);
            $mimeType = 'image/' . ($matches[1] ?? 'jpeg');
            $extension = $matches[1] ?? 'jpg';
            
            // Remove base64 header
            $base64String = preg_replace('/^data:image\/\w+;base64,/', '', $base64String);
            $imageContent = base64_decode($base64String);
            
            // Validate decoded content
            if ($imageContent === false || strlen($imageContent) < 100) {
                throw new Exception('Invalid base64 image data');
            }
            
            // Generate unique filename
            $fileName = 'router_' . $routerId . '_' . time() . '_' . uniqid() . '.' . $extension;
            $uploadDir = __DIR__ . '/uploads/routers/';
            $filePath = '/uploads/routers/' . $fileName;
            
            // Create directory if it doesn't exist
            if (!file_exists($uploadDir)) {
                mkdir($uploadDir, 0777, true);
            }
            
            // Save file
            $bytesWritten = file_put_contents($uploadDir . $fileName, $imageContent);
            if ($bytesWritten === false) {
                throw new Exception('Failed to write image file');
            }
            
            $fileSize = filesize($uploadDir . $fileName);
            error_log("Saved image: $filePath (Size: $fileSize bytes)");
            
        } else {
            // Handle regular file upload
            $fileName = $imageData['name'] ?? 'router_image.jpg';
            $filePath = $imageData['path'] ?? '';
            $fileSize = $imageData['size'] ?? 0;
            $mimeType = $imageData['mime_type'] ?? 'image/jpeg';
            
            if (empty($filePath)) {
                error_log('WARNING: Empty file path for image');
                return null;
            }
        }
        
        // Insert into database
        $sql = "INSERT INTO ticket_router_images 
                (router_id, file_name, file_path, file_size, mime_type, created_at) 
                VALUES (?, ?, ?, ?, ?, NOW())";
        
        $stmt = $db->prepare($sql);
        $stmt->execute([$routerId, $fileName, $filePath, $fileSize, $mimeType]);
        
        $imageId = $db->lastInsertId();
        
        $baseUrl = getPublicUploadsBaseUrl();
        
        return [
            'id' => $imageId,
            'file_name' => $fileName,
            'file_path' => $filePath,
            'url' => $baseUrl . $filePath
        ];
        
    } catch (Exception $e) {
        error_log('Failed to save router image: ' . $e->getMessage());
        return null;
    }
}

// =============================================
// GET TICKET MESSAGES
// Get all messages (replies, notes, routers) for a ticket
// =============================================
function getTicketMessages($db, $ticketId) {
    try {
        // Get all comments with user info
        $sql = "SELECT 
                    tc.id,
                    tc.type,
                    tc.comment as message,
                    tc.is_private,
                    tc.to_email,
                    tc.cc_email,
                    tc.bcc_email,
                    tc.created_at,
                    tc.updated_at,
                    COALESCE(u.name, 'Unknown User') as author,
                    COALESCE(u.email, '') as author_email
                FROM ticket_comments tc
                LEFT JOIN users u ON tc.user_id = u.id
                WHERE tc.ticket_id = ?
                ORDER BY tc.created_at ASC";
        
        $stmt = $db->prepare($sql);
        $stmt->execute([$ticketId]);
        $comments = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($comments as &$comment) {
            $comment['author_email'] = function_exists('homelinkStaffEmail')
                ? homelinkStaffEmail($comment['author_email'] ?? '')
                : ($comment['author_email'] ?? '');
        }
        unset($comment);
        
        // Get all routers with user info
        $routerSql = "SELECT 
                        tr.id,
                        tr.router_number,
                        tr.created_at,
                        COALESCE(u.name, 'Unknown User') as author,
                        COALESCE(u.email, '') as author_email
                    FROM ticket_routers tr
                    LEFT JOIN users u ON tr.user_id = u.id
                    WHERE tr.ticket_id = ?
                    ORDER BY tr.created_at ASC";
        
        $routerStmt = $db->prepare($routerSql);
        $routerStmt->execute([$ticketId]);
        $routers = $routerStmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($routers as &$routerRow) {
            $routerRow['author_email'] = function_exists('homelinkStaffEmail')
                ? homelinkStaffEmail($routerRow['author_email'] ?? '')
                : ($routerRow['author_email'] ?? '');
        }
        unset($routerRow);
        
        // Get router images
        $formattedRouters = [];
        foreach ($routers as $router) {
            $imageSql = "SELECT id, file_name, file_path, file_size, mime_type 
                        FROM ticket_router_images 
                        WHERE router_id = ?";
            $imageStmt = $db->prepare($imageSql);
            $imageStmt->execute([$router['id']]);
            $images = $imageStmt->fetchAll(PDO::FETCH_ASSOC);
            
            // Add the public reverse-proxy URL to images.
            $baseUrl = getPublicUploadsBaseUrl();
            foreach ($images as &$image) {
                $image['url'] = $baseUrl . $image['file_path'];
                error_log("Image URL constructed: " . $image['url'] . " from path: " . $image['file_path']);
            }
            
            $formattedRouters[] = [
                'id' => $router['id'],
                'type' => 'router',
                'router_number' => $router['router_number'],
                'message' => 'Router Added: ' . $router['router_number'],
                'images' => $images,
                'author' => $router['author'] ?? 'Unknown User',
                'author_email' => $router['author_email'] ?? '',
                'created_at' => $router['created_at']
            ];
        }
        
        // Combine and sort by date
        $allMessages = array_merge($comments, $formattedRouters);
        usort($allMessages, function($a, $b) {
            return strtotime($a['created_at']) - strtotime($b['created_at']);
        });
        
        echo json_encode([
            'success' => true,
            'data' => $allMessages
        ]);
        
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Failed to fetch messages: ' . $e->getMessage()
        ]);
    }
}

// =============================================
// LOG TICKET ACTIVITY
// Log activity to ticket_activities table
// =============================================
function logTicketActivity($db, $ticketId, $userId, $action, $oldValue, $newValue, $description) {
    try {
        $sql = "INSERT INTO ticket_activities 
                (ticket_id, user_id, action, old_value, new_value, description, created_at) 
                VALUES (?, ?, ?, ?, ?, ?, NOW())";
        
        $stmt = $db->prepare($sql);
        $stmt->execute([$ticketId, $userId, $action, $oldValue, $newValue, $description]);
        
        return true;
    } catch (PDOException $e) {
        error_log('Failed to log ticket activity: ' . $e->getMessage());
        return false;
    }
}

// =============================================
// TEST UPLOAD DIRECTORY
// Test if uploads directory exists and is writable
// =============================================
function testUploadDirectory() {
    $uploadDir = __DIR__ . '/uploads/routers/';
    $results = [
        'upload_dir' => $uploadDir,
        'exists' => file_exists($uploadDir),
        'is_dir' => is_dir($uploadDir),
        'is_writable' => is_writable($uploadDir),
        'permissions' => file_exists($uploadDir) ? substr(sprintf('%o', fileperms($uploadDir)), -4) : 'N/A',
        'parent_writable' => is_writable(dirname($uploadDir)),
        '__DIR__' => __DIR__
    ];
    
    // Try to create directory if it doesn't exist
    if (!file_exists($uploadDir)) {
        $created = @mkdir($uploadDir, 0777, true);
        $results['creation_attempted'] = true;
        $results['creation_success'] = $created;
        if ($created) {
            $results['is_writable'] = is_writable($uploadDir);
            $results['permissions'] = substr(sprintf('%o', fileperms($uploadDir)), -4);
        }
    }
    
    // Try to create a test file
    $testFile = $uploadDir . 'test_' . time() . '.txt';
    $testWrite = @file_put_contents($testFile, 'test');
    $results['test_write'] = $testWrite !== false;
    if ($testWrite) {
        @unlink($testFile);
    }
    
    echo json_encode([
        'success' => true,
        'data' => $results
    ], JSON_PRETTY_PRINT);
}

// =============================================
// LIST TICKETS WITH ROUTERS
// Get all tickets that have routers associated
// =============================================
function listTicketsWithRouters($db) {
    try {
        $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
        $perPage = 1000; // Large limit as requested
        $offset = ($page - 1) * $perPage;

        // Query to join tickets with ticket_routers
        // We group by ticket ID to avoid duplicates if a ticket has multiple routers
        // And we use GROUP_CONCAT to list all router numbers for a ticket
        $sql = "SELECT t.*, 
                GROUP_CONCAT(tr.router_number SEPARATOR ', ') as router_numbers,
                COUNT(tr.id) as router_count
                FROM tickets t
                INNER JOIN ticket_routers tr ON t.id = tr.ticket_id
                WHERE t.deleted_at IS NULL
                GROUP BY t.id
                ORDER BY t.updated_at DESC
                LIMIT ? OFFSET ?";
                
        $stmt = $db->prepare($sql);
        // Bind parameters explicitly as integers for LIMIT/OFFSET
        $stmt->bindValue(1, $perPage, PDO::PARAM_INT);
        $stmt->bindValue(2, $offset, PDO::PARAM_INT);
        $stmt->execute();
        $tickets = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Format data for JavaScript
        $formatted = array_map(function($ticket) {
            $formattedTicket = formatTicketForJS($ticket);
            // Add extra fields from the join
            // Ensure router_numbers is added even if null (as empty string or null)
            $formattedTicket['router_numbers'] = isset($ticket['router_numbers']) ? $ticket['router_numbers'] : null;
            $formattedTicket['router_count'] = isset($ticket['router_count']) ? (int)$ticket['router_count'] : 0;
            
            return $formattedTicket;
        }, $tickets);
        
        echo json_encode([
            'success' => true,
            'data' => $formatted,
            'count' => count($formatted)
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => $e->getMessage()
        ]);
    }
}

/**
 * Get total count of tickets with routers (including archived)
 */
function getRoutersListTotal($db) {
    try {
        // Count total tickets with routers (including archived)
        $sql = "SELECT COUNT(DISTINCT t.id) as ticket_count,
                COUNT(tr.id) as router_count
                FROM tickets t
                INNER JOIN ticket_routers tr ON t.id = tr.ticket_id";
                
        $stmt = $db->prepare($sql);
        $stmt->execute();
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        
        // Count tickets updated today (including archived)
        $todaySql = "SELECT COUNT(DISTINCT t.id) as today_count
                     FROM tickets t
                     INNER JOIN ticket_routers tr ON t.id = tr.ticket_id
                     WHERE DATE(t.updated_at) = CURDATE()";
        $todayStmt = $db->prepare($todaySql);
        $todayStmt->execute();
        $todayResult = $todayStmt->fetch(PDO::FETCH_ASSOC);
        
        echo json_encode([
            'success' => true,
            'data' => [
                'totalTickets' => (int)$result['ticket_count'],
                'totalRouters' => (int)$result['router_count'],
                'today' => (int)$todayResult['today_count']
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

/**
 * Get installation stats (including archived)
 */
function getInstallationStats($db) {
    try {
        // Count total installations (including archived)
        $totalSql = "SELECT COUNT(*) as total FROM tickets WHERE " . sqlWhereInstallationMenuTypes('type');
        $totalStmt = $db->prepare($totalSql);
        $totalStmt->execute();
        $totalResult = $totalStmt->fetch(PDO::FETCH_ASSOC);
        
        // Count unassigned installations (including archived)
        $unassignedSql = "SELECT COUNT(*) as count FROM tickets 
                          WHERE " . sqlWhereInstallationMenuTypes('type') . " 
                          AND (assigned_to IS NULL OR assigned_to = '' OR assigned_to = '0')";
        $unassignedStmt = $db->prepare($unassignedSql);
        $unassignedStmt->execute();
        $unassignedResult = $unassignedStmt->fetch(PDO::FETCH_ASSOC);
        
        // Count installations completed today (including archived)
        $todaySql = "SELECT COUNT(*) as count FROM tickets 
                     WHERE " . sqlWhereInstallationMenuTypes('type') . " 
                     AND LOWER(status) = 'installation complete'
                     AND DATE(updated_at) = CURDATE()";
        $todayStmt = $db->prepare($todaySql);
        $todayStmt->execute();
        $todayResult = $todayStmt->fetch(PDO::FETCH_ASSOC);
        
        // Count installations completed this month (including archived)
        $monthlySql = "SELECT COUNT(*) as count FROM tickets 
                       WHERE " . sqlWhereInstallationMenuTypes('type') . " 
                       AND LOWER(status) = 'installation complete'
                       AND YEAR(updated_at) = YEAR(CURDATE())
                       AND MONTH(updated_at) = MONTH(CURDATE())";
        $monthlyStmt = $db->prepare($monthlySql);
        $monthlyStmt->execute();
        $monthlyResult = $monthlyStmt->fetch(PDO::FETCH_ASSOC);
        
        // Count pending installations (not complete, including archived)
        $pendingSql = "SELECT COUNT(*) as count FROM tickets 
                       WHERE " . sqlWhereInstallationMenuTypes('type') . " 
                       AND LOWER(status) != 'installation complete'";
        $pendingStmt = $db->prepare($pendingSql);
        $pendingStmt->execute();
        $pendingResult = $pendingStmt->fetch(PDO::FETCH_ASSOC);
        
        echo json_encode([
            'success' => true,
            'data' => [
                'total' => (int)$totalResult['total'],
                'unassigned' => (int)$unassignedResult['count'],
                'today' => (int)$todayResult['count'],
                'monthly' => (int)$monthlyResult['count'],
                'pending' => (int)$pendingResult['count']
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
// LOS REPORT — grouped by nearest FAT area (Haversine on customer GPS)
// GET /tickets.php/los-report?from=YYYY-MM-DD&to=YYYY-MM-DD
// =============================================
function getLOSReport($db) {
    try {
        $from = isset($_GET['from']) ? $_GET['from'] : date('Y-m-d');
        $to   = isset($_GET['to'])   ? $_GET['to']   : date('Y-m-d');

        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $from)) $from = date('Y-m-d');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $to))   $to   = date('Y-m-d');

        $losTypes = [
            'No LOS no internet', 'LOS',
            'PON blinking/bad signal', 'Signal/ Power distribution',
        ];
        $placeholders = implode(',', array_fill(0, count($losTypes), '?'));
        $params = array_merge($losTypes, [$from . ' 00:00:00', $to . ' 23:59:59']);

        // Fetch LOS tickets joined to customers via phone OR customer_id.
        // Phone numbers may be stored as 07xx (local) or 254xx (international)
        // so we normalise both sides to 07xx for comparison.
        // We also fall back to customer_id when available.
        // GROUP BY t.id prevents duplicate rows when both paths match.
        $stmt = $db->prepare("
            SELECT
                t.id,
                t.number,
                t.subject,
                t.type,
                t.status,
                t.address,
                t.customer_name,
                t.customer_phone,
                t.assigned_to,
                t.created_at,
                t.deleted_at,
                MAX(c.latitude)  AS cust_lat,
                MAX(c.longitude) AS cust_lng,
                MAX(c.fat_id)    AS cust_fat_id
            FROM tickets t
            LEFT JOIN customers c ON (
                (t.customer_id IS NOT NULL AND c.id = t.customer_id)
                OR
                (
                    t.customer_phone IS NOT NULL
                    AND t.customer_phone != ''
                    AND c.phone_number IS NOT NULL
                    AND c.phone_number != ''
                    AND CASE
                        WHEN t.customer_phone LIKE '254%' THEN CONCAT('0', SUBSTRING(t.customer_phone, 4))
                        ELSE t.customer_phone
                    END
                    =
                    CASE
                        WHEN c.phone_number LIKE '254%' THEN CONCAT('0', SUBSTRING(c.phone_number, 4))
                        ELSE c.phone_number
                    END
                )
            )
            WHERE t.type IN ($placeholders)
              AND t.created_at >= ?
              AND t.created_at <= ?
            GROUP BY t.id
            ORDER BY t.created_at DESC
        ");
        $stmt->execute($params);
        $tickets = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // ── Load FAT points from network map ──────────────────────────────
        $fatPoints    = [];
        $fatById      = [];   // id → fat row, for direct fat_id lookups
        $fatAvailable = false;
        try {
            $fatStmt = $db->query("
                SELECT
                    id,
                    COALESCE(NULLIF(TRIM(description),''), fid, CONCAT('FAT-',id)) AS fat_name,
                    COALESCE(NULLIF(TRIM(hub_name),''), '')                         AS hub_name,
                    latitude,
                    longitude
                FROM network_fat
                WHERE status = 'active'
                  AND latitude  IS NOT NULL AND latitude  != 0
                  AND longitude IS NOT NULL AND longitude != 0
            ");
            $fatPoints    = $fatStmt->fetchAll(PDO::FETCH_ASSOC);
            $fatAvailable = count($fatPoints) > 0;
            foreach ($fatPoints as $fp) {
                $fatById[(int)$fp['id']] = $fp;
            }
        } catch (Exception $e) { /* table missing — degrade gracefully */ }

        // ── Group tickets by nearest FAT (Haversine) ──────────────────────
        $areas = [];

        foreach ($tickets as $ticket) {
            $archived   = !empty($ticket['deleted_at']);
            $ticketData = [
                'id'            => (int)$ticket['id'],
                'number'        => $ticket['number'],
                'subject'       => $ticket['subject'],
                'type'          => $ticket['type'],
                'status'        => $ticket['status'],
                'address'       => $ticket['address'],
                'customer_name' => !empty($ticket['customer_name']) ? $ticket['customer_name'] : 'Unknown',
                'customer_phone'=> $ticket['customer_phone'] ?? '',
                'assigned_to'   => $ticket['assigned_to'] ?? '',
                'created_at'    => $ticket['created_at'],
                'archived'      => $archived,
            ];

            $areaKey = 'unknown';
            $nearest = null;

            // ── Strategy 1: Customer has GPS → Haversine to nearest FAT ───
            $lat = isset($ticket['cust_lat']) && $ticket['cust_lat'] ? (float)$ticket['cust_lat'] : null;
            $lng = isset($ticket['cust_lng']) && $ticket['cust_lng'] ? (float)$ticket['cust_lng'] : null;

            if ($lat && $lng && $fatAvailable) {
                $nearest = losNearestFAT($lat, $lng, $fatPoints, 3.0);
            }

            // ── Strategy 2: Customer has direct fat_id assignment ─────────
            if (!$nearest && !empty($ticket['cust_fat_id']) && isset($fatById[(int)$ticket['cust_fat_id']])) {
                $nearest = $fatById[(int)$ticket['cust_fat_id']];
            }

            if ($nearest) {
                $areaKey = 'fat_' . $nearest['id'];
                if (!isset($areas[$areaKey])) {
                    $areas[$areaKey] = [
                        'area_key' => $areaKey,
                        'fat_id'   => (int)$nearest['id'],
                        'fat_name' => $nearest['fat_name'],
                        'hub_name' => $nearest['hub_name'],
                        'lat'      => (float)$nearest['latitude'],
                        'lng'      => (float)$nearest['longitude'],
                        'total' => 0, 'open' => 0, 'in_progress' => 0,
                        'resolved' => 0, 'closed' => 0,
                        'tickets'  => [],
                    ];
                }
            }

            if ($areaKey === 'unknown') {
                if (!isset($areas['unknown'])) {
                    $areas['unknown'] = [
                        'area_key' => 'unknown',
                        'fat_id'   => null,
                        'fat_name' => 'Unknown Area',
                        'hub_name' => 'No customer GPS or FAT assignment yet',
                        'lat'      => null, 'lng' => null,
                        'total' => 0, 'open' => 0, 'in_progress' => 0,
                        'resolved' => 0, 'closed' => 0,
                        'tickets'  => [],
                    ];
                }
            }

            $s = losReportNormaliseStatus($ticket['status']);
            $areas[$areaKey]['total']++;
            $areas[$areaKey][$s]++;
            $areas[$areaKey]['tickets'][] = $ticketData;
        }

        // Sort: known areas by total DESC, unknown always last
        $sorted = array_values($areas);
        usort($sorted, function($a, $b) {
            if ($a['area_key'] === 'unknown') return  1;
            if ($b['area_key'] === 'unknown') return -1;
            return $b['total'] - $a['total'];
        });

        echo json_encode([
            'success'       => true,
            'from'          => $from,
            'to'            => $to,
            'total'         => count($tickets),
            'areas_count'   => count($sorted),
            'fat_available' => $fatAvailable,
            'areas'         => $sorted,
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}

// Find the FAT point nearest to the given coordinates, within $maxKm kilometres
function losNearestFAT($lat, $lng, $fatPoints, $maxKm = 3.0) {
    $nearest = null;
    $minDist = PHP_FLOAT_MAX;
    foreach ($fatPoints as $fat) {
        $d = losHaversine($lat, $lng, (float)$fat['latitude'], (float)$fat['longitude']);
        if ($d < $minDist && $d <= $maxKm) { $minDist = $d; $nearest = $fat; }
    }
    return $nearest;
}

// Haversine formula — returns distance in km between two lat/lng points
function losHaversine($lat1, $lon1, $lat2, $lon2) {
    $R    = 6371;
    $dLat = deg2rad($lat2 - $lat1);
    $dLon = deg2rad($lon2 - $lon1);
    $a    = sin($dLat/2) * sin($dLat/2)
          + cos(deg2rad($lat1)) * cos(deg2rad($lat2))
          * sin($dLon/2) * sin($dLon/2);
    return $R * 2 * atan2(sqrt($a), sqrt(1 - $a));
}

function losReportNormaliseStatus($raw) {
    if (!$raw) return 'open';
    $s = strtolower(trim(preg_replace('/[\s\-]+/', '_', $raw)));
    if ($s === 'resolved' || $s === 'resolve') return 'resolved';
    if (in_array($s, ['closed', 'close', 'solved', 'installation_complete'])) return 'closed';
    if (strpos($s, 'progress') !== false || strpos($s, 'ongoing') !== false) return 'in_progress';
    return 'open';
}
?>
