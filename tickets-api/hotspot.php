<?php
/**
 * Hotspot Management API v2
 * 
 * Connects to:
 *   1. tonycommgroupltd_mpesa_hotspot  (hotspot business data)
 *   2. FreeRADIUS DB (configured via config table)
 *
 * Matches the exact data flow from the original admin panel:
 *   - Revenue uses status = 'success'
 *   - Revenue-by-location via mac_locations + nas_locations
 *   - NAS IP auto-backfill from radacct
 *   - Voucher uses used/use_count model (not string status)
 *   - User tracker joins mpesa_transactions → RADIUS
 *   - Package CRUD + FreeRADIUS sync + tier generation
 */

error_reporting(E_ALL);
ini_set('display_errors', 0);

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// ============================================
// DATABASE CONNECTIONS
// ============================================

function getHotspotDB() {
    static $conn = null;
    if ($conn === null) {
        try {
            $conn = new PDO(
                "mysql:host=localhost;dbname=tonycommgroupltd_mpesa_hotspot;charset=utf8mb4",
                'tonycommgroupltd_kim',
                'Kimani254',
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                ]
            );
            $conn->exec("SET time_zone = '+03:00'");
        } catch (PDOException $e) {
            echo json_encode(['success' => false, 'message' => 'Hotspot DB connection failed: ' . $e->getMessage()]);
            exit;
        }
    }
    return $conn;
}

function getRadiusDB() {
    static $conn = null;
    static $tried = false;
    if (!$tried) {
        $tried = true;
        try {
            $hdb = getHotspotDB();
            $stmt = $hdb->prepare("SELECT key_name, key_value FROM config WHERE key_name IN (
                'freeradius_db_host','freeradius_db_name','freeradius_db_user','freeradius_db_password','freeradius_db_port'
            )");
            $stmt->execute();
            $cfg = [];
            foreach ($stmt->fetchAll() as $r) {
                $cfg[$r['key_name']] = $r['key_value'];
            }

            $host = $cfg['freeradius_db_host'] ?? '127.0.0.1';
            $name = $cfg['freeradius_db_name'] ?? 'radius';
            $user = $cfg['freeradius_db_user'] ?? 'radius';
            $pass = $cfg['freeradius_db_password'] ?? 'radpass';
            $port = $cfg['freeradius_db_port'] ?? 3306;

            $conn = new PDO(
                "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4",
                $user, $pass,
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                ]
            );
        } catch (PDOException $e) {
            error_log("RADIUS DB connection failed: " . $e->getMessage());
            $conn = null;
        }
    }
    return $conn;
}

// ============================================
// HELPERS
// ============================================

function formatBytes($bytes, $precision = 2) {
    if ($bytes <= 0) return '0 B';
    $units = ['B', 'KB', 'MB', 'GB', 'TB'];
    $pow = floor(log($bytes) / log(1024));
    $pow = min($pow, count($units) - 1);
    return round($bytes / pow(1024, $pow), $precision) . ' ' . $units[$pow];
}

function formatDuration($seconds) {
    if ($seconds < 60) return $seconds . 's';
    if ($seconds < 3600) return floor($seconds / 60) . 'm ' . ($seconds % 60) . 's';
    $h = floor($seconds / 3600);
    $m = floor(($seconds % 3600) / 60);
    return $h . 'h ' . $m . 'm';
}

function generateVoucherCode() {
    // Same format as original: 6 random hex chars + 4 timestamp digits
    $random = strtoupper(substr(bin2hex(random_bytes(3)), 0, 6));
    $timestamp = substr((string)time(), -4);
    return $random . $timestamp;
}

/** Convert duration string like '1h', '12h', '1d', '7d', '30d' to seconds */
function durationToSeconds($duration) {
    if (!$duration) return 3600;
    $duration = strtolower(trim($duration));
    if (preg_match('/^(\d+)\s*h/', $duration, $m)) return intval($m[1]) * 3600;
    if (preg_match('/^(\d+)\s*d/', $duration, $m)) return intval($m[1]) * 86400;
    if (preg_match('/^(\d+)\s*m/', $duration, $m)) return intval($m[1]) * 60;
    if (is_numeric($duration)) return intval($duration) * 3600; // assume hours
    return 3600;
}

/** Extract bandwidth from package description, e.g. "MAX 3mbps" → "3M/3M" */
function extractBandwidthFromDescription($desc) {
    if (!$desc) return null;
    if (preg_match('/(\d+)\s*mbps/i', $desc, $m)) {
        return $m[1] . 'M/' . $m[1] . 'M';
    }
    return null;
}

/** Load all packages from DB as code => package array */
function loadPackagesMap() {
    $db = getHotspotDB();
    $stmt = $db->query("SELECT * FROM packages ORDER BY sort_order ASC, price ASC");
    $packages = [];
    foreach ($stmt->fetchAll() as $p) {
        $packages[$p['code']] = $p;
    }
    return $packages;
}

/** Auto-backfill NAS IP from RADIUS for transactions missing it */
function autoBackfillNasIP() {
    $db = getHotspotDB();
    $radiusDb = getRadiusDB();
    if (!$radiusDb) return;

    try {
        // Find up to 20 transactions missing nas_ip
        $stmt = $db->prepare("
            SELECT id, username FROM mpesa_transactions
            WHERE (nas_ip IS NULL OR nas_ip = '')
              AND username IS NOT NULL AND username != ''
            ORDER BY created_at DESC LIMIT 20
        ");
        $stmt->execute();
        $rows = $stmt->fetchAll();
        if (empty($rows)) return;

        $usernames = array_column($rows, 'username');
        $idByUser = [];
        foreach ($rows as $r) {
            $idByUser[$r['username']] = $r['id'];
        }

        // Get latest NAS IP per username from radacct
        $placeholders = implode(',', array_fill(0, count($usernames), '?'));
        $rStmt = $radiusDb->prepare("
            SELECT r.username, r.nasipaddress
            FROM radacct r
            INNER JOIN (
                SELECT username, MAX(acctstarttime) AS max_start
                FROM radacct WHERE username IN ($placeholders)
                GROUP BY username
            ) x ON r.username = x.username AND r.acctstarttime = x.max_start
        ");
        $rStmt->execute($usernames);

        $updateStmt = $db->prepare("UPDATE mpesa_transactions SET nas_ip = ? WHERE id = ?");
        foreach ($rStmt->fetchAll() as $row) {
            if (!empty($row['nasipaddress']) && isset($idByUser[$row['username']])) {
                $updateStmt->execute([$row['nasipaddress'], $idByUser[$row['username']]]);
            }
        }
    } catch (Exception $e) {
        error_log("NAS backfill error: " . $e->getMessage());
    }
}

/** Load MAC → location map */
function loadMacLocations() {
    $db = getHotspotDB();
    $map = [];
    try {
        $stmt = $db->query("SELECT mac_address, location FROM mac_locations");
        foreach ($stmt->fetchAll() as $r) {
            $normalized = strtoupper(str_replace([':', '-', ' ', '.', '_'], '', $r['mac_address']));
            $map[$normalized] = $r['location'];
        }
    } catch (Exception $e) {}
    return $map;
}

/** Load NAS IP → location map */
function loadNasLocations() {
    $db = getHotspotDB();
    $map = [];
    try {
        $stmt = $db->query("SELECT nas_ip, location FROM nas_locations WHERE is_active = 1");
        foreach ($stmt->fetchAll() as $r) {
            $map[$r['nas_ip']] = $r['location'];
        }
    } catch (Exception $e) {}

    // Fallback defaults if table is empty or missing
    if (empty($map)) {
        $map['197.248.151.41']  = 'Heshima';
        $map['192.168.100.7']   = 'Tumsifu Shopping Center';
        $map['192.168.100.171'] = "En Nga'nga'";
    }
    return $map;
}

/** Resolve location for a transaction row using MAC and NAS */
function resolveLocation($row, $macMap, $nasMap) {
    // Try MAC first
    if (!empty($row['mac_address'])) {
        $normalized = strtoupper(str_replace([':', '-', ' ', '.', '_'], '', $row['mac_address']));
        if (isset($macMap[$normalized])) return $macMap[$normalized];
    }
    // Try NAS IP
    if (!empty($row['nas_ip']) && isset($nasMap[$row['nas_ip']])) {
        return $nasMap[$row['nas_ip']];
    }
    return 'Unverified MACs';
}

/** Fetch RADIUS enrichment data for a batch of usernames */
function fetchRadiusSummary(array $usernames) {
    $radiusDb = getRadiusDB();
    if (!$radiusDb || empty($usernames)) return [];

    $result = [];
    foreach ($usernames as $u) {
        $result[$u] = [
            'active_sessions' => 0,
            'last_session_start' => null,
            'last_ip' => null,
            'nas_ip' => null,
            'mac_address' => null,
            'total_data_bytes' => 0,
            'last_session_time' => null,
            'last_stop_time' => null,
            'group' => null,
            'session_timeout' => null,
            'ended_early' => false,
        ];
    }

    $placeholders = implode(',', array_fill(0, count($usernames), '?'));

    try {
        // Session summary
        $stmt = $radiusDb->prepare("
            SELECT username,
                MAX(acctstarttime) AS last_session_start,
                SUM(CASE WHEN acctstoptime IS NULL THEN 1 ELSE 0 END) AS active_sessions,
                MAX(framedipaddress) AS last_ip,
                MAX(nasipaddress) AS nas_ip,
                MAX(callingstationid) AS mac_address
            FROM radacct WHERE username IN ($placeholders)
            GROUP BY username
        ");
        $stmt->execute($usernames);
        foreach ($stmt->fetchAll() as $r) {
            $result[$r['username']]['active_sessions'] = (int)$r['active_sessions'];
            $result[$r['username']]['last_session_start'] = $r['last_session_start'];
            $result[$r['username']]['last_ip'] = $r['last_ip'];
            $result[$r['username']]['nas_ip'] = $r['nas_ip'];
            $result[$r['username']]['mac_address'] = $r['mac_address'];
        }

        // Total data usage
        $stmt = $radiusDb->prepare("
            SELECT username, SUM(acctinputoctets + acctoutputoctets) AS total_data_bytes
            FROM radacct WHERE username IN ($placeholders)
            GROUP BY username
        ");
        $stmt->execute($usernames);
        foreach ($stmt->fetchAll() as $r) {
            $result[$r['username']]['total_data_bytes'] = (float)$r['total_data_bytes'];
        }

        // Last session duration
        $stmt = $radiusDb->prepare("
            SELECT r.username, r.acctsessiontime, r.acctstoptime
            FROM radacct r
            INNER JOIN (
                SELECT username, MAX(acctstarttime) AS last_start
                FROM radacct WHERE username IN ($placeholders)
                GROUP BY username
            ) ls ON r.username = ls.username AND r.acctstarttime = ls.last_start
        ");
        $stmt->execute($usernames);
        foreach ($stmt->fetchAll() as $r) {
            $result[$r['username']]['last_session_time'] = (int)$r['acctsessiontime'];
            $result[$r['username']]['last_stop_time'] = $r['acctstoptime'];
        }

        // Group assignments
        $stmt = $radiusDb->prepare("
            SELECT username, groupname FROM radusergroup
            WHERE username IN ($placeholders)
            ORDER BY priority ASC
        ");
        $stmt->execute($usernames);
        foreach ($stmt->fetchAll() as $r) {
            if (!$result[$r['username']]['group']) {
                $result[$r['username']]['group'] = $r['groupname'];
            }
        }

        // Get group timeouts
        $groups = array_unique(array_filter(array_column($result, 'group')));
        $groupTimeouts = [];
        if (!empty($groups)) {
            $gPlaceholders = implode(',', array_fill(0, count($groups), '?'));
            $stmt = $radiusDb->prepare("
                SELECT groupname, value FROM radgroupreply
                WHERE attribute = 'Session-Timeout' AND groupname IN ($gPlaceholders)
            ");
            $stmt->execute(array_values($groups));
            foreach ($stmt->fetchAll() as $r) {
                $groupTimeouts[$r['groupname']] = (int)$r['value'];
            }
        }

        // Get user-level timeouts
        $stmt = $radiusDb->prepare("
            SELECT username, value FROM radreply
            WHERE attribute = 'Session-Timeout' AND username IN ($placeholders)
        ");
        $stmt->execute($usernames);
        $userTimeouts = [];
        foreach ($stmt->fetchAll() as $r) {
            $userTimeouts[$r['username']] = (int)$r['value'];
        }

        // Calculate expected end and early termination
        foreach ($result as $u => &$data) {
            $timeout = $userTimeouts[$u] ?? ($data['group'] ? ($groupTimeouts[$data['group']] ?? null) : null);
            $data['session_timeout'] = $timeout;

            if ($data['last_session_start'] && $timeout) {
                $expectedEnd = strtotime($data['last_session_start']) + $timeout;
                $data['expected_end'] = date('Y-m-d H:i:s', $expectedEnd);

                if ($data['last_stop_time']) {
                    $actualEnd = strtotime($data['last_stop_time']);
                    $data['ended_early'] = ($actualEnd < $expectedEnd - 60); // 1 min grace
                }
            }
        }
    } catch (Exception $e) {
        error_log("RADIUS summary error: " . $e->getMessage());
    }

    return $result;
}

// ============================================
// ROUTING
// ============================================

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($action) {
        // DASHBOARD
        case 'dashboard-stats':       handleDashboardStats(); break;
        case 'revenue-chart':         handleRevenueChart(); break;
        case 'revenue-by-location':   handleRevenueByLocation(); break;
        case 'package-breakdown':     handlePackageBreakdown(); break;
        case 'recent-activity':       handleRecentActivity(); break;
        case 'hourly-stats':          handleHourlyStats(); break;

        // TRANSACTIONS
        case 'transactions':          handleGetTransactions(); break;
        case 'transaction-detail':    handleTransactionDetail(); break;
        case 'export-transactions':   handleExportTransactions(); break;

        // VOUCHERS
        case 'vouchers':
            if ($method === 'POST') handleCreateVoucher();
            else handleGetVouchers();
            break;
        case 'voucher-stats':         handleVoucherStats(); break;
        case 'voucher-reset':         handleVoucherReset(); break;

        // USER TRACKING
        case 'user-tracker':          handleUserTracker(); break;
        case 'user-tracker-stats':    handleUserTrackerStats(); break;
        case 'online-users':          handleOnlineUsers(); break;
        case 'user-detail':           handleUserDetail(); break;
        case 'user-sessions':         handleUserSessions(); break;
        case 'disconnect-user':
            if ($method === 'POST') handleDisconnectUser();
            break;
        case 'traffic-stats':         handleTrafficStats(); break;

        // PACKAGES
        case 'packages':
            if ($method === 'POST') handleCreateOrUpdatePackage();
            elseif ($method === 'DELETE') handleDeletePackage();
            else handleGetPackages();
            break;
        case 'package-delete':        handleDeletePackage(); break;
        case 'package-sync-radius':   handleSyncPackageToRadius(); break;
        case 'package-generate-tiers': handleGenerateTiers(); break;

        // LOYALTY
        case 'loyalty-data':          handleLoyaltyData(); break;

        default:
            echo json_encode(['success' => false, 'message' => 'Unknown action: ' . $action]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}


// ================================================================
//  DASHBOARD
// ================================================================

function handleDashboardStats() {
    $db = getHotspotDB();
    $radiusDb = getRadiusDB();

    // ── Accept optional date/month filters
    $filterDate  = isset($_GET['date'])  && preg_match('/^\d{4}-\d{2}-\d{2}$/', $_GET['date'])  ? $_GET['date']  : null;
    $filterMonth = isset($_GET['month']) && preg_match('/^\d{4}-\d{2}$/',        $_GET['month']) ? $_GET['month'] : null;

    // "Today" = filtered date OR actual today
    $today     = $filterDate ?? date('Y-m-d');
    $yesterday = date('Y-m-d', strtotime($today . ' -1 day'));

    // "This month" = filtered month OR actual current month
    if ($filterMonth) {
        $thisMonth      = $filterMonth . '-01';
        $thisMonthEnd   = date('Y-m-t', strtotime($thisMonth));
        $lastMonthStart = date('Y-m-01', strtotime($thisMonth . ' -1 month'));
        $lastMonthEnd   = date('Y-m-t',  strtotime($thisMonth . ' -1 month'));
    } else {
        $thisMonth      = date('Y-m-01');
        $thisMonthEnd   = date('Y-m-t');
        $lastMonthStart = date('Y-m-01', strtotime('-1 month'));
        $lastMonthEnd   = date('Y-m-t',  strtotime('-1 month'));
    }

    // Auto-backfill NAS IPs in the background
    autoBackfillNasIP();

    // ── Revenue today / filtered date (status = 'success')
    $stmt = $db->prepare("SELECT COALESCE(SUM(amount),0) as total FROM mpesa_transactions WHERE status='success' AND DATE(created_at) = ?");
    $stmt->execute([$today]);
    $revenueToday = (float)$stmt->fetch()['total'];

    // ── Revenue previous day (for % change)
    $stmt->execute([$yesterday]);
    $revenueYesterday = (float)$stmt->fetch()['total'];

    // ── Revenue this month / filtered month
    $stmt = $db->prepare("SELECT COALESCE(SUM(amount),0) as total FROM mpesa_transactions WHERE status='success' AND DATE(created_at) BETWEEN ? AND ?");
    $stmt->execute([$thisMonth, $thisMonthEnd]);
    $revenueMonth = (float)$stmt->fetch()['total'];

    // ── Revenue previous month
    $stmt->execute([$lastMonthStart, $lastMonthEnd]);
    $revenueLastMonth = (float)$stmt->fetch()['total'];

    // ── Pending STK count
    $stmt = $db->prepare("SELECT COUNT(*) as cnt FROM mpesa_transactions WHERE status='pending'");
    $stmt->execute();
    $pendingTotal = (int)$stmt->fetch()['cnt'];

    // ── Transaction breakdown for filtered date
    $stmt = $db->prepare("
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) as success,
            SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed,
            SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending
        FROM mpesa_transactions WHERE DATE(created_at) = ?
    ");
    $stmt->execute([$today]);
    $txToday = $stmt->fetch();

    // ── Active users (from RADIUS: sessions with no stop time)
    $onlineUsers = 0;
    $totalTrafficToday = 0;
    $totalSessionsToday = 0;
    if ($radiusDb) {
        try {
            $stmt = $radiusDb->query("SELECT COUNT(DISTINCT username) as cnt FROM radacct WHERE acctstoptime IS NULL");
            $onlineUsers = (int)$stmt->fetch()['cnt'];

            $stmt = $radiusDb->prepare("
                SELECT COALESCE(SUM(acctinputoctets),0) + COALESCE(SUM(acctoutputoctets),0) as total_bytes,
                       COUNT(*) as session_count
                FROM radacct WHERE DATE(acctstarttime) = ?
            ");
            $stmt->execute([$today]);
            $row = $stmt->fetch();
            $totalTrafficToday = (float)$row['total_bytes'];
            $totalSessionsToday = (int)$row['session_count'];
        } catch (Exception $e) {}
    }

    // ── Voucher stats
    $activeVouchers = 0;
    $usedVouchersToday = 0;
    $totalVouchers = 0;
    try {
        $stmt = $db->query("SELECT COUNT(*) as cnt FROM vouchers WHERE used = 0 AND (expires_at IS NULL OR expires_at > NOW())");
        $activeVouchers = (int)$stmt->fetch()['cnt'];

        $stmt = $db->prepare("SELECT COUNT(*) as cnt FROM vouchers WHERE used = 1 AND DATE(used_at) = ?");
        $stmt->execute([$today]);
        $usedVouchersToday = (int)$stmt->fetch()['cnt'];

        $stmt = $db->query("SELECT COUNT(*) as cnt FROM vouchers");
        $totalVouchers = (int)$stmt->fetch()['cnt'];
    } catch (Exception $e) {}

    // ── Revenue by location
    $locationRevenue = [];
    try {
        $macMap = loadMacLocations();
        $nasMap = loadNasLocations();

        $stmt = $db->prepare("
            SELECT username, amount, mac_address, nas_ip
            FROM mpesa_transactions
            WHERE status = 'success'
              AND DATE(created_at) = ?
        ");
        $stmt->execute([$today]);
        $txRows = $stmt->fetchAll();

        // Fallback to 7 days if no data today
        if (empty($txRows)) {
            $stmt = $db->prepare("
                SELECT username, amount, mac_address, nas_ip
                FROM mpesa_transactions
                WHERE status = 'success'
                  AND created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            ");
            $stmt->execute();
            $txRows = $stmt->fetchAll();
        }

        $locRev = [];
        foreach ($txRows as $row) {
            $loc = resolveLocation($row, $macMap, $nasMap);
            $locRev[$loc] = ($locRev[$loc] ?? 0) + (float)$row['amount'];
        }
        arsort($locRev);
        foreach ($locRev as $loc => $rev) {
            $locationRevenue[] = ['location' => $loc, 'revenue' => $rev];
        }
    } catch (Exception $e) {}

    // ── Success rate
    $txTodayTotal = (int)($txToday['total'] ?? 0);
    $txTodaySuccess = (int)($txToday['success'] ?? 0);
    $successRate = $txTodayTotal > 0 ? round(($txTodaySuccess / $txTodayTotal) * 100, 1) : 0;

    // ── Avg transaction
    $stmt = $db->prepare("SELECT COALESCE(AVG(amount),0) as avg_amount FROM mpesa_transactions WHERE status='success' AND DATE(created_at) = ?");
    $stmt->execute([$today]);
    $avgTransaction = round((float)$stmt->fetch()['avg_amount'], 2);

    echo json_encode([
        'success' => true,
        'data' => [
            'revenue' => [
                'today' => $revenueToday,
                'yesterday' => $revenueYesterday,
                'month' => $revenueMonth,
                'last_month' => $revenueLastMonth,
                'today_change' => $revenueYesterday > 0 ? round((($revenueToday - $revenueYesterday) / $revenueYesterday) * 100, 1) : 0,
                'month_change' => $revenueLastMonth > 0 ? round((($revenueMonth - $revenueLastMonth) / $revenueLastMonth) * 100, 1) : 0,
            ],
            'transactions' => [
                'today' => $txTodayTotal,
                'successful' => $txTodaySuccess,
                'failed' => (int)($txToday['failed'] ?? 0),
                'pending' => (int)($txToday['pending'] ?? 0),
                'pending_total' => $pendingTotal,
                'success_rate' => $successRate,
                'avg_amount' => $avgTransaction,
            ],
            'users' => [
                'online' => $onlineUsers,
            ],
            'vouchers' => [
                'active' => $activeVouchers,
                'used_today' => $usedVouchersToday,
                'total' => $totalVouchers,
            ],
            'radius' => [
                'online_users' => $onlineUsers,
                'sessions_today' => $totalSessionsToday,
                'traffic_today_bytes' => $totalTrafficToday,
                'traffic_today_formatted' => formatBytes($totalTrafficToday),
            ],
            'location_revenue' => $locationRevenue,
            'filter' => [
                'active_date'  => $filterDate,
                'active_month' => $filterMonth,
                'date_label'   => $filterDate  ? date('D, d M Y', strtotime($filterDate))            : date('D, d M Y'),
                'month_label'  => $filterMonth ? date('F Y', strtotime($filterMonth . '-01'))        : date('F Y'),
            ],
        ]
    ]);
}

function handleRevenueChart() {
    $db = getHotspotDB();
    $period = $_GET['period'] ?? '7days';

    switch ($period) {
        case '24hours':
            $stmt = $db->prepare("
                SELECT
                    DATE_FORMAT(created_at, '%H:00') as label,
                    COALESCE(SUM(CASE WHEN status='success' THEN amount ELSE 0 END), 0) as revenue,
                    COUNT(*) as transactions,
                    COUNT(CASE WHEN status='success' THEN 1 END) as successful,
                    COUNT(CASE WHEN status IN ('failed','cancelled') THEN 1 END) as failed
                FROM mpesa_transactions
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
                GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d %H:00')
                ORDER BY DATE_FORMAT(created_at, '%Y-%m-%d %H:00') ASC
            ");
            break;
        case '30days':
            $stmt = $db->prepare("
                SELECT
                    DATE_FORMAT(created_at, '%b %d') as label,
                    COALESCE(SUM(CASE WHEN status='success' THEN amount ELSE 0 END), 0) as revenue,
                    COUNT(*) as transactions,
                    COUNT(CASE WHEN status='success' THEN 1 END) as successful,
                    COUNT(CASE WHEN status IN ('failed','cancelled') THEN 1 END) as failed
                FROM mpesa_transactions
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                GROUP BY DATE(created_at) ORDER BY DATE(created_at) ASC
            ");
            break;
        default: // 7days
            $stmt = $db->prepare("
                SELECT
                    DATE_FORMAT(created_at, '%a %b %d') as label,
                    COALESCE(SUM(CASE WHEN status='success' THEN amount ELSE 0 END), 0) as revenue,
                    COUNT(*) as transactions,
                    COUNT(CASE WHEN status='success' THEN 1 END) as successful,
                    COUNT(CASE WHEN status IN ('failed','cancelled') THEN 1 END) as failed
                FROM mpesa_transactions
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                GROUP BY DATE(created_at) ORDER BY DATE(created_at) ASC
            ");
    }
    $stmt->execute();
    $data = $stmt->fetchAll();
    foreach ($data as &$row) {
        $row['revenue'] = (float)$row['revenue'];
        $row['transactions'] = (int)$row['transactions'];
        $row['successful'] = (int)$row['successful'];
        $row['failed'] = (int)$row['failed'];
    }
    echo json_encode(['success' => true, 'data' => $data]);
}

function handleRevenueByLocation() {
    $db = getHotspotDB();
    $date = $_GET['date'] ?? date('Y-m-d');

    autoBackfillNasIP();

    $macMap = loadMacLocations();
    $nasMap = loadNasLocations();

    $stmt = $db->prepare("
        SELECT username, amount, mac_address, nas_ip
        FROM mpesa_transactions
        WHERE status = 'success' AND DATE(created_at) = ?
    ");
    $stmt->execute([$date]);
    $rows = $stmt->fetchAll();

    if (empty($rows)) {
        $stmt = $db->prepare("
            SELECT username, amount, mac_address, nas_ip
            FROM mpesa_transactions
            WHERE status = 'success'
              AND created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        ");
        $stmt->execute();
        $rows = $stmt->fetchAll();
    }

    $locRev = [];
    foreach ($rows as $row) {
        $loc = resolveLocation($row, $macMap, $nasMap);
        $locRev[$loc] = ($locRev[$loc] ?? 0) + (float)$row['amount'];
    }
    arsort($locRev);

    $data = [];
    foreach ($locRev as $loc => $rev) {
        $data[] = ['location' => $loc, 'revenue' => $rev];
    }

    echo json_encode(['success' => true, 'data' => $data]);
}

function handlePackageBreakdown() {
    $db = getHotspotDB();
    $period = $_GET['period'] ?? 'today';

    $dateFilter = '';
    switch ($period) {
        case 'today': $dateFilter = "AND DATE(created_at) = CURDATE()"; break;
        case 'week':  $dateFilter = "AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)"; break;
        case 'month': $dateFilter = "AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)"; break;
    }

    $stmt = $db->query("
        SELECT
            COALESCE(package_type, 'unknown') as package_name,
            COUNT(*) as count,
            COALESCE(SUM(amount), 0) as revenue
        FROM mpesa_transactions
        WHERE status = 'success' $dateFilter
        GROUP BY package_type
        ORDER BY revenue DESC
    ");
    $data = $stmt->fetchAll();
    foreach ($data as &$row) {
        $row['count'] = (int)$row['count'];
        $row['revenue'] = (float)$row['revenue'];
    }
    echo json_encode(['success' => true, 'data' => $data]);
}

function handleRecentActivity() {
    $db = getHotspotDB();
    $limit = min((int)($_GET['limit'] ?? 20), 50);

    $stmt = $db->prepare("
        SELECT id, phone_number, amount, package_type, status,
               mpesa_receipt_number, created_at, mac_address, username,
               user_created, callback_received
        FROM mpesa_transactions ORDER BY created_at DESC LIMIT ?
    ");
    $stmt->execute([$limit]);
    echo json_encode(['success' => true, 'data' => $stmt->fetchAll()]);
}

function handleHourlyStats() {
    $db = getHotspotDB();
    $stmt = $db->query("
        SELECT
            HOUR(created_at) as hour,
            COUNT(*) as transactions,
            COALESCE(SUM(CASE WHEN status='success' THEN amount ELSE 0 END), 0) as revenue,
            COUNT(CASE WHEN status='success' THEN 1 END) as successful
        FROM mpesa_transactions WHERE DATE(created_at) = CURDATE()
        GROUP BY HOUR(created_at) ORDER BY hour ASC
    ");
    echo json_encode(['success' => true, 'data' => $stmt->fetchAll()]);
}


// ================================================================
//  TRANSACTIONS
// ================================================================

function handleGetTransactions() {
    $db = getHotspotDB();

    $page    = max(1, (int)($_GET['page'] ?? 1));
    $perPage = min((int)($_GET['per_page'] ?? 50), 500);
    $offset  = ($page - 1) * $perPage;
    $status  = $_GET['status'] ?? '';
    $search  = $_GET['search'] ?? '';
    $dateFrom = $_GET['date_from'] ?? '';
    $dateTo   = $_GET['date_to'] ?? '';
    $package  = $_GET['package'] ?? '';
    $amountMin = $_GET['amount_min'] ?? '';
    $amountMax = $_GET['amount_max'] ?? '';

    $where = [];
    $params = [];

    if ($status && $status !== 'all') {
        $where[] = "status = ?";
        $params[] = $status;
    }
    if ($search) {
        $where[] = "(phone_number LIKE ? OR mpesa_receipt_number LIKE ? OR username LIKE ? OR checkout_request_id LIKE ?)";
        $params = array_merge($params, ["%$search%", "%$search%", "%$search%", "%$search%"]);
    }
    if ($dateFrom) { $where[] = "DATE(created_at) >= ?"; $params[] = $dateFrom; }
    if ($dateTo)   { $where[] = "DATE(created_at) <= ?"; $params[] = $dateTo; }
    if ($package && $package !== 'all') { $where[] = "package_type = ?"; $params[] = $package; }
    if ($amountMin !== '') { $where[] = "amount >= ?"; $params[] = $amountMin; }
    if ($amountMax !== '') { $where[] = "amount <= ?"; $params[] = $amountMax; }

    $whereClause = $where ? 'WHERE ' . implode(' AND ', $where) : '';

    // Count
    $countStmt = $db->prepare("SELECT COUNT(*) as total FROM mpesa_transactions $whereClause");
    $countStmt->execute($params);
    $total = (int)$countStmt->fetch()['total'];

    // Summary
    $sumStmt = $db->prepare("
        SELECT
            COALESCE(SUM(CASE WHEN status='success' THEN amount ELSE 0 END), 0) as total_revenue,
            COUNT(CASE WHEN status='success' THEN 1 END) as successful,
            COUNT(CASE WHEN status IN ('failed','cancelled') THEN 1 END) as failed,
            COUNT(CASE WHEN status='pending' THEN 1 END) as pending
        FROM mpesa_transactions $whereClause
    ");
    $sumStmt->execute($params);
    $summary = $sumStmt->fetch();

    // Data
    $dataParams = array_merge($params, [$perPage, $offset]);
    $stmt = $db->prepare("
        SELECT id, phone_number, amount, package_type, status,
               mpesa_receipt_number, checkout_request_id, result_desc,
               mac_address, username, user_created, callback_received,
               router_name, nas_ip, created_at, updated_at
        FROM mpesa_transactions $whereClause
        ORDER BY created_at DESC LIMIT ? OFFSET ?
    ");
    $stmt->execute($dataParams);

    // Resolve locations for each row
    $macMap = loadMacLocations();
    $nasMap = loadNasLocations();
    $data = [];
    foreach ($stmt->fetchAll() as $row) {
        $row['location'] = resolveLocation($row, $macMap, $nasMap);
        $data[] = $row;
    }

    echo json_encode([
        'success' => true,
        'data' => $data,
        'summary' => [
            'total_revenue' => (float)$summary['total_revenue'],
            'successful' => (int)$summary['successful'],
            'failed' => (int)$summary['failed'],
            'pending' => (int)$summary['pending'],
        ],
        'pagination' => [
            'page' => $page,
            'per_page' => $perPage,
            'total' => $total,
            'total_pages' => (int)ceil($total / $perPage),
        ]
    ]);
}

function handleTransactionDetail() {
    $db = getHotspotDB();
    $id = $_GET['id'] ?? '';

    if (!$id) {
        echo json_encode(['success' => false, 'message' => 'Transaction ID required']);
        return;
    }

    $stmt = $db->prepare("SELECT * FROM mpesa_transactions WHERE id = ?");
    $stmt->execute([$id]);
    $transaction = $stmt->fetch();

    if (!$transaction) {
        echo json_encode(['success' => false, 'message' => 'Transaction not found']);
        return;
    }

    // Resolve location
    $macMap = loadMacLocations();
    $nasMap = loadNasLocations();
    $transaction['location'] = resolveLocation($transaction, $macMap, $nasMap);

    // Related user from mpesa_transactions (same phone, successful)
    $user = null;
    if ($transaction['username']) {
        $stmt = $db->prepare("SELECT username, phone_number, package_type, amount, created_at FROM mpesa_transactions WHERE username = ? ORDER BY created_at DESC LIMIT 1");
        $stmt->execute([$transaction['username']]);
        $user = $stmt->fetch();
    }

    // Related voucher
    $voucher = null;
    try {
        if ($transaction['phone_number']) {
            $stmt = $db->prepare("SELECT * FROM vouchers WHERE phone_number = ? ORDER BY created_at DESC LIMIT 1");
            $stmt->execute([$transaction['phone_number']]);
            $voucher = $stmt->fetch();
        }
    } catch (Exception $e) {}

    // RADIUS sessions
    $sessions = [];
    $radiusDb = getRadiusDB();
    if ($radiusDb && $transaction['username']) {
        try {
            $stmt = $radiusDb->prepare("
                SELECT acctstarttime, acctstoptime, acctinputoctets, acctoutputoctets,
                       acctsessiontime, framedipaddress, callingstationid, nasipaddress,
                       acctterminatecause
                FROM radacct WHERE username = ? ORDER BY acctstarttime DESC LIMIT 10
            ");
            $stmt->execute([$transaction['username']]);
            $sessions = $stmt->fetchAll();
            foreach ($sessions as &$s) {
                $s['duration_formatted'] = formatDuration((int)($s['acctsessiontime'] ?? 0));
                $s['download_formatted'] = formatBytes((float)($s['acctinputoctets'] ?? 0));
                $s['upload_formatted'] = formatBytes((float)($s['acctoutputoctets'] ?? 0));
            }
        } catch (Exception $e) {}
    }

    echo json_encode([
        'success' => true,
        'data' => [
            'transaction' => $transaction,
            'user' => $user,
            'voucher' => $voucher,
            'sessions' => $sessions,
        ]
    ]);
}

function handleExportTransactions() {
    $db = getHotspotDB();

    $dateFrom = $_GET['date_from'] ?? date('Y-m-01');
    $dateTo   = $_GET['date_to'] ?? date('Y-m-d');
    $status   = $_GET['status'] ?? '';

    $where = ["DATE(created_at) BETWEEN ? AND ?"];
    $params = [$dateFrom, $dateTo];

    if ($status && $status !== 'all') {
        $where[] = "status = ?";
        $params[] = $status;
    }

    $stmt = $db->prepare("
        SELECT id, phone_number, amount, package_type, status, mpesa_receipt_number,
               mac_address, router_name, username, nas_ip, created_at
        FROM mpesa_transactions WHERE " . implode(' AND ', $where) . "
        ORDER BY created_at DESC
    ");
    $stmt->execute($params);
    $data = $stmt->fetchAll();

    // Add locations
    $macMap = loadMacLocations();
    $nasMap = loadNasLocations();
    foreach ($data as &$row) {
        $row['location'] = resolveLocation($row, $macMap, $nasMap);
    }

    echo json_encode(['success' => true, 'data' => $data, 'count' => count($data)]);
}


// ================================================================
//  VOUCHERS  (uses: code, used 0/1, use_count, max_uses model)
// ================================================================

function handleGetVouchers() {
    $db = getHotspotDB();

    $page    = max(1, (int)($_GET['page'] ?? 1));
    $perPage = min((int)($_GET['per_page'] ?? 50), 200);
    $offset  = ($page - 1) * $perPage;
    $status  = $_GET['status'] ?? '';
    $search  = $_GET['search'] ?? '';

    $where = [];
    $params = [];

    if ($status && $status !== 'all') {
        switch ($status) {
            case 'unused':
                $where[] = "v.used = 0 AND (v.expires_at IS NULL OR v.expires_at > NOW())";
                break;
            case 'used':
                $where[] = "v.used = 1";
                break;
            case 'partially_used':
                $where[] = "v.used = 0 AND v.use_count > 0";
                break;
            case 'expired':
                $where[] = "v.expires_at IS NOT NULL AND v.expires_at <= NOW()";
                break;
        }
    }
    if ($search) {
        $where[] = "(v.code LIKE ? OR v.phone_number LIKE ?)";
        $params[] = "%$search%";
        $params[] = "%$search%";
    }

    $whereClause = $where ? 'WHERE ' . implode(' AND ', $where) : '';

    try {
        $countStmt = $db->prepare("SELECT COUNT(*) as total FROM vouchers v $whereClause");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetch()['total'];

        $dataParams = array_merge($params, [$perPage, $offset]);
        $stmt = $db->prepare("
            SELECT v.*, p.name as package_name, p.price as package_price, p.duration as package_duration
            FROM vouchers v
            LEFT JOIN packages p ON v.package_type = p.code
            $whereClause
            ORDER BY v.created_at DESC LIMIT ? OFFSET ?
        ");
        $stmt->execute($dataParams);
        $data = $stmt->fetchAll();

        // Compute runtime status for each voucher
        foreach ($data as &$v) {
            if ($v['used'] == 1) {
                $v['computed_status'] = 'used';
            } elseif ($v['expires_at'] && strtotime($v['expires_at']) <= time()) {
                $v['computed_status'] = 'expired';
            } elseif (($v['use_count'] ?? 0) > 0) {
                $v['computed_status'] = 'partially_used';
            } else {
                $v['computed_status'] = 'unused';
            }
        }

        echo json_encode([
            'success' => true,
            'data' => $data,
            'pagination' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => (int)ceil($total / $perPage),
            ]
        ]);
    } catch (Exception $e) {
        echo json_encode(['success' => true, 'data' => [], 'pagination' => ['page' => 1, 'per_page' => $perPage, 'total' => 0, 'total_pages' => 0], 'error' => $e->getMessage()]);
    }
}

function handleCreateVoucher() {
    $db = getHotspotDB();
    $input = json_decode(file_get_contents('php://input'), true);

    $packageId   = $input['package_id'] ?? '';
    $packageCode = $input['package_code'] ?? '';
    $phone       = $input['phone_number'] ?? '';
    $note        = $input['note'] ?? '';
    $quantity    = min(max((int)($input['quantity'] ?? 1), 1), 100);
    $customCode  = $input['code'] ?? '';
    $isBulk      = !empty($input['bulk']) || $quantity > 1;

    // Resolve package
    $package = null;
    if ($packageId) {
        $stmt = $db->prepare("SELECT * FROM packages WHERE id = ?");
        $stmt->execute([$packageId]);
        $package = $stmt->fetch();
    } elseif ($packageCode) {
        $stmt = $db->prepare("SELECT * FROM packages WHERE code = ?");
        $stmt->execute([$packageCode]);
        $package = $stmt->fetch();
    }

    if (!$package) {
        echo json_encode(['success' => false, 'message' => 'Valid package required']);
        return;
    }

    $maxUses = max(1, (int)($package['max_devices'] ?? 1));
    $vouchers = [];
    $created = 0;

    for ($i = 0; $i < $quantity; $i++) {
        // Generate unique code
        $code = ($quantity === 1 && $customCode) ? $customCode : '';
        if (!$code) {
            $attempts = 0;
            do {
                $code = generateVoucherCode();
                $checkStmt = $db->prepare("SELECT id FROM vouchers WHERE code = ? LIMIT 1");
                $checkStmt->execute([$code]);
                $attempts++;
            } while ($checkStmt->fetch() && $attempts < 10);
        }

        $noteText = $note ?: ($isBulk ? "Bulk generated voucher" : "Manually created voucher");

        try {
            $stmt = $db->prepare("
                INSERT INTO vouchers (code, package_type, phone_number, note, used, max_uses, use_count, created_at)
                VALUES (?, ?, ?, ?, 0, ?, 0, NOW())
            ");
            $stmt->execute([$code, $package['code'], $phone ?: null, $noteText, $maxUses]);

            $vouchers[] = [
                'id' => $db->lastInsertId(),
                'code' => $code,
                'package_type' => $package['code'],
                'package_name' => $package['name'],
                'max_uses' => $maxUses,
            ];
            $created++;
        } catch (Exception $e) {
            error_log("Voucher creation error: " . $e->getMessage());
        }
    }

    echo json_encode([
        'success' => $created > 0,
        'data' => $quantity === 1 ? ($vouchers[0] ?? null) : $vouchers,
        'created' => $created,
        'message' => "$created voucher(s) created"
    ]);
}

function handleVoucherStats() {
    $db = getHotspotDB();

    try {
        $stmt = $db->query("
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN used = 0 AND (expires_at IS NULL OR expires_at > NOW()) THEN 1 ELSE 0 END) as unused,
                SUM(CASE WHEN used = 1 THEN 1 ELSE 0 END) as used,
                SUM(CASE WHEN expires_at IS NOT NULL AND expires_at <= NOW() THEN 1 ELSE 0 END) as expired,
                SUM(CASE WHEN used = 0 AND use_count > 0 THEN 1 ELSE 0 END) as partially_used,
                SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) as created_today,
                SUM(CASE WHEN used = 1 AND DATE(used_at) = CURDATE() THEN 1 ELSE 0 END) as used_today
            FROM vouchers
        ");
        $data = $stmt->fetch();
        foreach ($data as $k => &$v) { $v = (int)$v; }
        echo json_encode(['success' => true, 'data' => $data]);
    } catch (Exception $e) {
        echo json_encode(['success' => true, 'data' => ['total'=>0,'unused'=>0,'used'=>0,'expired'=>0,'partially_used'=>0,'created_today'=>0,'used_today'=>0]]);
    }
}

function handleVoucherReset() {
    $db = getHotspotDB();
    $input = json_decode(file_get_contents('php://input'), true) ?: $_GET;
    $id = $input['id'] ?? $_GET['id'] ?? '';

    if (!$id) {
        echo json_encode(['success' => false, 'message' => 'Voucher ID required']);
        return;
    }

    try {
        $stmt = $db->prepare("
            UPDATE vouchers SET used = 0, use_count = 0, used_by_mac = NULL,
                   used_at = NULL, router_name = NULL, username = NULL, password = NULL
            WHERE id = ?
        ");
        $stmt->execute([$id]);
        echo json_encode(['success' => true, 'message' => 'Voucher reset']);
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
}


// ================================================================
//  USER TRACKER (queries mpesa_transactions + RADIUS enrichment)
// ================================================================

function handleUserTracker() {
    $db = getHotspotDB();

    $search = $_GET['search'] ?? '';
    $limit  = min((int)($_GET['limit'] ?? 50), 200);

    if ($search) {
        // Search by username, phone, receipt, or checkout ID
        $stmt = $db->prepare("
            SELECT * FROM mpesa_transactions
            WHERE username = ?
               OR phone_number LIKE ?
               OR checkout_request_id = ?
               OR merchant_request_id = ?
               OR mpesa_receipt_number = ?
            ORDER BY created_at DESC LIMIT ?
        ");
        $phone = '%' . preg_replace('/[^0-9]/', '', $search) . '%';
        $stmt->execute([$search, $phone, $search, $search, $search, $limit]);
    } else {
        // Default: latest purchased users (deduplicated by username)
        $stmt = $db->prepare("
            SELECT t.*
            FROM mpesa_transactions t
            INNER JOIN (
                SELECT username, MAX(created_at) AS max_created
                FROM mpesa_transactions
                WHERE username IS NOT NULL AND username != ''
                GROUP BY username
            ) x ON t.username = x.username AND t.created_at = x.max_created
            ORDER BY t.created_at DESC LIMIT ?
        ");
        $stmt->execute([$limit]);
    }

    $transactions = $stmt->fetchAll();

    // Collect usernames for RADIUS enrichment
    $usernames = array_filter(array_unique(array_column($transactions, 'username')));
    $radiusSummary = [];
    if (!empty($usernames)) {
        $radiusSummary = fetchRadiusSummary(array_values($usernames));
    }

    // Load location maps for resolving user location
    $macMap = loadMacLocations();
    $nasMap = loadNasLocations();

    // Merge RADIUS data into each transaction row
    $result = [];
    foreach ($transactions as $tx) {
        $u = $tx['username'] ?? '';
        $rData = $radiusSummary[$u] ?? null;

        $tx['radius_session'] = $rData ? [
            'start' => $rData['last_session_start'],
            'framed_ip' => $rData['last_ip'],
            'nas_ip' => $rData['nas_ip'],
            'mac_address' => $rData['mac_address'],
            'active_sessions' => $rData['active_sessions'],
            'total_bytes' => $rData['total_data_bytes'],
            'total_data_formatted' => formatBytes($rData['total_data_bytes']),
            'session_time' => $rData['last_session_time'],
            'session_time_formatted' => $rData['last_session_time'] ? formatDuration($rData['last_session_time']) : null,
            'group' => $rData['group'],
            'session_timeout' => $rData['session_timeout'],
            'expected_end' => $rData['expected_end'] ?? null,
            'ended_early' => $rData['ended_early'],
        ] : null;

        $tx['radius_group'] = $rData['group'] ?? null;
        $tx['is_online'] = $rData ? ($rData['active_sessions'] > 0) : false;

        // Resolve location: prefer transaction MAC, then RADIUS MAC, then NAS IP
        $locRow = [
            'mac_address' => $tx['mac_address'] ?? ($rData['mac_address'] ?? null),
            'nas_ip'      => $tx['nas_ip'] ?? ($rData['nas_ip'] ?? null),
        ];
        $tx['location'] = resolveLocation($locRow, $macMap, $nasMap);

        // Calculate expected end from purchase time + package duration if RADIUS doesn't have it
        if (!isset($tx['radius_session']['expected_end']) || !$tx['radius_session']['expected_end']) {
            if ($tx['package_type'] && $tx['created_at']) {
                $packages = loadPackagesMap();
                $pkg = $packages[$tx['package_type']] ?? null;
                if ($pkg && !empty($pkg['duration'])) {
                    $dur = durationToSeconds($pkg['duration']);
                    $tx['expires_at'] = date('Y-m-d H:i:s', strtotime($tx['created_at']) + $dur);
                }
            }
        }

        $result[] = $tx;
    }

    // Check if RADIUS is available
    $radiusAvailable = getRadiusDB() !== null;

    echo json_encode([
        'success' => true,
        'data' => $result,
        'radius_available' => $radiusAvailable,
        'count' => count($result),
    ]);
}

function handleUserTrackerStats() {
    $db = getHotspotDB();
    $radiusDb = getRadiusDB();

    // Transaction-based user stats
    $stmt = $db->query("
        SELECT
            COUNT(DISTINCT username) as total_users,
            COUNT(DISTINCT CASE WHEN status='success' THEN username END) as successful_users,
            COUNT(DISTINCT CASE WHEN DATE(created_at) = CURDATE() AND status='success' THEN username END) as new_today
        FROM mpesa_transactions
        WHERE username IS NOT NULL AND username != ''
    ");
    $userStats = $stmt->fetch();

    // Online from RADIUS
    $onlineCount = 0;
    $totalTraffic = ['download' => 0, 'upload' => 0];
    $topUsers = [];
    if ($radiusDb) {
        try {
            $stmt = $radiusDb->query("SELECT COUNT(DISTINCT username) as cnt FROM radacct WHERE acctstoptime IS NULL");
            $onlineCount = (int)$stmt->fetch()['cnt'];

            $stmt = $radiusDb->query("
                SELECT
                    COALESCE(SUM(acctinputoctets),0) as download,
                    COALESCE(SUM(acctoutputoctets),0) as upload
                FROM radacct WHERE DATE(acctstarttime) = CURDATE()
            ");
            $row = $stmt->fetch();
            $totalTraffic = [
                'download' => (float)$row['download'],
                'upload' => (float)$row['upload'],
                'download_formatted' => formatBytes((float)$row['download']),
                'upload_formatted' => formatBytes((float)$row['upload']),
                'total_formatted' => formatBytes((float)$row['download'] + (float)$row['upload']),
            ];

            // Top users today by data
            $stmt = $radiusDb->query("
                SELECT username, callingstationid as mac,
                       COUNT(*) as sessions,
                       SUM(acctsessiontime) as total_time,
                       SUM(acctinputoctets + acctoutputoctets) as total_bytes
                FROM radacct WHERE DATE(acctstarttime) = CURDATE()
                GROUP BY username ORDER BY total_bytes DESC LIMIT 10
            ");
            $topUsers = $stmt->fetchAll();
            foreach ($topUsers as &$tu) {
                $tu['total_time_formatted'] = formatDuration((int)$tu['total_time']);
                $tu['total_bytes_formatted'] = formatBytes((float)$tu['total_bytes']);
            }
        } catch (Exception $e) {}
    }

    echo json_encode([
        'success' => true,
        'data' => [
            'users' => [
                'total' => (int)($userStats['total_users'] ?? 0),
                'active' => $onlineCount,
                'new_today' => (int)($userStats['new_today'] ?? 0),
            ],
            'online' => $onlineCount,
            'traffic_today' => $totalTraffic,
            'top_users' => $topUsers,
        ]
    ]);
}

function handleOnlineUsers() {
    $radiusDb = getRadiusDB();
    $db = getHotspotDB();

    if (!$radiusDb) {
        echo json_encode(['success' => true, 'data' => [], 'message' => 'RADIUS database not available']);
        return;
    }

    try {
        $stmt = $radiusDb->query("
            SELECT radacctid, username, callingstationid, framedipaddress,
                   nasipaddress, acctstarttime, acctsessiontime, acctsessionid,
                   acctinputoctets, acctoutputoctets,
                   (acctinputoctets + acctoutputoctets) as total_bytes
            FROM radacct WHERE acctstoptime IS NULL
            ORDER BY acctstarttime DESC
        ");
        $sessions = $stmt->fetchAll();

        // Load locations and enrich
        $nasMap = loadNasLocations();

        foreach ($sessions as &$s) {
            $s['acctsessiontime'] = (int)($s['acctsessiontime'] ?? 0);
            $s['session_duration_formatted'] = formatDuration($s['acctsessiontime']);
            $s['download_formatted'] = formatBytes((float)($s['acctinputoctets'] ?? 0));
            $s['upload_formatted'] = formatBytes((float)($s['acctoutputoctets'] ?? 0));
            $s['total_formatted'] = formatBytes((float)($s['total_bytes'] ?? 0));
            $s['location'] = $nasMap[$s['nasipaddress']] ?? null;

            // Get phone + package from mpesa_transactions
            try {
                $stmt2 = $db->prepare("SELECT phone_number, package_type, amount FROM mpesa_transactions WHERE username = ? AND status = 'success' ORDER BY created_at DESC LIMIT 1");
                $stmt2->execute([$s['username']]);
                $ud = $stmt2->fetch();
                if ($ud) {
                    $s['phone_number'] = $ud['phone_number'];
                    $s['package_type'] = $ud['package_type'];
                    $s['amount'] = (float)$ud['amount'];
                }
            } catch (Exception $e) {}
        }

        echo json_encode(['success' => true, 'data' => $sessions]);
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => 'RADIUS query failed: ' . $e->getMessage()]);
    }
}

function handleUserDetail() {
    $db = getHotspotDB();
    $radiusDb = getRadiusDB();
    $username = $_GET['username'] ?? '';
    $phone = $_GET['phone'] ?? '';

    if (!$username && !$phone) {
        echo json_encode(['success' => false, 'message' => 'Username or phone required']);
        return;
    }

    // Get transactions for this user
    $transactions = [];
    if ($username) {
        $stmt = $db->prepare("SELECT * FROM mpesa_transactions WHERE username = ? ORDER BY created_at DESC LIMIT 20");
        $stmt->execute([$username]);
        $transactions = $stmt->fetchAll();
    }
    if (empty($transactions) && $phone) {
        $stmt = $db->prepare("SELECT * FROM mpesa_transactions WHERE phone_number LIKE ? ORDER BY created_at DESC LIMIT 20");
        $stmt->execute(["%$phone%"]);
        $transactions = $stmt->fetchAll();
    }

    // RADIUS data
    $radiusInfo = null;
    $recentSessions = [];
    if ($radiusDb && $username) {
        try {
            $stmt = $radiusDb->prepare("SELECT * FROM radcheck WHERE username = ?");
            $stmt->execute([$username]);
            $radcheck = $stmt->fetchAll();

            $stmt = $radiusDb->prepare("SELECT * FROM radreply WHERE username = ?");
            $stmt->execute([$username]);
            $radreply = $stmt->fetchAll();

            $stmt = $radiusDb->prepare("SELECT * FROM radusergroup WHERE username = ?");
            $stmt->execute([$username]);
            $radgroup = $stmt->fetchAll();

            $stmt = $radiusDb->prepare("
                SELECT acctstarttime, acctstoptime, acctsessiontime,
                       acctinputoctets, acctoutputoctets, framedipaddress,
                       callingstationid, nasipaddress, acctterminatecause,
                       CASE WHEN acctstoptime IS NULL THEN 1 ELSE 0 END as is_online
                FROM radacct WHERE username = ? ORDER BY acctstarttime DESC LIMIT 20
            ");
            $stmt->execute([$username]);
            $recentSessions = $stmt->fetchAll();

            foreach ($recentSessions as &$s) {
                $s['duration_formatted'] = formatDuration((int)($s['acctsessiontime'] ?? 0));
                $s['download_formatted'] = formatBytes((float)($s['acctinputoctets'] ?? 0));
                $s['upload_formatted'] = formatBytes((float)($s['acctoutputoctets'] ?? 0));
            }

            $radiusInfo = [
                'check' => $radcheck,
                'reply' => $radreply,
                'groups' => $radgroup,
            ];
        } catch (Exception $e) {
            error_log("RADIUS user detail error: " . $e->getMessage());
        }
    }

    echo json_encode([
        'success' => true,
        'data' => [
            'transactions' => $transactions,
            'radius' => $radiusInfo,
            'sessions' => $recentSessions,
        ]
    ]);
}

function handleUserSessions() {
    $radiusDb = getRadiusDB();
    $username = $_GET['username'] ?? '';
    $mac = $_GET['mac'] ?? '';
    $limit = min((int)($_GET['limit'] ?? 50), 200);

    if (!$username && !$mac) {
        echo json_encode(['success' => false, 'message' => 'Username or MAC required']);
        return;
    }

    if (!$radiusDb) {
        echo json_encode(['success' => true, 'data' => [], 'message' => 'RADIUS database not available']);
        return;
    }

    try {
        $where = [];
        $params = [];
        if ($username) { $where[] = "username = ?"; $params[] = $username; }
        if ($mac) { $where[] = "callingstationid = ?"; $params[] = $mac; }
        $params[] = $limit;

        $stmt = $radiusDb->prepare("
            SELECT radacctid, username, callingstationid as mac_address,
                   framedipaddress as ip_address, nasipaddress as nas_ip,
                   acctstarttime as session_start, acctstoptime as session_end,
                   acctsessiontime as duration_seconds,
                   acctinputoctets as download_bytes, acctoutputoctets as upload_bytes,
                   acctterminatecause as disconnect_reason,
                   CASE WHEN acctstoptime IS NULL THEN 1 ELSE 0 END as is_online
            FROM radacct WHERE " . implode(' AND ', $where) . "
            ORDER BY acctstarttime DESC LIMIT ?
        ");
        $stmt->execute($params);
        $sessions = $stmt->fetchAll();

        $totals = ['download' => 0, 'upload' => 0, 'duration' => 0];
        foreach ($sessions as &$s) {
            $s['duration_seconds'] = (int)$s['duration_seconds'];
            $s['duration_formatted'] = formatDuration($s['duration_seconds']);
            $s['download_formatted'] = formatBytes((float)$s['download_bytes']);
            $s['upload_formatted'] = formatBytes((float)$s['upload_bytes']);
            $s['is_online'] = (bool)$s['is_online'];
            $totals['download'] += (float)$s['download_bytes'];
            $totals['upload'] += (float)$s['upload_bytes'];
            $totals['duration'] += $s['duration_seconds'];
        }

        echo json_encode([
            'success' => true,
            'data' => $sessions,
            'summary' => [
                'total_sessions' => count($sessions),
                'total_download' => formatBytes($totals['download']),
                'total_upload' => formatBytes($totals['upload']),
                'total_duration' => formatDuration($totals['duration']),
            ]
        ]);
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
}

function handleDisconnectUser() {
    $input = json_decode(file_get_contents('php://input'), true);
    $username = $input['username'] ?? '';

    if (!$username) {
        echo json_encode(['success' => false, 'message' => 'Username required']);
        return;
    }

    $radiusDb = getRadiusDB();
    if (!$radiusDb) {
        echo json_encode(['success' => false, 'message' => 'RADIUS database not available']);
        return;
    }

    try {
        $stmt = $radiusDb->prepare("UPDATE radacct SET acctstoptime = NOW(), acctterminatecause = 'Admin-Reset' WHERE username = ? AND acctstoptime IS NULL");
        $stmt->execute([$username]);
        $affected = $stmt->rowCount();

        echo json_encode(['success' => true, 'message' => "Disconnected user $username ($affected sessions closed)"]);
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
}

function handleTrafficStats() {
    $radiusDb = getRadiusDB();
    $period = $_GET['period'] ?? '24hours';

    if (!$radiusDb) {
        echo json_encode(['success' => true, 'data' => [], 'message' => 'RADIUS not available']);
        return;
    }

    try {
        switch ($period) {
            case '7days':
                $stmt = $radiusDb->prepare("
                    SELECT DATE_FORMAT(acctstarttime, '%a %b %d') as label,
                           COALESCE(SUM(acctinputoctets),0) as download,
                           COALESCE(SUM(acctoutputoctets),0) as upload,
                           COUNT(DISTINCT username) as unique_users, COUNT(*) as sessions
                    FROM radacct WHERE acctstarttime >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                    GROUP BY DATE(acctstarttime) ORDER BY DATE(acctstarttime) ASC
                ");
                break;
            default:
                $stmt = $radiusDb->prepare("
                    SELECT DATE_FORMAT(acctstarttime, '%H:00') as label,
                           COALESCE(SUM(acctinputoctets),0) as download,
                           COALESCE(SUM(acctoutputoctets),0) as upload,
                           COUNT(DISTINCT username) as unique_users, COUNT(*) as sessions
                    FROM radacct WHERE acctstarttime >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
                    GROUP BY DATE_FORMAT(acctstarttime, '%Y-%m-%d %H:00')
                    ORDER BY DATE_FORMAT(acctstarttime, '%Y-%m-%d %H:00') ASC
                ");
        }
        $stmt->execute();
        $data = $stmt->fetchAll();
        foreach ($data as &$row) {
            $row['download_formatted'] = formatBytes((float)$row['download']);
            $row['upload_formatted'] = formatBytes((float)$row['upload']);
        }
        echo json_encode(['success' => true, 'data' => $data]);
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
}


// ================================================================
//  PACKAGES (full CRUD + RADIUS sync + tier generation)
// ================================================================

function handleGetPackages() {
    $db = getHotspotDB();

    $stmt = $db->query("SELECT * FROM packages ORDER BY sort_order ASC, price ASC");
    $packages = $stmt->fetchAll();

    foreach ($packages as &$pkg) {
        // Sales count
        $s = $db->prepare("SELECT COUNT(*) as cnt FROM mpesa_transactions WHERE package_type = ? AND status='success'");
        $s->execute([$pkg['code']]);
        $pkg['total_sales'] = (int)$s->fetch()['cnt'];

        // Sales today
        $s = $db->prepare("SELECT COUNT(*) as cnt FROM mpesa_transactions WHERE package_type = ? AND status='success' AND DATE(created_at) = CURDATE()");
        $s->execute([$pkg['code']]);
        $pkg['sales_today'] = (int)$s->fetch()['cnt'];

        $pkg['price'] = (float)$pkg['price'];

        // Map DB columns to frontend-expected names
        $pkg['tier'] = $pkg['package_tier'] ?? $pkg['tier'] ?? 'silver';
        $pkg['duration_hours'] = null;
        if (!empty($pkg['duration'])) {
            $secs = durationToSeconds($pkg['duration']);
            $pkg['duration_hours'] = round($secs / 3600, 2);
        }
        $pkg['badge_color'] = $pkg['color'] ?? '#667eea';
        $pkg['display_note'] = $pkg['note'] ?? '';
        $pkg['description'] = $pkg['description'] ?? '';
    }

    echo json_encode(['success' => true, 'data' => $packages]);
}

function handleCreateOrUpdatePackage() {
    $db = getHotspotDB();
    $input = json_decode(file_get_contents('php://input'), true);

    $id = $input['id'] ?? '';

    // Map frontend field names → DB column names
    $code = $input['code'] ?? '';
    $name = $input['name'] ?? '';
    $price = $input['price'] ?? 0;
    $durationHours = $input['duration_hours'] ?? '';
    $description = $input['description'] ?? '';
    $note = $input['display_note'] ?? $input['note'] ?? '';
    $color = $input['badge_color'] ?? $input['color'] ?? '#667eea';
    $category = $input['category'] ?? 'standard';
    $tier = $input['tier'] ?? 'silver';
    $basePackageId = $input['base_package_id'] ?? null;
    $maxDevices = max(1, (int)($input['max_devices'] ?? 1));
    $sortOrder = (int)($input['sort_order'] ?? 0);

    // Convert duration_hours → duration string
    $duration = '';
    if ($durationHours) {
        $hours = (float)$durationHours;
        if ($hours < 1) {
            $duration = round($hours * 60) . 'm';
        } elseif ($hours < 24) {
            $duration = $hours . 'h';
        } else {
            $days = floor($hours / 24);
            $remHours = $hours - ($days * 24);
            $duration = $remHours > 0 ? "{$days}d{$remHours}h" : "{$days}d";
        }
    }

    if (!$code || !$name || !$price) {
        echo json_encode(['success' => false, 'message' => 'Code, name and price are required']);
        return;
    }

    if ($id) {
        // UPDATE
        $stmt = $db->prepare("
            UPDATE packages SET
                code = ?, name = ?, price = ?, duration = ?, description = ?,
                note = ?, color = ?, category = ?, package_tier = ?,
                base_package_id = ?, max_devices = ?, sort_order = ?
            WHERE id = ?
        ");
        $stmt->execute([$code, $name, $price, $duration, $description, $note, $color, $category, $tier, $basePackageId ?: null, $maxDevices, $sortOrder, $id]);

        // Optionally sync to RADIUS
        if (!empty($input['sync_radius'])) {
            syncPackageToRadiusInternal($code, $description, $duration);
        }

        echo json_encode(['success' => true, 'message' => 'Package updated']);
    } else {
        // CREATE
        // Check duplicate code
        $check = $db->prepare("SELECT id FROM packages WHERE code = ? LIMIT 1");
        $check->execute([$code]);
        if ($check->fetch()) {
            echo json_encode(['success' => false, 'message' => "Package code '$code' already exists"]);
            return;
        }

        $stmt = $db->prepare("
            INSERT INTO packages (code, name, price, duration, description, note, color, category, package_tier, base_package_id, max_devices, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([$code, $name, $price, $duration, $description, $note, $color, $category, $tier, $basePackageId ?: null, $maxDevices, $sortOrder]);

        // Sync to RADIUS
        if (!empty($input['sync_radius'])) {
            syncPackageToRadiusInternal($code, $description, $duration);
        }

        echo json_encode(['success' => true, 'message' => 'Package created', 'id' => $db->lastInsertId()]);
    }
}

function handleDeletePackage() {
    $db = getHotspotDB();
    $input = json_decode(file_get_contents('php://input'), true) ?: $_GET;
    $id = $input['id'] ?? $_GET['id'] ?? '';

    if (!$id) {
        echo json_encode(['success' => false, 'message' => 'Package ID required']);
        return;
    }

    try {
        $stmt = $db->prepare("DELETE FROM packages WHERE id = ?");
        $stmt->execute([$id]);
        echo json_encode(['success' => true, 'message' => 'Package deleted']);
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
}

function handleSyncPackageToRadius() {
    $input = json_decode(file_get_contents('php://input'), true) ?: $_GET;
    $id = $input['id'] ?? $_GET['id'] ?? '';

    if (!$id) {
        echo json_encode(['success' => false, 'message' => 'Package ID required']);
        return;
    }

    $db = getHotspotDB();
    $stmt = $db->prepare("SELECT * FROM packages WHERE id = ?");
    $stmt->execute([$id]);
    $pkg = $stmt->fetch();

    if (!$pkg) {
        echo json_encode(['success' => false, 'message' => 'Package not found']);
        return;
    }

    $result = syncPackageToRadiusInternal($pkg['code'], $pkg['description'] ?? '', $pkg['duration'] ?? '1h');
    echo json_encode($result);
}

function syncPackageToRadiusInternal($groupName, $description, $duration) {
    $radiusDb = getRadiusDB();
    if (!$radiusDb) {
        return ['success' => false, 'message' => 'RADIUS database not available'];
    }

    $sessionTimeout = durationToSeconds($duration);
    $bandwidth = extractBandwidthFromDescription($description);

    try {
        // Delete existing group attributes
        $stmt = $radiusDb->prepare("DELETE FROM radgroupreply WHERE groupname = ?");
        $stmt->execute([$groupName]);

        // Insert Session-Timeout
        $stmt = $radiusDb->prepare("INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES (?, 'Session-Timeout', ':=', ?)");
        $stmt->execute([$groupName, $sessionTimeout]);

        // Insert bandwidth if available
        if ($bandwidth) {
            $parts = explode('/', $bandwidth);
            $down = $parts[0] ?? '5M';
            $up = $parts[1] ?? $down;

            // Convert to bits for WISPr
            $downBits = intval($down) * 1000000;
            $upBits = intval($up) * 1000000;

            $stmt = $radiusDb->prepare("INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES (?, 'WISPr-Bandwidth-Max-Down', ':=', ?)");
            $stmt->execute([$groupName, $downBits]);

            $stmt = $radiusDb->prepare("INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES (?, 'WISPr-Bandwidth-Max-Up', ':=', ?)");
            $stmt->execute([$groupName, $upBits]);
        }

        return ['success' => true, 'message' => "Synced group '$groupName' to FreeRADIUS (timeout: {$sessionTimeout}s" . ($bandwidth ? ", bandwidth: $bandwidth" : "") . ")"];
    } catch (Exception $e) {
        return ['success' => false, 'message' => 'RADIUS sync error: ' . $e->getMessage()];
    }
}

function handleGenerateTiers() {
    $input = json_decode(file_get_contents('php://input'), true) ?: $_GET;
    $baseId = $input['id'] ?? $_GET['id'] ?? '';

    if (!$baseId) {
        echo json_encode(['success' => false, 'message' => 'Base package ID required']);
        return;
    }

    $db = getHotspotDB();
    $stmt = $db->prepare("SELECT * FROM packages WHERE id = ?");
    $stmt->execute([$baseId]);
    $base = $stmt->fetch();

    if (!$base) {
        echo json_encode(['success' => false, 'message' => 'Base package not found']);
        return;
    }

    $created = 0;
    $tiers = [
        'bronze' => ['multiplier' => 2, 'max_devices' => 3],
        'premium' => ['multiplier' => 3, 'max_devices' => 3],
    ];

    foreach ($tiers as $tierName => $config) {
        $tierCode = $base['code'] . '_' . $tierName;

        // Check if already exists
        $check = $db->prepare("SELECT id FROM packages WHERE code = ? LIMIT 1");
        $check->execute([$tierCode]);
        if ($check->fetch()) continue;

        $tierPrice = (float)$base['price'] * $config['multiplier'];
        $tierNote = $base['name'] . ' – ' . ucfirst($tierName) . ' Tier';

        $stmt = $db->prepare("
            INSERT INTO packages (code, name, price, duration, description, note, color, category, package_tier, base_package_id, max_devices, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $tierCode,
            $base['name'] . ' ' . ucfirst($tierName),
            $tierPrice,
            $base['duration'] ?? '1h',
            $base['description'] ?? '',
            $tierNote,
            $base['color'] ?? '#667eea',
            $base['category'] ?? 'standard',
            $tierName,
            $baseId,
            $config['max_devices'],
            ($base['sort_order'] ?? 0) + ($tierName === 'bronze' ? 1 : 2),
        ]);

        // Also sync to RADIUS
        syncPackageToRadiusInternal($tierCode, $base['description'] ?? '', $base['duration'] ?? '1h');
        $created++;
    }

    echo json_encode([
        'success' => true,
        'message' => "$created tier(s) generated",
        'created' => $created,
    ]);
}


// ================================================================
//  LOYALTY
// ================================================================

function handleLoyaltyData() {
    $db = getHotspotDB();

    try {
        // Top customers by transaction count (last 30 days)
        $stmt = $db->query("
            SELECT
                phone_number,
                COUNT(*) as transaction_count,
                SUM(amount) as total_amount,
                MAX(created_at) as last_transaction_at
            FROM mpesa_transactions
            WHERE status = 'success'
              AND phone_number IS NOT NULL AND phone_number != ''
              AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            GROUP BY phone_number
            ORDER BY transaction_count DESC, total_amount DESC
            LIMIT 20
        ");
        $topCustomers = $stmt->fetchAll();
        foreach ($topCustomers as &$c) {
            $c['transaction_count'] = (int)$c['transaction_count'];
            $c['total_amount'] = (float)$c['total_amount'];
        }

        // Active campaigns
        $campaigns = [];
        try {
            $stmt = $db->query("SELECT * FROM payment_loyalty_campaigns ORDER BY created_at DESC");
            $campaigns = $stmt->fetchAll();
        } catch (Exception $e) {}

        // Tracking data
        $tracking = [];
        try {
            $stmt = $db->query("SELECT * FROM payment_loyalty_tracking ORDER BY phone_number");
            $tracking = $stmt->fetchAll();
        } catch (Exception $e) {}

        echo json_encode([
            'success' => true,
            'data' => [
                'top_customers' => $topCustomers,
                'campaigns' => $campaigns,
                'tracking' => $tracking,
            ]
        ]);
    } catch (Exception $e) {
        echo json_encode(['success' => true, 'data' => ['top_customers' => [], 'campaigns' => [], 'tracking' => []]]);
    }
}
