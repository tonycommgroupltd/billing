<?php
/**
 * Notification helper — DB functions only, no routing.
 * Safe to require_once from any other API file.
 */

function ensureNotificationsTable($db) {
    $db->exec("
        CREATE TABLE IF NOT EXISTS `notifications` (
            `id`         BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            `user_id`    BIGINT(20) UNSIGNED NOT NULL DEFAULT 0,
            `customer_id` BIGINT(20) UNSIGNED NULL DEFAULT NULL,
            `type`       VARCHAR(50)  NOT NULL DEFAULT 'info',
            `title`      VARCHAR(255) NOT NULL,
            `message`    TEXT         NOT NULL,
            `icon`       VARCHAR(50)  DEFAULT 'bell',
            `link`       VARCHAR(255) DEFAULT NULL,
            `is_read`    TINYINT(1)   NOT NULL DEFAULT 0,
            `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `updated_at` TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_user_id` (`user_id`),
            KEY `idx_is_read` (`is_read`),
            KEY `idx_type` (`type`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    // Older customer-app schema used ENUM('info','success','warning','error'),
    // which rejects type='ticket' and silently broke the staff bell.
    try {
        $db->exec("ALTER TABLE `notifications` MODIFY COLUMN `type` VARCHAR(50) NOT NULL DEFAULT 'info'");
    } catch (Exception $e) {
        /* already varchar or insufficient privileges */
    }
    try {
        $db->exec("ALTER TABLE `notifications` ADD COLUMN `user_id` BIGINT(20) UNSIGNED NOT NULL DEFAULT 0");
    } catch (Exception $e) {}
    try {
        $db->exec("ALTER TABLE `notifications` ADD COLUMN `icon` VARCHAR(50) DEFAULT 'bell'");
    } catch (Exception $e) {}
    try {
        $db->exec("ALTER TABLE `notifications` ADD COLUMN `link` VARCHAR(255) DEFAULT NULL");
    } catch (Exception $e) {}
    try {
        $db->exec("ALTER TABLE `notifications` MODIFY COLUMN `customer_id` BIGINT(20) UNSIGNED NULL DEFAULT NULL");
    } catch (Exception $e) {}
}

function createNotification($db, $userId, $type, $title, $message, $icon = 'bell', $link = null) {
    try {
        ensureNotificationsTable($db);
        $db->prepare("
            INSERT INTO notifications (user_id, type, title, message, icon, link, is_read, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 0, NOW())
        ")->execute([(int)$userId, $type, $title, $message, $icon, $link]);
        return true;
    } catch (Exception $e) {
        error_log('createNotification failed: ' . $e->getMessage());
        return false;
    }
}

/**
 * Staff user ids that have any of the given roles (excluding $excludeUserId).
 *
 * @param string[]|null $roles
 * @return int[]
 */
function getStaffNotificationRecipientIds($db, $excludeUserId = 0, array $roles = null) {
    $staffRoles = $roles ?: [
        'super-administrator',
        'administrator',
        'manager',
        'financial-manager',
        'customer-care',
        'technician',
        'engineer',
        'map-creator',
        'ticket-creater',
    ];
    $placeholders = implode(',', array_fill(0, count($staffRoles), '?'));
    $sql = "
        SELECT DISTINCT u.id
        FROM users u
        INNER JOIN model_has_roles mhr
            ON mhr.model_id = u.id
            AND mhr.model_type = ?
        INNER JOIN roles r ON r.id = mhr.role_id
        WHERE r.name IN ($placeholders)
          AND (u.deleted_at IS NULL)
    ";
    $params = array_merge(['App\\Models\\User'], $staffRoles);
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $recipients = $stmt->fetchAll(PDO::FETCH_COLUMN);
    $excludeUserId = (int)$excludeUserId;
    $ids = [];
    foreach ($recipients as $recipientId) {
        $recipientId = (int)$recipientId;
        if (!$recipientId) continue;
        if ($excludeUserId && $recipientId === $excludeUserId) continue;
        $ids[] = $recipientId;
    }
    return $ids;
}

/**
 * Parse assigned_to into assignee name / id tokens.
 *
 * @return string[]
 */
function parseTicketAssigneeTokens($assignedTo) {
    $tokens = [];
    if ($assignedTo === null || $assignedTo === '') {
        return $tokens;
    }
    if (is_array($assignedTo)) {
        foreach ($assignedTo as $item) {
            $item = trim((string)$item);
            if ($item !== '') $tokens[] = $item;
        }
        return $tokens;
    }
    $raw = trim((string)$assignedTo);
    $decoded = json_decode($raw, true);
    if (is_array($decoded)) {
        foreach ($decoded as $item) {
            $item = trim((string)$item);
            if ($item !== '') $tokens[] = $item;
        }
        return $tokens;
    }
    foreach (preg_split('/\s*,\s*/', $raw) as $item) {
        $item = trim((string)$item);
        if ($item !== '') $tokens[] = $item;
    }
    return $tokens;
}

/**
 * Expand an assignee token into match keys (id, name, email, username, Name (email)).
 *
 * @return string[]
 */
function expandAssigneeMatchKeys($token) {
    $norm = static function ($value) {
        return strtolower(trim(preg_replace('/\s+/', ' ', (string)$value)));
    };
    $raw = $norm($token);
    if ($raw === '' || $raw === '0' || $raw === '-' || $raw === 'unassigned') {
        return [];
    }

    $keys = [$raw => true];
    if (ctype_digit($raw)) {
        $keys['id:' . (int)$raw] = true;
    }

    if (preg_match('/^(.+?)\s*\(([^)]+)\)\s*$/', $raw, $m)) {
        $namePart = $norm($m[1]);
        $emailPart = $norm($m[2]);
        if ($namePart !== '') $keys[$namePart] = true;
        if ($emailPart !== '') $keys[$emailPart] = true;
        if (strpos($emailPart, '@') !== false) {
            $local = $norm(strstr($emailPart, '@', true));
            if ($local !== '') $keys[$local] = true;
        }
    }

    if (strpos($raw, '@') !== false) {
        $local = $norm(strstr($raw, '@', true));
        if ($local !== '') $keys[$local] = true;
    }

    return array_keys($keys);
}

/**
 * Match keys for a staff user row.
 *
 * @return string[]
 */
function expandUserMatchKeys(array $user) {
    $norm = static function ($value) {
        return strtolower(trim(preg_replace('/\s+/', ' ', (string)$value)));
    };
    $uid = (int)($user['id'] ?? 0);
    $name = $norm($user['name'] ?? '');
    $email = $norm($user['email'] ?? '');
    $username = $norm($user['username'] ?? '');
    $keys = [];
    if ($uid > 0) $keys['id:' . $uid] = true;
    if ($name !== '') $keys[$name] = true;
    if ($email !== '') $keys[$email] = true;
    if ($username !== '') $keys[$username] = true;
    if ($name !== '' && $email !== '') {
        $keys[$norm($name . ' (' . $email . ')')] = true;
    }
    if ($email !== '' && strpos($email, '@') !== false) {
        $local = $norm(strstr($email, '@', true));
        if ($local !== '') $keys[$local] = true;
    }
    return array_keys($keys);
}

/**
 * Resolve ticket notification recipients by role concern:
 * - Ops (super-admin / admin / manager / customer-care / ticket-creater): all ticket events
 * - Assigned technicians/engineers: only their tickets
 * - Unassigned field staff: never notified about other people's tickets
 *
 * @return int[]
 */
function getTicketNotificationRecipientIds($db, $ticket, $excludeUserId = 0) {
    $opsRoles = [
        'super-administrator',
        'administrator',
        'manager',
        'customer-care',
        'ticket-creater',
    ];
    $ids = getStaffNotificationRecipientIds($db, $excludeUserId, $opsRoles);

    $tokens = parseTicketAssigneeTokens($ticket['assigned_to'] ?? $ticket['assignedTo'] ?? '');
    if ($tokens) {
        $fieldRoles = ['technician', 'engineer'];
        $fieldIds = getStaffNotificationRecipientIds($db, $excludeUserId, $fieldRoles);
        if ($fieldIds) {
            $placeholders = implode(',', array_fill(0, count($fieldIds), '?'));
            $stmt = $db->prepare("SELECT id, name, email, username FROM users WHERE id IN ($placeholders)");
            $stmt->execute($fieldIds);
            $users = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $tokenSet = [];
            foreach ($tokens as $token) {
                foreach (expandAssigneeMatchKeys($token) as $key) {
                    $tokenSet[$key] = true;
                }
            }

            foreach ($users as $user) {
                $uid = (int)($user['id'] ?? 0);
                if (!$uid) continue;
                foreach (expandUserMatchKeys($user) as $candidate) {
                    if ($candidate === '' || $candidate === 'id:0') continue;
                    if (isset($tokenSet[$candidate])) {
                        $ids[] = $uid;
                        break;
                    }
                    // Soft match: assignee value contains the user's name/email/username
                    if (strlen($candidate) < 4) continue;
                    foreach ($tokenSet as $tokenKey => $_) {
                        if (strpos($tokenKey, $candidate) !== false) {
                            $ids[] = $uid;
                            break 2;
                        }
                    }
                }
            }
        }
    }

    $excludeUserId = (int)$excludeUserId;
    $unique = [];
    foreach ($ids as $id) {
        $id = (int)$id;
        if (!$id || ($excludeUserId && $id === $excludeUserId)) continue;
        $unique[$id] = true;
    }
    return array_map('intval', array_keys($unique));
}

function formatTicketStatusLabel($status) {
    $raw = trim((string)$status);
    if ($raw === '') return 'Unknown';
    $key = strtolower(str_replace(['-', ' '], '_', $raw));
    $labels = [
        'new' => 'New',
        'open' => 'Open',
        'in_progress' => 'In Progress',
        'work_in_progress' => 'Work in Progress',
        'pending' => 'Pending',
        'waiting_on_agent' => 'Waiting on Agent',
        'waiting_agent' => 'Waiting on Agent',
        'waiting_on_customer' => 'Waiting on Customer',
        'waiting_customer' => 'Waiting on Customer',
        'resolved' => 'Resolved',
        'closed' => 'Closed',
        'installation_complete' => 'Installation Complete',
        'out_of_range' => 'Out of Range',
        'archived' => 'Archived',
    ];
    return $labels[$key] ?? ucwords(str_replace(['_', '-'], ' ', $raw));
}

/**
 * Notify staff about a ticket mutation.
 * type "ticket" is what the header bell uses for the audible alert.
 * The actor who made the change is never notified — only other staff.
 *
 * @param bool $includeActor  Ignored; kept for call-site compatibility. Actor is always excluded.
 */
function notifyStaffTicketChange(
    $db,
    $ticket,
    $actorId,
    $actorName,
    $action = 'updated',
    $includeActor = false
) {
    try {
        ensureNotificationsTable($db);

        $ticketId = (int)($ticket['id'] ?? 0);
        if (!$ticketId) return;

        $ticketNumber = trim((string)($ticket['number'] ?? ''));
        if ($ticketNumber === '') $ticketNumber = '#' . $ticketId;
        $subject = trim((string)($ticket['subject'] ?? ''));
        $actorName = trim((string)$actorName) ?: 'A staff member';
        $actorId = (int)$actorId;
        // $includeActor is intentionally ignored — never notify the person who made the change.

        $recipients = getTicketNotificationRecipientIds($db, $ticket, $actorId);
        if (!$recipients) {
            error_log('notifyStaffTicketChange: no staff recipients found');
            return;
        }

        $title = "Ticket {$ticketNumber} {$action}";
        $message = "{$actorName} {$action} ticket {$ticketNumber}";
        if ($subject !== '') $message .= ": {$subject}";
        $link = "/admin/tickets/view/{$ticketId}";

        foreach ($recipients as $recipientId) {
            createNotification(
                $db,
                $recipientId,
                'ticket',
                $title,
                $message,
                'ticket',
                $link
            );
        }
    } catch (Exception $e) {
        error_log('notifyStaffTicketChange failed: ' . $e->getMessage());
    }
}

/**
 * Dedicated status-change notification for the header bell + sound.
 * Excludes the actor — only other staff see/hear the change.
 */
function notifyStaffTicketStatusChange(
    $db,
    $ticket,
    $actorId,
    $actorName,
    $previousStatus,
    $newStatus
) {
    $from = formatTicketStatusLabel($previousStatus);
    $to = formatTicketStatusLabel($newStatus);
    $ticketNumber = trim((string)($ticket['number'] ?? ''));
    if ($ticketNumber === '') {
        $ticketNumber = '#' . (int)($ticket['id'] ?? 0);
    }
    $actorName = trim((string)$actorName) ?: 'A staff member';
    $subject = trim((string)($ticket['subject'] ?? ''));
    $actorId = (int)$actorId;

    $action = "status changed {$from} → {$to}";
    $ticketForNotify = $ticket;
    try {
        ensureNotificationsTable($db);
        $ticketId = (int)($ticket['id'] ?? 0);
        if (!$ticketId) return;

        $recipients = getTicketNotificationRecipientIds($db, $ticket, $actorId);
        if (!$recipients) {
            error_log('notifyStaffTicketStatusChange: no staff recipients found');
            return;
        }

        $title = "Ticket {$ticketNumber}: {$to}";
        $message = "{$actorName} changed status from {$from} to {$to}";
        if ($subject !== '') $message .= " — {$subject}";
        $link = "/admin/tickets/view/{$ticketId}";

        foreach ($recipients as $recipientId) {
            createNotification(
                $db,
                (int)$recipientId,
                'ticket',
                $title,
                $message,
                'ticket',
                $link
            );
        }
    } catch (Exception $e) {
        error_log('notifyStaffTicketStatusChange failed: ' . $e->getMessage());
        notifyStaffTicketChange($db, $ticketForNotify, $actorId, $actorName, $action);
    }
}
