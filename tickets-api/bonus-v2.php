<?php
/**
 * Bonus System V2 - Solid, Reliable Implementation
 * 
 * This system uses ticket_bonus_records table as the SINGLE SOURCE OF TRUTH.
 * Bonuses are calculated ONCE when tickets are resolved, and stored permanently.
 * 
 * Rules:
 * - Installation tickets: 5th and beyond per technician per day = KSh 100 each
 * - Resolved tickets: 11th and beyond per technician per day = KSh 100 each
 * - Each technician on a qualifying ticket gets KSh 100
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Database connection
$config = require_once 'config.php';
$conn = new mysqli(
    $config['db']['host'],
    $config['db']['username'],
    $config['db']['password'],
    $config['db']['database'],
    $config['db']['port'] ?? 3306
);

if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed']);
    exit;
}

$conn->set_charset('utf8mb4');

// Get action
$action = $_GET['action'] ?? '';

try {
    switch ($action) {
        case 'sync':
            // Recalculate and sync all bonuses from tickets
            syncBonusesFromTickets();
            break;
            
        case 'list':
            // Get bonus list with filters
            getBonusList();
            break;
            
        case 'technician':
            // Get bonus for specific technician
            getTechnicianBonus();
            break;
            
        case 'add-tech':
            // Add technician to a ticket's bonus
            addTechnicianToBonus();
            break;
            
        case 'pay':
            // Mark bonuses as paid
            markBonusesPaid();
            break;
            
        case 'stats':
            // Get overall statistics
            getStats();
            break;
            
        default:
            throw new Exception('Invalid action. Use: sync, list, technician, add-tech, pay, stats');
    }
} catch (Exception $e) {
    http_response_code($e->getCode() ?: 400);
    echo json_encode([
        'success' => false,
        'message' => $e->getMessage()
    ]);
}

$conn->close();

/**
 * Sync bonuses from tickets table to ticket_bonus_records
 * This recalculates everything from scratch to ensure consistency
 */
function syncBonusesFromTickets()
{
    global $conn;
    
    $start_date = $_GET['start_date'] ?? '2024-01-01';
    $end_date = $_GET['end_date'] ?? date('Y-m-d');
    $clear_existing = $_GET['clear'] ?? 'false';
    
    // Optionally clear existing records for date range
    if ($clear_existing === 'true') {
        $stmt = $conn->prepare("DELETE FROM ticket_bonus_records WHERE completion_date BETWEEN ? AND ?");
        $stmt->bind_param("ss", $start_date, $end_date);
        $stmt->execute();
        $deleted = $stmt->affected_rows;
        $stmt->close();
    } else {
        $deleted = 0;
    }
    
    // Get all resolved tickets in date range
    // Use updated_at as the tracking date (when status was actually changed)
    $stmt = $conn->prepare("
        SELECT 
            t.id as ticket_id,
            t.subject,
            t.type,
            t.status,
            t.assigned_to,
            DATE(t.updated_at) as completion_date
        FROM tickets t
        WHERE t.status IN ('resolved', 'closed', 'installation complete')
        AND DATE(t.updated_at) BETWEEN ? AND ?
        ORDER BY DATE(t.updated_at) ASC, t.id ASC
    ");
    $stmt->bind_param("ss", $start_date, $end_date);
    $stmt->execute();
    $result = $stmt->get_result();
    
    $tickets = [];
    while ($row = $result->fetch_assoc()) {
        $tickets[] = $row;
    }
    $stmt->close();
    
    // Track daily counts per technician
    $daily_counts = []; // [date][tech_name] => ['installation' => N, 'resolved' => N]
    
    // Track which ticket-technician combos qualify for bonus
    $bonus_entries = []; // Array of [ticket_id, tech_name, type, date]
    
    foreach ($tickets as $ticket) {
        $ticket_id = $ticket['ticket_id'];
        $completion_date = $ticket['completion_date'];
        $ticket_type = strtolower($ticket['type'] ?? '');
        $is_installation = strpos($ticket_type, 'installation') !== false;
        $type_key = $is_installation ? 'installation' : 'resolved';
        $threshold = $is_installation ? 4 : 10;
        
        // Parse technicians
        $technicians = parseTechnicians($ticket['assigned_to']);
        
        if (empty($technicians)) {
            continue;
        }
        
        // Initialize daily tracking
        if (!isset($daily_counts[$completion_date])) {
            $daily_counts[$completion_date] = [];
        }
        
        // Process each technician
        foreach ($technicians as $tech_name) {
            $tech_name = trim($tech_name);
            if (empty($tech_name)) continue;
            
            $tech_key = strtolower($tech_name);
            
            // Initialize technician daily count
            if (!isset($daily_counts[$completion_date][$tech_key])) {
                $daily_counts[$completion_date][$tech_key] = [
                    'installation' => 0,
                    'resolved' => 0,
                    'name' => $tech_name // Preserve original casing
                ];
            }
            
            // Increment count
            $daily_counts[$completion_date][$tech_key][$type_key]++;
            $position = $daily_counts[$completion_date][$tech_key][$type_key];
            
            // Check if this exceeds threshold (qualifies for bonus)
            if ($position > $threshold) {
                $bonus_entries[] = [
                    'ticket_id' => $ticket_id,
                    'tech_name' => $tech_name,
                    'type' => $type_key,
                    'date' => $completion_date,
                    'position' => $position
                ];
            }
        }
    }
    
    // Get user IDs and emails for technicians
    $tech_info = getTechnicianInfo($conn, array_unique(array_column($bonus_entries, 'tech_name')));
    
    // Insert bonus records
    $inserted = 0;
    $skipped = 0;
    
    $insert_stmt = $conn->prepare("
        INSERT INTO ticket_bonus_records 
        (ticket_id, technician_id, technician_name, technician_email, ticket_type, bonus_amount, completion_date)
        VALUES (?, ?, ?, ?, ?, 100.00, ?)
        ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP
    ");
    
    foreach ($bonus_entries as $entry) {
        $tech_name = $entry['tech_name'];
        $tech_key = strtolower($tech_name);
        
        $tech_id = $tech_info[$tech_key]['id'] ?? 0;
        $tech_email = $tech_info[$tech_key]['email'] ?? '';
        
        $insert_stmt->bind_param(
            "iissss",
            $entry['ticket_id'],
            $tech_id,
            $tech_name,
            $tech_email,
            $entry['type'],
            $entry['date']
        );
        
        if ($insert_stmt->execute()) {
            if ($insert_stmt->affected_rows > 0) {
                $inserted++;
            } else {
                $skipped++;
            }
        }
    }
    $insert_stmt->close();
    
    echo json_encode([
        'success' => true,
        'message' => 'Bonus sync completed',
        'stats' => [
            'tickets_processed' => count($tickets),
            'bonus_entries_found' => count($bonus_entries),
            'records_inserted' => $inserted,
            'records_skipped_duplicate' => $skipped,
            'records_deleted' => $deleted,
            'date_range' => ['start' => $start_date, 'end' => $end_date]
        ]
    ]);
}

/**
 * Get bonus list with filters - reads directly from ticket_bonus_records
 */
function getBonusList()
{
    global $conn;
    
    $start_date = $_GET['start_date'] ?? date('Y-m-01');
    $end_date = $_GET['end_date'] ?? date('Y-m-d');
    $technician = $_GET['technician'] ?? '';
    $payment_status = $_GET['payment_status'] ?? '';
    $type_filter = $_GET['type_filter'] ?? '';
    $limit = intval($_GET['limit'] ?? 100);
    $offset = intval($_GET['offset'] ?? 0);
    
    // Build query with filters
    $where = ["completion_date BETWEEN ? AND ?"];
    $params = [$start_date, $end_date];
    $types = "ss";
    
    if (!empty($technician)) {
        $where[] = "technician_name LIKE ?";
        $params[] = "%$technician%";
        $types .= "s";
    }
    
    if (!empty($payment_status)) {
        $where[] = "payment_status = ?";
        $params[] = $payment_status;
        $types .= "s";
    }
    
    if (!empty($type_filter)) {
        $where[] = "ticket_type = ?";
        $params[] = $type_filter;
        $types .= "s";
    }
    
    $where_clause = implode(' AND ', $where);
    
    // Get total count
    $count_query = "SELECT COUNT(*) as total FROM ticket_bonus_records WHERE $where_clause";
    $stmt = $conn->prepare($count_query);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $total = $stmt->get_result()->fetch_assoc()['total'];
    $stmt->close();
    
    // Get summary stats
    $summary_query = "
        SELECT 
            COUNT(*) as total_records,
            SUM(bonus_amount) as total_bonus,
            SUM(CASE WHEN ticket_type = 'installation' THEN 1 ELSE 0 END) as installation_count,
            SUM(CASE WHEN ticket_type = 'resolved' THEN 1 ELSE 0 END) as resolved_count,
            SUM(CASE WHEN ticket_type = 'installation' THEN bonus_amount ELSE 0 END) as installation_bonus,
            SUM(CASE WHEN ticket_type = 'resolved' THEN bonus_amount ELSE 0 END) as resolved_bonus,
            SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END) as paid_count,
            SUM(CASE WHEN payment_status = 'pending' THEN 1 ELSE 0 END) as pending_count
        FROM ticket_bonus_records 
        WHERE $where_clause
    ";
    $stmt = $conn->prepare($summary_query);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $summary = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    
    // Get paginated data - GROUP BY ticket to show all technicians per ticket
    $data_query = "
        SELECT 
            r.ticket_id,
            t.subject,
            t.type as ticket_type_original,
            t.status,
            r.ticket_type,
            r.completion_date,
            GROUP_CONCAT(r.technician_name SEPARATOR ', ') as technicians,
            GROUP_CONCAT(r.id) as record_ids,
            COUNT(*) as technician_count,
            SUM(r.bonus_amount) as total_bonus,
            SUM(CASE WHEN r.payment_status = 'paid' THEN 1 ELSE 0 END) as paid_count,
            SUM(CASE WHEN r.payment_status = 'pending' THEN 1 ELSE 0 END) as pending_count
        FROM ticket_bonus_records r
        LEFT JOIN tickets t ON r.ticket_id = t.id
        WHERE $where_clause
        GROUP BY r.ticket_id, t.subject, t.type, t.status, r.ticket_type, r.completion_date
        ORDER BY r.completion_date DESC, r.ticket_id DESC
        LIMIT ? OFFSET ?
    ";
    
    $data_types = $types . "ii";
    $data_params = array_merge($params, [$limit, $offset]);
    
    $stmt = $conn->prepare($data_query);
    $stmt->bind_param($data_types, ...$data_params);
    $stmt->execute();
    $result = $stmt->get_result();
    
    $data = [];
    while ($row = $result->fetch_assoc()) {
        $data[] = [
            'ticket_id' => (int)$row['ticket_id'],
            'subject' => $row['subject'],
            'type' => $row['ticket_type_original'],
            'status' => $row['status'],
            'bonus_type' => $row['ticket_type'],
            'completion_date' => $row['completion_date'],
            'all_technicians' => explode(', ', $row['technicians']),
            'record_ids' => array_map('intval', explode(',', $row['record_ids'])),
            'technician_count' => (int)$row['technician_count'],
            'bonus_amount' => (float)$row['total_bonus'],
            'bonus_per_tech' => 100.00,
            'paid_count' => (int)$row['paid_count'],
            'pending_count' => (int)$row['pending_count'],
            'payment_status' => (int)$row['pending_count'] === 0 ? 'paid' : 'pending'
        ];
    }
    $stmt->close();
    
    // Get per-technician summary for the date range
    $tech_summary_query = "
        SELECT 
            technician_id,
            technician_name,
            technician_email,
            COUNT(*) as bonus_count,
            SUM(bonus_amount) as total_earned,
            SUM(CASE WHEN payment_status = 'paid' THEN bonus_amount ELSE 0 END) as total_paid,
            SUM(CASE WHEN payment_status = 'pending' THEN bonus_amount ELSE 0 END) as balance_owed,
            SUM(CASE WHEN ticket_type = 'installation' THEN 1 ELSE 0 END) as installation_count,
            SUM(CASE WHEN ticket_type = 'resolved' THEN 1 ELSE 0 END) as resolved_count
        FROM ticket_bonus_records
        WHERE completion_date BETWEEN ? AND ?
        GROUP BY technician_id, technician_name, technician_email
        ORDER BY total_earned DESC
    ";
    $tech_stmt = $conn->prepare($tech_summary_query);
    $tech_stmt->bind_param("ss", $start_date, $end_date);
    $tech_stmt->execute();
    $tech_result = $tech_stmt->get_result();
    
    $technician_breakdown = [];
    while ($row = $tech_result->fetch_assoc()) {
        $technician_breakdown[] = [
            'id' => (int)$row['technician_id'],
            'name' => $row['technician_name'],
            'email' => $row['technician_email'],
            'bonus_count' => (int)$row['bonus_count'],
            'total_earned' => (float)$row['total_earned'],
            'total_paid' => (float)$row['total_paid'],
            'balance_owed' => (float)$row['balance_owed'],
            'installation_count' => (int)$row['installation_count'],
            'resolved_count' => (int)$row['resolved_count']
        ];
    }
    $tech_stmt->close();

    echo json_encode([
        'success' => true,
        'data' => $data,
        'pagination' => [
            'total' => (int)$total,
            'limit' => $limit,
            'offset' => $offset,
            'pages' => ceil($total / $limit)
        ],
        'summary' => [
            'total_tickets' => (int)$summary['total_records'],
            'total_bonus_amount' => (float)($summary['total_bonus'] ?? 0),
            'installation_count' => (int)($summary['installation_count'] ?? 0),
            'resolved_count' => (int)($summary['resolved_count'] ?? 0),
            'installation_bonus' => (float)($summary['installation_bonus'] ?? 0),
            'resolved_bonus' => (float)($summary['resolved_bonus'] ?? 0),
            'paid_count' => (int)($summary['paid_count'] ?? 0),
            'pending_count' => (int)($summary['pending_count'] ?? 0)
        ],
        'technician_breakdown' => $technician_breakdown,
        'filters' => [
            'start_date' => $start_date,
            'end_date' => $end_date,
            'technician' => $technician,
            'payment_status' => $payment_status,
            'type_filter' => $type_filter
        ]
    ]);
}

/**
 * Get bonus for a specific technician
 */
function getTechnicianBonus()
{
    global $conn;
    
    $email = $_GET['email'] ?? '';
    
    if (empty($email)) {
        throw new Exception('Email parameter required');
    }
    
    // Get user info
    $stmt = $conn->prepare("SELECT id, name, email FROM users WHERE email = ? OR name = ?");
    $stmt->bind_param("ss", $email, $email);
    $stmt->execute();
    $user = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    
    if (!$user) {
        echo json_encode([
            'success' => true,
            'email' => $email,
            'name' => '',
            'today' => [
                'installations_completed' => 0,
                'other_tickets_completed' => 0,
                'bonus_amount' => 0
            ],
            'total' => [
                'total_earned' => 0,
                'total_paid' => 0,
                'balance_owed' => 0
            ]
        ]);
        return;
    }
    
    $user_id = $user['id'];
    $user_name = $user['name'];
    $today = date('Y-m-d');
    
    // Get today's bonuses from ticket_bonus_records (single source of truth)
    $stmt = $conn->prepare("
        SELECT 
            SUM(CASE WHEN ticket_type = 'installation' THEN 1 ELSE 0 END) as today_installations,
            SUM(CASE WHEN ticket_type = 'resolved' THEN 1 ELSE 0 END) as today_resolved,
            SUM(bonus_amount) as today_bonus
        FROM ticket_bonus_records 
        WHERE (technician_id = ? OR LOWER(technician_name) = LOWER(?))
        AND completion_date = ?
    ");
    $stmt->bind_param("iss", $user_id, $user_name, $today);
    $stmt->execute();
    $today_data = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    
    // Get total bonuses
    $stmt = $conn->prepare("
        SELECT 
            SUM(bonus_amount) as total_earned,
            SUM(CASE WHEN payment_status = 'paid' THEN bonus_amount ELSE 0 END) as total_paid
        FROM ticket_bonus_records 
        WHERE technician_id = ? OR LOWER(technician_name) = LOWER(?)
    ");
    $stmt->bind_param("is", $user_id, $user_name);
    $stmt->execute();
    $total_data = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    
    $total_earned = (float)($total_data['total_earned'] ?? 0);
    $total_paid = (float)($total_data['total_paid'] ?? 0);
    
    echo json_encode([
        'success' => true,
        'email' => $user['email'],
        'name' => $user['name'],
        'today' => [
            'installations_completed' => (int)($today_data['today_installations'] ?? 0),
            'other_tickets_completed' => (int)($today_data['today_resolved'] ?? 0),
            'bonus_amount' => (float)($today_data['today_bonus'] ?? 0)
        ],
        'total' => [
            'total_earned' => $total_earned,
            'total_paid' => $total_paid,
            'balance_owed' => $total_earned - $total_paid
        ]
    ]);
}

/**
 * Add a technician to a ticket's bonus
 */
function addTechnicianToBonus()
{
    global $conn;
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    $ticket_id = intval($input['ticket_id'] ?? 0);
    $technician_email = trim($input['technician_email'] ?? '');
    
    if (!$ticket_id || empty($technician_email)) {
        throw new Exception('ticket_id and technician_email required');
    }
    
    // Get ticket info
    $stmt = $conn->prepare("SELECT id, type, status, assigned_to, completed_at, updated_at FROM tickets WHERE id = ?");
    $stmt->bind_param("i", $ticket_id);
    $stmt->execute();
    $ticket = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    
    if (!$ticket) {
        throw new Exception('Ticket not found');
    }
    
    // Get technician info
    $stmt = $conn->prepare("SELECT id, name, email FROM users WHERE email = ? OR name = ?");
    $stmt->bind_param("ss", $technician_email, $technician_email);
    $stmt->execute();
    $tech = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    
    if (!$tech) {
        throw new Exception('Technician not found');
    }
    
    // Check if already has bonus for this ticket
    $stmt = $conn->prepare("SELECT id FROM ticket_bonus_records WHERE ticket_id = ? AND technician_id = ?");
    $stmt->bind_param("ii", $ticket_id, $tech['id']);
    $stmt->execute();
    $existing = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    
    if ($existing) {
        throw new Exception('Technician already has bonus for this ticket');
    }
    
    // Check if ticket has any existing bonus records (meaning it's a qualifying ticket)
    $stmt = $conn->prepare("SELECT ticket_type, completion_date FROM ticket_bonus_records WHERE ticket_id = ? LIMIT 1");
    $stmt->bind_param("i", $ticket_id);
    $stmt->execute();
    $existing_bonus = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    
    if (!$existing_bonus) {
        throw new Exception('This ticket does not qualify for bonus yet');
    }
    
    // Add the bonus record
    $stmt = $conn->prepare("
        INSERT INTO ticket_bonus_records 
        (ticket_id, technician_id, technician_name, technician_email, ticket_type, bonus_amount, completion_date)
        VALUES (?, ?, ?, ?, ?, 100.00, ?)
    ");
    $stmt->bind_param(
        "iissss",
        $ticket_id,
        $tech['id'],
        $tech['name'],
        $tech['email'],
        $existing_bonus['ticket_type'],
        $existing_bonus['completion_date']
    );
    $stmt->execute();
    $stmt->close();
    
    // NOTE: We no longer update the ticket's assigned_to field 
    // because it changes updated_at which messes up date calculations.
    // The bonus record in ticket_bonus_records is the source of truth.
    
    echo json_encode([
        'success' => true,
        'message' => "Added {$tech['name']} to ticket #{$ticket_id} bonus",
        'bonus_amount' => 100.00
    ]);
}

/**
 * Mark bonuses as paid
 */
function markBonusesPaid()
{
    global $conn;
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    $technician_id = intval($input['technician_id'] ?? 0);
    $record_ids = $input['record_ids'] ?? [];
    $reference = trim($input['reference'] ?? '');
    
    if (empty($record_ids) && !$technician_id) {
        throw new Exception('Either record_ids or technician_id required');
    }
    
    $today = date('Y-m-d');
    
    if (!empty($record_ids)) {
        // Mark specific records as paid
        $placeholders = implode(',', array_fill(0, count($record_ids), '?'));
        $types = str_repeat('i', count($record_ids));
        
        $stmt = $conn->prepare("
            UPDATE ticket_bonus_records 
            SET payment_status = 'paid', payment_date = ?, payment_reference = ?
            WHERE id IN ($placeholders)
        ");
        
        $params = array_merge([$today, $reference], $record_ids);
        $stmt->bind_param("ss" . $types, ...$params);
        $stmt->execute();
        $updated = $stmt->affected_rows;
        $stmt->close();
    } else {
        // Mark all pending for technician as paid
        $stmt = $conn->prepare("
            UPDATE ticket_bonus_records 
            SET payment_status = 'paid', payment_date = ?, payment_reference = ?
            WHERE technician_id = ? AND payment_status = 'pending'
        ");
        $stmt->bind_param("ssi", $today, $reference, $technician_id);
        $stmt->execute();
        $updated = $stmt->affected_rows;
        $stmt->close();
    }
    
    echo json_encode([
        'success' => true,
        'message' => "Marked $updated bonus records as paid",
        'records_updated' => $updated
    ]);
}

/**
 * Get overall statistics
 */
function getStats()
{
    global $conn;
    
    $start_date = $_GET['start_date'] ?? date('Y-m-01');
    $end_date = $_GET['end_date'] ?? date('Y-m-d');
    
    // Overall stats
    $stmt = $conn->prepare("
        SELECT 
            COUNT(DISTINCT ticket_id) as total_tickets,
            COUNT(*) as total_bonus_records,
            SUM(bonus_amount) as total_bonus,
            SUM(CASE WHEN payment_status = 'paid' THEN bonus_amount ELSE 0 END) as total_paid,
            SUM(CASE WHEN payment_status = 'pending' THEN bonus_amount ELSE 0 END) as total_pending
        FROM ticket_bonus_records
        WHERE completion_date BETWEEN ? AND ?
    ");
    $stmt->bind_param("ss", $start_date, $end_date);
    $stmt->execute();
    $overall = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    
    // Per technician stats
    $stmt = $conn->prepare("
        SELECT 
            technician_id,
            technician_name,
            technician_email,
            COUNT(*) as bonus_count,
            SUM(bonus_amount) as total_earned,
            SUM(CASE WHEN payment_status = 'paid' THEN bonus_amount ELSE 0 END) as total_paid,
            SUM(CASE WHEN payment_status = 'pending' THEN bonus_amount ELSE 0 END) as balance_owed
        FROM ticket_bonus_records
        WHERE completion_date BETWEEN ? AND ?
        GROUP BY technician_id, technician_name, technician_email
        ORDER BY total_earned DESC
    ");
    $stmt->bind_param("ss", $start_date, $end_date);
    $stmt->execute();
    $result = $stmt->get_result();
    
    $technicians = [];
    while ($row = $result->fetch_assoc()) {
        $technicians[] = [
            'id' => (int)$row['technician_id'],
            'name' => $row['technician_name'],
            'email' => $row['technician_email'],
            'bonus_count' => (int)$row['bonus_count'],
            'total_earned' => (float)$row['total_earned'],
            'total_paid' => (float)$row['total_paid'],
            'balance_owed' => (float)$row['balance_owed']
        ];
    }
    $stmt->close();
    
    echo json_encode([
        'success' => true,
        'date_range' => ['start' => $start_date, 'end' => $end_date],
        'overall' => [
            'total_qualifying_tickets' => (int)($overall['total_tickets'] ?? 0),
            'total_bonus_records' => (int)($overall['total_bonus_records'] ?? 0),
            'total_bonus' => (float)($overall['total_bonus'] ?? 0),
            'total_paid' => (float)($overall['total_paid'] ?? 0),
            'total_pending' => (float)($overall['total_pending'] ?? 0)
        ],
        'technicians' => $technicians
    ]);
}

/**
 * Helper: Parse technicians from assigned_to field
 * Filters out emails, "0", and empty values — only keeps actual technician names
 */
function parseTechnicians($assigned_to)
{
    if (empty($assigned_to)) {
        return [];
    }
    
    $decoded = json_decode($assigned_to, true);
    if (is_array($decoded)) {
        $names = array_map('trim', $decoded);
    } else {
        $names = array_map('trim', explode(',', $assigned_to));
    }
    
    // Filter out invalid entries: empty strings, "0", email addresses
    return array_filter($names, function($name) {
        if (empty($name) || $name === '0') return false;
        // Skip email addresses — these are not technician names
        if (strpos($name, '@') !== false) return false;
        return true;
    });
}

/**
 * Helper: Get technician info by names
 */
function getTechnicianInfo($conn, $names)
{
    if (empty($names)) {
        return [];
    }
    
    $result = [];
    
    foreach ($names as $name) {
        $name = trim($name);
        if (empty($name)) continue;
        
        $stmt = $conn->prepare("SELECT id, name, email FROM users WHERE LOWER(name) = LOWER(?) LIMIT 1");
        $stmt->bind_param("s", $name);
        $stmt->execute();
        $user = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        
        $key = strtolower($name);
        if ($user) {
            $result[$key] = [
                'id' => $user['id'],
                'name' => $user['name'],
                'email' => $user['email']
            ];
        } else {
            $result[$key] = [
                'id' => 0,
                'name' => $name,
                'email' => ''
            ];
        }
    }
    
    return $result;
}
?>
