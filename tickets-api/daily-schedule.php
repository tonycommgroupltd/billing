<?php

// =====================================================
// DAILY SCHEDULE API ENDPOINTS
// =====================================================

date_default_timezone_set('Africa/Nairobi');

if (!function_exists('getRosterTeamForUser')) {
    define('DAILY_ROSTER_LIB_ONLY', true);
    require_once __DIR__ . '/daily-roster.php';
}

/**
 * Get today's schedule for the current user and all members
 */
function getDailyScheduleForToday($db, $userId) {
    try {
        ensureDailyScheduleTables($db);
        $today = date('Y-m-d');

        $rosterTeam = getRosterTeamForUser($db, $today, $userId);
        if ($rosterTeam && !empty($rosterTeam['members'])) {
            return [
                'success' => true,
                'data' => [
                    'schedule_date' => $today,
                    'source' => 'roster',
                    'team_title' => $rosterTeam['team_title'],
                    'team_phone' => $rosterTeam['phone'] ?? null,
                    'team_extra_info' => $rosterTeam['extra_info'] ?? null,
                    'members' => $rosterTeam['members'],
                ],
            ];
        }
        
        // Schedule created by this user, or any schedule they are listed on today
        $sql = "SELECT ds.* FROM daily_schedules ds
                WHERE ds.schedule_date = ? AND ds.created_by_id = ?
                LIMIT 1";
        $stmt = $db->prepare($sql);
        $stmt->execute([$today, $userId]);
        $schedule = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$schedule) {
            $memberSql = "SELECT ds.* FROM daily_schedules ds
                          INNER JOIN daily_schedule_members dsm ON dsm.schedule_id = ds.id
                          WHERE ds.schedule_date = ? AND dsm.member_id = ?
                          ORDER BY ds.updated_at DESC
                          LIMIT 1";
            $memberStmt = $db->prepare($memberSql);
            $memberStmt->execute([$today, $userId]);
            $schedule = $memberStmt->fetch(PDO::FETCH_ASSOC);
        }

        if (!$schedule) {
            return [
                'success' => true,
                'data' => null,
                'message' => 'No roster team for today (' . $today . '). Save Team Roster for this date with names linked to system users.',
                'lookup_date' => $today,
            ];
        }
        
        // Get all members of this schedule
        $memberSql = "SELECT dsm.member_id, dsm.member_name, dsm.member_role 
                      FROM daily_schedule_members dsm 
                      WHERE dsm.schedule_id = ? 
                      ORDER BY dsm.member_name ASC";
        $memberStmt = $db->prepare($memberSql);
        $memberStmt->execute([$schedule['id']]);
        $members = $memberStmt->fetchAll(PDO::FETCH_ASSOC);
        
        $schedule['members'] = $members;
        $schedule['source'] = 'manual';
        
        return [
            'success' => true,
            'data' => $schedule
        ];
    } catch (Exception $e) {
        return [
            'success' => false,
            'error' => $e->getMessage()
        ];
    }
}

/**
 * Create or update today's schedule for a user
 */
function ensureDailyScheduleTables($db) {
    $db->exec("CREATE TABLE IF NOT EXISTS `daily_schedules` (
        `id` BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        `schedule_date` DATE NOT NULL,
        `created_by_id` BIGINT(20) UNSIGNED NOT NULL,
        `created_by_name` VARCHAR(255) DEFAULT NULL,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY `uq_schedule_date_creator` (`schedule_date`, `created_by_id`),
        KEY `idx_schedule_date` (`schedule_date`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $db->exec("CREATE TABLE IF NOT EXISTS `daily_schedule_members` (
        `id` BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        `schedule_id` BIGINT(20) UNSIGNED NOT NULL,
        `member_id` BIGINT(20) UNSIGNED NOT NULL,
        `member_name` VARCHAR(255) DEFAULT NULL,
        `member_role` VARCHAR(100) DEFAULT NULL,
        `added_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY `uq_schedule_member` (`schedule_id`, `member_id`),
        KEY `idx_schedule_id` (`schedule_id`),
        KEY `idx_member_id` (`member_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function getMemberRoleLabel($db, $memberId) {
    $stmt = $db->prepare("
        SELECT GROUP_CONCAT(DISTINCT r.name ORDER BY r.name SEPARATOR ', ') AS roles
        FROM roles r
        INNER JOIN model_has_roles mhr ON r.id = mhr.role_id
        WHERE mhr.model_id = ? AND mhr.model_type = 'App\\\\Models\\\\User'
    ");
    $stmt->execute([$memberId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row['roles'] ?? 'technician';
}

function saveDailySchedule($db, $userId, $userName, $memberIds) {
    try {
        $today = date('Y-m-d');
        ensureDailyScheduleTables($db);

        $memberIds = array_values(array_unique(array_map('intval', (array)$memberIds)));
        if (!in_array((int)$userId, $memberIds, true)) {
            $memberIds[] = (int)$userId;
        }
        
        $db->beginTransaction();
        
        // Check if schedule exists
        $checkSql = "SELECT id FROM daily_schedules 
                     WHERE schedule_date = ? AND created_by_id = ? LIMIT 1";
        $checkStmt = $db->prepare($checkSql);
        $checkStmt->execute([$today, $userId]);
        $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);
        
        if ($existing) {
            $scheduleId = $existing['id'];
            // Delete existing members (will re-add)
            $db->prepare("DELETE FROM daily_schedule_members WHERE schedule_id = ?")->execute([$scheduleId]);
        } else {
            // Create new schedule
            $insertSql = "INSERT INTO daily_schedules (schedule_date, created_by_id, created_by_name) 
                          VALUES (?, ?, ?)";
            $insertStmt = $db->prepare($insertSql);
            $insertStmt->execute([$today, $userId, $userName]);
            $scheduleId = $db->lastInsertId();
        }
        
        // Add members to schedule
        if (is_array($memberIds) && count($memberIds) > 0) {
            $memberInsertSql = "INSERT INTO daily_schedule_members (schedule_id, member_id, member_name, member_role) 
                               VALUES (?, ?, ?, ?)";
            $memberInsertStmt = $db->prepare($memberInsertSql);
            
            foreach ($memberIds as $memberId) {
                $userStmt = $db->prepare("SELECT id, name FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1");
                $userStmt->execute([$memberId]);
                $memberUser = $userStmt->fetch(PDO::FETCH_ASSOC);
                
                if ($memberUser) {
                    $memberInsertStmt->execute([
                        $scheduleId,
                        $memberUser['id'],
                        $memberUser['name'],
                        getMemberRoleLabel($db, $memberUser['id'])
                    ]);
                }
            }
        }
        
        $db->commit();
        
        // Return updated schedule
        $sql = "SELECT ds.* FROM daily_schedules ds WHERE ds.id = ?";
        $stmt = $db->prepare($sql);
        $stmt->execute([$scheduleId]);
        $schedule = $stmt->fetch(PDO::FETCH_ASSOC);
        
        $memberSql = "SELECT dsm.member_id, dsm.member_name, dsm.member_role 
                      FROM daily_schedule_members dsm 
                      WHERE dsm.schedule_id = ?";
        $memberStmt = $db->prepare($memberSql);
        $memberStmt->execute([$scheduleId]);
        $members = $memberStmt->fetchAll(PDO::FETCH_ASSOC);
        $schedule['members'] = $members;
        
        return [
            'success' => true,
            'data' => $schedule,
            'message' => 'Daily schedule saved successfully'
        ];
    } catch (Exception $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        return [
            'success' => false,
            'error' => $e->getMessage()
        ];
    }
}

/**
 * Member user IDs in today's schedule group (empty if none).
 */
function getScheduleGroupMemberIds($db, $userId) {
    $today = date('Y-m-d');

    $rosterIds = getRosterGroupMemberIds($db, $today, $userId);
    if (!empty($rosterIds)) {
        return $rosterIds;
    }

    $memberSql = "SELECT DISTINCT dsm2.member_id
                 FROM daily_schedule_members dsm1
                 INNER JOIN daily_schedules ds ON ds.id = dsm1.schedule_id
                 INNER JOIN daily_schedule_members dsm2 ON dsm2.schedule_id = ds.id
                 WHERE dsm1.member_id = ? AND ds.schedule_date = ?";
    $memberStmt = $db->prepare($memberSql);
    $memberStmt->execute([$userId, $today]);
    return array_map('intval', $memberStmt->fetchAll(PDO::FETCH_COLUMN));
}

/**
 * Get all members in user's schedule group for today
 * Returns IDs of everyone in the same schedule as the user
 */
function getScheduleGroupMembers($db, $userId) {
    try {
        $today = date('Y-m-d');

        $rosterTeam = getRosterTeamForUser($db, $today, $userId);
        if ($rosterTeam && !empty($rosterTeam['members'])) {
            return [
                'success' => true,
                'data' => $rosterTeam['members'],
                'source' => 'roster',
                'team_title' => $rosterTeam['team_title'],
            ];
        }
        
        $sql = "SELECT DISTINCT dsm2.member_id, dsm2.member_name, dsm2.member_role
                FROM daily_schedule_members dsm1
                INNER JOIN daily_schedules ds ON ds.id = dsm1.schedule_id
                INNER JOIN daily_schedule_members dsm2 ON dsm2.schedule_id = ds.id
                WHERE dsm1.member_id = ? AND ds.schedule_date = ?
                ORDER BY dsm2.member_name ASC";
        
        $stmt = $db->prepare($sql);
        $stmt->execute([$userId, $today]);
        $members = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        return [
            'success' => true,
            'data' => $members
        ];
    } catch (Exception $e) {
        return [
            'success' => false,
            'error' => $e->getMessage()
        ];
    }
}

/**
 * Disbursement rows for everyone in today's schedule group (shared inventory pool).
 */
function getGroupDisbursements($db, $userId) {
    try {
        ensureDailyScheduleTables($db);
        $memberIds = getScheduleGroupMemberIds($db, $userId);
        if (empty($memberIds)) {
            return ['success' => true, 'data' => []];
        }

        $placeholders = implode(',', array_fill(0, count($memberIds), '?'));
        $sql = "
            SELECT d.*,
                   COALESCE(d.ticket_number, ii.ticket_number) AS ticket_number,
                   COALESCE(d.ticket_id, ii.ticket_id) AS linked_ticket_id,
                   ii.used_by_name AS used_by_name,
                   COALESCE(d.serial_number, ii.serial_number) AS serial_number,
                   ii.unit AS unit,
                   t.subject AS ticket_subject
            FROM inventory_disbursements d
            LEFT JOIN inventory_items ii ON ii.id = d.item_id
            LEFT JOIN tickets t ON t.id = COALESCE(d.ticket_id, ii.ticket_id)
            WHERE d.assigned_to_id IN ($placeholders)
            ORDER BY d.assigned_to_name ASC, d.created_at DESC
        ";
        $stmt = $db->prepare($sql);
        $stmt->execute($memberIds);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        return ['success' => true, 'data' => $rows];
    } catch (Exception $e) {
        return ['success' => false, 'error' => $e->getMessage()];
    }
}

/**
 * Get inventory available only to members in user's schedule group
 * Filters: active status, not assigned to someone outside the group
 */
function getGroupAvailableInventory($db, $userId, $category = 'GPON Router') {
    try {
        $memberIds = getScheduleGroupMemberIds($db, $userId);
        
        // If no group found, return empty
        if (empty($memberIds)) {
            return [
                'success' => true,
                'data' => []
            ];
        }
        
        $placeholders = implode(',', array_fill(0, count($memberIds), '?'));
        $isRouter = stripos($category, 'router') !== false || stripos($category, 'gpon') !== false;

        if ($isRouter) {
            // Team routers: only the latest disbursement for each physical
            // router. Older link fields can survive a later re-disbursement
            // in legacy data, so a link older than the latest disbursement is
            // stale and must not hide the router from its current team.
            $sql = "SELECT DISTINCT ii.*,
                           COALESCE(ii.assigned_to_name, d.assigned_to_name) AS assigned_to_name,
                           d.assigned_to_id
                    FROM inventory_disbursements d
                    INNER JOIN (
                        SELECT item_id, MAX(id) AS latest_disbursement_id
                        FROM inventory_disbursements
                        WHERE type = 'router' AND item_id IS NOT NULL
                        GROUP BY item_id
                    ) latest ON latest.latest_disbursement_id = d.id
                    INNER JOIN inventory_items ii ON ii.id = d.item_id
                    WHERE d.type = 'router'
                      AND d.assigned_to_id IN ($placeholders)
                      AND (d.ticket_id IS NULL OR d.ticket_id = 0)
                      AND (
                          ii.ticket_id IS NULL
                          OR ii.ticket_id = 0
                          OR ii.updated_at <= DATE_ADD(d.created_at, INTERVAL 2 SECOND)
                      )
                      AND (ii.status = 'disbursed' OR ii.status IS NULL)
                    ORDER BY assigned_to_name ASC, ii.name ASC";
            $params = $memberIds;
        } else {
            $sql = "SELECT * FROM inventory_items
                    WHERE category = ?
                    AND quantity_available > 0
                    AND (
                        assigned_to_id IS NULL
                        OR assigned_to_id IN ($placeholders)
                    )
                    ORDER BY name ASC";
            $params = array_merge([$category], $memberIds);
        }

        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $inventory = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        return [
            'success' => true,
            'data' => $inventory
        ];
    } catch (Exception $e) {
        return [
            'success' => false,
            'error' => $e->getMessage()
        ];
    }
}

/**
 * Roster-aware bundle for ticket view: team IDs, all disbursements, available routers.
 */
function getTeamInventoryBundle($db, $userId) {
    try {
        ensureDailyScheduleTables($db);
        $today = date('Y-m-d');
        $memberIds = getScheduleGroupMemberIds($db, $userId);
        $rosterTeam = getRosterTeamForUser($db, $today, $userId);
        $source = 'none';

        if ($rosterTeam && !empty($rosterTeam['members'])) {
            $source = 'roster';
        } elseif (!empty($memberIds)) {
            $source = 'manual';
        }

        $disbursements = [];
        if (!empty($memberIds)) {
            $disbResult = getGroupDisbursements($db, $userId);
            if (!empty($disbResult['success']) && is_array($disbResult['data'])) {
                $disbursements = $disbResult['data'];
            }
        }

        $routers = [];
        if (!empty($memberIds)) {
            $routerResult = getGroupAvailableInventory($db, $userId, 'GPON Router');
            if (!empty($routerResult['success']) && is_array($routerResult['data'])) {
                $routers = $routerResult['data'];
            }
        }

        return [
            'success' => true,
            'data' => [
                'lookup_date' => $today,
                'source' => $source,
                'team_title' => $rosterTeam['team_title'] ?? null,
                'member_ids' => $memberIds,
                'disbursements' => $disbursements,
                'routers' => $routers,
            ],
        ];
    } catch (Exception $e) {
        return ['success' => false, 'error' => $e->getMessage()];
    }
}

function userCanLookupTeamFor($authUserId, $targetUserId) {
    if ((int)$authUserId === (int)$targetUserId) {
        return true;
    }
    $user = getUserWithRoles((int)$authUserId);
    if (!$user) {
        return false;
    }
    $adminRoles = ['super-administrator', 'administrator', 'manager'];
    return (bool)array_intersect($adminRoles, $user['all_roles'] ?? []);
}

/**
 * Today's schedule team for a technician — used on disbursement page (admin can pass user_id).
 */
function getTeamForUserDisbursement($db, $targetUserId) {
    try {
        ensureDailyScheduleTables($db);
        $today = date('Y-m-d');
        $targetUserId = (int)$targetUserId;
        $membersResult = getScheduleGroupMembers($db, $targetUserId);
        $memberIds = getScheduleGroupMemberIds($db, $targetUserId);
        if (empty($memberIds)) {
            $memberIds = [$targetUserId];
        }

        $members = [];
        if (!empty($membersResult['data']) && is_array($membersResult['data'])) {
            foreach ($membersResult['data'] as $m) {
                $id = (int)($m['member_id'] ?? $m['user_id'] ?? 0);
                if ($id <= 0) {
                    continue;
                }
                $members[] = [
                    'id' => $id,
                    'name' => $m['member_name'] ?? '',
                    'role' => $m['member_role'] ?? null,
                ];
            }
        }

        if (empty($members)) {
            $stmt = $db->prepare('SELECT id, name FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1');
            $stmt->execute([$targetUserId]);
            $u = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($u) {
                $members[] = ['id' => (int)$u['id'], 'name' => $u['name'], 'role' => null];
            }
        }

        return [
            'success' => true,
            'data' => [
                'lookup_date' => $today,
                'source' => $membersResult['source'] ?? (count($memberIds) > 1 ? 'manual' : 'none'),
                'team_title' => $membersResult['team_title'] ?? null,
                'selected_user_id' => $targetUserId,
                'member_ids' => array_values(array_unique(array_map('intval', $memberIds))),
                'members' => $members,
            ],
        ];
    } catch (Exception $e) {
        return ['success' => false, 'error' => $e->getMessage()];
    }
}

// =====================================================
// HTTP router (included from index.php)
// =====================================================
if (!defined('DAILY_SCHEDULE_LIB_ONLY')) {
if (!function_exists('getDB')) {
    require_once __DIR__ . '/helpers.php';
}
setCorsHeaders();
header('Content-Type: application/json');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    exit;
}

$uriPath = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?: '/';
$segments = array_values(array_filter(explode('/', trim($uriPath, '/'))));
if (!empty($segments) && $segments[0] === 'api') {
    array_shift($segments);
}
$base = array_search('daily-schedule', $segments, true);
$subPath = ($base !== false && isset($segments[$base + 1])) ? $segments[$base + 1] : '';

$token = getAuthToken();
$userId = null;
$userName = null;
if ($token) {
    $decoded = verifyToken($token);
    if ($decoded && !empty($decoded['user_id'])) {
        $dbAuth = getDB();
        $stmt = $dbAuth->prepare('SELECT id, name FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1');
        $stmt->execute([(int)$decoded['user_id']]);
        $authUser = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($authUser) {
            $userId = (int)$authUser['id'];
            $userName = $authUser['name'];
        }
    }
}

if (!$userId) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Unauthorized']);
    exit;
}

try {
    $db = getDB();
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database connection failed']);
    exit;
}

if ($subPath === 'today') {
    echo json_encode(getDailyScheduleForToday($db, $userId));
} elseif ($subPath === 'save' && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    $memberIds = $data['member_ids'] ?? [];
    echo json_encode(saveDailySchedule($db, $userId, $userName, $memberIds));
} elseif ($subPath === 'members') {
    echo json_encode(getScheduleGroupMembers($db, $userId));
} elseif ($subPath === 'available-inventory') {
    $category = $_GET['category'] ?? 'GPON Router';
    echo json_encode(getGroupAvailableInventory($db, $userId, $category));
} elseif ($subPath === 'group-disbursements') {
    echo json_encode(getGroupDisbursements($db, $userId));
} elseif ($subPath === 'team-inventory') {
    echo json_encode(getTeamInventoryBundle($db, $userId));
} elseif ($subPath === 'group-tickets') {
    require_once __DIR__ . '/team-ticket-access.php';
    $excludeResolved = !isset($_GET['exclude_resolved']) || $_GET['exclude_resolved'] !== '0';
    echo json_encode(getGroupTicketsForUser($db, $userId, [
        'exclude_resolved' => $excludeResolved,
    ]));
} elseif ($subPath === 'team-for-user') {
    $targetId = !empty($_GET['user_id']) ? (int)$_GET['user_id'] : $userId;
    if ($targetId <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'user_id required']);
        exit;
    }
    if (!userCanLookupTeamFor($userId, $targetId)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Forbidden']);
        exit;
    }
    echo json_encode(getTeamForUserDisbursement($db, $targetId));
} else {
    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'Unknown daily-schedule endpoint']);
}
}
