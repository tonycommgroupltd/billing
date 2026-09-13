<?php
/**
 * Shared team ticket access — same daily-schedule group as shared inventory.
 */

date_default_timezone_set('Africa/Nairobi');

if (!function_exists('getScheduleGroupMemberIds')) {
    define('DAILY_SCHEDULE_LIB_ONLY', true);
    require_once __DIR__ . '/daily-schedule.php';
}

if (!function_exists('getUserWithRoles')) {
    require_once __DIR__ . '/helpers.php';
}

const TEAM_TICKET_ELEVATED_ROLES = ['administrator', 'super-administrator', 'super-admin', 'manager'];

function userIsFieldTeamPool(array $user) {
    $roles = array_map('strtolower', $user['all_roles'] ?? []);
    foreach (TEAM_TICKET_ELEVATED_ROLES as $role) {
        if (in_array($role, $roles, true)) {
            return false;
        }
    }
    return in_array('technician', $roles, true) || in_array('engineer', $roles, true);
}

function userIsTechnicianOnly(array $user) {
    $roles = array_map('strtolower', $user['all_roles'] ?? []);
    foreach (TEAM_TICKET_ELEVATED_ROLES as $role) {
        if (in_array($role, $roles, true)) {
            return false;
        }
    }
    return in_array('technician', $roles, true);
}

function normalizeAssigneeToken($value) {
    $s = strtolower(trim((string)$value));
    if ($s === '' || $s === '0' || $s === '-' || $s === 'unassigned') {
        return '';
    }
    return $s;
}

function assigneeMatchTokensFromProfile(array $profile) {
    $tokens = [];
    $add = function ($value) use (&$tokens) {
        $token = normalizeAssigneeToken($value);
        if ($token !== '') {
            $tokens[$token] = true;
        }
    };

    $add($profile['name'] ?? '');
    $add($profile['email'] ?? '');
    $add($profile['username'] ?? '');

    $name = trim((string)($profile['name'] ?? ''));
    $email = trim((string)($profile['email'] ?? ''));
    if ($name !== '' && $email !== '') {
        $add($name . ' (' . $email . ')');
    }
    if ($email !== '' && strpos($email, '@') !== false) {
        $add(explode('@', $email)[0]);
    }

    return array_keys($tokens);
}

function assignedToValuesFromRaw($assignedToRaw) {
    if ($assignedToRaw === null || $assignedToRaw === '') {
        return [];
    }

    if (is_array($assignedToRaw)) {
        return array_values(array_filter(array_map('trim', $assignedToRaw)));
    }

    $str = trim((string)$assignedToRaw);
    if ($str === '') {
        return [];
    }

    if ($str[0] === '[') {
        $decoded = json_decode($str, true);
        if (is_array($decoded)) {
            return array_values(array_filter(array_map('trim', $decoded)));
        }
    }

    if (strpos($str, ',') !== false) {
        return array_values(array_filter(array_map('trim', explode(',', $str))));
    }

    return [$str];
}

function ticketAssignedToProfile($assignedToRaw, array $profile) {
    $values = assignedToValuesFromRaw($assignedToRaw);
    if (empty($values)) {
        return false;
    }

    $tokens = assigneeMatchTokensFromProfile($profile);
    if (empty($tokens)) {
        return false;
    }

    foreach ($values as $value) {
        $lower = strtolower($value);
        foreach ($tokens as $token) {
            if ($lower === $token || strpos($lower, $token) !== false) {
                return true;
            }
        }
    }

    return false;
}

function getScheduleGroupMemberProfiles($db, $userId) {
    $memberIds = getScheduleGroupMemberIds($db, $userId);
    if (empty($memberIds)) {
        return [];
    }

    $profilesById = [];
    $placeholders = implode(',', array_fill(0, count($memberIds), '?'));
    $stmt = $db->prepare("SELECT id, name, email FROM users WHERE id IN ($placeholders) AND deleted_at IS NULL");
    $stmt->execute($memberIds);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $profilesById[(int)$row['id']] = [
            'id' => (int)$row['id'],
            'name' => $row['name'] ?? '',
            'email' => $row['email'] ?? '',
            'username' => '',
        ];
    }

    $membersResult = getScheduleGroupMembers($db, $userId);
    if (!empty($membersResult['data']) && is_array($membersResult['data'])) {
        foreach ($membersResult['data'] as $member) {
            $id = (int)($member['member_id'] ?? $member['user_id'] ?? 0);
            if ($id <= 0) {
                continue;
            }
            $prev = $profilesById[$id] ?? ['id' => $id, 'name' => '', 'email' => '', 'username' => ''];
            $profilesById[$id] = [
                'id' => $id,
                'name' => $member['member_name'] ?? $member['name'] ?? $prev['name'],
                'email' => $prev['email'],
                'username' => $prev['username'],
            ];
        }
    }

    return array_values($profilesById);
}

function ticketVisibleToUserTeam($db, $userId, $ticketRow) {
    $user = getUserWithRoles($userId);
    if (!$user) {
        return false;
    }

    $selfProfile = [
        'id' => (int)$user['id'],
        'name' => $user['name'] ?? '',
        'email' => $user['email'] ?? '',
        'username' => $user['username'] ?? '',
    ];
    $assignedRaw = is_array($ticketRow) ? ($ticketRow['assigned_to'] ?? null) : null;

    if (ticketAssignedToProfile($assignedRaw, $selfProfile)) {
        return true;
    }

    // Optional: when a roster/schedule exists, teammates can still share tickets.
    foreach (getScheduleGroupMemberProfiles($db, $userId) as $profile) {
        if ((int)$profile['id'] === (int)$userId) {
            continue;
        }
        if (ticketAssignedToProfile($assignedRaw, $profile)) {
            return true;
        }
    }

    return false;
}

function appendProfileAssignedToClauses(array $profile, array &$clauses, array &$params) {
    foreach (assigneeMatchTokensFromProfile($profile) as $token) {
        $clauses[] = '(assigned_to = ? OR (assigned_to LIKE "[%" AND JSON_CONTAINS(assigned_to, JSON_QUOTE(?))) OR assigned_to LIKE ? OR assigned_to LIKE ?)';
        $params[] = $token;
        $params[] = $token;
        $params[] = '%' . $token . '%';
        $params[] = '%(' . $token . ')%';
    }
}

function getGroupTicketsForUser($db, $userId, array $options = []) {
    try {
        $user = getUserWithRoles($userId);
        if (!$user) {
            return ['success' => false, 'error' => 'User not found'];
        }

        // Technicians do not need daily roster — always include tickets assigned to this user.
        $profiles = [[
            'id' => (int)$user['id'],
            'name' => $user['name'] ?? '',
            'email' => $user['email'] ?? '',
            'username' => $user['username'] ?? '',
        ]];
        $memberIds = [(int)$user['id']];

        // When roster/schedule exists, also include teammates' assigned tickets.
        foreach (getScheduleGroupMemberProfiles($db, $userId) as $profile) {
            $pid = (int)($profile['id'] ?? 0);
            if ($pid <= 0 || $pid === (int)$user['id']) {
                continue;
            }
            $profiles[] = $profile;
            $memberIds[] = $pid;
        }
        $memberIds = array_values(array_unique($memberIds));

        $where = ['deleted_at IS NULL'];
        $params = [];
        $assignClauses = [];

        foreach ($profiles as $profile) {
            appendProfileAssignedToClauses($profile, $assignClauses, $params);
        }

        if (empty($assignClauses)) {
            return [
                'success' => true,
                'data' => [],
                'member_ids' => $memberIds,
                'fallback_self' => true,
            ];
        }

        $where[] = '(' . implode(' OR ', $assignClauses) . ')';

        $excludeResolved = !isset($options['exclude_resolved']) || $options['exclude_resolved'];
        if ($excludeResolved) {
            $where[] = "LOWER(REPLACE(REPLACE(status, '-', ' '), '_', ' ')) NOT IN ('resolved', 'installation complete', 'closed')";
        }

        $limit = isset($options['limit']) ? max(1, min(10000, (int)$options['limit'])) : 5000;
        $sql = 'SELECT * FROM tickets WHERE ' . implode(' AND ', $where) . ' ORDER BY updated_at DESC LIMIT ' . $limit;
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $formatted = array_map(function ($ticket) {
            if (function_exists('formatTicketForJS')) {
                return formatTicketForJS($ticket);
            }
            return [
                'id' => (int)($ticket['id'] ?? 0),
                'number' => $ticket['number'] ?? '',
                'subject' => $ticket['subject'] ?? '',
                'status' => $ticket['status'] ?? '',
                'priority' => $ticket['priority'] ?? '',
                'type' => $ticket['type'] ?? '',
                'group' => $ticket['group'] ?? '',
                'assigned_to' => $ticket['assigned_to'] ?? null,
                'assignedTo' => $ticket['assigned_to'] ?? null,
                'customer_name' => $ticket['customer_name'] ?? '',
                'customerName' => $ticket['customer_name'] ?? '',
                'customer_phone' => $ticket['customer_phone'] ?? '',
                'customerPhone' => $ticket['customer_phone'] ?? '',
                'address' => $ticket['address'] ?? '',
                'created_at' => $ticket['created_at'] ?? null,
                'updated_at' => $ticket['updated_at'] ?? null,
            ];
        }, $rows);

        return [
            'success' => true,
            'data' => $formatted,
            'member_ids' => $memberIds,
            'count' => count($formatted),
        ];
    } catch (Exception $e) {
        return [
            'success' => false,
            'error' => $e->getMessage(),
        ];
    }
}

function ticketsCurrentUser() {
    $token = getAuthToken();
    if (!$token) {
        return null;
    }
    $decoded = verifyToken($token);
    if (!$decoded || empty($decoded['user_id'])) {
        return null;
    }
    return getUserWithRoles((int)$decoded['user_id']);
}

function fieldUserCanAccessTicket($db, $ticketRow, $user = null) {
    if (!$user) {
        $user = ticketsCurrentUser();
    }
    if (!$user) {
        return true;
    }
    if (!userIsFieldTeamPool($user)) {
        return true;
    }

    // Daily roster is not required for technicians/engineers to view or update tickets.
    return true;
}

function denyTeamTicketAccessResponse() {
    http_response_code(403);
    echo json_encode([
        'success' => false,
        'error' => 'You do not have access to this ticket',
    ]);
}

function applyFieldUserUpdateRestrictions(array $data, array $user) {
    if (!userIsTechnicianOnly($user)) {
        return $data;
    }
    unset($data['assignedTo'], $data['assigned_to'], $data['type'], $data['group']);
    return $data;
}

function assertFieldUserTicketAccess($db, $ticketRow) {
    if (!fieldUserCanAccessTicket($db, $ticketRow)) {
        denyTeamTicketAccessResponse();
        return false;
    }
    return true;
}

function loadTicketForTeamAccess($db, $ticketId) {
    $stmt = $db->prepare('SELECT * FROM tickets WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([(int)$ticketId]);
    $ticket = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$ticket) {
        http_response_code(404);
        echo json_encode([
            'success' => false,
            'error' => 'Ticket not found',
        ]);
        return null;
    }
    if (!assertFieldUserTicketAccess($db, $ticket)) {
        return null;
    }
    return $ticket;
}
