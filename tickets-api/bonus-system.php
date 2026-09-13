<?php
/**
 * Technician Bonus System API
 * Handles bonus tracking, calculation, and payments
 * 
 * Endpoints:
 * - POST /complete-installation - Mark installation complete
 * - GET /daily-bonuses - Get all techs' bonuses for today (admin only)
 * - GET /technician-bonus/{email} - Get single tech's bonus info
 * - POST /pay-bonus - Pay out bonus to technician (admin only)
 * - GET /payment-history - Get payment history (admin only)
 * - POST /reset-daily - Reset daily counters (admin only)
 * - GET /bonus-summary - Total bonuses across all techs (admin only)
 */

// Set up error handler to catch fatal errors
set_error_handler(function($errno, $errstr, $errfile, $errline) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => $errstr,
        'file' => $errfile,
        'line' => $errline,
        'type' => 'PHP Error'
    ]);
    exit();
});

register_shutdown_function(function() {
    $error = error_get_last();
    if ($error !== null) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => $error['message'],
            'file' => $error['file'],
            'line' => $error['line'],
            'type' => 'Fatal Error'
        ]);
    }
});

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once 'config.php';
require_once 'helpers.php';

// Set timezone to Africa/Nairobi
date_default_timezone_set('Africa/Nairobi');

// Initialize MySQLi connection for bonus system
$config = require 'config.php';
$db_config = $config['db'];
$conn = @new mysqli(
    $db_config['host'],
    $db_config['username'],
    $db_config['password'],
    $db_config['database'],
    $db_config['port'] ?? 3306
);

if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Database connection failed: ' . $conn->connect_error,
        'error' => 'Unable to connect to database'
    ]);
    exit();
}

/**
 * Get the action from either query string or JSON body
 */
$action = $_GET['action'] ?? '';
$__request_json = null;
if (empty($action) && ($_SERVER['REQUEST_METHOD'] === 'POST' || $_SERVER['REQUEST_METHOD'] === 'PUT')) {
    $raw = file_get_contents('php://input');
    $json = json_decode($raw, true);
    if (is_array($json)) {
        $__request_json = $json;
        if (!empty($json['action'])) {
            $action = $json['action'];
        }
    }
}

/**
 * Check if bonus system tables exist
 */
function validateBonusTables()
{
    global $conn;
    
    $tables_to_check = ['technician_daily_bonuses', 'technician_bonus_payments'];
    
    foreach ($tables_to_check as $table) {
        // Some MariaDB versions don't allow parameter markers in SHOW statements.
        $safe = $conn->real_escape_string($table);
        $result = $conn->query("SHOW TABLES LIKE '{$safe}'");
        if (!$result) {
            throw new Exception('Database error: ' . $conn->error, 500);
        }
        if ($result->num_rows === 0) {
            throw new Exception("Required table '$table' does not exist. Please run database migration.", 503);
        }
    }
    
    // Ensure new dual-bonus columns exist (auto-migration)
    $columns_to_add = [
        'other_tickets_completed' => "ALTER TABLE technician_daily_bonuses ADD COLUMN other_tickets_completed INT DEFAULT 0 COMMENT 'Count of non-installation tickets resolved'",
        'installation_bonus' => "ALTER TABLE technician_daily_bonuses ADD COLUMN installation_bonus DECIMAL(10, 2) DEFAULT 0.00 COMMENT 'Bonus from installations'",
        'other_tickets_bonus' => "ALTER TABLE technician_daily_bonuses ADD COLUMN other_tickets_bonus DECIMAL(10, 2) DEFAULT 0.00 COMMENT 'Bonus from other ticket types'"
    ];
    
    foreach ($columns_to_add as $column => $alter_sql) {
        $check_col = $conn->query("SHOW COLUMNS FROM technician_daily_bonuses LIKE '$column'");
        if ($check_col && $check_col->num_rows === 0) {
            $conn->query($alter_sql);
        }
    }
}

try {
    // Validate tables exist for all valid actions
    if (!empty($action)) {
        validateBonusTables();
    }
    
    switch ($action) {
        case 'complete-installation':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                throw new Exception('Method not allowed', 405);
            }
            handleCompleteInstallation();
            break;
        
        case 'complete-other-ticket':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                throw new Exception('Method not allowed', 405);
            }
            handleCompleteOtherTicket();
            break;

        case 'daily-bonuses':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                throw new Exception('Method not allowed', 405);
            }
            // Skip admin check - allow authenticated users to view bonus dashboard
            getDailyBonuses();
            break;

        case 'technician-bonus':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                throw new Exception('Method not allowed', 405);
            }
            getTechnicianBonus();
            break;

        case 'pay-bonus':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                throw new Exception('Method not allowed', 405);
            }
            // Skip admin check - allow authenticated users to pay bonuses
            payBonus();
            break;

        case 'payment-history':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                throw new Exception('Method not allowed', 405);
            }
            checkAdminRole();
            getPaymentHistory();
            break;

        case 'reset-daily':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                throw new Exception('Method not allowed', 405);
            }
            checkAdminRole();
            resetDailyCounters();
            break;

        case 'bonus-summary':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                throw new Exception('Method not allowed', 405);
            }
            // Skip admin check - allow authenticated users to view bonus summary
            getBonusSummary();
            break;

        case 'ticket-bonus-list':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                throw new Exception('Method not allowed', 405);
            }
            getTicketBonusList();
            break;

        case 'add-technician-bonus':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                throw new Exception('Method not allowed', 405);
            }
            addTechnicianToTicketBonus();
            break;

        case 'get-technicians':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                throw new Exception('Method not allowed', 405);
            }
            getTechniciansList();
            break;

        case 'debug-tickets':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                throw new Exception('Method not allowed', 405);
            }
            debugTicketData();
            break;

        default:
            throw new Exception('Invalid action', 400);
    }
} catch (Exception $e) {
    http_response_code($e->getCode() ?: 500);
    $response = [
        'success' => false,
        'message' => $e->getMessage(),
        'code' => $e->getCode()
    ];
    
    // Add debug info if database error
    if (isset($GLOBALS['conn']) && $GLOBALS['conn'] && $GLOBALS['conn']->errno) {
        $response['db_error'] = $GLOBALS['conn']->error;
    }
    
    echo json_encode($response);
    exit();
}

/**
 * Mark an installation as complete and award bonus
 */
function handleCompleteInstallation()
{
    global $conn;
    
    $data = json_decode(file_get_contents('php://input'), true);
    
    // Validate input
    if (empty($data['ticket_id'])) {
        throw new Exception('ticket_id is required', 400);
    }
    
    $ticket_id = intval($data['ticket_id']);
    
    // Get ticket details
    $stmt = $conn->prepare("SELECT id, assigned_to, status FROM tickets WHERE id = ?");
    $stmt->bind_param("i", $ticket_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $ticket = $result->fetch_assoc();
    $stmt->close();
    
    if (!$ticket) {
        throw new Exception('Ticket not found', 404);
    }
    
    // Skip authorization check - allow any authenticated user to complete installations
    
    $today = date('Y-m-d');
    $now = date('Y-m-d H:i:s');
    
    error_log("DEBUG: Today's date: {$today}, Now: {$now}");
    
    // Parse assigned technicians for bonus awarding
    $assigned_to_raw = $ticket['assigned_to'];
    $assigned_to = [];
    
    // DEBUG: Log the raw assigned_to data
    error_log("DEBUG: Ticket {$ticket_id} assigned_to raw: " . var_export($assigned_to_raw, true));
    
    if (!empty($assigned_to_raw)) {
        // Try to decode as JSON first
        $decoded = json_decode($assigned_to_raw, true);
        if (is_array($decoded)) {
            $assigned_to = $decoded;
            error_log("DEBUG: Parsed as JSON array: " . var_export($assigned_to, true));
        } else {
            // Plain string - could be single email or comma-separated
            $assigned_to = array_map('trim', explode(',', $assigned_to_raw));
            error_log("DEBUG: Parsed as comma-separated: " . var_export($assigned_to, true));
        }
    } else {
        error_log("DEBUG: assigned_to is empty for ticket {$ticket_id}");
    }
    
    // Award bonus to each assigned technician
    $technicians_credited = [];
    
    error_log("DEBUG: Processing " . count($assigned_to) . " technicians for bonuses");
    
    foreach ($assigned_to as $tech_email) {
        if (empty($tech_email)) {
            error_log("DEBUG: Skipping empty tech_email");
            continue;
        }
        
        error_log("DEBUG: Processing technician: {$tech_email}");
        
        // Simple user lookup - try email first, then name
        $user = null;
        
        // Try email lookup
        $stmt = $conn->prepare("SELECT id, total_bonus_earned, email, name FROM users WHERE email = ? AND deleted_at IS NULL");
        $stmt->bind_param("s", $tech_email);
        $stmt->execute();
        $user = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        
        // If not found, try name lookup
        if (!$user) {
            $stmt = $conn->prepare("SELECT id, total_bonus_earned, email, name FROM users WHERE LOWER(name) = LOWER(?) AND deleted_at IS NULL");
            $stmt->bind_param("s", $tech_email);
            $stmt->execute();
            $user = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            
            if ($user) {
                error_log("DEBUG: Found user by name: {$tech_email} -> {$user['email']}");
                $tech_email = $user['email']; // Use real email
            }
        }
        
        if (!$user) {
            error_log("DEBUG: User not found for: {$tech_email}");
            continue;
        }
        
        $user_id = $user['id'];
        error_log("DEBUG: Using user ID: {$user_id} for {$tech_email}");
        
        $user_id = $user['id'];
        $prev_total_earned = (float)($user['total_bonus_earned'] ?? 0);
        
        // Get or create today's bonus record
        $stmt = $conn->prepare("
            SELECT id, installations_completed, installation_bonus, other_tickets_bonus, bonus_amount 
            FROM technician_daily_bonuses 
            WHERE user_id = ? AND date = ?
        ");
        $stmt->bind_param("is", $user_id, $today);
        $stmt->execute();
        $result = $stmt->get_result();
        $bonus_record = $result->fetch_assoc();
        $stmt->close();
        
        $old_bonus_amount = $bonus_record ? (float)($bonus_record['bonus_amount'] ?? 0) : 0;
        
        if ($bonus_record) {
            // Update existing record
            $new_count = $bonus_record['installations_completed'] + 1;
            $installation_bonus = calculateBonus($new_count);
            $total_bonus = $installation_bonus + (float)($bonus_record['other_tickets_bonus'] ?? 0);
            
            $stmt = $conn->prepare("
                UPDATE technician_daily_bonuses 
                SET installations_completed = ?, installation_bonus = ?, bonus_amount = ? 
                WHERE user_id = ? AND date = ?
            ");
            $stmt->bind_param("iddis", $new_count, $installation_bonus, $total_bonus, $user_id, $today);
            $stmt->execute();
            $stmt->close();
            
            // Update total_bonus_earned in users table (diff between new and old)
            $bonus_diff = $total_bonus - $old_bonus_amount;
            if ($bonus_diff > 0) {
                $stmt = $conn->prepare("UPDATE users SET total_bonus_earned = total_bonus_earned + ? WHERE id = ?");
                $stmt->bind_param("di", $bonus_diff, $user_id);
                $stmt->execute();
                $stmt->close();
            }
        } else {
            // Create new record - simple approach
            $new_count = 1;
            $installation_bonus = calculateBonus($new_count);
            
            // Check if record already exists and update it
            $stmt = $conn->prepare("SELECT id FROM technician_daily_bonuses WHERE user_id = ? AND date = ?");
            $stmt->bind_param("is", $user_id, $today);
            $stmt->execute();
            $exists = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            
            if ($exists) {
                // Update existing record
                $stmt = $conn->prepare("UPDATE technician_daily_bonuses SET installations_completed = installations_completed + 1, installation_bonus = ?, bonus_amount = installation_bonus + other_tickets_bonus WHERE user_id = ? AND date = ?");
                $stmt->bind_param("dis", $installation_bonus, $user_id, $today);
                $stmt->execute();
                $stmt->close();
            } else {
                // Insert new record
                $stmt = $conn->prepare("INSERT INTO technician_daily_bonuses (user_id, email, date, installations_completed, other_tickets_completed, installation_bonus, other_tickets_bonus, bonus_amount, bonus_awarded) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $other_tickets = 0;
                $other_bonus = 0.00;
                $bonus_awarded = 0;
                $stmt->bind_param("issididdi", $user_id, $tech_email, $today, $new_count, $other_tickets, $installation_bonus, $other_bonus, $installation_bonus, $bonus_awarded);
                $stmt->execute();
                $stmt->close();
            }
            
            // Update total_bonus_earned in users table
            if ($installation_bonus > 0) {
                $stmt = $conn->prepare("UPDATE users SET total_bonus_earned = total_bonus_earned + ? WHERE id = ?");
                $stmt->bind_param("di", $installation_bonus, $user_id);
                $stmt->execute();
                $stmt->close();
            }
        }
        
        $technicians_credited[] = $tech_email;
        
        error_log("DEBUG: Credited bonus to {$tech_email} (ID: {$user_id})");
    }
    
    // Update ticket record
    $completed_by = json_encode($assigned_to);
    $bonus_awarded = 1;
    
    $stmt = $conn->prepare("
        UPDATE tickets 
        SET completed_by = ?, completed_at = ?, bonus_awarded = ? 
        WHERE id = ?
    ");
    $stmt->bind_param("ssii", $completed_by, $now, $bonus_awarded, $ticket_id);
    $stmt->execute();
    $stmt->close();
    
    echo json_encode([
        'success' => true,
        'message' => 'Installation marked as complete',
        'ticket_id' => $ticket_id,
        // keep both keys for compatibility with different frontend callers
        'technicians_credited' => $technicians_credited,
        'bonus_awarded' => $technicians_credited,
        'completed_at' => $now,
        // DEBUG: Show what we found
        'debug' => [
            'assigned_to_raw' => $assigned_to_raw,
            'assigned_to_parsed' => $assigned_to,
            'technician_count' => count($assigned_to),
            'credited_count' => count($technicians_credited)
        ]
    ]);
}

/**
 * Mark other ticket types as complete/resolved and award bonus if threshold met
 */
function handleCompleteOtherTicket()
{
    global $conn;
    
    $data = json_decode(file_get_contents('php://input'), true);
    
    // Validate input
    if (empty($data['ticket_id'])) {
        throw new Exception('ticket_id is required', 400);
    }
    
    $ticket_id = intval($data['ticket_id']);
    
    // Skip authorization check - allow any authenticated user to complete tickets (matches handleCompleteInstallation)
    
    // Get ticket details
    $stmt = $conn->prepare("SELECT id, assigned_to, status, type FROM tickets WHERE id = ?");
    $stmt->bind_param("i", $ticket_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $ticket = $result->fetch_assoc();
    $stmt->close();
    
    if (!$ticket) {
        throw new Exception('Ticket not found', 404);
    }
    
    // Parse assigned technicians - handle both JSON array and plain string formats
    $assigned_to_raw = $ticket['assigned_to'];
    $assigned_to = [];
    
    if (!empty($assigned_to_raw)) {
        // Try to decode as JSON first
        $decoded = json_decode($assigned_to_raw, true);
        if (is_array($decoded)) {
            $assigned_to = $decoded;
        } else {
            // Plain string - could be single email or comma-separated
            $assigned_to = array_map('trim', explode(',', $assigned_to_raw));
        }
    }
    
    $today = date('Y-m-d');
    $now = date('Y-m-d H:i:s');
    
    // Award bonus to each assigned technician
    $technicians_credited = [];
    
    foreach ($assigned_to as $tech_email) {
        if (empty($tech_email)) continue;
        
        // Get technician user ID - try email first, then name (like handleCompleteInstallation)
        $user = null;
        
        $stmt = $conn->prepare("SELECT id, total_bonus_earned, email, name FROM users WHERE email = ? AND deleted_at IS NULL");
        $stmt->bind_param("s", $tech_email);
        $stmt->execute();
        $user = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        
        // If not found by email, try name lookup
        if (!$user) {
            $stmt = $conn->prepare("SELECT id, total_bonus_earned, email, name FROM users WHERE LOWER(name) = LOWER(?) AND deleted_at IS NULL");
            $stmt->bind_param("s", $tech_email);
            $stmt->execute();
            $user = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            
            if ($user) {
                $tech_email = $user['email']; // Use real email
            }
        }
        
        if (!$user) continue;
        
        $user_id = $user['id'];
        
        // Get or create today's bonus record
        $stmt = $conn->prepare("
            SELECT id, other_tickets_completed, installation_bonus, other_tickets_bonus, bonus_amount 
            FROM technician_daily_bonuses 
            WHERE user_id = ? AND date = ?
        ");
        $stmt->bind_param("is", $user_id, $today);
        $stmt->execute();
        $result = $stmt->get_result();
        $bonus_record = $result->fetch_assoc();
        $stmt->close();
        
        $old_bonus_amount = $bonus_record ? (float)($bonus_record['bonus_amount'] ?? 0) : 0;
        
        if ($bonus_record) {
            // Update existing record
            $new_count = $bonus_record['other_tickets_completed'] + 1;
            $other_tickets_bonus = calculateOtherTicketsBonus($new_count);
            $total_bonus = (float)($bonus_record['installation_bonus'] ?? 0) + $other_tickets_bonus;
            
            $stmt = $conn->prepare("
                UPDATE technician_daily_bonuses 
                SET other_tickets_completed = ?, other_tickets_bonus = ?, bonus_amount = ? 
                WHERE user_id = ? AND date = ?
            ");
            $stmt->bind_param("iddis", $new_count, $other_tickets_bonus, $total_bonus, $user_id, $today);
            $stmt->execute();
            $stmt->close();
            
            // Update total_bonus_earned in users table (diff between new and old)
            $bonus_diff = $total_bonus - $old_bonus_amount;
            if ($bonus_diff > 0) {
                $stmt = $conn->prepare("UPDATE users SET total_bonus_earned = total_bonus_earned + ? WHERE id = ?");
                $stmt->bind_param("di", $bonus_diff, $user_id);
                $stmt->execute();
                $stmt->close();
            }
        } else {
            // Create new record
            $new_count = 1;
            $other_tickets_bonus = calculateOtherTicketsBonus($new_count);
            
            $stmt = $conn->prepare("
                INSERT INTO technician_daily_bonuses 
                (user_id, email, date, installations_completed, other_tickets_completed, installation_bonus, other_tickets_bonus, bonus_amount, bonus_awarded) 
                VALUES (?, ?, ?, 0, ?, 0.00, ?, ?, 0)
            ");
            $stmt->bind_param("issiddd", $user_id, $tech_email, $today, $new_count, $other_tickets_bonus, $other_tickets_bonus);
            $stmt->execute();
            $stmt->close();
            
            // Update total_bonus_earned in users table
            if ($other_tickets_bonus > 0) {
                $stmt = $conn->prepare("UPDATE users SET total_bonus_earned = total_bonus_earned + ? WHERE id = ?");
                $stmt->bind_param("di", $other_tickets_bonus, $user_id);
                $stmt->execute();
                $stmt->close();
            }
        }
        
        $technicians_credited[] = $tech_email;
    }
    
    // Update ticket record
    $completed_by = json_encode($assigned_to);
    $bonus_awarded = 1;
    
    $stmt = $conn->prepare("
        UPDATE tickets 
        SET completed_by = ?, completed_at = ?, bonus_awarded = ? 
        WHERE id = ?
    ");
    $stmt->bind_param("ssii", $completed_by, $now, $bonus_awarded, $ticket_id);
    $stmt->execute();
    $stmt->close();
    
    echo json_encode([
        'success' => true,
        'message' => 'Ticket marked as complete',
        'ticket_id' => $ticket_id,
        'technicians_credited' => $technicians_credited,
        'completed_at' => $now
    ]);
}

/**
 * Get all technicians' bonuses for today
 */
function getDailyBonuses()
{
    global $conn;
    
    $today = date('Y-m-d');
    
    // Check if tables exist first
    $check_stmt = $conn->prepare("SELECT COUNT(*) as cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'technician_daily_bonuses'");
    $check_stmt->execute();
    $check_result = $check_stmt->get_result();
    $table_check = $check_result->fetch_assoc();
    $check_stmt->close();
    
    if (!$table_check || $table_check['cnt'] == 0) {
        throw new Exception('Bonus tables do not exist. Database migration required.', 503);
    }
    
    $stmt = $conn->prepare("
        SELECT 
            tdb.id,
            tdb.user_id,
            tdb.email,
            tdb.installations_completed,
            tdb.other_tickets_completed,
            tdb.installation_bonus,
            tdb.other_tickets_bonus,
            tdb.bonus_amount,
            tdb.bonus_awarded,
            u.name,
            u.phone,
            u.total_bonus_earned,
            u.total_bonus_paid
        FROM technician_daily_bonuses tdb
        JOIN users u ON tdb.user_id = u.id
        WHERE tdb.date = ?
        ORDER BY tdb.bonus_amount DESC, tdb.installations_completed DESC
    ");
    
    if (!$stmt) {
        throw new Exception('Database error: ' . $conn->error, 500);
    }
    
    $stmt->bind_param("s", $today);
    if (!$stmt->execute()) {
        throw new Exception('Query error: ' . $stmt->error, 500);
    }
    $result = $stmt->get_result();
    $bonuses = $result->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    
    // Convert numeric fields
    foreach ($bonuses as &$bonus) {
        $bonus['installations_completed'] = (int)($bonus['installations_completed'] ?? 0);
        $bonus['other_tickets_completed'] = (int)($bonus['other_tickets_completed'] ?? 0);
        $bonus['installation_bonus'] = (float)($bonus['installation_bonus'] ?? 0);
        $bonus['other_tickets_bonus'] = (float)($bonus['other_tickets_bonus'] ?? 0);
        $bonus['bonus_amount'] = (float)$bonus['bonus_amount'];
        $bonus['total_bonus_earned'] = (float)($bonus['total_bonus_earned'] ?? 0);
        $bonus['total_bonus_paid'] = (float)($bonus['total_bonus_paid'] ?? 0);
        $bonus['balance_owed'] = (float)($bonus['total_bonus_earned'] - $bonus['total_bonus_paid']);
    }
    
    echo json_encode([
        'success' => true,
        'date' => $today,
        'bonuses' => $bonuses,
        'count' => count($bonuses)
    ]);
}

/**
 * Get a single technician's bonus information
 * Calculates bonuses from QUALIFYING TICKETS (same logic as getTicketBonusList)
 * A ticket qualifies if ANY technician on it exceeded their daily threshold.
 * Once qualified, ALL technicians on that ticket get KSh 100 each.
 */
function getTechnicianBonus()
{
    global $conn;
    
    $email = $_GET['email'] ?? '';
    
    if (empty($email)) {
        throw new Exception('email parameter is required', 400);
    }
    
    // Get user info
    $stmt = $conn->prepare("SELECT id, name, email, total_bonus_earned, total_bonus_paid FROM users WHERE email = ? OR name = ?");
    $stmt->bind_param("ss", $email, $email);
    $stmt->execute();
    $user = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    
    if (!$user) {
        echo json_encode([
            'success' => true,
            'email' => $email,
            'today' => [
                'installations_completed' => 0,
                'other_tickets_completed' => 0,
                'installation_bonus' => 0,
                'other_tickets_bonus' => 0,
                'bonus_amount' => 0,
                'bonus_awarded' => 0
            ],
            'total' => [
                'total_earned' => 0,
                'total_paid' => 0,
                'balance_owed' => 0
            ]
        ]);
        return;
    }
    
    $user_name = strtolower(trim($user['name']));
    $user_email_lower = strtolower(trim($user['email']));
    $today = date('Y-m-d');
    
    // Get ALL resolved tickets
    $stmt = $conn->prepare("
        SELECT 
            t.id,
            t.type,
            t.status,
            t.assigned_to,
            DATE(COALESCE(t.completed_at, t.updated_at)) as ticket_date
        FROM tickets t
        WHERE t.status IN ('resolved', 'closed', 'installation complete')
        ORDER BY ticket_date ASC, t.id ASC
    ");
    $stmt->execute();
    $result = $stmt->get_result();
    
    $all_tickets = [];
    while ($row = $result->fetch_assoc()) {
        $all_tickets[] = $row;
    }
    $stmt->close();
    
    // STEP 1: Determine which tickets QUALIFY (any tech exceeded threshold)
    // Track daily counts per technician
    $daily_tech_counts = []; // [date][tech] => ['installations' => N, 'other' => N]
    $ticket_qualifications = []; // [ticket_id] => ['qualifies' => bool, 'date' => date, 'is_installation' => bool, 'assigned_to' => array]
    
    foreach ($all_tickets as $ticket) {
        $ticket_id = $ticket['id'];
        $ticket_date = $ticket['ticket_date'];
        $ticket_type = strtolower($ticket['type'] ?? '');
        $is_installation = isInstallationMenuType($ticket_type);
        $threshold = $is_installation ? 4 : 10;
        
        // Parse assigned technicians
        $assigned_raw = $ticket['assigned_to'];
        $technicians = [];
        if (!empty($assigned_raw)) {
            $decoded = json_decode($assigned_raw, true);
            if (is_array($decoded)) {
                $technicians = array_map(function($t) { return strtolower(trim($t)); }, $decoded);
            } else {
                $technicians = array_map(function($t) { return strtolower(trim($t)); }, explode(',', $assigned_raw));
            }
        }
        
        // Store ticket info
        $ticket_qualifications[$ticket_id] = [
            'qualifies' => false,
            'date' => $ticket_date,
            'is_installation' => $is_installation,
            'technicians' => $technicians
        ];
        
        // Track counts and check if this ticket qualifies
        foreach ($technicians as $tech) {
            if (empty($tech)) continue;
            
            if (!isset($daily_tech_counts[$ticket_date])) {
                $daily_tech_counts[$ticket_date] = [];
            }
            if (!isset($daily_tech_counts[$ticket_date][$tech])) {
                $daily_tech_counts[$ticket_date][$tech] = ['installations' => 0, 'other' => 0];
            }
            
            if ($is_installation) {
                $daily_tech_counts[$ticket_date][$tech]['installations']++;
                $position = $daily_tech_counts[$ticket_date][$tech]['installations'];
            } else {
                $daily_tech_counts[$ticket_date][$tech]['other']++;
                $position = $daily_tech_counts[$ticket_date][$tech]['other'];
            }
            
            // If any tech's count exceeds threshold, ticket qualifies
            if ($position > $threshold) {
                $ticket_qualifications[$ticket_id]['qualifies'] = true;
            }
        }
    }
    
    // STEP 2: Count qualifying tickets for THIS user
    $today_installations = 0;
    $today_other = 0;
    $today_bonus = 0;
    $total_installations = 0;
    $total_other = 0;
    $total_earned = 0;
    
    // Debug: Count qualifying tickets
    $debug_qualifying_count = 0;
    $debug_user_matches = 0;
    $debug_all_techs_on_qualifying = []; // Track all technicians on qualifying tickets
    
    foreach ($ticket_qualifications as $ticket_id => $qual) {
        if (!$qual['qualifies']) {
            continue; // Skip non-qualifying tickets
        }
        
        $debug_qualifying_count++;
        
        // Track all technicians on qualifying tickets for debug
        foreach ($qual['technicians'] as $tech) {
            if (!empty($tech) && !in_array($tech, $debug_all_techs_on_qualifying)) {
                $debug_all_techs_on_qualifying[] = $tech;
            }
        }
        
        // Check if this user is assigned to this ticket
        $user_on_ticket = false;
        foreach ($qual['technicians'] as $tech) {
            // Also check partial match (in case name is stored differently)
            if ($tech === $user_name || $tech === $user_email_lower || 
                strpos($tech, $user_name) !== false || strpos($user_name, $tech) !== false) {
                $user_on_ticket = true;
                break;
            }
        }
        
        if (!$user_on_ticket) {
            continue; // User not on this ticket
        }
        
        $debug_user_matches++;
        
        // User is on a qualifying ticket - they get KSh 100
        if ($qual['is_installation']) {
            $total_installations++;
            if ($qual['date'] === $today) {
                $today_installations++;
            }
        } else {
            $total_other++;
            if ($qual['date'] === $today) {
                $today_other++;
            }
        }
        
        $total_earned += 100;
        if ($qual['date'] === $today) {
            $today_bonus += 100;
        }
    }
    
    // Get total paid from database
    $total_paid = (float)($user['total_bonus_paid'] ?? 0);
    
    echo json_encode([
        'success' => true,
        'email' => $user['email'],
        'name' => $user['name'],
        'today' => [
            'installations_completed' => $today_installations,
            'other_tickets_completed' => $today_other,
            'installation_bonus' => $today_installations * 100,
            'other_tickets_bonus' => $today_other * 100,
            'bonus_amount' => $today_bonus,
            'bonus_awarded' => $today_bonus > 0 ? 1 : 0
        ],
        'total' => [
            'total_earned' => $total_earned,
            'total_paid' => $total_paid,
            'balance_owed' => $total_earned - $total_paid
        ]
    ]);
}

/**
 * Pay bonus to technician
 */
function payBonus()
{
    global $conn;
    
    $data = json_decode(file_get_contents('php://input'), true);
    
    // Validate input
    if (empty($data['technician_email']) || empty($data['amount'])) {
        throw new Exception('technician_email and amount are required', 400);
    }
    
    $technician_email = trim($data['technician_email']);
    $amount = floatval($data['amount']);
    $reference_number = $data['reference_number'] ?? generateReferenceNumber();
    $payment_method = $data['payment_method'] ?? 'manual';
    $notes = $data['notes'] ?? '';
    
    if ($amount <= 0) {
        throw new Exception('Amount must be greater than 0', 400);
    }
    
    $current_user = getCurrentUser();
    if (!$current_user) {
        throw new Exception('Unauthorized', 401);
    }
    
    // Get technician user ID
    $stmt = $conn->prepare("SELECT id FROM users WHERE email = ?");
    $stmt->bind_param("s", $technician_email);
    $stmt->execute();
    $result = $stmt->get_result();
    $tech_user = $result->fetch_assoc();
    $stmt->close();
    
    if (!$tech_user) {
        throw new Exception('Technician not found', 404);
    }
    
    $tech_user_id = $tech_user['id'];
    $payment_date = date('Y-m-d');
    $now = date('Y-m-d H:i:s');
    
    // Start transaction
    $conn->begin_transaction();
    
    try {
        // Log payment
        $stmt = $conn->prepare("
            INSERT INTO technician_bonus_payments 
            (user_id, technician_email, amount, payment_date, reference_number, paid_by_admin, paid_by_email, payment_method, notes, created_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        if (!$stmt) {
            throw new Exception('Database error: ' . $conn->error, 500);
        }
        $paid_by_admin_id = (int)$current_user['id'];
        $paid_by_email = (string)$current_user['email'];
        $stmt->bind_param(
            "isdssissss",
            $tech_user_id,
            $technician_email,
            $amount,
            $payment_date,
            $reference_number,
            $paid_by_admin_id,
            $paid_by_email,
            $payment_method,
            $notes,
            $now
        );
        $stmt->execute();
        $stmt->close();
        
        // Update user's total_bonus_paid
        $stmt = $conn->prepare("
            UPDATE users 
            SET total_bonus_paid = total_bonus_paid + ? 
            WHERE id = ?
        ");
        $stmt->bind_param("di", $amount, $tech_user_id);
        $stmt->execute();
        $stmt->close();
        
        $conn->commit();
        
        echo json_encode([
            'success' => true,
            'message' => 'Bonus payment recorded',
            'technician_email' => $technician_email,
            'amount' => $amount,
            'reference_number' => $reference_number,
            'payment_date' => $payment_date,
            'paid_by' => $current_user['email']
        ]);
    } catch (Exception $e) {
        $conn->rollback();
        throw $e;
    }
}

/**
 * Get payment history
 */
function getPaymentHistory()
{
    global $conn;
    
    $limit = intval($_GET['limit'] ?? 50);
    $offset = intval($_GET['offset'] ?? 0);
    $technician_email = trim((string)($_GET['technician_email'] ?? ''));
    $technician_name = trim((string)($_GET['technician_name'] ?? ''));
    
    $query = "
        SELECT 
            tbp.id,
            tbp.technician_email,
            tech.name as technician_name,
            tbp.amount,
            tbp.payment_date,
            tbp.reference_number,
            admin.email as paid_by_email,
            admin.name as admin_name,
            tbp.payment_method,
            tbp.notes,
            tbp.created_at
        FROM technician_bonus_payments tbp
        LEFT JOIN users tech ON tbp.user_id = tech.id
        LEFT JOIN users admin ON tbp.paid_by_admin = admin.id
    ";
    
    $where_clauses = [];
    $params = [];
    $param_types = '';

    if ($technician_email !== '') {
        $where_clauses[] = "tbp.technician_email = ?";
        $params[] = $technician_email;
        $param_types .= 's';
    }

    if ($technician_name !== '') {
        $where_clauses[] = "tech.name LIKE ?";
        $params[] = '%' . $technician_name . '%';
        $param_types .= 's';
    }
    
    if (!empty($where_clauses)) {
        $query .= " WHERE " . implode(" AND ", $where_clauses);
    }
    
    $query .= " ORDER BY tbp.created_at DESC LIMIT ? OFFSET ?";
    $params[] = $limit;
    $params[] = $offset;
    $param_types .= 'ii';
    
    $stmt = $conn->prepare($query);
    if (!$stmt) {
        throw new Exception('Database error: ' . $conn->error, 500);
    }

    // bind dynamic params (mysqli requires references)
    $bind_params = [];
    $bind_params[] = $param_types;
    for ($i = 0; $i < count($params); $i++) {
        $bind_params[] = &$params[$i];
    }
    call_user_func_array([$stmt, 'bind_param'], $bind_params);

    $stmt->execute();
    $result = $stmt->get_result();
    $payments = $result->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    
    // Get total count
    $count_query = "SELECT COUNT(*) as total FROM technician_bonus_payments tbp LEFT JOIN users tech ON tbp.user_id = tech.id";
    if (!empty($where_clauses)) {
        $count_query .= " WHERE " . implode(" AND ", $where_clauses);
    }
    
    $stmt = $conn->prepare($count_query);
    if (!$stmt) {
        throw new Exception('Database error: ' . $conn->error, 500);
    }

    // Bind count params (same filters, without limit/offset)
    $count_params = [];
    $count_types = '';
    if ($technician_email !== '') {
        $count_params[] = $technician_email;
        $count_types .= 's';
    }
    if ($technician_name !== '') {
        $count_params[] = '%' . $technician_name . '%';
        $count_types .= 's';
    }

    if ($count_types !== '') {
        $bind_count = [];
        $bind_count[] = $count_types;
        for ($i = 0; $i < count($count_params); $i++) {
            $bind_count[] = &$count_params[$i];
        }
        call_user_func_array([$stmt, 'bind_param'], $bind_count);
    }

    $stmt->execute();
    $count_result = $stmt->get_result();
    $count_row = $count_result->fetch_assoc();
    $stmt->close();
    
    // Convert amounts to float
    foreach ($payments as &$payment) {
        $payment['amount'] = (float)$payment['amount'];
    }
    
    echo json_encode([
        'success' => true,
        'payments' => $payments,
        'total' => (int)($count_row['total'] ?? 0),
        'limit' => $limit,
        'offset' => $offset
    ]);
}

/**
 * Reset daily bonus counters
 */
function resetDailyCounters()
{
    global $conn;
    
    $yesterday = date('Y-m-d', strtotime('-1 day'));
    
    // Mark all yesterday's bonuses as awarded
    $stmt = $conn->prepare("
        UPDATE technician_daily_bonuses 
        SET bonus_awarded = 1 
        WHERE date = ? AND bonus_awarded = 0
    ");
    $stmt->bind_param("s", $yesterday);
    $stmt->execute();
    $stmt->close();
    
    // Update users' total_bonus_earned with today's amounts
    $stmt = $conn->prepare("
        UPDATE users u
        SET u.total_bonus_earned = u.total_bonus_earned + 
            (SELECT COALESCE(SUM(bonus_amount), 0) 
             FROM technician_daily_bonuses 
             WHERE user_id = u.id AND date = ?)
        WHERE u.id IN (
            SELECT DISTINCT user_id FROM technician_daily_bonuses WHERE date = ?
        )
    ");
    $stmt->bind_param("ss", $yesterday, $yesterday);
    $stmt->execute();
    $stmt->close();
    
    echo json_encode([
        'success' => true,
        'message' => 'Daily counters reset',
        'date' => $yesterday
    ]);
}

/**
 * Get bonus summary
 */
function getBonusSummary()
{
    global $conn;
    
    $today = date('Y-m-d');
    
    // Check if tables exist first
    $check_stmt = $conn->prepare("SELECT COUNT(*) as cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'technician_daily_bonuses'");
    $check_stmt->execute();
    $check_result = $check_stmt->get_result();
    $table_check = $check_result->fetch_assoc();
    $check_stmt->close();
    
    if (!$table_check || $table_check['cnt'] == 0) {
        throw new Exception('Bonus tables do not exist. Database migration required.', 503);
    }
    
    // Today's summary
    $stmt = $conn->prepare("
        SELECT 
            COUNT(DISTINCT user_id) as technician_count,
            SUM(installations_completed) as total_installations,
            SUM(bonus_amount) as total_bonus_today
        FROM technician_daily_bonuses
        WHERE date = ?
    ");
    
    if (!$stmt) {
        throw new Exception('Database error: ' . $conn->error, 500);
    }
    
    $stmt->bind_param("s", $today);
    if (!$stmt->execute()) {
        throw new Exception('Query error: ' . $stmt->error, 500);
    }
    $result = $stmt->get_result();
    $today_summary = $result->fetch_assoc();
    $stmt->close();
    
    // Overall summary
    $overall_stmt = $conn->prepare("SELECT COALESCE(SUM(total_bonus_earned),0) as total_earned, COALESCE(SUM(total_bonus_paid),0) as total_paid FROM users");
    if (!$overall_stmt) {
        throw new Exception('Database error: ' . $conn->error, 500);
    }
    $overall_stmt->execute();
    $overall_result = $overall_stmt->get_result();
    $overall = $overall_result->fetch_assoc() ?: ['total_earned' => 0, 'total_paid' => 0];
    $overall_stmt->close();

    $overall_total_earned = (float)($overall['total_earned'] ?? 0);
    $overall_total_paid = (float)($overall['total_paid'] ?? 0);
    $overall_balance = $overall_total_earned - $overall_total_paid;
    
    echo json_encode([
        'success' => true,
        'today' => [
            'technician_count' => (int)($today_summary['technician_count'] ?? 0),
            'total_installations' => (int)($today_summary['total_installations'] ?? 0),
            'total_bonus' => (float)($today_summary['total_bonus_today'] ?? 0)
        ],
        'overall' => [
            'total_earned' => $overall_total_earned,
            'total_paid' => $overall_total_paid,
            'balance_owed' => $overall_balance
        ]
    ]);
}

/**
 * Get ticket-level bonus list with payment status
 * Returns tickets that qualify for bonus based on thresholds:
 * - Installation: 5th, 6th, 7th... (after threshold of 4 per technician per day)
 * - Resolved: 11th, 12th, 13th... (after threshold of 10 per technician per day)
 * 
 * IMPORTANT: A ticket qualifies if ANY technician on it exceeded their daily threshold.
 * Once qualified, ALL technicians on that ticket get the bonus (KSh 100 each).
 */
function getTicketBonusList()
{
    global $conn;
    
    // Get filter parameters
    $start_date = $_GET['start_date'] ?? date('Y-m-01'); // Default to start of current month
    $end_date = $_GET['end_date'] ?? date('Y-m-d');
    $technician_filter = $_GET['technician'] ?? '';
    $status_filter = $_GET['payment_status'] ?? ''; // 'paid', 'pending', or empty for all
    $type_filter = $_GET['type_filter'] ?? ''; // 'installation', 'resolved', or empty for all
    $limit = intval($_GET['limit'] ?? 100);
    $offset = intval($_GET['offset'] ?? 0);
    
    // STEP 1: Get ALL resolved tickets in the date range
    $query = "
        SELECT 
            t.id as ticket_id,
            t.subject,
            t.type,
            t.status,
            t.assigned_to,
            t.created_at as ticket_date,
            t.completed_at,
            t.updated_at,
            t.bonus_awarded,
            t.completed_by,
            DATE(COALESCE(t.completed_at, t.updated_at)) as completion_date
        FROM tickets t
        WHERE t.status IN ('resolved', 'closed', 'installation complete')
        AND DATE(COALESCE(t.completed_at, t.updated_at)) BETWEEN ? AND ?
        ORDER BY DATE(COALESCE(t.completed_at, t.updated_at)) ASC, 
                 COALESCE(t.completed_at, t.updated_at) ASC,
                 t.id ASC
    ";
    
    $stmt = $conn->prepare($query);
    $stmt->bind_param("ss", $start_date, $end_date);
    $stmt->execute();
    $result = $stmt->get_result();
    
    $all_tickets = [];
    while ($row = $result->fetch_assoc()) {
        $all_tickets[] = $row;
    }
    $stmt->close();
    
    // STEP 2: First pass - determine which tickets QUALIFY based on any tech exceeding threshold
    // Track daily counts per technician, and mark which tickets qualify
    $daily_tech_counts = []; // [date][technician] => ['installations' => count, 'resolved' => count]
    $ticket_qualifications = []; // [ticket_id] => ['qualifies' => bool, 'position' => N, 'threshold' => N, 'qualifying_tech' => email]
    
    foreach ($all_tickets as $ticket) {
        $completion_date = $ticket['completion_date'];
        $ticket_id = $ticket['ticket_id'];
        $ticket_type = strtolower($ticket['type'] ?? '');
        $is_installation = isInstallationMenuType($ticket_type);
        
        // Parse assigned technicians
        $assigned_to_raw = $ticket['assigned_to'];
        $technicians = [];
        
        if (!empty($assigned_to_raw)) {
            $decoded = json_decode($assigned_to_raw, true);
            if (is_array($decoded)) {
                $technicians = $decoded;
            } else {
                $technicians = array_map('trim', explode(',', $assigned_to_raw));
            }
        }
        
        // Track this ticket's qualification status
        $ticket_qualifications[$ticket_id] = [
            'qualifies' => false,
            'position' => 0,
            'threshold' => $is_installation ? 4 : 10,
            'qualifying_tech' => '',
            'is_installation' => $is_installation,
            'completion_date' => $completion_date,
            'ticket_data' => $ticket,
            'all_technicians' => $technicians
        ];
        
        // Check each technician to see if THIS ticket causes them to exceed threshold
        foreach ($technicians as $tech_name) {
            if (empty($tech_name)) continue;
            $tech_name = trim($tech_name);
            
            // Initialize tracking
            if (!isset($daily_tech_counts[$completion_date])) {
                $daily_tech_counts[$completion_date] = [];
            }
            if (!isset($daily_tech_counts[$completion_date][$tech_name])) {
                $daily_tech_counts[$completion_date][$tech_name] = [
                    'installations' => 0,
                    'resolved' => 0
                ];
            }
            
            // Increment count and check qualification
            if ($is_installation) {
                $daily_tech_counts[$completion_date][$tech_name]['installations']++;
                $position = $daily_tech_counts[$completion_date][$tech_name]['installations'];
                $threshold = 4;
            } else {
                $daily_tech_counts[$completion_date][$tech_name]['resolved']++;
                $position = $daily_tech_counts[$completion_date][$tech_name]['resolved'];
                $threshold = 10;
            }
            
            // If this technician's count exceeds threshold, the ticket qualifies
            if ($position > $threshold && !$ticket_qualifications[$ticket_id]['qualifies']) {
                $ticket_qualifications[$ticket_id]['qualifies'] = true;
                $ticket_qualifications[$ticket_id]['position'] = $position;
                $ticket_qualifications[$ticket_id]['qualifying_tech'] = $tech_name;
            }
        }
    }
    
    // STEP 3: Collect ONLY qualifying tickets with ALL their technicians
    $qualifying_tickets = [];
    
    foreach ($ticket_qualifications as $ticket_id => $qual_info) {
        if (!$qual_info['qualifies']) {
            continue; // Skip non-qualifying tickets
        }
        
        $ticket = $qual_info['ticket_data'];
        $all_technicians = $qual_info['all_technicians'];
        $is_installation = $qual_info['is_installation'];
        
        // Apply type filter
        if ($type_filter === 'installation' && !$is_installation) {
            continue;
        }
        if ($type_filter === 'resolved' && $is_installation) {
            continue;
        }
        
        // Apply technician filter (check if ANY assigned tech matches)
        if (!empty($technician_filter)) {
            $tech_matches = false;
            foreach ($all_technicians as $tech) {
                if (stripos($tech, $technician_filter) !== false) {
                    $tech_matches = true;
                    break;
                }
            }
            if (!$tech_matches) {
                continue;
            }
        }
        
        // Check payment status
        $payment_status = 'pending';
        $payment_date = null;
        $payment_reference = null;
        
        if ($ticket['bonus_awarded']) {
            // Check if there's a payment for the qualifying technician
            $ticket_date = date('Y-m-d', strtotime($ticket['completed_at'] ?? $ticket['updated_at']));
            $qual_tech = $qual_info['qualifying_tech'];
            
            $pay_check = $conn->prepare("
                SELECT id, payment_date, reference_number 
                FROM technician_bonus_payments 
                WHERE technician_email = ? 
                AND payment_date >= ?
                LIMIT 1
            ");
            if ($pay_check) {
                $pay_check->bind_param("ss", $qual_tech, $ticket_date);
                $pay_check->execute();
                $pay_result = $pay_check->get_result()->fetch_assoc();
                $pay_check->close();
                
                if ($pay_result) {
                    $payment_status = 'paid';
                    $payment_date = $pay_result['payment_date'];
                    $payment_reference = $pay_result['reference_number'];
                }
            }
        }
        
        // Apply payment status filter
        if (!empty($status_filter)) {
            if ($status_filter === 'paid' && $payment_status !== 'paid') continue;
            if ($status_filter === 'pending' && $payment_status !== 'pending') continue;
        }
        
        // Calculate bonus based on number of technicians
        $tech_count = count($all_technicians);
        $total_bonus = $tech_count * 100.00;
        
        $qualifying_tickets[] = [
            'ticket_id' => (int)$ticket['ticket_id'],
            'subject' => $ticket['subject'],
            'type' => $ticket['type'],
            'status' => $ticket['status'],
            'technicians' => [$qual_info['qualifying_tech']], // The technician who caused qualification
            'all_technicians' => $all_technicians, // All technicians on this ticket
            'technician_count' => $tech_count,
            'ticket_date' => $ticket['ticket_date'],
            'completed_at' => $ticket['completed_at'] ?? $ticket['updated_at'],
            'is_installation' => $is_installation,
            'bonus_type' => $is_installation ? 'installation' : 'resolved',
            'position_today' => $qual_info['position'],
            'threshold' => $qual_info['threshold'],
            'bonus_amount' => $total_bonus,
            'bonus_per_tech' => 100.00,
            'bonus_awarded' => (bool)$ticket['bonus_awarded'],
            'payment_status' => $payment_status,
            'payment_date' => $payment_date,
            'payment_reference' => $payment_reference
        ];
    }
    
    // Sort by completed_at descending (most recent first)
    usort($qualifying_tickets, function($a, $b) {
        return strtotime($b['completed_at']) - strtotime($a['completed_at']);
    });
    
    // STEP 4: Calculate summary stats (before pagination)
    // Count tickets by type
    $installation_tickets = array_filter($qualifying_tickets, fn($t) => $t['is_installation']);
    $resolved_tickets = array_filter($qualifying_tickets, fn($t) => !$t['is_installation']);
    $installation_count = count($installation_tickets);
    $resolved_count = count($resolved_tickets);
    
    // Calculate total bonus INCLUDING all technicians per ticket
    $installation_bonus_total = array_sum(array_map(fn($t) => $t['bonus_amount'], $installation_tickets));
    $resolved_bonus_total = array_sum(array_map(fn($t) => $t['bonus_amount'], $resolved_tickets));
    $total_bonus = $installation_bonus_total + $resolved_bonus_total;
    
    $paid_count = count(array_filter($qualifying_tickets, fn($t) => $t['payment_status'] === 'paid'));
    $pending_count = count($qualifying_tickets) - $paid_count;
    
    // STEP 5: Apply pagination
    $total_count = count($qualifying_tickets);
    $paginated_tickets = array_slice($qualifying_tickets, $offset, $limit);
    
    echo json_encode([
        'success' => true,
        'data' => array_values($paginated_tickets),
        'pagination' => [
            'total' => $total_count,
            'limit' => $limit,
            'offset' => $offset
        ],
        'summary' => [
            'total_tickets' => $total_count,
            'installation_count' => $installation_count,
            'resolved_count' => $resolved_count,
            'installation_bonus' => $installation_bonus_total,
            'resolved_bonus' => $resolved_bonus_total,
            'total_bonus_amount' => $total_bonus,
            'paid_count' => $paid_count,
            'pending_count' => $pending_count,
            'thresholds' => [
                'installation' => 4,
                'resolved' => 10
            ]
        ],
        'filters' => [
            'start_date' => $start_date,
            'end_date' => $end_date,
            'technician' => $technician_filter,
            'payment_status' => $status_filter,
            'type_filter' => $type_filter
        ],
        'explanation' => 'Only tickets that exceed daily thresholds are shown: installations > 4, resolved > 10 per technician per day'
    ]);
}

/**
 * Calculate bonus amount based on installation count
 * No bonus for 1-4 installations
 * KSh 100 per installation for 5+
 */
function calculateBonus($installation_count)
{
    if ($installation_count <= 4) {
        return 0.00;
    }
    
    // Bonus only for installations beyond 4 (KSh 100 per installation)
    $bonus_installations = $installation_count - 4;
    return $bonus_installations * 100.00;
}

/**
 * Calculate bonus for other ticket types (non-installation)
 * No bonus for 1-10 tickets
 * KSh 100 per ticket for 11+ tickets
 */
function calculateOtherTicketsBonus($ticket_count)
{
    if ($ticket_count <= 10) {
        return 0.00;
    }
    
    // Bonus only for tickets beyond 10 (KSh 100 per ticket)
    $bonus_tickets = $ticket_count - 10;
    return $bonus_tickets * 100.00;
}

/**
 * Generate unique reference number
 */
function generateReferenceNumber()
{
    return 'PAY-' . date('YmdHis') . '-' . random_int(1000, 9999);
}

/**
 * Get authenticated user from database
 */
function getCurrentUser()
{
    global $conn;

    // Try session-based auth first (simpler)
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    if (isset($_SESSION['user_id']) && isset($_SESSION['email'])) {
        return [
            'id' => $_SESSION['user_id'],
            'email' => $_SESSION['email'],
            'name' => $_SESSION['name'] ?? 'User'
        ];
    }

    // Fallback to token-based auth
    $token = getAuthToken();
    if (!$token) {
        return null;
    }

    $decoded = verifyToken($token);
    if (!$decoded || empty($decoded['user_id'])) {
        return null;
    }

    $user_id = (int)$decoded['user_id'];

    $stmt = $conn->prepare("SELECT id, email, name FROM users WHERE id = ?");
    if (!$stmt) {
        return null;
    }
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $user = $result->fetch_assoc();
    $stmt->close();
    
    return $user;
}

/**
 * Check if user has admin role (checks model_has_roles table)
 */
function isAdmin($user)
{
    if (!$user || !isset($user['id'])) {
        return false;
    }
    
    global $conn;
    
    try {
        // Check if user has admin role via model_has_roles
        $stmt = $conn->prepare("
            SELECT 1 FROM model_has_roles mhr
            INNER JOIN roles r ON mhr.role_id = r.id
            WHERE mhr.model_id = ? AND mhr.model_type = ?
            AND r.name IN ('administrator', 'manager', 'super-administrator')
            LIMIT 1
        ");
        
        if (!$stmt) {
            // If query fails, try simpler approach - check if user is admin user
            return $user['email'] === 'admin@tonycommgroupltd.com';
        }
        
        $model_type = 'App\\Models\\User';
        $stmt->bind_param("is", $user['id'], $model_type);
        $stmt->execute();
        $result = $stmt->get_result();
        $has_admin_role = $result->num_rows > 0;
        $stmt->close();
        
        return $has_admin_role;
    } catch (Exception $e) {
        // Fallback: check if email is admin
        return $user['email'] === 'admin@tonycommgroupltd.com';
    }
}

/**
 * Check admin role and throw exception if not admin
 */
function checkAdminRole()
{
    $user = getCurrentUser();
    
    if (!$user) {
        throw new Exception('Unauthorized', 401);
    }
    
    if (!isAdmin($user)) {
        throw new Exception('Admin access required', 403);
    }
}

/**
 * Add a technician to a ticket's bonus record
 * This allows adding technicians who worked on a ticket but weren't originally assigned
 */
function addTechnicianToTicketBonus()
{
    global $conn;
    
    // Get POST data
    $input = json_decode(file_get_contents('php://input'), true);
    
    $ticket_id = intval($input['ticket_id'] ?? 0);
    $technician_email = trim($input['technician_email'] ?? '');
    
    if (!$ticket_id) {
        throw new Exception('Ticket ID is required', 400);
    }
    
    if (empty($technician_email)) {
        throw new Exception('Technician email is required', 400);
    }
    
    // Verify the ticket exists and is resolved/completed
    $stmt = $conn->prepare("
        SELECT id, subject, type, status, assigned_to, completed_at, updated_at
        FROM tickets 
        WHERE id = ?
    ");
    $stmt->bind_param("i", $ticket_id);
    $stmt->execute();
    $ticket = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    
    if (!$ticket) {
        throw new Exception('Ticket not found', 404);
    }
    
    $valid_statuses = ['resolved', 'closed', 'installation complete'];
    if (!in_array(strtolower($ticket['status']), $valid_statuses)) {
        throw new Exception('Ticket must be resolved, closed, or installation complete to add bonus', 400);
    }
    
    // Verify the technician exists
    $stmt = $conn->prepare("SELECT id, name, email FROM users WHERE (email = ? OR name = ?) AND deleted_at IS NULL");
    $stmt->bind_param("ss", $technician_email, $technician_email);
    $stmt->execute();
    $technician = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    
    if (!$technician) {
        throw new Exception('Technician not found: ' . $technician_email, 404);
    }
    
    $tech_email = $technician['email'];
    $tech_name = $technician['name'];
    $user_id = $technician['id'];
    
    // Check if this technician is already assigned to this ticket
    $existing_assigned = [];
    if (!empty($ticket['assigned_to'])) {
        $decoded = json_decode($ticket['assigned_to'], true);
        if (is_array($decoded)) {
            $existing_assigned = array_map('trim', array_map('strtolower', $decoded));
        } else {
            $existing_assigned = array_map('trim', array_map('strtolower', explode(',', $ticket['assigned_to'])));
        }
    }
    
    $tech_email_lower = strtolower($tech_email);
    $tech_name_lower = strtolower($tech_name);
    
    if (in_array($tech_email_lower, $existing_assigned) || in_array($tech_name_lower, $existing_assigned)) {
        throw new Exception('This technician is already assigned to this ticket', 400);
    }
    
    // Add the technician to the ticket's assigned_to field
    // NOTE: The system stores NAME in assigned_to (not email) - see getAssignmentOptions in tickets.php
    $new_assigned = $ticket['assigned_to'];
    if (!empty($new_assigned)) {
        $decoded = json_decode($new_assigned, true);
        if (is_array($decoded)) {
            $decoded[] = $tech_name; // Use name to match how tickets store assigned_to
            $new_assigned = json_encode($decoded);
        } else {
            $new_assigned = $new_assigned . ',' . $tech_name;
        }
    } else {
        $new_assigned = json_encode([$tech_name]);
    }
    
    // Update the ticket
    $stmt = $conn->prepare("UPDATE tickets SET assigned_to = ? WHERE id = ?");
    $stmt->bind_param("si", $new_assigned, $ticket_id);
    $stmt->execute();
    $stmt->close();
    
    // Calculate the completion date for bonus tracking
    $completion_date = date('Y-m-d', strtotime($ticket['completed_at'] ?? $ticket['updated_at']));
    $ticket_type = strtolower($ticket['type'] ?? '');
    $is_installation = isInstallationMenuType($ticket_type);
    
    // Since this ticket is already in the bonus summary (qualifying),
    // we directly add KSh 100 bonus for this technician
    $bonus_to_add = 100.00;
    
    // Check if there's already a daily bonus record for this technician on this date
    $stmt = $conn->prepare("
        SELECT id, installations_completed, other_tickets_completed, installation_bonus, other_tickets_bonus, bonus_amount
        FROM technician_daily_bonuses 
        WHERE user_id = ? AND date = ?
    ");
    $stmt->bind_param("is", $user_id, $completion_date);
    $stmt->execute();
    $existing_bonus = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    
    if ($existing_bonus) {
        // Update existing record - add 1 to count and add KSh 100 to bonus
        if ($is_installation) {
            $new_count = $existing_bonus['installations_completed'] + 1;
            $new_inst_bonus = $existing_bonus['installation_bonus'] + $bonus_to_add;
            $new_total = $new_inst_bonus + $existing_bonus['other_tickets_bonus'];
            $stmt = $conn->prepare("
                UPDATE technician_daily_bonuses 
                SET installations_completed = ?,
                    installation_bonus = ?,
                    bonus_amount = ?
                WHERE id = ?
            ");
            $stmt->bind_param("iddi", $new_count, $new_inst_bonus, $new_total, $existing_bonus['id']);
        } else {
            $new_count = $existing_bonus['other_tickets_completed'] + 1;
            $new_other_bonus = $existing_bonus['other_tickets_bonus'] + $bonus_to_add;
            $new_total = $existing_bonus['installation_bonus'] + $new_other_bonus;
            $stmt = $conn->prepare("
                UPDATE technician_daily_bonuses 
                SET other_tickets_completed = ?,
                    other_tickets_bonus = ?,
                    bonus_amount = ?
                WHERE id = ?
            ");
            $stmt->bind_param("iddi", $new_count, $new_other_bonus, $new_total, $existing_bonus['id']);
        }
        $stmt->execute();
        $stmt->close();
    } else {
        // Create new record with direct KSh 100 bonus (since ticket already qualifies)
        $installations = $is_installation ? 1 : 0;
        $other_tickets = $is_installation ? 0 : 1;
        $installation_bonus = $is_installation ? $bonus_to_add : 0.00;
        $other_bonus = $is_installation ? 0.00 : $bonus_to_add;
        $total_bonus = $bonus_to_add;
        
        $stmt = $conn->prepare("
            INSERT INTO technician_daily_bonuses 
            (user_id, email, date, installations_completed, other_tickets_completed, installation_bonus, other_tickets_bonus, bonus_amount)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->bind_param("issiiddd", $user_id, $tech_email, $completion_date, $installations, $other_tickets, $installation_bonus, $other_bonus, $total_bonus);
        $stmt->execute();
        $stmt->close();
    }
    
    // Also update the user's total_bonus_earned in the users table
    $stmt = $conn->prepare("
        UPDATE users 
        SET total_bonus_earned = COALESCE(total_bonus_earned, 0) + ?
        WHERE id = ?
    ");
    $stmt->bind_param("di", $bonus_to_add, $user_id);
    $stmt->execute();
    $stmt->close();
    
    // Log the action
    $current_user = getCurrentUser();
    $added_by = $current_user['email'] ?? 'system';
    $added_by_name = $current_user['name'] ?? 'System';
    
    // Log to activity if table exists (using correct column names from activity_logs table)
    $log_query = "INSERT INTO activity_logs (user_id, user_name, user_email, activity_type, activity_description, target_type, target_id, created_at) VALUES (?, ?, ?, 'bonus_update', ?, 'ticket', ?, NOW())";
    $log_stmt = $conn->prepare($log_query);
    if ($log_stmt) {
        $description = "Added technician {$tech_name} ({$tech_email}) to ticket #{$ticket_id} bonus";
        $log_user_id = $current_user['id'] ?? 0;
        $log_stmt->bind_param("isssi", $log_user_id, $added_by_name, $added_by, $description, $ticket_id);
        $log_stmt->execute();
        $log_stmt->close();
    }
    
    // Get updated technicians list for the ticket
    $updated_technicians = [];
    $decoded_new = json_decode($new_assigned, true);
    if (is_array($decoded_new)) {
        $updated_technicians = $decoded_new;
    } else {
        $updated_technicians = array_map('trim', explode(',', $new_assigned));
    }
    
    echo json_encode([
        'success' => true,
        'message' => "Technician {$tech_name} added to ticket #{$ticket_id}. Bonus of KSh 100 will be awarded.",
        'data' => [
            'ticket_id' => $ticket_id,
            'technician_email' => $tech_email,
            'technician_name' => $tech_name,
            'completion_date' => $completion_date,
            'is_installation' => $is_installation,
            'bonus_amount' => 100,
            'updated_technicians' => $updated_technicians
        ]
    ]);
}

/**
 * Get list of all technicians and engineers for dropdown selection
 * Uses same approach as getAssignmentOptions in tickets.php
 */
function getTechniciansList()
{
    global $conn;
    
    // Get users who are technicians or engineers (using model_has_roles - same as tickets.php)
    $query = "
        SELECT DISTINCT 
            u.id,
            u.name,
            u.email,
            u.phone,
            GROUP_CONCAT(DISTINCT r.name ORDER BY r.name SEPARATOR ', ') as roles
        FROM users u
        INNER JOIN model_has_roles mhr ON u.id = mhr.model_id
        INNER JOIN roles r ON mhr.role_id = r.id
        WHERE u.deleted_at IS NULL
        AND mhr.model_type = 'App\\\\Models\\\\User'
        AND r.name IN ('technician', 'engineer')
        GROUP BY u.id, u.name, u.email, u.phone
        ORDER BY u.name ASC
    ";
    
    $result = $conn->query($query);
    
    $technicians = [];
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $technicians[] = [
                'id' => (int)$row['id'],
                'name' => $row['name'],
                'email' => $row['email'],
                'phone' => $row['phone'],
                'roles' => $row['roles']
            ];
        }
    }
    
    // If no technicians/engineers found, try broader role matching
    if (empty($technicians)) {
        $query2 = "
            SELECT DISTINCT 
                u.id,
                u.name,
                u.email,
                u.phone,
                GROUP_CONCAT(DISTINCT r.name ORDER BY r.name SEPARATOR ', ') as roles
            FROM users u
            INNER JOIN model_has_roles mhr ON u.id = mhr.model_id
            INNER JOIN roles r ON mhr.role_id = r.id
            WHERE u.deleted_at IS NULL
            AND mhr.model_type = 'App\\\\Models\\\\User'
            AND (
                LOWER(r.name) LIKE '%technician%'
                OR LOWER(r.name) LIKE '%engineer%'
                OR LOWER(r.name) LIKE '%tech%'
                OR LOWER(r.name) LIKE '%field%'
                OR LOWER(r.name) LIKE '%installer%'
            )
            GROUP BY u.id, u.name, u.email, u.phone
            ORDER BY u.name ASC
        ";
        
        $result = $conn->query($query2);
        if ($result) {
            while ($row = $result->fetch_assoc()) {
                $technicians[] = [
                    'id' => (int)$row['id'],
                    'name' => $row['name'],
                    'email' => $row['email'],
                    'phone' => $row['phone'],
                    'roles' => $row['roles']
                ];
            }
        }
    }
    
    // If still no technicians found, get ALL active users as fallback
    if (empty($technicians)) {
        $fallback_query = "
            SELECT 
                u.id,
                u.name,
                u.email,
                u.phone,
                COALESCE(
                    (SELECT GROUP_CONCAT(DISTINCT r.name ORDER BY r.name SEPARATOR ', ')
                     FROM model_has_roles mhr
                     JOIN roles r ON mhr.role_id = r.id
                     WHERE mhr.model_id = u.id AND mhr.model_type = 'App\\\\Models\\\\User'),
                    'User'
                ) as roles
            FROM users u
            WHERE u.deleted_at IS NULL
            ORDER BY u.name ASC
        ";
        
        $result = $conn->query($fallback_query);
        if ($result) {
            while ($row = $result->fetch_assoc()) {
                $technicians[] = [
                    'id' => (int)$row['id'],
                    'name' => $row['name'],
                    'email' => $row['email'],
                    'phone' => $row['phone'],
                    'roles' => $row['roles'] ?: 'User'
                ];
            }
        }
    }
    
    echo json_encode([
        'success' => true,
        'data' => $technicians,
        'count' => count($technicians)
    ]);
}

/**
 * Debug function to see what tickets look like
 */
function debugTicketData()
{
    global $conn;
    
    $email = $_GET['email'] ?? '';
    
    // Get user info
    $user = null;
    if (!empty($email)) {
        $stmt = $conn->prepare("SELECT id, name, email FROM users WHERE email = ? OR name = ?");
        $stmt->bind_param("ss", $email, $email);
        $stmt->execute();
        $user = $stmt->get_result()->fetch_assoc();
        $stmt->close();
    }
    
    // Get some resolved tickets
    $stmt = $conn->prepare("
        SELECT id, subject, type, status, assigned_to, completed_at, updated_at
        FROM tickets 
        WHERE status IN ('resolved', 'closed', 'installation complete')
        ORDER BY id DESC
        LIMIT 20
    ");
    $stmt->execute();
    $result = $stmt->get_result();
    
    $tickets = [];
    while ($row = $result->fetch_assoc()) {
        $assigned_raw = $row['assigned_to'];
        $parsed = [];
        if (!empty($assigned_raw)) {
            $decoded = json_decode($assigned_raw, true);
            if (is_array($decoded)) {
                $parsed = $decoded;
            } else {
                $parsed = explode(',', $assigned_raw);
            }
        }
        $tickets[] = [
            'id' => $row['id'],
            'subject' => $row['subject'],
            'type' => $row['type'],
            'status' => $row['status'],
            'assigned_to_raw' => $assigned_raw,
            'assigned_to_parsed' => $parsed
        ];
    }
    $stmt->close();
    
    echo json_encode([
        'success' => true,
        'user_searched' => $user,
        'user_name_lower' => $user ? strtolower(trim($user['name'])) : null,
        'tickets' => $tickets
    ]);
}

// NOTE: email-based auth removed; use Bearer token via getAuthToken()/verifyToken()
?>
