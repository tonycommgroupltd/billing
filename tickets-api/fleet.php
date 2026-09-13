<?php
/**
 * Fleet vehicle daily logbook API
 * Drivers log start/end odometer per car; management sees all vehicles + alerts.
 */

date_default_timezone_set('Africa/Nairobi');

require_once __DIR__ . '/helpers.php';

setCorsHeaders();
header('Content-Type: application/json');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    exit;
}

// ── Auth ─────────────────────────────────────────────────────────────────────
$token = getAuthToken();
$userId = null;
$userName = null;
$userRoles = [];

if ($token) {
    $decoded = verifyToken($token);
    if ($decoded && !empty($decoded['user_id'])) {
        $authUser = getUserWithRoles((int)$decoded['user_id']);
        if ($authUser) {
            $userId = (int)$authUser['id'];
            $userName = $authUser['name'] ?? 'Unknown';
            $userRoles = $authUser['all_roles'] ?? [];
        }
    }
}

if (!$userId) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Unauthorized']);
    exit;
}

function fleetUserIsManager($roles) {
    $mgr = ['super-administrator', 'super-admin', 'administrator', 'manager'];
    foreach ($roles as $r) {
        if (in_array(strtolower((string)$r), $mgr, true)) {
            return true;
        }
    }
    return false;
}

$isManager = fleetUserIsManager($userRoles);

function fleetUserCanAssignDrivers($roles) {
    if (fleetUserIsManager($roles)) {
        return true;
    }
    foreach ($roles as $r) {
        if (strtolower((string)$r) === 'driver') {
            return true;
        }
    }
    return false;
}

$canAssignDrivers = fleetUserCanAssignDrivers($userRoles);

function fleetUserCanManageVehicles($roles) {
    if (fleetUserIsManager($roles)) {
        return true;
    }
    foreach ($roles as $r) {
        if (strtolower((string)$r) === 'driver') {
            return true;
        }
    }
    return false;
}

$canManageVehicles = fleetUserCanManageVehicles($userRoles);

try {
    $db = getDB();
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database connection failed']);
    exit;
}

// ── Tables ───────────────────────────────────────────────────────────────────
const FLEET_ROSTER_GROUPS = ['PASSO', 'KDN', 'KDS', 'KDX'];

function fleetTryAlter($db, $sql) {
    try {
        $db->exec($sql);
    } catch (PDOException $e) {
        // column/table may already exist
    }
}

function ensureFleetTables($db) {
    $db->exec("
        CREATE TABLE IF NOT EXISTS `fleet_vehicles` (
          `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          `plate_number` VARCHAR(32) NOT NULL,
          `label` VARCHAR(120) DEFAULT NULL,
          `fleet_group` VARCHAR(16) DEFAULT NULL COMMENT 'Roster team code: PASSO, KDN, KDS, KDX',
          `next_service_odometer` INT UNSIGNED DEFAULT NULL,
          `insurance_expiry` DATE DEFAULT NULL,
          `inspection_expiry` DATE DEFAULT NULL,
          `assigned_driver_id` INT UNSIGNED DEFAULT NULL,
          `assigned_driver_name` VARCHAR(120) DEFAULT NULL,
          `last_odometer` INT UNSIGNED DEFAULT NULL,
          `service_alert_km` INT UNSIGNED NOT NULL DEFAULT 500,
          `is_active` TINYINT(1) NOT NULL DEFAULT 1,
          `notes` TEXT DEFAULT NULL,
          `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY `uq_plate` (`plate_number`),
          KEY `idx_assigned_driver` (`assigned_driver_id`),
          KEY `idx_fleet_group` (`fleet_group`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    fleetTryAlter($db, "ALTER TABLE `fleet_vehicles` ADD COLUMN `fleet_group` VARCHAR(16) DEFAULT NULL AFTER `label`");

    $db->exec("
        CREATE TABLE IF NOT EXISTS `fleet_daily_logs` (
          `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          `vehicle_id` INT UNSIGNED NOT NULL,
          `log_date` DATE NOT NULL,
          `start_odometer` INT UNSIGNED NOT NULL,
          `end_odometer` INT UNSIGNED NOT NULL,
          `distance_km` INT UNSIGNED NOT NULL DEFAULT 0,
          `start_odometer_image` VARCHAR(512) DEFAULT NULL,
          `end_odometer_image` VARCHAR(512) DEFAULT NULL,
          `driver_id` INT UNSIGNED DEFAULT NULL,
          `driver_name` VARCHAR(120) DEFAULT NULL,
          `notes` TEXT DEFAULT NULL,
          `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY `uq_vehicle_date` (`vehicle_id`, `log_date`),
          KEY `idx_log_date` (`log_date`),
          CONSTRAINT `fk_fleet_log_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `fleet_vehicles` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    fleetTryAlter($db, "ALTER TABLE `fleet_daily_logs` ADD COLUMN `start_odometer_image` VARCHAR(512) DEFAULT NULL AFTER `distance_km`");
    fleetTryAlter($db, "ALTER TABLE `fleet_daily_logs` ADD COLUMN `end_odometer_image` VARCHAR(512) DEFAULT NULL AFTER `start_odometer_image`");

    $db->exec("
        CREATE TABLE IF NOT EXISTS `fleet_daily_assignments` (
          `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          `roster_date` DATE NOT NULL,
          `vehicle_id` INT UNSIGNED NOT NULL,
          `driver_id` INT UNSIGNED DEFAULT NULL,
          `driver_name` VARCHAR(120) DEFAULT NULL,
          `roster_team_title` VARCHAR(255) DEFAULT NULL,
          `created_by_id` INT UNSIGNED DEFAULT NULL,
          `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY `uq_roster_vehicle` (`roster_date`, `vehicle_id`),
          KEY `idx_roster_date` (`roster_date`),
          CONSTRAINT `fk_fleet_assign_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `fleet_vehicles` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    $db->exec("
        CREATE TABLE IF NOT EXISTS `fleet_maintenance_events` (
          `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          `vehicle_id` INT UNSIGNED NOT NULL,
          `event_type` ENUM('car_wash', 'garage', 'inspection') NOT NULL,
          `event_date` DATE NOT NULL,
          `returned_date` DATE DEFAULT NULL,
          `description` TEXT DEFAULT NULL,
          `image_url` VARCHAR(512) DEFAULT NULL,
          `status` ENUM('open', 'closed') NOT NULL DEFAULT 'closed',
          `recorded_by_id` INT UNSIGNED DEFAULT NULL,
          `recorded_by_name` VARCHAR(120) DEFAULT NULL,
          `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY `idx_vehicle_type` (`vehicle_id`, `event_type`),
          KEY `idx_event_date` (`event_date`),
          KEY `idx_status` (`status`),
          CONSTRAINT `fk_fleet_maint_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `fleet_vehicles` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    fleetTryAlter($db, "ALTER TABLE `fleet_maintenance_events` MODIFY COLUMN `event_type` ENUM('car_wash', 'garage', 'inspection', 'service', 'maintenance') NOT NULL");
    fleetTryAlter($db, "ALTER TABLE `fleet_maintenance_events` ADD COLUMN `cost` DECIMAL(12,2) DEFAULT NULL AFTER `description`");
    fleetTryAlter($db, "ALTER TABLE `fleet_maintenance_events` ADD COLUMN `next_service_odometer` INT UNSIGNED DEFAULT NULL AFTER `cost`");
    fleetTryAlter($db, "ALTER TABLE `fleet_maintenance_events` ADD COLUMN `next_service_date` DATE DEFAULT NULL AFTER `next_service_odometer`");
    fleetTryAlter($db, "ALTER TABLE `fleet_maintenance_events` ADD COLUMN `maintenance_kind` ENUM('normal', 'breakdown') DEFAULT NULL AFTER `next_service_date`");
    fleetTryAlter($db, "ALTER TABLE `fleet_maintenance_events` ADD COLUMN `driver_name_at_event` VARCHAR(120) DEFAULT NULL AFTER `maintenance_kind`");

    fleetTryAlter($db, "ALTER TABLE `fleet_vehicles` ADD COLUMN `maintenance_cost_estimate` DECIMAL(12,2) DEFAULT NULL AFTER `service_alert_km`");
    fleetTryAlter($db, "ALTER TABLE `fleet_vehicles` ADD COLUMN `next_service_date` DATE DEFAULT NULL AFTER `next_service_odometer`");
    fleetTryAlter($db, "ALTER TABLE `fleet_vehicles` ADD COLUMN `insurance_type` ENUM('private', 'commercial') NOT NULL DEFAULT 'commercial' AFTER `insurance_expiry`");

    $db->exec("
        CREATE TABLE IF NOT EXISTS `fleet_fuel_logs` (
          `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          `vehicle_id` INT UNSIGNED NOT NULL,
          `fuel_date` DATE NOT NULL,
          `amount_ksh` DECIMAL(12,2) NOT NULL DEFAULT 0,
          `liters` DECIMAL(10,2) DEFAULT NULL,
          `odometer` INT UNSIGNED DEFAULT NULL,
          `notes` TEXT DEFAULT NULL,
          `recorded_by_id` INT UNSIGNED DEFAULT NULL,
          `recorded_by_name` VARCHAR(120) DEFAULT NULL,
          `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          KEY `idx_fuel_vehicle_date` (`vehicle_id`, `fuel_date`),
          CONSTRAINT `fk_fleet_fuel_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `fleet_vehicles` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    migrateFleetGroupsFromPlates($db);
    migrateRosterPlaceholderPlates($db);
}

function rosterPlaceholderPlate($code) {
    return 'TBD-' . strtoupper(trim((string)$code));
}

/** Fix duplicate placeholder plates (unique index on plate_number). */
function migrateRosterPlaceholderPlates($db) {
    $missingCodes = [];
    foreach (FLEET_ROSTER_GROUPS as $code) {
        $stmt = $db->prepare('SELECT id FROM fleet_vehicles WHERE fleet_group = ? LIMIT 1');
        $stmt->execute([$code]);
        if (!$stmt->fetchColumn()) {
            $missingCodes[] = $code;
        }
    }
    $orphans = $db->query("
        SELECT id FROM fleet_vehicles
        WHERE (fleet_group IS NULL OR fleet_group = '')
          AND (plate_number IN ('—', 'TBD', '') OR plate_number IS NULL)
        ORDER BY id ASC
    ")->fetchAll(PDO::FETCH_COLUMN);
    foreach ($orphans as $i => $orphanId) {
        if (!isset($missingCodes[$i])) {
            break;
        }
        $code = $missingCodes[$i];
        $db->prepare('UPDATE fleet_vehicles SET fleet_group = ?, plate_number = ? WHERE id = ?')
            ->execute([$code, rosterPlaceholderPlate($code), (int)$orphanId]);
    }

    $rows = $db->query("
        SELECT id, fleet_group, plate_number FROM fleet_vehicles
        WHERE plate_number IN ('—', 'TBD', '') OR plate_number IS NULL
           OR plate_number LIKE 'TBD-%'
    ")->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rows as $row) {
        $code = $row['fleet_group'] ?: inferFleetGroupFromPlate($row['plate_number'] ?? '');
        if (!$code || !in_array($code, FLEET_ROSTER_GROUPS, true)) {
            continue;
        }
        $targetPlate = rosterPlaceholderPlate($code);
        if ($row['plate_number'] === $targetPlate) {
            continue;
        }
        $chk = $db->prepare('SELECT id FROM fleet_vehicles WHERE plate_number = ? AND id != ? LIMIT 1');
        $chk->execute([$targetPlate, (int)$row['id']]);
        if ($chk->fetchColumn()) {
            continue;
        }
        $db->prepare('UPDATE fleet_vehicles SET plate_number = ?, fleet_group = COALESCE(fleet_group, ?) WHERE id = ?')
            ->execute([$targetPlate, $code, (int)$row['id']]);
    }
}

function detectFleetGroupFromTitle($title) {
    $upper = strtoupper(trim((string)$title));
    if ($upper === '') {
        return null;
    }

    foreach (FLEET_ROSTER_GROUPS as $code) {
        if (preg_match('/\b' . preg_quote($code, '/') . '\b/', $upper)) {
            return $code;
        }
    }

    $letterMap = ['A' => 'PASSO', 'B' => 'KDN', 'C' => 'KDX', 'D' => 'KDS'];
    if (preg_match('/\bTEAM\s+([A-D])\b/', $upper, $m)) {
        return $letterMap[$m[1]] ?? null;
    }

    foreach (FLEET_ROSTER_GROUPS as $code) {
        if (strpos($upper, $code) === 0) {
            return $code;
        }
    }

    return null;
}

function inferFleetGroupFromPlate($plate) {
    $upper = strtoupper(trim((string)$plate));
    foreach (FLEET_ROSTER_GROUPS as $code) {
        if (strpos($upper, $code) === 0) {
            return $code;
        }
    }
    return null;
}

function migrateFleetGroupsFromPlates($db) {
    $rows = $db->query("SELECT id, plate_number, fleet_group FROM fleet_vehicles")->fetchAll(PDO::FETCH_ASSOC);
    $upd = $db->prepare('UPDATE fleet_vehicles SET fleet_group = ? WHERE id = ?');
    foreach ($rows as $row) {
        if (!empty($row['fleet_group'])) {
            continue;
        }
        $group = inferFleetGroupFromPlate($row['plate_number']);
        if ($group) {
            $upd->execute([$group, (int)$row['id']]);
        }
    }
}

function seedFleetVehiclesIfEmpty($db) {
    $count = (int)$db->query('SELECT COUNT(*) FROM fleet_vehicles')->fetchColumn();
    if ($count > 0) {
        ensureRosterFleetVehicles($db);
        return;
    }
    $seed = [
        ['TBD-PASSO', 'PASSO', 'PASSO', null, null, null, null],
        ['TBD-KDN', 'KDN', 'KDN', null, null, null, null],
        ['KDS 521X', 'KDS', 'KDS', 173184, '2027-02-23', '2027-06-04', 167249],
        ['TBD-KDX', 'KDX', 'KDX', null, null, null, null],
    ];
    $stmt = $db->prepare("
        INSERT INTO fleet_vehicles
          (plate_number, label, fleet_group, next_service_odometer, insurance_expiry, inspection_expiry, last_odometer)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ");
    foreach ($seed as $row) {
        $stmt->execute($row);
    }
}

/** One roster vehicle per PASSO / KDN / KDS / KDX code (plate can be set later). */
function ensureRosterFleetVehicles($db) {
    foreach (FLEET_ROSTER_GROUPS as $code) {
        $stmt = $db->prepare('SELECT id FROM fleet_vehicles WHERE is_active = 1 AND fleet_group = ? LIMIT 1');
        $stmt->execute([$code]);
        if ($stmt->fetchColumn()) {
            continue;
        }
        $adopt = $db->prepare("
            SELECT id FROM fleet_vehicles
            WHERE is_active = 1 AND fleet_group IS NULL
              AND (UPPER(plate_number) LIKE ? OR UPPER(plate_number) = ?)
            LIMIT 1
        ");
        $adopt->execute([$code . '%', $code]);
        $adoptId = $adopt->fetchColumn();
        if ($adoptId) {
            $db->prepare('UPDATE fleet_vehicles SET fleet_group = ?, label = COALESCE(NULLIF(label, ""), ?) WHERE id = ?')
                ->execute([$code, $code, (int)$adoptId]);
            continue;
        }
        try {
            $db->prepare('INSERT INTO fleet_vehicles (plate_number, label, fleet_group) VALUES (?, ?, ?)')
                ->execute([rosterPlaceholderPlate($code), $code, $code]);
        } catch (PDOException $e) {
            // duplicate plate — migration may have already created it
        }
    }
    deactivateDuplicateFleetGroupVehicles($db);
}

function deactivateDuplicateFleetGroupVehicles($db) {
    foreach (FLEET_ROSTER_GROUPS as $code) {
        $stmt = $db->prepare("
            SELECT id FROM fleet_vehicles
            WHERE is_active = 1 AND fleet_group = ?
            ORDER BY
              CASE WHEN plate_number NOT LIKE 'TBD-%' AND plate_number NOT IN ('—', 'TBD', '') AND plate_number IS NOT NULL THEN 0 ELSE 1 END,
              id ASC
        ");
        $stmt->execute([$code]);
        $ids = $stmt->fetchAll(PDO::FETCH_COLUMN);
        if (count($ids) <= 1) {
            continue;
        }
        $remove = array_slice($ids, 1);
        foreach ($remove as $id) {
            $db->prepare('UPDATE fleet_vehicles SET is_active = 0 WHERE id = ?')->execute([(int)$id]);
        }
    }
}

function getPrimaryVehicleForCode($db, $code) {
    ensureRosterFleetVehicles($db);
    $stmt = $db->prepare("
        SELECT * FROM fleet_vehicles
        WHERE is_active = 1 AND fleet_group = ?
        ORDER BY
          CASE WHEN plate_number NOT LIKE 'TBD-%' AND plate_number NOT IN ('—', 'TBD', '') AND plate_number IS NOT NULL THEN 0 ELSE 1 END,
          id ASC
        LIMIT 1
    ");
    $stmt->execute([$code]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function saveFleetImage($vehicleId, $imageData, $prefix = 'fleet') {
    if (!is_string($imageData) || strpos($imageData, 'data:image') !== 0) {
        return null;
    }
    preg_match('/data:image\/(\w+);base64,/', $imageData, $matches);
    $extension = $matches[1] ?? 'jpg';
    $base64String = preg_replace('/^data:image\/\w+;base64,/', '', $imageData);
    $imageContent = base64_decode($base64String);
    if ($imageContent === false || strlen($imageContent) < 100) {
        throw new Exception('Invalid image data');
    }
    $fileName = $prefix . '_' . (int)$vehicleId . '_' . time() . '_' . uniqid() . '.' . $extension;
    $uploadDir = __DIR__ . '/uploads/fleet/';
    if (!file_exists($uploadDir) && !mkdir($uploadDir, 0777, true)) {
        throw new Exception('Failed to create upload directory');
    }
    if (!is_writable($uploadDir)) {
        throw new Exception('Upload directory is not writable');
    }
    $fullPath = $uploadDir . $fileName;
    if (file_put_contents($fullPath, $imageContent) === false) {
        throw new Exception('Failed to save image');
    }
    return '/uploads/fleet/' . $fileName;
}

function fleetVehicleRequiresInspection($row) {
    $type = strtolower(trim($row['insurance_type'] ?? 'commercial'));
    return $type !== 'private';
}

function formatVehicleRow($row, $alerts = []) {
    $lastOdo = $row['last_odometer'] != null ? (int)$row['last_odometer'] : null;
    $nextSvc = $row['next_service_odometer'] != null ? (int)$row['next_service_odometer'] : null;
    $alertKm = (int)($row['service_alert_km'] ?? 500);
    $kmToService = ($lastOdo !== null && $nextSvc !== null) ? max(0, $nextSvc - $lastOdo) : null;

    return [
        'id' => (int)$row['id'],
        'plate_number' => $row['plate_number'],
        'label' => $row['label'],
        'fleet_group' => $row['fleet_group'] ?? inferFleetGroupFromPlate($row['plate_number'] ?? ''),
        'next_service_odometer' => $nextSvc,
        'insurance_expiry' => $row['insurance_expiry'],
        'insurance_type' => $row['insurance_type'] ?? 'commercial',
        'requires_inspection' => fleetVehicleRequiresInspection($row),
        'inspection_expiry' => fleetVehicleRequiresInspection($row) ? ($row['inspection_expiry'] ?? null) : null,
        'assigned_driver_id' => $row['assigned_driver_id'] ? (int)$row['assigned_driver_id'] : null,
        'assigned_driver_name' => $row['assigned_driver_name'],
        'last_odometer' => $lastOdo,
        'service_alert_km' => $alertKm,
        'km_to_service' => $kmToService,
        'is_active' => !empty($row['is_active']),
        'notes' => $row['notes'],
        'alerts' => $alerts,
        'created_at' => $row['created_at'] ?? null,
        'updated_at' => $row['updated_at'] ?? null,
    ];
}

function buildVehicleAlerts($row) {
    $alerts = [];
    $today = new DateTime('today');
    $lastOdo = $row['last_odometer'] != null ? (int)$row['last_odometer'] : null;
    $nextSvc = $row['next_service_odometer'] != null ? (int)$row['next_service_odometer'] : null;
    $alertKm = (int)($row['service_alert_km'] ?? 500);

    if ($lastOdo !== null && $nextSvc !== null) {
        $kmLeft = $nextSvc - $lastOdo;
        if ($kmLeft <= 0) {
            $alerts[] = ['type' => 'service_overdue', 'level' => 'danger', 'message' => 'Service overdue'];
        } elseif ($kmLeft <= $alertKm) {
            $alerts[] = ['type' => 'service_due', 'level' => 'warning', 'message' => "Service in {$kmLeft} km"];
        }
    }

    foreach (['insurance_expiry' => 'Insurance'] as $field => $label) {
        if (empty($row[$field])) {
            continue;
        }
        try {
            $exp = new DateTime($row[$field]);
            $diff = (int)$today->diff($exp)->format('%r%a');
            if ($diff < 0) {
                $alerts[] = ['type' => strtolower($label) . '_expired', 'level' => 'danger', 'message' => "{$label} expired"];
            } elseif ($diff <= 30) {
                $alerts[] = ['type' => strtolower($label) . '_expiring', 'level' => 'warning', 'message' => "{$label} in {$diff} days"];
            }
        } catch (Exception $e) { /* skip */ }
    }

    if (fleetVehicleRequiresInspection($row)) {
        if (empty($row['inspection_expiry'])) {
            $alerts[] = ['type' => 'inspection_missing', 'level' => 'warning', 'message' => 'Inspection date not set (commercial)'];
        } else {
            try {
                $exp = new DateTime($row['inspection_expiry']);
                $diff = (int)$today->diff($exp)->format('%r%a');
                if ($diff < 0) {
                    $alerts[] = ['type' => 'inspection_expired', 'level' => 'danger', 'message' => 'Inspection expired'];
                } elseif ($diff <= 30) {
                    $alerts[] = ['type' => 'inspection_expiring', 'level' => 'warning', 'message' => "Inspection in {$diff} days"];
                }
            } catch (Exception $e) { /* skip */ }
        }
    }

    return $alerts;
}

function refreshVehicleLastOdometer($db, $vehicleId) {
    $stmt = $db->prepare("
        SELECT end_odometer FROM fleet_daily_logs
        WHERE vehicle_id = ?
        ORDER BY log_date DESC, id DESC
        LIMIT 1
    ");
    $stmt->execute([$vehicleId]);
    $last = $stmt->fetchColumn();
    $upd = $db->prepare('UPDATE fleet_vehicles SET last_odometer = ? WHERE id = ?');
    $upd->execute([$last !== false ? (int)$last : null, $vehicleId]);
}

function getSuggestedStartOdometer($db, $vehicleId, $logDate) {
    $stmt = $db->prepare("
        SELECT end_odometer FROM fleet_daily_logs
        WHERE vehicle_id = ? AND log_date < ?
        ORDER BY log_date DESC, id DESC
        LIMIT 1
    ");
    $stmt->execute([$vehicleId, $logDate]);
    $prev = $stmt->fetchColumn();
    if ($prev !== false) {
        return (int)$prev;
    }
    $v = $db->prepare('SELECT last_odometer FROM fleet_vehicles WHERE id = ?');
    $v->execute([$vehicleId]);
    $fallback = $v->fetchColumn();
    return $fallback !== false && $fallback !== null ? (int)$fallback : null;
}

function listFleetVehicles($db, $userId, $isManager) {
    ensureFleetTables($db);
    seedFleetVehiclesIfEmpty($db);

    $sql = "SELECT * FROM fleet_vehicles WHERE is_active = 1 ORDER BY plate_number ASC";
    $rows = $db->query($sql)->fetchAll(PDO::FETCH_ASSOC);

    $vehicles = [];
    foreach ($rows as $row) {
        if (!$isManager && !empty($row['assigned_driver_id']) && (int)$row['assigned_driver_id'] !== $userId) {
            continue;
        }
        $alerts = buildVehicleAlerts($row);
        $vehicles[] = formatVehicleRow($row, $alerts);
    }

    if (!$isManager && empty($vehicles)) {
        foreach ($rows as $row) {
            $alerts = buildVehicleAlerts($row);
            $vehicles[] = formatVehicleRow($row, $alerts);
        }
    }

    return ['success' => true, 'data' => $vehicles];
}

function getFleetDashboard($db) {
    ensureFleetTables($db);
    seedFleetVehiclesIfEmpty($db);

    $rows = $db->query("SELECT * FROM fleet_vehicles WHERE is_active = 1 ORDER BY plate_number ASC")
        ->fetchAll(PDO::FETCH_ASSOC);

    $vehicles = [];
    $alertCount = 0;
    foreach ($rows as $row) {
        $alerts = buildVehicleAlerts($row);
        $alertCount += count($alerts);
        $vehicles[] = formatVehicleRow($row, $alerts);
    }

    $today = date('Y-m-d');
    $stmt = $db->prepare("SELECT COUNT(DISTINCT vehicle_id) FROM fleet_daily_logs WHERE log_date = ?");
    $stmt->execute([$today]);
    $loggedToday = (int)$stmt->fetchColumn();

    $weekStart = date('Y-m-d', strtotime('-6 days'));
    $distStmt = $db->prepare("
        SELECT COALESCE(SUM(distance_km), 0) FROM fleet_daily_logs
        WHERE log_date BETWEEN ? AND ?
    ");
    $distStmt->execute([$weekStart, $today]);
    $weekDistance = (int)$distStmt->fetchColumn();

    return [
        'success' => true,
        'data' => [
            'vehicles' => $vehicles,
            'stats' => [
                'vehicle_count' => count($vehicles),
                'logged_today' => $loggedToday,
                'week_distance_km' => $weekDistance,
                'open_alerts' => $alertCount,
            ],
        ],
    ];
}

function listFleetLogs($db, $vehicleId = null, $from = null, $to = null) {
    ensureFleetTables($db);
    $sql = "
        SELECT l.*, v.plate_number, v.label AS vehicle_label
        FROM fleet_daily_logs l
        INNER JOIN fleet_vehicles v ON v.id = l.vehicle_id
        WHERE 1=1
    ";
    $bindings = [];
    if ($vehicleId) {
        $sql .= ' AND l.vehicle_id = ?';
        $bindings[] = (int)$vehicleId;
    }
    if ($from) {
        $sql .= ' AND l.log_date >= ?';
        $bindings[] = $from;
    }
    if ($to) {
        $sql .= ' AND l.log_date <= ?';
        $bindings[] = $to;
    }
    $sql .= ' ORDER BY l.log_date DESC, l.id DESC LIMIT 500';
    $stmt = $db->prepare($sql);
    $stmt->execute($bindings);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $data = array_map(function ($r) use ($db, $vehicleId) {
        $prevStart = getSuggestedStartOdometer($db, (int)$r['vehicle_id'], $r['log_date']);
        $gapWarning = ($prevStart !== null && (int)$r['start_odometer'] !== $prevStart)
            ? "Start ({$r['start_odometer']}) does not match previous end ({$prevStart})"
            : null;
        return [
            'id' => (int)$r['id'],
            'vehicle_id' => (int)$r['vehicle_id'],
            'plate_number' => $r['plate_number'],
            'vehicle_label' => $r['vehicle_label'],
            'log_date' => $r['log_date'],
            'start_odometer' => (int)$r['start_odometer'],
            'end_odometer' => (int)$r['end_odometer'],
            'distance_km' => (int)$r['distance_km'],
            'driver_id' => $r['driver_id'] ? (int)$r['driver_id'] : null,
            'driver_name' => $r['driver_name'],
            'notes' => $r['notes'],
            'start_odometer_image' => $r['start_odometer_image'] ?? null,
            'end_odometer_image' => $r['end_odometer_image'] ?? null,
            'gap_warning' => $gapWarning,
            'created_at' => $r['created_at'],
        ];
    }, $rows);

    return ['success' => true, 'data' => $data];
}

function formatFleetLogRow($row) {
    if (!$row) {
        return null;
    }
    return [
        'id' => (int)$row['id'],
        'vehicle_id' => (int)$row['vehicle_id'],
        'log_date' => $row['log_date'],
        'start_odometer' => (int)$row['start_odometer'],
        'end_odometer' => (int)$row['end_odometer'],
        'distance_km' => (int)$row['distance_km'],
        'start_odometer_image' => $row['start_odometer_image'] ?? null,
        'end_odometer_image' => $row['end_odometer_image'] ?? null,
        'driver_id' => $row['driver_id'] ? (int)$row['driver_id'] : null,
        'driver_name' => $row['driver_name'],
        'notes' => $row['notes'],
    ];
}

function formatMaintenanceRow($row) {
    if (!$row) {
        return null;
    }
    return [
        'id' => (int)$row['id'],
        'vehicle_id' => (int)$row['vehicle_id'],
        'event_type' => $row['event_type'],
        'event_date' => $row['event_date'],
        'returned_date' => $row['returned_date'],
        'description' => $row['description'],
        'cost' => isset($row['cost']) && $row['cost'] !== null ? (float)$row['cost'] : null,
        'next_service_odometer' => !empty($row['next_service_odometer']) ? (int)$row['next_service_odometer'] : null,
        'next_service_date' => $row['next_service_date'] ?? null,
        'maintenance_kind' => $row['maintenance_kind'] ?? null,
        'driver_name_at_event' => $row['driver_name_at_event'] ?? null,
        'image_url' => $row['image_url'],
        'status' => $row['status'],
        'recorded_by_name' => $row['recorded_by_name'],
        'created_at' => $row['created_at'],
    ];
}

function saveFleetLog($db, $userId, $userName, $data) {
    ensureFleetTables($db);

    $vehicleId = (int)($data['vehicle_id'] ?? 0);
    $logDate = trim($data['log_date'] ?? date('Y-m-d'));
    $start = isset($data['start_odometer']) ? (int)$data['start_odometer'] : null;
    $end = isset($data['end_odometer']) ? (int)$data['end_odometer'] : null;
    $notes = trim($data['notes'] ?? '');

    if (!$vehicleId) {
        http_response_code(400);
        return ['success' => false, 'error' => 'vehicle_id is required'];
    }
    if ($start === null && $end === null) {
        http_response_code(400);
        return ['success' => false, 'error' => 'At least one odometer reading is required'];
    }
    if ($start === null) {
        $start = $end;
    }
    if ($end === null) {
        $end = $start;
    }
    if ($end < $start) {
        http_response_code(400);
        return ['success' => false, 'error' => 'End odometer must be greater than or equal to start'];
    }

    $startImage = null;
    $endImage = null;
    try {
        if (!empty($data['start_odometer_image'])) {
            $startImage = saveFleetImage($vehicleId, $data['start_odometer_image'], 'odo_start');
        }
        if (!empty($data['end_odometer_image'])) {
            $endImage = saveFleetImage($vehicleId, $data['end_odometer_image'], 'odo_end');
        }
    } catch (Exception $e) {
        http_response_code(400);
        return ['success' => false, 'error' => $e->getMessage()];
    }

    $vStmt = $db->prepare('SELECT id FROM fleet_vehicles WHERE id = ? AND is_active = 1');
    $vStmt->execute([$vehicleId]);
    if (!$vStmt->fetch()) {
        http_response_code(404);
        return ['success' => false, 'error' => 'Vehicle not found'];
    }

    $distance = max(0, $end - $start);
    $suggested = getSuggestedStartOdometer($db, $vehicleId, $logDate);
    $gapWarning = ($suggested !== null && $start !== $suggested)
        ? "Start reading differs from previous day end ({$suggested})"
        : null;

    $prevLog = $db->prepare('SELECT * FROM fleet_daily_logs WHERE vehicle_id = ? AND log_date = ?');
    $prevLog->execute([$vehicleId, $logDate]);
    $prevRow = $prevLog->fetch(PDO::FETCH_ASSOC);

    if ($prevRow) {
        if ($startImage === null) {
            $startImage = $prevRow['start_odometer_image'] ?? null;
        }
        if ($endImage === null) {
            $endImage = $prevRow['end_odometer_image'] ?? null;
        }
        $upd = $db->prepare("
            UPDATE fleet_daily_logs
            SET start_odometer = ?, end_odometer = ?, distance_km = ?,
                start_odometer_image = ?, end_odometer_image = ?,
                driver_id = ?, driver_name = ?, notes = ?, updated_at = NOW()
            WHERE id = ?
        ");
        $upd->execute([
            $start, $end, $distance, $startImage, $endImage,
            $userId, $userName, $notes ?: null, (int)$prevRow['id'],
        ]);
        $logId = (int)$prevRow['id'];
    } else {
        $ins = $db->prepare("
            INSERT INTO fleet_daily_logs
              (vehicle_id, log_date, start_odometer, end_odometer, distance_km,
               start_odometer_image, end_odometer_image, driver_id, driver_name, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $ins->execute([
            $vehicleId, $logDate, $start, $end, $distance,
            $startImage, $endImage, $userId, $userName, $notes ?: null,
        ]);
        $logId = (int)$db->lastInsertId();
    }

    refreshVehicleLastOdometer($db, $vehicleId);

    return [
        'success' => true,
        'data' => [
            'id' => $logId,
            'vehicle_id' => $vehicleId,
            'log_date' => $logDate,
            'start_odometer' => $start,
            'end_odometer' => $end,
            'distance_km' => $distance,
            'gap_warning' => $gapWarning,
        ],
        'message' => 'Daily log saved',
    ];
}

function updateFleetVehicle($db, $vehicleId, $data, $canManage) {
    if (!$canManage) {
        http_response_code(403);
        return ['success' => false, 'error' => 'Management access required'];
    }
    ensureFleetTables($db);

    $stmt = $db->prepare('SELECT * FROM fleet_vehicles WHERE id = ?');
    $stmt->execute([(int)$vehicleId]);
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$existing) {
        http_response_code(404);
        return ['success' => false, 'error' => 'Vehicle not found'];
    }

    $fields = [
        'plate_number', 'label', 'fleet_group', 'next_service_odometer',
        'insurance_expiry', 'insurance_type', 'inspection_expiry',
        'assigned_driver_id', 'assigned_driver_name',
        'service_alert_km', 'notes', 'is_active',
    ];
    $updates = [];
    $bindings = [];
    $clearInspection = false;
    foreach ($fields as $f) {
        if (array_key_exists($f, $data)) {
            $val = $data[$f];
            if ($f === 'insurance_type') {
                $val = strtolower(trim((string)$val));
                if (!in_array($val, ['private', 'commercial'], true)) {
                    $val = 'commercial';
                }
                if ($val === 'private') {
                    $clearInspection = true;
                }
            }
            if (in_array($f, ['next_service_odometer', 'assigned_driver_id', 'service_alert_km'], true)) {
                $val = $val === '' || $val === null ? null : (int)$val;
            }
            if ($f === 'is_active') {
                $val = !empty($val) ? 1 : 0;
            }
            if ($f === 'inspection_expiry' && !fleetVehicleRequiresInspection(array_merge($existing, ['insurance_type' => $data['insurance_type'] ?? $existing['insurance_type'] ?? 'commercial']))) {
                $val = null;
            }
            $updates[] = "{$f} = ?";
            $bindings[] = $val === '' ? null : $val;
        }
    }
    if ($clearInspection && !array_key_exists('inspection_expiry', $data)) {
        $updates[] = 'inspection_expiry = ?';
        $bindings[] = null;
    }
    if (empty($updates)) {
        http_response_code(400);
        return ['success' => false, 'error' => 'No fields to update'];
    }
    $bindings[] = (int)$vehicleId;
    $db->prepare('UPDATE fleet_vehicles SET ' . implode(', ', $updates) . ', updated_at = NOW() WHERE id = ?')
        ->execute($bindings);

    $row = $db->prepare('SELECT * FROM fleet_vehicles WHERE id = ?');
    $row->execute([(int)$vehicleId]);
    $fresh = $row->fetch(PDO::FETCH_ASSOC);

    return [
        'success' => true,
        'data' => formatVehicleRow($fresh, buildVehicleAlerts($fresh)),
        'message' => 'Vehicle updated',
    ];
}

function getTodayLogContext($db, $vehicleId, $logDate = null) {
    $logDate = $logDate ?: date('Y-m-d');
    $suggested = getSuggestedStartOdometer($db, (int)$vehicleId, $logDate);

    $stmt = $db->prepare('SELECT * FROM fleet_daily_logs WHERE vehicle_id = ? AND log_date = ?');
    $stmt->execute([(int)$vehicleId, $logDate]);
    $today = $stmt->fetch(PDO::FETCH_ASSOC);

    return [
        'success' => true,
        'data' => [
            'log_date' => $logDate,
            'suggested_start' => $suggested,
            'today_log' => formatFleetLogRow($today),
        ],
    ];
}

function loadRosterTeamsForDate($db, $date) {
    if (!function_exists('getDailyRosterByDate')) {
        define('DAILY_ROSTER_LIB_ONLY', true);
        require_once __DIR__ . '/daily-roster.php';
    }
    $res = getDailyRosterByDate($db, $date);
    return is_array($res['data']['teams'] ?? null) ? $res['data']['teams'] : [];
}

function formatRosterTeamForFleet($team) {
    $members = [];
    foreach ($team['members'] ?? [] as $m) {
        $members[] = [
            'member_name' => $m['member_name'] ?? $m['pasted_label'] ?? '',
            'user_id' => !empty($m['user_id']) ? (int)$m['user_id'] : null,
            'pasted_label' => $m['pasted_label'] ?? null,
        ];
    }
    return [
        'team_title' => $team['team_title'] ?? '',
        'phone' => $team['phone'] ?? '',
        'extra_info' => $team['extra_info'] ?? '',
        'members' => $members,
    ];
}

function getVehicleMaintenanceContext($db, $vehicleId) {
    $openStmt = $db->prepare("
        SELECT * FROM fleet_maintenance_events
        WHERE vehicle_id = ? AND status = 'open'
        ORDER BY event_date DESC, id DESC
        LIMIT 1
    ");
    $openStmt->execute([(int)$vehicleId]);
    $openGarage = $openStmt->fetch(PDO::FETCH_ASSOC);

    $washStmt = $db->prepare("
        SELECT * FROM fleet_maintenance_events
        WHERE vehicle_id = ? AND event_type = 'car_wash'
        ORDER BY event_date DESC, id DESC
        LIMIT 1
    ");
    $washStmt->execute([(int)$vehicleId]);
    $lastWash = $washStmt->fetch(PDO::FETCH_ASSOC);

    $inspStmt = $db->prepare("
        SELECT * FROM fleet_maintenance_events
        WHERE vehicle_id = ? AND event_type = 'inspection'
        ORDER BY event_date DESC, id DESC
        LIMIT 1
    ");
    $inspStmt->execute([(int)$vehicleId]);
    $lastInspection = $inspStmt->fetch(PDO::FETCH_ASSOC);

    return [
        'open_garage' => ($openGarage && in_array($openGarage['event_type'], ['garage', 'inspection'], true))
            ? formatMaintenanceRow($openGarage) : null,
        'last_car_wash' => formatMaintenanceRow($lastWash),
        'last_inspection_event' => formatMaintenanceRow($lastInspection),
    ];
}

function getRosterDayFleet($db, $date) {
    ensureFleetTables($db);
    seedFleetVehiclesIfEmpty($db);

    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        http_response_code(400);
        return ['success' => false, 'error' => 'Invalid date'];
    }

    $assignStmt = $db->prepare('SELECT * FROM fleet_daily_assignments WHERE roster_date = ?');
    $assignStmt->execute([$date]);
    $assignments = [];
    foreach ($assignStmt->fetchAll(PDO::FETCH_ASSOC) as $a) {
        $assignments[(int)$a['vehicle_id']] = $a;
    }

    $logStmt = $db->prepare('SELECT * FROM fleet_daily_logs WHERE log_date = ?');
    $logStmt->execute([$date]);
    $logs = [];
    foreach ($logStmt->fetchAll(PDO::FETCH_ASSOC) as $l) {
        $logs[(int)$l['vehicle_id']] = $l;
    }

    $teamByGroup = [];
    foreach (loadRosterTeamsForDate($db, $date) as $team) {
        $code = detectFleetGroupFromTitle($team['team_title'] ?? '');
        if ($code) {
            $teamByGroup[$code] = formatRosterTeamForFleet($team);
        }
    }

    $groups = [];
    foreach (FLEET_ROSTER_GROUPS as $code) {
        $v = getPrimaryVehicleForCode($db, $code);
        $vehiclePayload = null;
        if ($v) {
            $vid = (int)$v['id'];
            $assign = $assignments[$vid] ?? null;
            $maint = getVehicleMaintenanceContext($db, $vid);
            $vehiclePayload = array_merge(
                formatVehicleRow($v, buildVehicleAlerts($v)),
                [
                    'daily_assignment' => $assign ? [
                        'driver_id' => $assign['driver_id'] ? (int)$assign['driver_id'] : null,
                        'driver_name' => $assign['driver_name'],
                        'roster_team_title' => $assign['roster_team_title'],
                    ] : null,
                    'today_log' => formatFleetLogRow($logs[$vid] ?? null),
                    'suggested_start' => getSuggestedStartOdometer($db, $vid, $date),
                    'open_garage' => $maint['open_garage'],
                ]
            );
        }
        $groups[] = [
            'code' => $code,
            'team' => $teamByGroup[$code] ?? null,
            'vehicle' => $vehiclePayload,
        ];
    }

    return [
        'success' => true,
        'data' => [
            'roster_date' => $date,
            'groups' => $groups,
        ],
    ];
}

function saveDailyAssignments($db, $userId, $data, $canAssign) {
    if (!$canAssign) {
        http_response_code(403);
        return ['success' => false, 'error' => 'You cannot assign drivers'];
    }
    ensureFleetTables($db);

    $date = trim($data['roster_date'] ?? '');
    $assignments = is_array($data['assignments'] ?? null) ? $data['assignments'] : [];
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        http_response_code(400);
        return ['success' => false, 'error' => 'Invalid roster_date'];
    }

    $upsert = $db->prepare("
        INSERT INTO fleet_daily_assignments
          (roster_date, vehicle_id, driver_id, driver_name, roster_team_title, created_by_id)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          driver_id = VALUES(driver_id),
          driver_name = VALUES(driver_name),
          roster_team_title = VALUES(roster_team_title),
          updated_at = NOW()
    ");

    $saved = 0;
    foreach ($assignments as $a) {
        $vehicleId = (int)($a['vehicle_id'] ?? 0);
        if (!$vehicleId) {
            continue;
        }
        $driverId = !empty($a['driver_id']) ? (int)$a['driver_id'] : null;
        $driverName = trim($a['driver_name'] ?? '') ?: null;
        if (!$driverName) {
            continue;
        }
        $teamTitle = trim($a['roster_team_title'] ?? '') ?: null;
        $upsert->execute([$date, $vehicleId, $driverId, $driverName, $teamTitle, $userId]);
        $saved++;
    }

    return [
        'success' => true,
        'message' => "Saved {$saved} driver assignment(s)",
        'data' => getRosterDayFleet($db, $date)['data'] ?? null,
    ];
}

function listMaintenanceEvents($db, $vehicleId = null, $eventType = null, $limit = 50) {
    ensureFleetTables($db);
    $sql = "
        SELECT m.*, v.plate_number, v.label AS vehicle_label
        FROM fleet_maintenance_events m
        INNER JOIN fleet_vehicles v ON v.id = m.vehicle_id
        WHERE 1=1
    ";
    $bindings = [];
    if ($vehicleId) {
        $sql .= ' AND m.vehicle_id = ?';
        $bindings[] = (int)$vehicleId;
    }
    if ($eventType) {
        $sql .= ' AND m.event_type = ?';
        $bindings[] = $eventType;
    }
    $sql .= ' ORDER BY m.event_date DESC, m.id DESC LIMIT ' . max(1, min(200, (int)$limit));
    $stmt = $db->prepare($sql);
    $stmt->execute($bindings);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    return [
        'success' => true,
        'data' => array_map(function ($r) {
            return array_merge(formatMaintenanceRow($r), [
                'plate_number' => $r['plate_number'],
                'vehicle_label' => $r['vehicle_label'],
            ]);
        }, $rows),
    ];
}

function saveMaintenanceEvent($db, $userId, $userName, $data) {
    ensureFleetTables($db);

    $vehicleId = (int)($data['vehicle_id'] ?? 0);
    $eventType = trim($data['event_type'] ?? '');
    $eventDate = trim($data['event_date'] ?? date('Y-m-d'));
    $description = trim($data['description'] ?? '');
    $status = trim($data['status'] ?? 'closed');
    $returnedDate = trim($data['returned_date'] ?? '') ?: null;
    $eventId = !empty($data['id']) ? (int)$data['id'] : null;

    $allowed = ['car_wash', 'garage', 'inspection', 'service', 'maintenance'];
    if (!$vehicleId || !in_array($eventType, $allowed, true)) {
        http_response_code(400);
        return ['success' => false, 'error' => 'vehicle_id and valid event_type required'];
    }
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $eventDate)) {
        http_response_code(400);
        return ['success' => false, 'error' => 'Invalid event_date'];
    }
    if (!in_array($status, ['open', 'closed'], true)) {
        $status = ($eventType === 'garage' || $eventType === 'inspection') ? 'open' : 'closed';
    }
    if ($eventType === 'car_wash') {
        $status = 'closed';
    }

    $cost = array_key_exists('cost', $data) && $data['cost'] !== '' && $data['cost'] !== null
        ? (float)$data['cost'] : null;
    $nextSvcOdo = !empty($data['next_service_odometer']) ? (int)$data['next_service_odometer'] : null;
    $nextSvcDate = trim($data['next_service_date'] ?? '') ?: null;
    $maintenanceKind = trim($data['maintenance_kind'] ?? '') ?: null;
    $driverNameAtEvent = trim($data['driver_name_at_event'] ?? '') ?: null;

    if ($eventType === 'maintenance') {
        if (!in_array($maintenanceKind, ['normal', 'breakdown'], true)) {
            http_response_code(400);
            return ['success' => false, 'error' => 'maintenance_kind must be normal or breakdown'];
        }
        if ($maintenanceKind === 'breakdown' && $driverNameAtEvent === '') {
            http_response_code(400);
            return ['success' => false, 'error' => 'driver_name_at_event is required for breakdown'];
        }
        if ($maintenanceKind === 'normal') {
            $driverNameAtEvent = $driverNameAtEvent ?: null;
        }
    } else {
        $maintenanceKind = null;
        $driverNameAtEvent = null;
    }

    $vStmt = $db->prepare('SELECT id FROM fleet_vehicles WHERE id = ? AND is_active = 1');
    $vStmt->execute([$vehicleId]);
    if (!$vStmt->fetch()) {
        http_response_code(404);
        return ['success' => false, 'error' => 'Vehicle not found'];
    }

    $imageUrl = null;
    try {
        if (!empty($data['image'])) {
            $imageUrl = saveFleetImage($vehicleId, $data['image'], $eventType);
        }
    } catch (Exception $e) {
        http_response_code(400);
        return ['success' => false, 'error' => $e->getMessage()];
    }

    if ($eventId) {
        $prev = $db->prepare('SELECT * FROM fleet_maintenance_events WHERE id = ? AND vehicle_id = ?');
        $prev->execute([$eventId, $vehicleId]);
        $prevRow = $prev->fetch(PDO::FETCH_ASSOC);
        if (!$prevRow) {
            http_response_code(404);
            return ['success' => false, 'error' => 'Event not found'];
        }
        if ($imageUrl === null) {
            $imageUrl = $prevRow['image_url'];
        }
        $upd = $db->prepare("
            UPDATE fleet_maintenance_events
            SET event_type = ?, event_date = ?, returned_date = ?, description = ?,
                cost = ?, next_service_odometer = ?, next_service_date = ?,
                maintenance_kind = ?, driver_name_at_event = ?,
                image_url = ?, status = ?, recorded_by_id = ?, recorded_by_name = ?, updated_at = NOW()
            WHERE id = ?
        ");
        $upd->execute([
            $eventType, $eventDate, $returnedDate, $description ?: null,
            $cost, $nextSvcOdo, $nextSvcDate,
            $maintenanceKind, $driverNameAtEvent,
            $imageUrl, $status, $userId, $userName, $eventId,
        ]);
        $id = $eventId;
    } else {
        $ins = $db->prepare("
            INSERT INTO fleet_maintenance_events
              (vehicle_id, event_type, event_date, returned_date, description, cost,
               next_service_odometer, next_service_date, maintenance_kind, driver_name_at_event,
               image_url, status, recorded_by_id, recorded_by_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $ins->execute([
            $vehicleId, $eventType, $eventDate, $returnedDate, $description ?: null,
            $cost, $nextSvcOdo, $nextSvcDate, $maintenanceKind, $driverNameAtEvent,
            $imageUrl, $status, $userId, $userName,
        ]);
        $id = (int)$db->lastInsertId();
    }

    if ($eventType === 'service' && $nextSvcOdo) {
        $vehUpd = $db->prepare('UPDATE fleet_vehicles SET next_service_odometer = COALESCE(?, next_service_odometer), updated_at = NOW() WHERE id = ?');
        $vehUpd->execute([$nextSvcOdo, $vehicleId]);
    }

    $row = $db->prepare('SELECT * FROM fleet_maintenance_events WHERE id = ?');
    $row->execute([$id]);
    $fresh = $row->fetch(PDO::FETCH_ASSOC);

    return [
        'success' => true,
        'data' => formatMaintenanceRow($fresh),
        'message' => ucfirst(str_replace('_', ' ', $eventType)) . ' recorded',
    ];
}

function getCleaningOverview($db) {
    ensureFleetTables($db);
    ensureRosterFleetVehicles($db);
    $today = new DateTime('today');
    $overview = [];

    foreach (FLEET_ROSTER_GROUPS as $code) {
        $v = getPrimaryVehicleForCode($db, $code);
        if (!$v) {
            continue;
        }
        $vid = (int)$v['id'];
        $washStmt = $db->prepare("
            SELECT * FROM fleet_maintenance_events
            WHERE vehicle_id = ? AND event_type = 'car_wash'
            ORDER BY event_date DESC, id DESC
            LIMIT 1
        ");
        $washStmt->execute([$vid]);
        $lastWash = $washStmt->fetch(PDO::FETCH_ASSOC);

        $histStmt = $db->prepare("
            SELECT * FROM fleet_maintenance_events
            WHERE vehicle_id = ? AND event_type = 'car_wash'
            ORDER BY event_date DESC, id DESC
            LIMIT 30
        ");
        $histStmt->execute([$vid]);
        $history = array_map('formatMaintenanceRow', $histStmt->fetchAll(PDO::FETCH_ASSOC));

        $daysSince = null;
        if ($lastWash && !empty($lastWash['event_date'])) {
            try {
                $lastDate = new DateTime($lastWash['event_date']);
                $daysSince = (int)$today->diff($lastDate)->format('%a');
            } catch (Exception $e) { /* skip */ }
        }

        $overview[] = [
            'code' => $code,
            'vehicle' => formatVehicleRow($v, buildVehicleAlerts($v)),
            'last_cleaning' => formatMaintenanceRow($lastWash),
            'days_since_cleaning' => $daysSince,
            'history' => $history,
        ];
    }

    return ['success' => true, 'data' => $overview];
}

function formatFuelRow($row, $daysSince = null) {
    return [
        'id' => (int)$row['id'],
        'vehicle_id' => (int)$row['vehicle_id'],
        'fuel_date' => $row['fuel_date'],
        'amount_ksh' => (float)$row['amount_ksh'],
        'liters' => $row['liters'] !== null ? (float)$row['liters'] : null,
        'odometer' => $row['odometer'] !== null ? (int)$row['odometer'] : null,
        'notes' => $row['notes'],
        'recorded_by_name' => $row['recorded_by_name'],
        'days_since_previous' => $daysSince,
        'created_at' => $row['created_at'],
    ];
}

function listFuelLogs($db, $vehicleId = null, $limit = 100) {
    ensureFleetTables($db);
    $sql = "
        SELECT f.*, v.plate_number, v.label AS vehicle_label, v.fleet_group
        FROM fleet_fuel_logs f
        INNER JOIN fleet_vehicles v ON v.id = f.vehicle_id
        WHERE 1=1
    ";
    $bindings = [];
    if ($vehicleId) {
        $sql .= ' AND f.vehicle_id = ?';
        $bindings[] = (int)$vehicleId;
    }
    $sql .= ' ORDER BY f.fuel_date DESC, f.id DESC LIMIT ' . max(1, min(500, (int)$limit));
    $stmt = $db->prepare($sql);
    $stmt->execute($bindings);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $data = [];
    foreach ($rows as $row) {
        $prevStmt = $db->prepare('SELECT fuel_date FROM fleet_fuel_logs WHERE vehicle_id = ? AND fuel_date < ? ORDER BY fuel_date DESC, id DESC LIMIT 1');
        $prevStmt->execute([(int)$row['vehicle_id'], $row['fuel_date']]);
        $prevDate = $prevStmt->fetchColumn();
        $daysSince = null;
        if ($prevDate) {
            try {
                $daysSince = (int)(new DateTime($prevDate))->diff(new DateTime($row['fuel_date']))->format('%a');
            } catch (Exception $e) { /* skip */ }
        }
        $formatted = formatFuelRow($row, $daysSince);
        $formatted['plate_number'] = $row['plate_number'];
        $formatted['vehicle_label'] = $row['vehicle_label'];
        $formatted['fleet_group'] = $row['fleet_group'];
        $data[] = $formatted;
    }

    return ['success' => true, 'data' => $data];
}

function saveFuelLog($db, $userId, $userName, $data) {
    ensureFleetTables($db);
    $vehicleId = (int)($data['vehicle_id'] ?? 0);
    $fuelDate = trim($data['fuel_date'] ?? date('Y-m-d'));
    $amount = isset($data['amount_ksh']) ? (float)$data['amount_ksh'] : 0;
    $liters = array_key_exists('liters', $data) && $data['liters'] !== '' && $data['liters'] !== null
        ? (float)$data['liters'] : null;
    $odometer = array_key_exists('odometer', $data) && $data['odometer'] !== '' && $data['odometer'] !== null
        ? (int)$data['odometer'] : null;
    $notes = trim($data['notes'] ?? '');

    if (!$vehicleId || $amount <= 0) {
        http_response_code(400);
        return ['success' => false, 'error' => 'vehicle_id and amount_ksh are required'];
    }
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fuelDate)) {
        http_response_code(400);
        return ['success' => false, 'error' => 'Invalid fuel_date'];
    }

    $vStmt = $db->prepare('SELECT id FROM fleet_vehicles WHERE id = ? AND is_active = 1');
    $vStmt->execute([$vehicleId]);
    if (!$vStmt->fetch()) {
        http_response_code(404);
        return ['success' => false, 'error' => 'Vehicle not found'];
    }

    $ins = $db->prepare("
        INSERT INTO fleet_fuel_logs
          (vehicle_id, fuel_date, amount_ksh, liters, odometer, notes, recorded_by_id, recorded_by_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ");
    $ins->execute([$vehicleId, $fuelDate, $amount, $liters, $odometer, $notes ?: null, $userId, $userName]);
    $id = (int)$db->lastInsertId();

    $row = $db->prepare('SELECT * FROM fleet_fuel_logs WHERE id = ?');
    $row->execute([$id]);
    $fresh = $row->fetch(PDO::FETCH_ASSOC);

    $prevStmt = $db->prepare('SELECT fuel_date FROM fleet_fuel_logs WHERE vehicle_id = ? AND id != ? ORDER BY fuel_date DESC, id DESC LIMIT 1');
    $prevStmt->execute([$vehicleId, $id]);
    $prevDate = $prevStmt->fetchColumn();
    $daysSince = null;
    if ($prevDate) {
        try {
            $daysSince = (int)(new DateTime($prevDate))->diff(new DateTime($fuelDate))->format('%a');
        } catch (Exception $e) { /* skip */ }
    }

    return [
        'success' => true,
        'data' => formatFuelRow($fresh, $daysSince),
        'message' => 'Fuel log saved',
    ];
}

function getVehicleCareSummary($db, $vehicleId = null) {
    ensureFleetTables($db);
    ensureRosterFleetVehicles($db);
    $today = new DateTime('today');
    $summaries = [];

    $vehicles = [];
    if ($vehicleId) {
        $stmt = $db->prepare('SELECT * FROM fleet_vehicles WHERE id = ? AND is_active = 1');
        $stmt->execute([(int)$vehicleId]);
        $v = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($v) {
            $vehicles[] = $v;
        }
    } else {
        foreach (FLEET_ROSTER_GROUPS as $code) {
            $v = getPrimaryVehicleForCode($db, $code);
            if ($v) {
                $vehicles[] = $v;
            }
        }
    }

    foreach ($vehicles as $v) {
        $vid = (int)$v['id'];
        $fuelStmt = $db->prepare('SELECT * FROM fleet_fuel_logs WHERE vehicle_id = ? ORDER BY fuel_date DESC, id DESC LIMIT 1');
        $fuelStmt->execute([$vid]);
        $lastFuel = $fuelStmt->fetch(PDO::FETCH_ASSOC);
        $daysSinceFuel = null;
        if ($lastFuel && !empty($lastFuel['fuel_date'])) {
            try {
                $daysSinceFuel = (int)(new DateTime($lastFuel['fuel_date']))->diff($today)->format('%a');
            } catch (Exception $e) { /* skip */ }
        }

        $svcStmt = $db->prepare("SELECT * FROM fleet_maintenance_events WHERE vehicle_id = ? AND event_type = 'service' ORDER BY event_date DESC, id DESC LIMIT 1");
        $svcStmt->execute([$vid]);
        $lastService = $svcStmt->fetch(PDO::FETCH_ASSOC);

        $maintCtx = getVehicleMaintenanceContext($db, $vid);

        $summaries[] = [
            'vehicle' => formatVehicleRow($v, buildVehicleAlerts($v)),
            'last_fuel' => $lastFuel ? formatFuelRow($lastFuel, null) : null,
            'days_since_fuel' => $daysSinceFuel,
            'last_service' => $lastService ? formatMaintenanceRow($lastService) : null,
            'last_cleaning' => $maintCtx['last_car_wash'],
            'last_inspection' => $maintCtx['last_inspection_event'],
            'open_maintenance' => $maintCtx['open_garage'],
        ];
    }

    return ['success' => true, 'data' => $summaries];
}

// ── HTTP router ──────────────────────────────────────────────────────────────
$uriPath = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?: '/';
$segments = array_values(array_filter(explode('/', trim($uriPath, '/'))));
if (!empty($segments) && $segments[0] === 'api') {
    array_shift($segments);
}
$base = array_search('fleet', $segments, true);
$subPath = ($base !== false && isset($segments[$base + 1])) ? $segments[$base + 1] : '';
$subId = ($base !== false && isset($segments[$base + 2])) ? $segments[$base + 2] : null;
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    if ($subPath === '' || $subPath === 'vehicles') {
        if ($method === 'GET' && !$subId) {
            echo json_encode(listFleetVehicles($db, $userId, $isManager));
        } elseif ($method === 'PUT' && $subId) {
            $body = json_decode(file_get_contents('php://input'), true) ?? [];
            echo json_encode(updateFleetVehicle($db, $subId, $body, $canManageVehicles));
        } else {
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
        }
    } elseif ($subPath === 'dashboard' && $method === 'GET') {
        echo json_encode(getFleetDashboard($db));
    } elseif ($subPath === 'logs') {
        if ($method === 'GET') {
            echo json_encode(listFleetLogs(
                $db,
                $_GET['vehicle_id'] ?? null,
                $_GET['from'] ?? null,
                $_GET['to'] ?? null
            ));
        } elseif ($method === 'POST') {
            $body = json_decode(file_get_contents('php://input'), true) ?? [];
            echo json_encode(saveFleetLog($db, $userId, $userName, $body));
        } else {
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
        }
    } elseif ($subPath === 'today' && $method === 'GET') {
        $vehicleId = $_GET['vehicle_id'] ?? null;
        if (!$vehicleId) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'vehicle_id required']);
        } else {
            echo json_encode(getTodayLogContext($db, $vehicleId, $_GET['date'] ?? null));
        }
    } elseif ($subPath === 'roster-day' && $method === 'GET') {
        $date = $_GET['date'] ?? date('Y-m-d');
        echo json_encode(getRosterDayFleet($db, $date));
    } elseif ($subPath === 'daily-assignments' && $method === 'POST') {
        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        echo json_encode(saveDailyAssignments($db, $userId, $body, $canAssignDrivers));
    } elseif ($subPath === 'fuel') {
        if ($method === 'GET') {
            echo json_encode(listFuelLogs($db, $_GET['vehicle_id'] ?? null, $_GET['limit'] ?? 100));
        } elseif ($method === 'POST') {
            $body = json_decode(file_get_contents('php://input'), true) ?? [];
            echo json_encode(saveFuelLog($db, $userId, $userName, $body));
        } else {
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
        }
    } elseif ($subPath === 'care-summary' && $method === 'GET') {
        echo json_encode(getVehicleCareSummary($db, $_GET['vehicle_id'] ?? null));
    } elseif ($subPath === 'maintenance') {
        if ($method === 'GET') {
            echo json_encode(listMaintenanceEvents(
                $db,
                $_GET['vehicle_id'] ?? null,
                $_GET['event_type'] ?? null,
                $_GET['limit'] ?? 50
            ));
        } elseif ($method === 'POST') {
            $body = json_decode(file_get_contents('php://input'), true) ?? [];
            echo json_encode(saveMaintenanceEvent($db, $userId, $userName, $body));
        } else {
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
        }
    } elseif ($subPath === 'cleaning' && $method === 'GET') {
        echo json_encode(getCleaningOverview($db));
    } else {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Unknown fleet endpoint']);
    }
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database error: ' . $e->getMessage()]);
}
