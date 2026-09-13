<?php
/**
 * Statistics Endpoints
 * GET /api/service-statistics/{service_id} - Get detailed statistics for a service
 * GET /api/customer-statistics/{customer_id} - Get statistics for a customer
 * GET /api/router-statistics/{router_id} - Get statistics for a router
 * GET /api/network-statistics - Get overall network statistics
 */

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/radius/PPPoERadiusSync.php';

setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$pathParts = explode('/', trim($path, '/'));

// If accessing directly, show API info
$lastPart = end($pathParts);
if ($lastPart === 'statistics.php' || ($lastPart === 'api' && $method === 'GET' && count($pathParts) < 2)) {
    if ($method === 'GET') {
        jsonResponse([
            'success' => true,
            'name' => 'Statistics API',
            'version' => '1.0',
            'description' => 'Network and usage statistics with RADIUS integration',
            'endpoints' => [
                'GET /api/service-statistics/{service_id}' => 'Detailed statistics for a specific service',
                'GET /api/customer-statistics/{customer_id}' => 'Aggregated statistics for customer',
                'GET /api/router-statistics/{router_id}' => 'Statistics for a specific router',
                'GET /api/network-statistics' => 'Overall network statistics',
            ],
            'authentication' => 'Required - Bearer token',
            'radius_integration' => true,
            'statistics_include' => [
                'Data usage (upload/download)',
                'Session time',
                'Connection status',
                'Peak usage times',
                'Historical trends',
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
    // Initialize RADIUS sync for statistics
    $pppoeRadius = new PPPoERadiusSync();
    $radiusDb = $pppoeRadius->getRadiusConnection();
    
    // Set timezone to Kenya (UTC+3)
    date_default_timezone_set('Africa/Nairobi');
    
    // GET /api/service-statistics/{service_id}
    if ($method === 'GET' && in_array('service-statistics', $pathParts)) {
        $serviceId = end($pathParts);
        
        if (!is_numeric($serviceId)) {
            jsonResponse(['error' => 'Invalid service ID'], 400);
        }
        
        // Get service details
        $stmt = $pdo->prepare("SELECT * FROM services WHERE id = ? AND deleted_at IS NULL");
        $stmt->execute([$serviceId]);
        $service = $stmt->fetch();
        
        if (!$service) {
            jsonResponse(['error' => 'Service not found'], 404);
        }
        
        $username = $service['mikrotik_name'];
        
        // Get active session count
        $stmt = $radiusDb->prepare("SELECT COUNT(*) as count FROM radacct WHERE username = ? AND acctstoptime IS NULL");
        $stmt->execute([$username]);
        $activeSessions = intval($stmt->fetch()['count'] ?? 0);
        
        // Get total sessions count
        $stmt = $radiusDb->prepare("SELECT COUNT(*) as count FROM radacct WHERE username = ?");
        $stmt->execute([$username]);
        $totalSessions = intval($stmt->fetch()['count'] ?? 0);
        
        // Get total usage (download + upload) - all time
        $stmt = $radiusDb->prepare("
            SELECT 
                SUM(acctinputoctets) as total_download,
                SUM(acctoutputoctets) as total_upload
            FROM radacct 
            WHERE username = ?
        ");
        $stmt->execute([$username]);
        $usage = $stmt->fetch();
        $totalDownload = intval($usage['total_download'] ?? 0);
        $totalUpload = intval($usage['total_upload'] ?? 0);
        $totalUsage = $totalDownload + $totalUpload;
        
        // Get usage this month
        $firstDayThisMonth = date('Y-m-01 00:00:00');
        $stmt = $radiusDb->prepare("
            SELECT 
                SUM(acctinputoctets) as month_download,
                SUM(acctoutputoctets) as month_upload
            FROM radacct 
            WHERE username = ? 
            AND acctstarttime >= ?
        ");
        $stmt->execute([$username, $firstDayThisMonth]);
        $monthUsage = $stmt->fetch();
        $monthDownload = intval($monthUsage['month_download'] ?? 0);
        $monthUpload = intval($monthUsage['month_upload'] ?? 0);
        $monthUsageTotal = $monthDownload + $monthUpload;
        
        // Get usage today
        $today = date('Y-m-d 00:00:00');
        $stmt = $radiusDb->prepare("
            SELECT 
                SUM(acctinputoctets) as today_download,
                SUM(acctoutputoctets) as today_upload
            FROM radacct 
            WHERE username = ? 
            AND acctstarttime >= ?
        ");
        $stmt->execute([$username, $today]);
        $todayUsage = $stmt->fetch();
        $todayDownload = intval($todayUsage['today_download'] ?? 0);
        $todayUpload = intval($todayUsage['today_upload'] ?? 0);
        $todayUsageTotal = $todayDownload + $todayUpload;
        
        // Get last session info
        $stmt = $radiusDb->prepare("
            SELECT 
                acctstarttime as last_connected,
                acctstoptime as last_disconnected,
                acctinputoctets as last_download,
                acctoutputoctets as last_upload,
                framedipaddress as last_ip
            FROM radacct 
            WHERE username = ?
            ORDER BY acctstarttime DESC
            LIMIT 1
        ");
        $stmt->execute([$username]);
        $lastSession = $stmt->fetch();
        
        // Format last session dates
        if ($lastSession) {
            if (!empty($lastSession['last_connected'])) {
                try {
                    $date = new DateTime($lastSession['last_connected'], new DateTimeZone('UTC'));
                    $date->setTimezone(new DateTimeZone('Africa/Nairobi'));
                    $lastSession['last_connected'] = $date->format('Y-m-d\TH:i:s');
                } catch (Exception $e) {
                    $lastSession['last_connected'] = null;
                }
            } else {
                $lastSession['last_connected'] = null;
            }
            
            if (!empty($lastSession['last_disconnected'])) {
                try {
                    $date = new DateTime($lastSession['last_disconnected'], new DateTimeZone('UTC'));
                    $date->setTimezone(new DateTimeZone('Africa/Nairobi'));
                    $lastSession['last_disconnected'] = $date->format('Y-m-d\TH:i:s');
                } catch (Exception $e) {
                    $lastSession['last_disconnected'] = null;
                }
            } else {
                $lastSession['last_disconnected'] = null;
            }
            
            $lastSession['last_download'] = intval($lastSession['last_download'] ?? 0);
            $lastSession['last_upload'] = intval($lastSession['last_upload'] ?? 0);
        }
        
        jsonResponse([
            'service_id' => intval($serviceId),
            'username' => $username,
            'active_sessions' => $activeSessions,
            'total_sessions' => $totalSessions,
            'usage' => [
                'all_time' => [
                    'download' => $totalDownload,
                    'upload' => $totalUpload,
                    'total' => $totalUsage,
                    'download_formatted' => humanFilesize($totalDownload),
                    'upload_formatted' => humanFilesize($totalUpload),
                    'total_formatted' => humanFilesize($totalUsage)
                ],
                'this_month' => [
                    'download' => $monthDownload,
                    'upload' => $monthUpload,
                    'total' => $monthUsageTotal,
                    'download_formatted' => humanFilesize($monthDownload),
                    'upload_formatted' => humanFilesize($monthUpload),
                    'total_formatted' => humanFilesize($monthUsageTotal)
                ],
                'today' => [
                    'download' => $todayDownload,
                    'upload' => $todayUpload,
                    'total' => $todayUsageTotal,
                    'download_formatted' => humanFilesize($todayDownload),
                    'upload_formatted' => humanFilesize($todayUpload),
                    'total_formatted' => humanFilesize($todayUsageTotal)
                ]
            ],
            'last_session' => $lastSession ?? null
        ], 200);
    }
    
    // GET /api/customer-statistics/{customer_id}
    if ($method === 'GET' && in_array('customer-statistics', $pathParts)) {
        $customerId = end($pathParts);
        
        if (!is_numeric($customerId)) {
            jsonResponse(['error' => 'Invalid customer ID'], 400);
        }
        
        // Get customer's services
        $stmt = $pdo->prepare("SELECT mikrotik_name FROM services WHERE customer_id = ? AND deleted_at IS NULL");
        $stmt->execute([$customerId]);
        $services = $stmt->fetchAll();
        
        if (empty($services)) {
            jsonResponse([
                'customer_id' => intval($customerId),
                'total_services' => 0,
                'active_sessions' => 0,
                'total_sessions' => 0,
                'usage' => [
                    'all_time' => ['download' => 0, 'upload' => 0, 'total' => 0],
                    'this_month' => ['download' => 0, 'upload' => 0, 'total' => 0],
                    'today' => ['download' => 0, 'upload' => 0, 'total' => 0]
                ]
            ], 200);
        }
        
        $usernames = array_column($services, 'mikrotik_name');
        $placeholders = implode(',', array_fill(0, count($usernames), '?'));
        
        // Get active sessions count
        $stmt = $radiusDb->prepare("SELECT COUNT(DISTINCT username) as count FROM radacct WHERE username IN ($placeholders) AND acctstoptime IS NULL");
        $stmt->execute($usernames);
        $activeSessions = intval($stmt->fetch()['count'] ?? 0);
        
        // Get total sessions count
        $stmt = $radiusDb->prepare("SELECT COUNT(*) as count FROM radacct WHERE username IN ($placeholders)");
        $stmt->execute($usernames);
        $totalSessions = intval($stmt->fetch()['count'] ?? 0);
        
        // Get total usage - all time
        $stmt = $radiusDb->prepare("
            SELECT 
                SUM(acctinputoctets) as total_download,
                SUM(acctoutputoctets) as total_upload
            FROM radacct 
            WHERE username IN ($placeholders)
        ");
        $stmt->execute($usernames);
        $usage = $stmt->fetch();
        $totalDownload = intval($usage['total_download'] ?? 0);
        $totalUpload = intval($usage['total_upload'] ?? 0);
        
        // Get usage this month
        $firstDayThisMonth = date('Y-m-01 00:00:00');
        $stmt = $radiusDb->prepare("
            SELECT 
                SUM(acctinputoctets) as month_download,
                SUM(acctoutputoctets) as month_upload
            FROM radacct 
            WHERE username IN ($placeholders)
            AND acctstarttime >= ?
        ");
        $params = array_merge($usernames, [$firstDayThisMonth]);
        $stmt->execute($params);
        $monthUsage = $stmt->fetch();
        $monthDownload = intval($monthUsage['month_download'] ?? 0);
        $monthUpload = intval($monthUsage['month_upload'] ?? 0);
        
        // Get usage today
        $today = date('Y-m-d 00:00:00');
        $stmt = $radiusDb->prepare("
            SELECT 
                SUM(acctinputoctets) as today_download,
                SUM(acctoutputoctets) as today_upload
            FROM radacct 
            WHERE username IN ($placeholders)
            AND acctstarttime >= ?
        ");
        $params = array_merge($usernames, [$today]);
        $stmt->execute($params);
        $todayUsage = $stmt->fetch();
        $todayDownload = intval($todayUsage['today_download'] ?? 0);
        $todayUpload = intval($todayUsage['today_upload'] ?? 0);
        
        jsonResponse([
            'customer_id' => intval($customerId),
            'total_services' => count($services),
            'active_sessions' => $activeSessions,
            'total_sessions' => $totalSessions,
            'usage' => [
                'all_time' => [
                    'download' => $totalDownload,
                    'upload' => $totalUpload,
                    'total' => $totalDownload + $totalUpload,
                    'download_formatted' => humanFilesize($totalDownload),
                    'upload_formatted' => humanFilesize($totalUpload),
                    'total_formatted' => humanFilesize($totalDownload + $totalUpload)
                ],
                'this_month' => [
                    'download' => $monthDownload,
                    'upload' => $monthUpload,
                    'total' => $monthDownload + $monthUpload,
                    'download_formatted' => humanFilesize($monthDownload),
                    'upload_formatted' => humanFilesize($monthUpload),
                    'total_formatted' => humanFilesize($monthDownload + $monthUpload)
                ],
                'today' => [
                    'download' => $todayDownload,
                    'upload' => $todayUpload,
                    'total' => $todayDownload + $todayUpload,
                    'download_formatted' => humanFilesize($todayDownload),
                    'upload_formatted' => humanFilesize($todayUpload),
                    'total_formatted' => humanFilesize($todayDownload + $todayUpload)
                ]
            ]
        ], 200);
    }
    
    // GET /api/router-statistics/{router_id}
    if ($method === 'GET' && in_array('router-statistics', $pathParts)) {
        $routerId = end($pathParts);
        
        if (!is_numeric($routerId)) {
            jsonResponse(['error' => 'Invalid router ID'], 400);
        }
        
        // Get router details
        $stmt = $pdo->prepare("SELECT * FROM routers WHERE id = ?");
        $stmt->execute([$routerId]);
        $router = $stmt->fetch();
        
        if (!$router) {
            jsonResponse(['error' => 'Router not found'], 404);
        }
        
        // Get router's NAS IP (used to identify sessions)
        $nasIp = $router['nas_ip'] ?? null;
        
        if (empty($nasIp)) {
            jsonResponse([
                'router_id' => intval($routerId),
                'router_name' => $router['title'],
                'nas_ip' => null,
                'active_sessions' => 0,
                'total_sessions' => 0,
                'usage' => [
                    'all_time' => ['download' => 0, 'upload' => 0, 'total' => 0],
                    'this_month' => ['download' => 0, 'upload' => 0, 'total' => 0],
                    'today' => ['download' => 0, 'upload' => 0, 'total' => 0]
                ]
            ], 200);
        }
        
        // Get active sessions count for this router
        $stmt = $radiusDb->prepare("SELECT COUNT(*) as count FROM radacct WHERE nasipaddress = ? AND acctstoptime IS NULL");
        $stmt->execute([$nasIp]);
        $activeSessions = intval($stmt->fetch()['count'] ?? 0);
        
        // Get total sessions count
        $stmt = $radiusDb->prepare("SELECT COUNT(*) as count FROM radacct WHERE nasipaddress = ?");
        $stmt->execute([$nasIp]);
        $totalSessions = intval($stmt->fetch()['count'] ?? 0);
        
        // Get usage statistics
        $stmt = $radiusDb->prepare("
            SELECT 
                SUM(acctinputoctets) as total_download,
                SUM(acctoutputoctets) as total_upload
            FROM radacct 
            WHERE nasipaddress = ?
        ");
        $stmt->execute([$nasIp]);
        $usage = $stmt->fetch();
        $totalDownload = intval($usage['total_download'] ?? 0);
        $totalUpload = intval($usage['total_upload'] ?? 0);
        
        // This month
        $firstDayThisMonth = date('Y-m-01 00:00:00');
        $stmt = $radiusDb->prepare("
            SELECT 
                SUM(acctinputoctets) as month_download,
                SUM(acctoutputoctets) as month_upload
            FROM radacct 
            WHERE nasipaddress = ? 
            AND acctstarttime >= ?
        ");
        $stmt->execute([$nasIp, $firstDayThisMonth]);
        $monthUsage = $stmt->fetch();
        $monthDownload = intval($monthUsage['month_download'] ?? 0);
        $monthUpload = intval($monthUsage['month_upload'] ?? 0);
        
        // Today
        $today = date('Y-m-d 00:00:00');
        $stmt = $radiusDb->prepare("
            SELECT 
                SUM(acctinputoctets) as today_download,
                SUM(acctoutputoctets) as today_upload
            FROM radacct 
            WHERE nasipaddress = ? 
            AND acctstarttime >= ?
        ");
        $stmt->execute([$nasIp, $today]);
        $todayUsage = $stmt->fetch();
        $todayDownload = intval($todayUsage['today_download'] ?? 0);
        $todayUpload = intval($todayUsage['today_upload'] ?? 0);
        
        jsonResponse([
            'router_id' => intval($routerId),
            'router_name' => $router['title'],
            'nas_ip' => $nasIp,
            'active_sessions' => $activeSessions,
            'total_sessions' => $totalSessions,
            'usage' => [
                'all_time' => [
                    'download' => $totalDownload,
                    'upload' => $totalUpload,
                    'total' => $totalDownload + $totalUpload,
                    'download_formatted' => humanFilesize($totalDownload),
                    'upload_formatted' => humanFilesize($totalUpload),
                    'total_formatted' => humanFilesize($totalDownload + $totalUpload)
                ],
                'this_month' => [
                    'download' => $monthDownload,
                    'upload' => $monthUpload,
                    'total' => $monthDownload + $monthUpload,
                    'download_formatted' => humanFilesize($monthDownload),
                    'upload_formatted' => humanFilesize($monthUpload),
                    'total_formatted' => humanFilesize($monthDownload + $monthUpload)
                ],
                'today' => [
                    'download' => $todayDownload,
                    'upload' => $todayUpload,
                    'total' => $todayDownload + $todayUpload,
                    'download_formatted' => humanFilesize($todayDownload),
                    'upload_formatted' => humanFilesize($todayUpload),
                    'total_formatted' => humanFilesize($todayDownload + $todayUpload)
                ]
            ]
        ], 200);
    }
    
    // GET /api/network-statistics
    if ($method === 'GET' && in_array('network-statistics', $pathParts)) {
        // Overall network statistics from RADIUS
        
        // Get total active sessions
        $stmt = $radiusDb->query("SELECT COUNT(*) as count FROM radacct WHERE acctstoptime IS NULL");
        $activeSessions = intval($stmt->fetch()['count'] ?? 0);
        
        // Get total sessions (all time)
        $stmt = $radiusDb->query("SELECT COUNT(*) as count FROM radacct");
        $totalSessions = intval($stmt->fetch()['count'] ?? 0);
        
        // Get unique users count
        $stmt = $radiusDb->query("SELECT COUNT(DISTINCT username) as count FROM radacct");
        $uniqueUsers = intval($stmt->fetch()['count'] ?? 0);
        
        // Get total network usage - all time
        $stmt = $radiusDb->query("
            SELECT 
                SUM(acctinputoctets) as total_download,
                SUM(acctoutputoctets) as total_upload
            FROM radacct
        ");
        $usage = $stmt->fetch();
        $totalDownload = intval($usage['total_download'] ?? 0);
        $totalUpload = intval($usage['total_upload'] ?? 0);
        
        // Get usage this month
        $firstDayThisMonth = date('Y-m-01 00:00:00');
        $stmt = $radiusDb->prepare("
            SELECT 
                SUM(acctinputoctets) as month_download,
                SUM(acctoutputoctets) as month_upload
            FROM radacct 
            WHERE acctstarttime >= ?
        ");
        $stmt->execute([$firstDayThisMonth]);
        $monthUsage = $stmt->fetch();
        $monthDownload = intval($monthUsage['month_download'] ?? 0);
        $monthUpload = intval($monthUsage['month_upload'] ?? 0);
        
        // Get usage today
        $today = date('Y-m-d 00:00:00');
        $stmt = $radiusDb->prepare("
            SELECT 
                SUM(acctinputoctets) as today_download,
                SUM(acctoutputoctets) as today_upload
            FROM radacct 
            WHERE acctstarttime >= ?
        ");
        $stmt->execute([$today]);
        $todayUsage = $stmt->fetch();
        $todayDownload = intval($todayUsage['today_download'] ?? 0);
        $todayUpload = intval($todayUsage['today_upload'] ?? 0);
        
        // Get active routers (routers with active sessions)
        $stmt = $radiusDb->query("
            SELECT COUNT(DISTINCT nasipaddress) as count 
            FROM radacct 
            WHERE acctstoptime IS NULL 
            AND nasipaddress IS NOT NULL
        ");
        $activeRouters = intval($stmt->fetch()['count'] ?? 0);
        
        // Get sessions per hour today (for chart)
        $stmt = $radiusDb->prepare("
            SELECT 
                DATE_FORMAT(acctstarttime, '%Y-%m-%d %H:00:00') as hour,
                COUNT(*) as session_count,
                SUM(acctinputoctets) as download,
                SUM(acctoutputoctets) as upload
            FROM radacct 
            WHERE acctstarttime >= ?
            GROUP BY DATE_FORMAT(acctstarttime, '%Y-%m-%d %H:00:00')
            ORDER BY hour ASC
        ");
        $stmt->execute([$today]);
        $hourlyStats = $stmt->fetchAll();
        
        // Format hourly stats dates and bytes
        foreach ($hourlyStats as &$stat) {
            if (!empty($stat['hour'])) {
                try {
                    $date = new DateTime($stat['hour'], new DateTimeZone('UTC'));
                    $date->setTimezone(new DateTimeZone('Africa/Nairobi'));
                    $stat['hour'] = $date->format('Y-m-d\TH:i:s');
                } catch (Exception $e) {
                    $stat['hour'] = null;
                }
            }
            $stat['download'] = intval($stat['download'] ?? 0);
            $stat['upload'] = intval($stat['upload'] ?? 0);
            $stat['session_count'] = intval($stat['session_count'] ?? 0);
        }
        
        jsonResponse([
            'active_sessions' => $activeSessions,
            'total_sessions' => $totalSessions,
            'unique_users' => $uniqueUsers,
            'active_routers' => $activeRouters,
            'usage' => [
                'all_time' => [
                    'download' => $totalDownload,
                    'upload' => $totalUpload,
                    'total' => $totalDownload + $totalUpload,
                    'download_formatted' => humanFilesize($totalDownload),
                    'upload_formatted' => humanFilesize($totalUpload),
                    'total_formatted' => humanFilesize($totalDownload + $totalUpload)
                ],
                'this_month' => [
                    'download' => $monthDownload,
                    'upload' => $monthUpload,
                    'total' => $monthDownload + $monthUpload,
                    'download_formatted' => humanFilesize($monthDownload),
                    'upload_formatted' => humanFilesize($monthUpload),
                    'total_formatted' => humanFilesize($monthDownload + $monthUpload)
                ],
                'today' => [
                    'download' => $todayDownload,
                    'upload' => $todayUpload,
                    'total' => $todayDownload + $todayUpload,
                    'download_formatted' => humanFilesize($todayDownload),
                    'upload_formatted' => humanFilesize($todayUpload),
                    'total_formatted' => humanFilesize($todayDownload + $todayUpload)
                ]
            ],
            'hourly_stats' => $hourlyStats
        ], 200);
    }
    
    jsonResponse(['error' => 'Statistics endpoint not found'], 404);
    
} catch (Exception $e) {
    error_log("Statistics API Error: " . $e->getMessage() . "\n" . $e->getTraceAsString());
    jsonResponse(['error' => $e->getMessage()], 500);
}

