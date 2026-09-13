<?php

// =====================================================
// DAILY TEAM ROSTER (manager bulletin for WhatsApp)
// =====================================================

function ensureDailyRosterTables($db) {
    $db->exec("CREATE TABLE IF NOT EXISTS `daily_rosters` (
        `id` BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        `roster_date` DATE NOT NULL,
        `notes` TEXT DEFAULT NULL,
        `created_by_id` BIGINT(20) UNSIGNED DEFAULT NULL,
        `created_by_name` VARCHAR(255) DEFAULT NULL,
        `updated_by_id` BIGINT(20) UNSIGNED DEFAULT NULL,
        `updated_by_name` VARCHAR(255) DEFAULT NULL,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY `uq_roster_date` (`roster_date`),
        KEY `idx_roster_date` (`roster_date`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $db->exec("CREATE TABLE IF NOT EXISTS `daily_roster_teams` (
        `id` BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        `roster_id` BIGINT(20) UNSIGNED NOT NULL,
        `team_title` VARCHAR(255) NOT NULL,
        `phone` VARCHAR(50) DEFAULT NULL,
        `extra_info` VARCHAR(255) DEFAULT NULL,
        `sort_order` INT NOT NULL DEFAULT 0,
        KEY `idx_roster_id` (`roster_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $db->exec("CREATE TABLE IF NOT EXISTS `daily_roster_members` (
        `id` BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        `team_id` BIGINT(20) UNSIGNED NOT NULL,
        `member_name` VARCHAR(255) NOT NULL,
        `user_id` BIGINT(20) UNSIGNED DEFAULT NULL,
        `sort_order` INT NOT NULL DEFAULT 0,
        KEY `idx_team_id` (`team_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    try {
        $db->exec("ALTER TABLE `daily_rosters` ADD COLUMN `whatsapp_source` TEXT DEFAULT NULL");
    } catch (Exception $e) {
        // Column already exists
    }
    try {
        $db->exec("ALTER TABLE `daily_roster_members` ADD COLUMN `pasted_label` VARCHAR(255) DEFAULT NULL");
    } catch (Exception $e) {
        // Column already exists
    }
}

function getUserRoles($db, $userId) {
    $stmt = $db->prepare("
        SELECT DISTINCT r.name
        FROM roles r
        INNER JOIN model_has_roles mhr ON r.id = mhr.role_id
        WHERE mhr.model_id = ? AND mhr.model_type = 'App\\\\Models\\\\User'
    ");
    $stmt->execute([$userId]);
    return array_map('strtolower', $stmt->fetchAll(PDO::FETCH_COLUMN));
}

function userCanEditRoster($roles) {
    $allowed = ['administrator', 'super-administrator', 'super-admin', 'manager'];
    foreach ($roles as $role) {
        if (in_array(strtolower($role), $allowed, true)) {
            return true;
        }
    }
    return false;
}

function getDailyRosterByDate($db, $date) {
    try {
        ensureDailyRosterTables($db);

        $stmt = $db->prepare("SELECT * FROM daily_rosters WHERE roster_date = ? LIMIT 1");
        $stmt->execute([$date]);
        $roster = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$roster) {
            return [
                'success' => true,
                'data' => null,
                'message' => 'No roster for this date',
            ];
        }

        $teamStmt = $db->prepare("
            SELECT * FROM daily_roster_teams
            WHERE roster_id = ?
            ORDER BY sort_order ASC, id ASC
        ");
        $teamStmt->execute([$roster['id']]);
        $teams = $teamStmt->fetchAll(PDO::FETCH_ASSOC);

        $memberStmt = $db->prepare("
            SELECT * FROM daily_roster_members
            WHERE team_id = ?
            ORDER BY sort_order ASC, id ASC
        ");

        foreach ($teams as &$team) {
            $memberStmt->execute([$team['id']]);
            $team['members'] = $memberStmt->fetchAll(PDO::FETCH_ASSOC);
        }
        unset($team);

        $roster['teams'] = $teams;

        return ['success' => true, 'data' => $roster];
    } catch (Exception $e) {
        return ['success' => false, 'error' => $e->getMessage()];
    }
}

function saveDailyRoster($db, $userId, $userName, $payload) {
    try {
        ensureDailyRosterTables($db);

        $date = trim($payload['roster_date'] ?? date('Y-m-d'));
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            return ['success' => false, 'error' => 'Invalid roster_date'];
        }

        $notes = trim($payload['notes'] ?? '');
        $whatsappSource = trim($payload['whatsapp_source'] ?? '');
        $teams = is_array($payload['teams'] ?? null) ? $payload['teams'] : [];

        $db->beginTransaction();

        $check = $db->prepare("SELECT id FROM daily_rosters WHERE roster_date = ? LIMIT 1");
        $check->execute([$date]);
        $existing = $check->fetch(PDO::FETCH_ASSOC);

        if ($existing) {
            $rosterId = (int)$existing['id'];
            $upd = $db->prepare("
                UPDATE daily_rosters
                SET notes = ?, whatsapp_source = ?, updated_by_id = ?, updated_by_name = ?, updated_at = NOW()
                WHERE id = ?
            ");
            $upd->execute([
                $notes ?: null,
                $whatsappSource ?: null,
                $userId,
                $userName,
                $rosterId,
            ]);

            $oldTeams = $db->prepare("SELECT id FROM daily_roster_teams WHERE roster_id = ?");
            $oldTeams->execute([$rosterId]);
            $oldTeamIds = $oldTeams->fetchAll(PDO::FETCH_COLUMN);
            if (!empty($oldTeamIds)) {
                $ph = implode(',', array_fill(0, count($oldTeamIds), '?'));
                $db->prepare("DELETE FROM daily_roster_members WHERE team_id IN ($ph)")->execute($oldTeamIds);
            }
            $db->prepare("DELETE FROM daily_roster_teams WHERE roster_id = ?")->execute([$rosterId]);
        } else {
            $ins = $db->prepare("
                INSERT INTO daily_rosters (roster_date, notes, whatsapp_source, created_by_id, created_by_name, updated_by_id, updated_by_name)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ");
            $ins->execute([
                $date,
                $notes ?: null,
                $whatsappSource ?: null,
                $userId,
                $userName,
                $userId,
                $userName,
            ]);
            $rosterId = (int)$db->lastInsertId();
        }

        $teamIns = $db->prepare("
            INSERT INTO daily_roster_teams (roster_id, team_title, phone, extra_info, sort_order)
            VALUES (?, ?, ?, ?, ?)
        ");
        $memberIns = $db->prepare("
            INSERT INTO daily_roster_members (team_id, member_name, pasted_label, user_id, sort_order)
            VALUES (?, ?, ?, ?, ?)
        ");

        foreach ($teams as $idx => $team) {
            $title = trim($team['team_title'] ?? '');
            if ($title === '') {
                continue;
            }
            $phone = trim($team['phone'] ?? '') ?: null;
            $extra = trim($team['extra_info'] ?? '') ?: null;
            $sortOrder = isset($team['sort_order']) ? (int)$team['sort_order'] : $idx;

            $teamIns->execute([$rosterId, $title, $phone, $extra, $sortOrder]);
            $teamId = (int)$db->lastInsertId();

            $members = is_array($team['members'] ?? null) ? $team['members'] : [];
            foreach ($members as $mIdx => $member) {
                $memberUserId = !empty($member['user_id']) ? (int)$member['user_id'] : null;
                $name = trim($member['member_name'] ?? $member['name'] ?? '');

                if ($memberUserId) {
                    $userStmt = $db->prepare(
                        "SELECT name FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1"
                    );
                    $userStmt->execute([$memberUserId]);
                    $userRow = $userStmt->fetch(PDO::FETCH_ASSOC);
                    if (!$userRow || trim($userRow['name'] ?? '') === '') {
                        continue;
                    }
                    $name = trim($userRow['name']);
                }

                if ($name === '') {
                    continue;
                }

                $pastedLabel = trim($member['pasted_label'] ?? $member['pasted_name'] ?? '');
                if ($pastedLabel === '') {
                    $pastedLabel = $name;
                }
                $mSort = isset($member['sort_order']) ? (int)$member['sort_order'] : $mIdx;
                $memberIns->execute([$teamId, $name, $pastedLabel, $memberUserId, $mSort]);
            }
        }

        $db->commit();

        return getDailyRosterByDate($db, $date);
    } catch (Exception $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        return ['success' => false, 'error' => $e->getMessage()];
    }
}

/**
 * Roster team containing the user on a given date (linked user_ids only).
 */
function getRosterTeamForUser($db, $date, $userId) {
    ensureDailyRosterTables($db);

    $stmt = $db->prepare("
        SELECT dr.id AS roster_id, dr.roster_date,
               dt.id AS team_id, dt.team_title, dt.phone, dt.extra_info
        FROM daily_rosters dr
        INNER JOIN daily_roster_teams dt ON dt.roster_id = dr.id
        INNER JOIN daily_roster_members drm ON drm.team_id = dt.id
        WHERE dr.roster_date = ? AND drm.user_id IS NOT NULL AND CAST(drm.user_id AS UNSIGNED) = ?
        LIMIT 1
    ");
    $stmt->execute([$date, (int)$userId]);
    $team = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$team) {
        return null;
    }

    $memberStmt = $db->prepare("
        SELECT drm.user_id, drm.member_name, drm.pasted_label, drm.sort_order
        FROM daily_roster_members drm
        WHERE drm.team_id = ? AND drm.user_id IS NOT NULL
        ORDER BY drm.sort_order ASC, drm.member_name ASC
    ");
    $memberStmt->execute([$team['team_id']]);
    $rows = $memberStmt->fetchAll(PDO::FETCH_ASSOC);

    $members = [];
    foreach ($rows as $row) {
        $members[] = [
            'member_id' => (int)$row['user_id'],
            'member_name' => $row['member_name'],
            'member_role' => getMemberRoleLabelForRoster($db, (int)$row['user_id']),
            'pasted_label' => $row['pasted_label'],
        ];
    }

    $team['members'] = $members;
    $team['source'] = 'roster';
    return $team;
}

function getMemberRoleLabelForRoster($db, $memberId) {
    if (function_exists('getMemberRoleLabel')) {
        return getMemberRoleLabel($db, $memberId);
    }
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

/**
 * User IDs on the same roster team as $userId for $date (empty if none).
 */
function getRosterGroupMemberIds($db, $date, $userId) {
    $team = getRosterTeamForUser($db, $date, $userId);
    if (!$team || empty($team['members'])) {
        return [];
    }
    return array_map(function ($m) {
        return (int)$m['member_id'];
    }, $team['members']);
}

// =====================================================
// HTTP router
// =====================================================
if (!defined('DAILY_ROSTER_LIB_ONLY')) {
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
$base = array_search('daily-roster', $segments, true);
$subPath = ($base !== false && isset($segments[$base + 1])) ? $segments[$base + 1] : '';

$token = getAuthToken();
$userId = null;
$userName = null;
$userRoles = [];

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
            $userRoles = getUserRoles($dbAuth, $userId);
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

$date = $_GET['date'] ?? date('Y-m-d');
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
    $date = date('Y-m-d');
}

if ($subPath === 'today' || $subPath === 'by-date') {
    echo json_encode(getDailyRosterByDate($db, $date));
} elseif ($subPath === 'save' && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    if (!userCanEditRoster($userRoles)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Only super administrators, managers and administrators can edit the daily roster']);
        exit;
    }
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    $result = saveDailyRoster($db, $userId, $userName, $data);
    if (!empty($result['success'])) {
        $result['message'] = 'Daily roster saved successfully';
    }
    echo json_encode($result);
} else {
    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'Unknown daily-roster endpoint']);
}
}
