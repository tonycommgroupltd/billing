<?php
/**
 * Users Management API
 * Properly handles REST routes for user CRUD operations
 */

require_once __DIR__ . '/helpers.php';

header('Content-Type: application/json');
setCorsHeaders();

// Authentication and Authorization Check
try {
    $token = getAuthToken();
    if (!$token) {
        jsonResponse(['error' => 'Unauthorized - Token required'], 401);
    }

    $decoded = verifyToken($token);
    if (!$decoded) {
        jsonResponse(['error' => 'Unauthorized - Invalid or expired token'], 401);
    }

    // Check if user is admin or super-admin
    $currentUser = getUserWithRoles($decoded['user_id']);
    if (!$currentUser) {
        jsonResponse(['error' => 'User not found'], 404);
    }

    // Ensure all_roles is set (in case user has no roles)
    if (!isset($currentUser['all_roles'])) {
        $currentUser['all_roles'] = [];
    }

    $roleNames = array_map('strtolower', $currentUser['all_roles'] ?? []);
    $canManageUsers = (bool) array_intersect(
        ['administrator', 'super-administrator', 'super-admin'],
        $roleNames
    );
    $canListUsers = $canManageUsers || in_array('manager', $roleNames, true);

    if (!$canListUsers) {
        jsonResponse(['error' => 'Forbidden - Admin access required'], 403);
    }
} catch (Exception $e) {
    jsonResponse([
        'error' => 'Authentication error',
        'message' => $e->getMessage(),
        'file' => basename($e->getFile()),
        'line' => $e->getLine()
    ], 500);
}

$pdo = getDB();

// Parse request - use PATH_INFO like roles-management.php (works better on cPanel)
$method = $_SERVER['REQUEST_METHOD'];
$pathInfo = isset($_SERVER['PATH_INFO']) ? $_SERVER['PATH_INFO'] : '';

// If PATH_INFO is empty, try to extract from REQUEST_URI
if (empty($pathInfo) && isset($_SERVER['REQUEST_URI'])) {
    $uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    // Remove /api/users-management.php or users-management.php prefix
    $uri = str_replace('/api/users-management.php', '', $uri);
    $uri = str_replace('users-management.php', '', $uri);
    $pathInfo = $uri;
}

$parts = explode('/', trim($pathInfo, '/'));
$action = isset($parts[0]) && !empty($parts[0]) ? $parts[0] : '';
$id = isset($parts[1]) && !empty($parts[1]) ? intval($parts[1]) : 0;

try {
    $writeActions = ['add', 'update', 'delete', 'assign-role', 'change-password'];
    if (in_array($action, $writeActions, true) && !$canManageUsers) {
        jsonResponse(['error' => 'Forbidden - Admin access required'], 403);
    }

    switch ($action) {
        case 'add':
            if ($method === 'POST') {
                handleAddUser($pdo);
            } else {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }
            break;
        case 'list':
            if ($method === 'GET') {
                handleListUsers($pdo);
            } else {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }
            break;
        case 'view':
            if ($method === 'GET' && $id > 0) {
                handleViewUser($pdo, $id);
            } else {
                jsonResponse(['error' => 'Invalid ID'], 400);
            }
            break;
        case 'update':
            if ($method === 'PUT' && $id > 0) {
                handleUpdateUser($pdo, $id);
            } else {
                jsonResponse(['error' => 'Invalid ID'], 400);
            }
            break;
        case 'delete':
            if ($method === 'DELETE' && $id > 0) {
                handleDeleteUser($pdo, $id);
            } else {
                jsonResponse(['error' => 'Invalid ID'], 400);
            }
            break;
        case 'assign-role':
            if ($method === 'POST' && $id > 0) {
                handleAssignRole($pdo, $id);
            } else {
                jsonResponse(['error' => 'Invalid ID'], 400);
            }
            break;
        case 'change-password':
            if ($method === 'POST') {
                handleChangePassword($pdo);
            } else {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }
            break;
        case 'search':
            if ($method === 'GET') {
                handleSearchUsers($pdo);
            } else {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }
            break;
        default:
            jsonResponse(['error' => 'Endpoint not found', 'action' => $action], 404);
            break;
    }
} catch (Exception $e) {
    jsonResponse([
        'error' => 'Server error',
        'message' => $e->getMessage(),
        'file' => basename($e->getFile()),
        'line' => $e->getLine()
    ], 500);
}

// ============ HANDLERS ============

function handleAddUser($pdo) {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!is_array($input)) {
        return jsonResponse(['error' => 'Invalid JSON body'], 400);
    }

    $errors = [];
    if (empty($input['name'])) $errors['name'] = 'Name is required';
    if (empty($input['email'])) $errors['email'] = 'Email is required';
    elseif (!filter_var($input['email'], FILTER_VALIDATE_EMAIL)) $errors['email'] = 'Invalid email';
    if (empty($input['password'])) $errors['password'] = 'Password is required';
    elseif (strlen($input['password']) < 6) $errors['password'] = 'Password must be 6+ chars';

    // role_id is optional, but if present it must be valid
    $roleId = null;
    if (isset($input['role_id']) && $input['role_id'] !== '' && $input['role_id'] !== null) {
        $roleId = (int)$input['role_id'];
        if ($roleId <= 0) {
            $errors['role_id'] = 'Invalid role_id';
        }
    }

    if (!empty($errors)) return jsonResponse(['errors' => $errors], 422);

    try {
        // Check email exists
        $stmt = $pdo->prepare('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL');
        $stmt->execute([$input['email']]);
        if ($stmt->fetch()) return jsonResponse(['error' => 'Email already exists'], 409);

        // If role_id provided, ensure role exists
        if ($roleId) {
            $r = $pdo->prepare('SELECT id FROM roles WHERE id = ? LIMIT 1');
            $r->execute([$roleId]);
            if (!$r->fetch()) {
                return jsonResponse(['errors' => ['role_id' => 'Role not found']], 422);
            }
        }

        $hashed = password_hash($input['password'], PASSWORD_BCRYPT);
        $phone = isset($input['phone']) ? $input['phone'] : null;

        $stmt = $pdo->prepare('INSERT INTO users (name, email, phone, password, password_change_at, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW(), NOW())');
        $stmt->execute([$input['name'], $input['email'], $phone, $hashed]);

        $userId = $pdo->lastInsertId();

        if ($roleId) {
            $roleStmt = $pdo->prepare('INSERT INTO model_has_roles (model_id, role_id, model_type) VALUES (?, ?, ?)');
            $roleStmt->execute([$userId, $roleId, 'App\\Models\\User']);
        }

        $user = fetchUserWithRoles($pdo, $userId);
        jsonResponse(['success' => true, 'message' => 'User created', 'data' => $user], 201);
    } catch (PDOException $e) {
        $info = $e->errorInfo ?? null;
        jsonResponse([
            'error' => 'Database error creating user',
            'message' => $e->getMessage(),
            'sql_state' => $info[0] ?? null,
            'sql_code' => $info[1] ?? null
        ], 500);
    }
}

function handleListUsers($pdo) {
    $page = max(1, intval(isset($_GET['page']) ? $_GET['page'] : 1));
    $perPage = min(100, max(1, intval(isset($_GET['per_page']) ? $_GET['per_page'] : 10)));
    $search = trim(isset($_GET['search']) ? $_GET['search'] : '');
    $roleId = isset($_GET['role_id']) && $_GET['role_id'] !== 'null' ? intval($_GET['role_id']) : null;
    
    $offset = ($page - 1) * $perPage;
    
    $query = 'SELECT u.id, u.name, u.email, u.phone, u.avatar, u.last_login, u.created_at, u.updated_at,
                     GROUP_CONCAT(DISTINCT r.id) as role_ids,
                     GROUP_CONCAT(DISTINCT r.name) as role_names,
                     GROUP_CONCAT(DISTINCT r.display_name) as role_display_names
              FROM users u
              LEFT JOIN model_has_roles mhr ON u.id = mhr.model_id AND mhr.model_type = ?
              LEFT JOIN roles r ON mhr.role_id = r.id AND r.guard_name IN ("api", "web")
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
    
    $query .= ' GROUP BY u.id ORDER BY u.created_at DESC LIMIT ' . intval($perPage) . ' OFFSET ' . intval($offset);
    
    $stmt = $pdo->prepare($query);
    $stmt->execute($params);
    $users = $stmt->fetchAll();
    
    // Count total
    $countQuery = 'SELECT COUNT(DISTINCT u.id) as total FROM users u
                   LEFT JOIN model_has_roles mhr ON u.id = mhr.model_id AND mhr.model_type = ?
                   LEFT JOIN roles r ON mhr.role_id = r.id AND r.guard_name IN ("api", "web")
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
    
    $formatted = array_map(function($u) { return formatUser($u); }, $users);
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
    try {
        $input = json_decode(file_get_contents('php://input'), true);
        
        // Log the input for debugging
        error_log("Update user input: " . json_encode($input));
        
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
            $result = $stmt->execute($params);
            error_log("Update result: " . ($result ? 'success' : 'failed'));
        }
        
        // Handle role assignment if provided
        if (isset($input['role_id'])) {
            error_log("Updating role_id: " . $input['role_id']);
            // Remove existing roles
            $stmt = $pdo->prepare('DELETE FROM model_has_roles WHERE model_id = ? AND model_type = ?');
            $stmt->execute([$id, 'App\\Models\\User']);
            
            // Assign new role
            $stmt = $pdo->prepare('INSERT INTO model_has_roles (model_id, role_id, model_type) VALUES (?, ?, ?)');
            $result = $stmt->execute([$id, intval($input['role_id']), 'App\\Models\\User']);
            error_log("Role assignment result: " . ($result ? 'success' : 'failed'));
        }
        
        $user = fetchUserWithRoles($pdo, $id);
        jsonResponse(['success' => true, 'message' => 'User updated', 'data' => $user]);
    } catch (Exception $e) {
        error_log("Error in handleUpdateUser: " . $e->getMessage());
        jsonResponse(['error' => 'Internal server error', 'details' => $e->getMessage()], 500);
    }
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
    
    $id = isset($input['user_id']) ? $input['user_id'] : null;
    if (!$id) return jsonResponse(['error' => 'User ID required'], 400);
    
    $hashed = password_hash($input['password'], PASSWORD_BCRYPT);
    $stmt = $pdo->prepare('UPDATE users SET password = ?, password_change_at = NOW() WHERE id = ?');
    $stmt->execute([$hashed, $id]);
    
    jsonResponse(['success' => true, 'message' => 'Password changed']);
}

function handleSearchUsers($pdo) {
    $search = trim(isset($_GET['search']) ? $_GET['search'] : '');
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
        LEFT JOIN roles r ON mhr.role_id = r.id AND r.guard_name IN ("api", "web")
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
                'name' => trim(isset($names[$idx]) ? $names[$idx] : ''),
                'displayName' => trim(isset($displays[$idx]) ? $displays[$idx] : '')
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
