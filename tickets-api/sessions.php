<?php
/**
 * Session Endpoints
 * GET /api/list-online-sessions/{customer_id} - Get online PPPoE sessions
 * GET /api/list-daily-sessions/{customer_id} - Get daily session statistics
 * GET /api/list-total-sessions/{customer_id} - Get all sessions with pagination
 */

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/radius/PPPoERadiusSync.php';

setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$pathParts = explode('/', trim($path, '/'));

// If accessing directly, show API info
$lastPart = end($pathParts);
if ($lastPart === 'sessions.php' || ($lastPart === 'api' && $method === 'GET' && count($pathParts) < 2)) {
    if ($method === 'GET') {
        jsonResponse([
            'success' => true,
            'name' => 'Sessions API',
            'version' => '1.0',
            'description' => 'PPPoE session management with RADIUS accounting integration',
            'endpoints' => [
                'GET /api/list-online-sessions/{customer_id}' => 'Get currently active PPPoE sessions for customer',
                'GET /api/list-daily-sessions/{customer_id}' => 'Get daily session statistics for customer',
                'GET /api/list-total-sessions/{customer_id}' => 'Get all sessions with pagination for customer',
            ],
            'authentication' => 'Required - Bearer token',
            'radius_integration' => true,
            'query_parameters' => [
                'page' => 'Page number for total sessions (default: 1)',
                'per_page' => 'Results per page for total sessions (default: 10)',
            ]
        ]);
    }
}

$user = checkAuth();
$pdo = getDB();

// Remove 'api' from path if present
if (!empty($pathParts) && $pathParts[0] === 'api') {
    array_shift($pathParts);
}

try {
    // Initialize RADIUS sync for session queries
    $pppoeRadius = new PPPoERadiusSync();
    
    // GET /api/list-online-sessions/{customer_id}
    $isOnlineSessions = in_array('list-online-sessions', $pathParts);
    $isDailySessions = in_array('list-daily-sessions', $pathParts);
    $isTotalSessions = in_array('list-total-sessions', $pathParts);
    
    // Extract customer ID from route
    $customerId = null;
    if ($isOnlineSessions || $isDailySessions || $isTotalSessions) {
        $lastPart = end($pathParts);
        $secondLastPart = $pathParts[count($pathParts) - 2] ?? '';
        
        if (($secondLastPart === 'list-online-sessions' || 
             $secondLastPart === 'list-daily-sessions' || 
             $secondLastPart === 'list-total-sessions') && 
            is_numeric($lastPart)) {
            $customerId = intval($lastPart);
        }
    }
    
    if ($method === 'GET' && $isOnlineSessions && $customerId) {
        // Get customer's services (usernames)
        $stmt = $pdo->prepare("
            SELECT DISTINCT mikrotik_name 
            FROM services 
            WHERE customer_id = ? AND deleted_at IS NULL
        ");
        $stmt->execute([$customerId]);
        $services = $stmt->fetchAll();
        
        if (empty($services)) {
            jsonResponse(['online_sessions' => []], 200);
        }
        
        $usernames = array_column($services, 'mikrotik_name');
        $placeholders = implode(',', array_fill(0, count($usernames), '?'));
        
        // Get active sessions from RADIUS database
        try {
            $radiusDb = $pppoeRadius->getRadiusConnection();
            
            $sql = "
                SELECT 
                    r.username,
                    r.framedipaddress as ip_address,
                    r.callingstationid as mac_address,
                    r.acctstarttime as start_time,
                    TIMESTAMPDIFF(SECOND, r.acctstarttime, NOW()) as time_diff_seconds,
                    r.acctinputoctets as download,
                    r.acctoutputoctets as upload
                FROM radacct r
                WHERE r.username IN ($placeholders)
                AND r.acctstoptime IS NULL
                ORDER BY r.acctstarttime DESC
            ";
            
            $stmt = $radiusDb->prepare($sql);
            $stmt->execute($usernames);
            $sessions = $stmt->fetchAll();
            
            // Set timezone to Kenya (UTC+3)
            date_default_timezone_set('Africa/Nairobi');
            
            // Format time_diff as HH:MM:SS and convert dates to Kenya timezone
            foreach ($sessions as &$session) {
                $seconds = intval($session['time_diff_seconds']);
                $hours = floor($seconds / 3600);
                $minutes = floor(($seconds % 3600) / 60);
                $secs = $seconds % 60;
                $session['time_diff'] = sprintf('%02d:%02d:%02d', $hours, $minutes, $secs);
                
                // Convert and format start_time (convert from server timezone to Kenya timezone)
                $startTime = $session['start_time'] ?? null;
                if (!empty($startTime) && 
                    $startTime !== '0000-00-00 00:00:00' && 
                    $startTime !== '0000-00-00' &&
                    trim($startTime) !== '' &&
                    strtotime($startTime) !== false) {
                    try {
                        // Parse the date from RADIUS server timezone (assuming UTC)
                        // Try creating DateTime - if it fails, the value is invalid
                        $date = @new DateTime($startTime, new DateTimeZone('UTC'));
                        if ($date === false) {
                            throw new Exception('Invalid DateTime object');
                        }
                        // Convert to Kenya timezone (UTC+3)
                        $date->setTimezone(new DateTimeZone('Africa/Nairobi'));
                        // Format as ISO 8601 (with T separator) for JavaScript
                        $formatted = $date->format('Y-m-d\TH:i:s');
                        if ($formatted && $formatted !== '1970-01-01T00:00:00') {
                            $session['start_time'] = $formatted;
                        } else {
                            $session['start_time'] = null;
                        }
                    } catch (Exception $e) {
                        error_log("Date parsing error for start_time: " . ($startTime ?? 'null') . " - " . $e->getMessage());
                        $session['start_time'] = null;
                    }
                } else {
                    $session['start_time'] = null;
                }
                
                // Convert bytes to numbers
                $session['download'] = intval($session['download'] ?? 0);
                $session['upload'] = intval($session['upload'] ?? 0);
            }
            
            jsonResponse(['online_sessions' => $sessions], 200);
            
        } catch (Exception $e) {
            error_log("Error fetching online sessions: " . $e->getMessage());
            jsonResponse(['online_sessions' => []], 200);
        }
    }
    
    // GET /api/list-daily-sessions/{customer_id}
    if ($method === 'GET' && $isDailySessions && $customerId) {
        $fromDate = !empty($_GET['from']) ? $_GET['from'] : date('Y-m-d 00:00:00');
        $toDate = !empty($_GET['to']) ? $_GET['to'] : date('Y-m-d 23:59:59');
        
        // Parse dates (handle various formats including formatted strings)
        try {
            // Try to parse the date string (may be formatted like "Monday, December 1st, 2025, 12:00:00 AM")
            $fromTimestamp = strtotime($fromDate);
            $toTimestamp = strtotime($toDate);
            
            // If parsing fails, try to extract date parts
            if ($fromTimestamp === false || $toTimestamp === false) {
                // Try to clean the date string and parse again
                $cleanFrom = preg_replace('/[^\d\s:\-\/]/', '', $fromDate);
                $cleanTo = preg_replace('/[^\d\s:\-\/]/', '', $toDate);
                $fromTimestamp = strtotime($cleanFrom ?: '-30 days');
                $toTimestamp = strtotime($cleanTo ?: 'now');
            }
            
            if ($fromTimestamp === false || $toTimestamp === false) {
                $fromTimestamp = strtotime('-30 days');
                $toTimestamp = time();
            }
        } catch (Exception $e) {
            $fromTimestamp = strtotime('-30 days');
            $toTimestamp = time();
        }
        
        // Get customer's services
        $stmt = $pdo->prepare("
            SELECT DISTINCT mikrotik_name 
            FROM services 
            WHERE customer_id = ? AND deleted_at IS NULL
        ");
        $stmt->execute([$customerId]);
        $services = $stmt->fetchAll();
        
        if (empty($services)) {
            jsonResponse(['daily_sessions' => []], 200);
        }
        
        $usernames = array_column($services, 'mikrotik_name');
        $placeholders = implode(',', array_fill(0, count($usernames), '?'));
        
        try {
            $radiusDb = $pppoeRadius->getRadiusConnection();
            
            // Get daily aggregated statistics from RADIUS
            $sql = "
                SELECT 
                    DATE(r.acctstarttime) as date,
                    SUM(r.acctinputoctets) as download,
                    SUM(r.acctoutputoctets) as upload
                FROM radacct r
                WHERE r.username IN ($placeholders)
                AND r.acctstarttime >= FROM_UNIXTIME(?)
                AND r.acctstarttime <= FROM_UNIXTIME(?)
                GROUP BY DATE(r.acctstarttime)
                ORDER BY date ASC
            ";
            
            $params = array_merge($usernames, [$fromTimestamp, $toTimestamp]);
            $stmt = $radiusDb->prepare($sql);
            $stmt->execute($params);
            $dailyStats = $stmt->fetchAll();
            
            // Format download/upload as numbers and ensure date is valid
            foreach ($dailyStats as &$stat) {
                $stat['download'] = intval($stat['download'] ?? 0);
                $stat['upload'] = intval($stat['upload'] ?? 0);
                
                // Ensure date field is valid (should be Y-m-d format from DATE() function)
                // Validate the date string
                if (!empty($stat['date'])) {
                    $dateStr = $stat['date'];
                    // Check if it's a valid date format (YYYY-MM-DD)
                    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateStr)) {
                        // Validate it's not a zero date
                        if ($dateStr !== '0000-00-00' && strtotime($dateStr) !== false) {
                            // Date is valid, keep it as is (Y-m-d format is fine for JavaScript)
                            $stat['date'] = $dateStr;
                        } else {
                            $stat['date'] = null;
                        }
                    } else {
                        $stat['date'] = null;
                    }
                } else {
                    $stat['date'] = null;
                }
            }
            
            jsonResponse(['daily_sessions' => $dailyStats], 200);
            
        } catch (Exception $e) {
            error_log("Error fetching daily sessions: " . $e->getMessage());
            jsonResponse(['daily_sessions' => []], 200);
        }
    }
    
    // GET /api/list-total-sessions/{customer_id}
    if ($method === 'GET' && $isTotalSessions && $customerId) {
        $page = isset($_GET['page']) ? max(1, intval($_GET['page'])) : 1;
        $perPage = isset($_GET['per_page']) ? max(1, min(100, intval($_GET['per_page']))) : 100;
        $offset = ($page - 1) * $perPage;
        
        $fromDate = !empty($_GET['from']) ? $_GET['from'] : date('Y-m-d 00:00:00', strtotime('-30 days'));
        $toDate = !empty($_GET['to']) ? $_GET['to'] : date('Y-m-d 23:59:59');
        
        // Parse dates (handle various formats)
        try {
            $fromTimestamp = strtotime($fromDate);
            $toTimestamp = strtotime($toDate);
            
            // If parsing fails, try to clean and parse again
            if ($fromTimestamp === false || $toTimestamp === false) {
                $cleanFrom = preg_replace('/[^\d\s:\-\/]/', '', $fromDate);
                $cleanTo = preg_replace('/[^\d\s:\-\/]/', '', $toDate);
                $fromTimestamp = strtotime($cleanFrom ?: '-30 days');
                $toTimestamp = strtotime($cleanTo ?: 'now');
            }
            
            if ($fromTimestamp === false || $toTimestamp === false) {
                $fromTimestamp = strtotime('-30 days');
                $toTimestamp = time();
            }
        } catch (Exception $e) {
            $fromTimestamp = strtotime('-30 days');
            $toTimestamp = time();
        }
        
        // Get customer's services
        $stmt = $pdo->prepare("
            SELECT DISTINCT mikrotik_name 
            FROM services 
            WHERE customer_id = ? AND deleted_at IS NULL
        ");
        $stmt->execute([$customerId]);
        $services = $stmt->fetchAll();
        
        if (empty($services)) {
            jsonResponse([
                'data' => [],
                'total' => 0,
                'page' => $page,
                'per_page' => $perPage,
                'total_pages' => 0
            ], 200);
        }
        
        $usernames = array_column($services, 'mikrotik_name');
        $placeholders = implode(',', array_fill(0, count($usernames), '?'));
        
        $searchQuery = !empty($_GET['q']) ? trim($_GET['q']) : '';
        $sortCol = !empty($_GET['sort_col']) ? $_GET['sort_col'] : 'acctstarttime';
        $sort = !empty($_GET['sort']) ? strtoupper($_GET['sort']) : 'DESC';
        
        // Validate sort column
        $allowedSortCols = ['acctstarttime', 'acctstoptime', 'username', 'framedipaddress'];
        if (!in_array($sortCol, $allowedSortCols)) {
            $sortCol = 'acctstarttime';
        }
        if ($sort !== 'ASC' && $sort !== 'DESC') {
            $sort = 'DESC';
        }
        
        try {
            $radiusDb = $pppoeRadius->getRadiusConnection();
            
            // Build WHERE clause
            $where = ["r.username IN ($placeholders)"];
            $params = $usernames;
            
            $where[] = "r.acctstarttime >= FROM_UNIXTIME(?)";
            $params[] = $fromTimestamp;
            $where[] = "r.acctstarttime <= FROM_UNIXTIME(?)";
            $params[] = $toTimestamp;
            $where[] = "r.acctstoptime IS NOT NULL";
            
            if (!empty($searchQuery)) {
                $where[] = "(r.username LIKE ? OR r.framedipaddress LIKE ?)";
                $searchTerm = '%' . $searchQuery . '%';
                $params[] = $searchTerm;
                $params[] = $searchTerm;
            }
            
            $whereClause = implode(' AND ', $where);
            
            // Count total
            $countSql = "SELECT COUNT(DISTINCT r.radacctid) as total FROM radacct r WHERE $whereClause";
            $countStmt = $radiusDb->prepare($countSql);
            $countStmt->execute($params);
            $total = $countStmt->fetch()['total'];
            
            // Get sessions
            $limitValue = intval($perPage);
            $offsetValue = intval($offset);
            
            // Map sort column to actual column name
            $sortColumnMap = [
                'acctstarttime' => 'r.acctstarttime',
                'acctstoptime' => 'r.acctstoptime',
                'username' => 'r.username',
                'framedipaddress' => 'r.framedipaddress'
            ];
            $orderByColumn = $sortColumnMap[$sortCol] ?? 'r.acctstarttime';
            
            $sql = "
                SELECT 
                    r.radacctid as id,
                    r.username,
                    r.framedipaddress as ip_address,
                    r.callingstationid as mac_address,
                    r.acctstarttime as start_time,
                    r.acctstoptime as end_time,
                    TIMESTAMPDIFF(SECOND, r.acctstarttime, r.acctstoptime) as time_diff_seconds,
                    r.acctinputoctets as download,
                    r.acctoutputoctets as upload
                FROM radacct r
                WHERE $whereClause
                GROUP BY r.radacctid, r.username, r.framedipaddress, r.callingstationid, 
                         r.acctstarttime, r.acctstoptime, r.acctinputoctets, r.acctoutputoctets
                ORDER BY $orderByColumn $sort
                LIMIT :limit_val OFFSET :offset_val
            ";
            
            // Replace named parameters with positional for limit/offset
            $sql = str_replace(':limit_val', '?', $sql);
            $sql = str_replace(':offset_val', '?', $sql);
            $params[] = $limitValue;
            $params[] = $offsetValue;
            
            $stmt = $radiusDb->prepare($sql);
            $stmt->execute($params);
            $sessions = $stmt->fetchAll();
            
            // Set timezone to Kenya (UTC+3)
            date_default_timezone_set('Africa/Nairobi');
            
            // Format sessions and convert dates to Kenya timezone
            foreach ($sessions as &$session) {
                $seconds = intval($session['time_diff_seconds'] ?? 0);
                $hours = floor($seconds / 3600);
                $minutes = floor(($seconds % 3600) / 60);
                $secs = $seconds % 60;
                $session['time_diff'] = sprintf('%02d:%02d:%02d', $hours, $minutes, $secs);
                
                // Convert and format start_time (convert from server timezone to Kenya timezone)
                $startTime = $session['start_time'] ?? null;
                if (!empty($startTime) && 
                    $startTime !== '0000-00-00 00:00:00' && 
                    $startTime !== '0000-00-00' &&
                    trim($startTime) !== '' &&
                    strtotime($startTime) !== false) {
                    try {
                        $date = @new DateTime($startTime, new DateTimeZone('UTC'));
                        if ($date === false) {
                            throw new Exception('Invalid DateTime object');
                        }
                        $date->setTimezone(new DateTimeZone('Africa/Nairobi'));
                        $formatted = $date->format('Y-m-d\TH:i:s');
                        if ($formatted && $formatted !== '1970-01-01T00:00:00') {
                            $session['start_time'] = $formatted;
                        } else {
                            $session['start_time'] = null;
                        }
                    } catch (Exception $e) {
                        error_log("Date parsing error for start_time: " . ($startTime ?? 'null') . " - " . $e->getMessage());
                        $session['start_time'] = null;
                    }
                } else {
                    $session['start_time'] = null;
                }
                
                // Convert and format end_time (convert from server timezone to Kenya timezone)
                $endTime = $session['end_time'] ?? null;
                if (!empty($endTime) && 
                    $endTime !== '0000-00-00 00:00:00' && 
                    $endTime !== '0000-00-00' &&
                    trim($endTime) !== '' &&
                    strtotime($endTime) !== false) {
                    try {
                        $date = @new DateTime($endTime, new DateTimeZone('UTC'));
                        if ($date === false) {
                            throw new Exception('Invalid DateTime object');
                        }
                        $date->setTimezone(new DateTimeZone('Africa/Nairobi'));
                        $formatted = $date->format('Y-m-d\TH:i:s');
                        if ($formatted && $formatted !== '1970-01-01T00:00:00') {
                            $session['end_time'] = $formatted;
                        } else {
                            $session['end_time'] = null;
                        }
                    } catch (Exception $e) {
                        error_log("Date parsing error for end_time: " . ($endTime ?? 'null') . " - " . $e->getMessage());
                        $session['end_time'] = null;
                    }
                } else {
                    $session['end_time'] = null;
                }
                
                $session['download'] = intval($session['download'] ?? 0);
                $session['upload'] = intval($session['upload'] ?? 0);
            }
            
            jsonResponse([
                'data' => $sessions,
                'total' => $total,
                'page' => $page,
                'per_page' => $perPage,
                'total_pages' => ceil($total / $perPage)
            ], 200);
            
        } catch (Exception $e) {
            error_log("Error fetching total sessions: " . $e->getMessage());
            jsonResponse([
                'data' => [],
                'total' => 0,
                'page' => $page,
                'per_page' => $perPage,
                'total_pages' => 0
            ], 200);
        }
    }
    
    jsonResponse(['error' => 'Endpoint not found'], 404);
    
} catch (Exception $e) {
    error_log("Sessions API Error: " . $e->getMessage() . "\n" . $e->getTraceAsString());
    jsonResponse(['error' => $e->getMessage()], 500);
}

