<?php
/**
 * Users Management API
 * Properly handles REST routes for user CRUD operations
 */

require_once __DIR__ . '/helpers.php';

header('Content-Type: application/json');
setCorsHeaders();

$pdo = getDB();

// Parse request
$method = $_SERVER['REQUEST_METHOD'];
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// Extract action and ID from URI
// URI format: /api/users-management.php/action or /api/users-management.php/action/id
$uri = str_replace('/api/users-management.php', '', $uri);
$parts = array_filter(explode('/', trim($uri, '/')));
$action = isset($parts[0]) ? array_shift($parts) : '';
$id = isset($parts[0]) ? intval($parts[0]) : 0;

try {
    match($action) {
        'add' => ($method === 'POST') ? handleAddUser($pdo) : jsonResponse(['error' => 'Method not allowed'], 405),
        'list' => ($method === 'GET') ? handleListUsers($pdo) : jsonResponse(['error' => 'Method not allowed'], 405),
        'view' => ($method === 'GET' && $id > 0) ? handleViewUser($pdo, $id) : jsonResponse(['error' => 'Invalid ID'], 400),
        'update' => ($method === 'PUT' && $id > 0) ? handleUpdateUser($pdo, $id) : jsonResponse(['error' => 'Invalid ID'], 400),
        'delete' => ($method === 'DELETE' && $id > 0) ? handleDeleteUser($pdo, $id) : jsonResponse(['error' => 'Invalid ID'], 400),
        'assign-role' => ($method === 'POST' && $id > 0) ? handleAssignRole($pdo, $id) : jsonResponse(['error' => 'Invalid ID'], 400),
        'change-password' => ($method === 'POST') ? handleChangePassword($pdo) : jsonResponse(['error' => 'Method not allowed'], 405),
        'search' => ($method === 'GET') ? handleSearchUsers($pdo) : jsonResponse(['error' => 'Method not allowed'], 405),
        default => jsonResponse(['error' => 'Endpoint not found'], 404)
    };
} catch (Exception $e) {
    jsonResponse(['error' => $e->getMessage()], 500);
}

// ============ HANDLERS ============

function handleAddUser($pdo) {
    $input = json_decode(file_get_contents('php://input'), true);
    
    $errors = [];
    if (empty($input['name'])) $errors['name'] = 'Name is required';
    if (empty($input['email'])) $errors['email'] = 'Email is required';
    elseif (!filter_var($input['email'], FILTER_VALIDATE_EMAIL)) $errors['email'] = 'Invalid email';
    if (empty($input['password'])) $errors['password'] = 'Password is required';
    elseif (strlen($input['password']) < 6) $errors['password'] = 'Password must be 6+ chars';
    
    if (!empty($errors)) return jsonResponse(['errors' => $errors], 422);
    
    // Check email exists
    $stmt = $pdo->prepare('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL');
    $stmt->execute([$input['email']]);
    if ($stmt->fetch()) return jsonResponse(['error' => 'Email already exists'], 409);
    
    $hashed = password_hash($input['password'], PASSWORD_BCRYPT);
    $phone = $input['phone'] ?? null;
    
    $stmt = $pdo->prepare('INSERT INTO users (name, email, phone, password, password_change_at, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW(), NOW())');
    $stmt->execute([$input['name'], $input['email'], $phone, $hashed]);
    
    $userId = $pdo->lastInsertId();
    
    if (!empty($input['role_id'])) {
        $roleStmt = $pdo->prepare('INSERT INTO model_has_roles (model_id, role_id, model_type) VALUES (?, ?, ?)');
        $roleStmt->execute([$userId, intval($input['role_id']), 'App\\Models\\User']);
    }
    
    $user = fetchUserWithRoles($pdo, $userId);
    jsonResponse(['success' => true, 'message' => 'User created', 'data' => $user], 201);
}

function handleListUsers($pdo) {
    $page = max(1, intval($_GET['page'] ?? 1));
    $perPage = min(100, max(1, intval($_GET['per_page'] ?? 10)));
    $search = trim($_GET['search'] ?? '');
    $roleId = isset($_GET['role_id']) && $_GET['role_id'] !== 'null' ? intval($_GET['role_id']) : null;
    
    $offset = ($page - 1) * $perPage;
    
    $query = 'SELECT u.id, u.name, u.email, u.phone, u.avatar, u.last_login, u.created_at, u.updated_at,
                     GROUP_CONCAT(DISTINCT r.id) as role_ids,
                     GROUP_CONCAT(DISTINCT r.name) as role_names,
                     GROUP_CONCAT(DISTINCT r.display_name) as role_display_names
              FROM users u
              LEFT JOIN model_has_roles mhr ON u.id = mhr.model_id AND mhr.model_type = ?
              LEFT JOIN roles r ON mhr.role_id = r.id
              WHERE u.deleted_at IS NULL';
    
    $params = ['App\\Models\\User'];
    
    if (!empty($search)) {
        $query .= ' AND (u.name LIKE ? OR u.email LIKE ?)';
        $term = "%$search%";
        $params[] = $term;
        $params[] = $term;
    }
    
    if ($roleId) {
        $query .= ' AND mhr.role_id = ?';
        $params[] = $roleId;
    }
    
    $query .= ' GROUP BY u.id ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
    
    $stmt = $pdo->prepare($query);
    $stmt->execute(array_merge($params, [$perPage, $offset]));
    $users = $stmt->fetchAll();
    
    // Count total
    $countQuery = 'SELECT COUNT(DISTINCT u.id) as total FROM users u
                   LEFT JOIN model_has_roles mhr ON u.id = mhr.model_id AND mhr.model_type = ?
                   LEFT JOIN roles r ON mhr.role_id = r.id
                   WHERE u.deleted_at IS NULL';
    
    $countParams = ['App\\Models\\User'];
    if (!empty($search)) {
        $countQuery .= ' AND (u.name LIKE ? OR u.email LIKE ?)';
        $countParams[] = "%$search%";
        $countParams[] = "%$search%";
    }
    if ($roleId) {
        $countQuery .= ' AND mhr.role_id = ?';
        $countParams[] = $roleId;
    }
    
    $countStmt = $pdo->prepare($countQuery);
    $countStmt->execute($countParams);
    $total = $countStmt->fetch()['total'];
    
    $formatted = array_map(fn($u) => formatUser($u), $users);
    jsonResponse([
        'success' => true,
        'data' => $formatted,
        'pagination' => [
            'page' => $page,
            'per_page' => $perPage,
            'total' => $total,
            'total_pages' => ceil($total / $perPage)
        ]
    ]);
}

function handleViewUser($pdo, $id) {
    $user = fetchUserWithRoles($pdo, $id);
    if (!$user) return jsonResponse(['error' => 'User not found'], 404);
    jsonResponse(['success' => true, 'data' => $user]);
}

function handleUpdateUser($pdo, $id) {
    $input = json_decode(file_get_contents('php://input'), true);
    
    $stmt = $pdo->prepare('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$id]);
    if (!$stmt->fetch()) return jsonResponse(['error' => 'User not found'], 404);
    
    $updates = [];
    $params = [];
    
    if (isset($input['name'])) {
        $updates[] = 'name = ?';
        $params[] = $input['name'];
    }
    if (isset($input['email'])) {
        $updates[] = 'email = ?';
        $params[] = $input['email'];
    }
    if (isset($input['phone'])) {
        $updates[] = 'phone = ?';
        $params[] = $input['phone'] ?: null;
    }
    if (isset($input['avatar'])) {
        $updates[] = 'avatar = ?';
        $params[] = $input['avatar'];
    }
    
    if (!empty($updates)) {
        $updates[] = 'updated_at = NOW()';
        $params[] = $id;
        
        $stmt = $pdo->prepare('UPDATE users SET ' . implode(', ', $updates) . ' WHERE id = ?');
        $stmt->execute($params);
    }
    
    $user = fetchUserWithRoles($pdo, $id);
    jsonResponse(['success' => true, 'message' => 'User updated', 'data' => $user]);
}

function handleDeleteUser($pdo, $id) {
    $stmt = $pdo->prepare('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$id]);
    if (!$stmt->fetch()) return jsonResponse(['error' => 'User not found'], 404);
    
    $stmt = $pdo->prepare('UPDATE users SET deleted_at = NOW() WHERE id = ?');
    $stmt->execute([$id]);
    
    jsonResponse(['success' => true, 'message' => 'User deleted']);
}

function handleAssignRole($pdo, $id) {
    $input = json_decode(file_get_contents('php://input'), true);
    if (empty($input['role_id'])) return jsonResponse(['error' => 'Role ID required'], 400);
    
    // Check user exists
    $stmt = $pdo->prepare('SELECT id FROM users WHERE id = ?');
    $stmt->execute([$id]);
    if (!$stmt->fetch()) return jsonResponse(['error' => 'User not found'], 404);
    
    // Remove existing roles
    $stmt = $pdo->prepare('DELETE FROM model_has_roles WHERE model_id = ? AND model_type = ?');
    $stmt->execute([$id, 'App\\Models\\User']);
    
    // Assign new role
    $stmt = $pdo->prepare('INSERT INTO model_has_roles (model_id, role_id, model_type) VALUES (?, ?, ?)');
    $stmt->execute([$id, intval($input['role_id']), 'App\\Models\\User']);
    
    $user = fetchUserWithRoles($pdo, $id);
    jsonResponse(['success' => true, 'message' => 'Role assigned', 'data' => $user]);
}

function handleChangePassword($pdo) {
    $input = json_decode(file_get_contents('php://input'), true);
    if (empty($input['password'])) return jsonResponse(['error' => 'Password required'], 400);
    if (strlen($input['password']) < 6) return jsonResponse(['error' => 'Password too short'], 400);
    
    $id = $input['user_id'] ?? null;
    if (!$id) return jsonResponse(['error' => 'User ID required'], 400);
    
    $hashed = password_hash($input['password'], PASSWORD_BCRYPT);
    $stmt = $pdo->prepare('UPDATE users SET password = ?, password_change_at = NOW() WHERE id = ?');
    $stmt->execute([$hashed, $id]);
    
    jsonResponse(['success' => true, 'message' => 'Password changed']);
}

function handleSearchUsers($pdo) {
    $search = trim($_GET['search'] ?? '');
    if (strlen($search) < 2) return jsonResponse(['error' => 'Search term too short'], 400);
    
    $stmt = $pdo->prepare('SELECT id, name, email FROM users WHERE (name LIKE ? OR email LIKE ?) AND deleted_at IS NULL LIMIT 20');
    $term = "%$search%";
    $stmt->execute([$term, $term]);
    $users = $stmt->fetchAll();
    
    jsonResponse(['success' => true, 'data' => $users]);
}

// ============ HELPERS ============

function fetchUserWithRoles($pdo, $id) {
    $stmt = $pdo->prepare('
        SELECT u.id, u.name, u.email, u.phone, u.avatar, u.last_login, u.created_at, u.updated_at,
               GROUP_CONCAT(DISTINCT r.id) as role_ids,
               GROUP_CONCAT(DISTINCT r.name) as role_names,
               GROUP_CONCAT(DISTINCT r.display_name) as role_display_names
        FROM users u
        LEFT JOIN model_has_roles mhr ON u.id = mhr.model_id AND mhr.model_type = ?
        LEFT JOIN roles r ON mhr.role_id = r.id
        WHERE u.id = ? AND u.deleted_at IS NULL
        GROUP BY u.id
    ');
    $stmt->execute(['App\\Models\\User', $id]);
    return formatUser($stmt->fetch());
}

function formatUser($user) {
    if (!$user) return null;
    
    $roles = [];
    if (!empty($user['role_names'])) {
        $ids = array_filter(explode(',', $user['role_ids']));
        $names = array_filter(explode(',', $user['role_names']));
        $displays = array_filter(explode(',', $user['role_display_names']));
        
        foreach ($ids as $idx => $roleId) {
            $roles[] = [
                'id' => intval($roleId),
                'name' => trim($names[$idx] ?? ''),
                'displayName' => trim($displays[$idx] ?? '')
            ];
        }
    }
    
    return [
        'id' => intval($user['id']),
        'name' => $user['name'],
        'email' => $user['email'],
        'phone' => $user['phone'],
        'avatar' => $user['avatar'],
        'lastLogin' => $user['last_login'],
        'createdAt' => $user['created_at'],
        'updatedAt' => $user['updated_at'],
        'roles' => $roles
    ];
}

function jsonResponse($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data);
    exit;
}
