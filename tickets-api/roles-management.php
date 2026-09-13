<?php
/**
 * Roles Management API
 * Handles role CRUD operations and permission management
 * 
 * Endpoints:
 * - GET /list - Get all roles with permission counts
 * - POST /add - Create new role
 * - GET /view/{id} - Get role with all permissions
 * - PUT /update/{id} - Update role details
 * - DELETE /delete/{id} - Delete role
 * - POST /assign-permission/{id} - Assign permission to role
 * - POST /revoke-permission/{id} - Remove permission from role
 * - GET /permissions - Get all available permissions
 * - GET /export - Export roles and permissions
 */

header('Content-Type: application/json');

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';

// Set CORS headers
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

    $isAdmin = in_array('administrator', $currentUser['all_roles']) || 
               in_array('super-administrator', $currentUser['all_roles']);

    if (!$isAdmin) {
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

// Database connection
$pdo = getDB();

// Get request method and endpoint
$requestMethod = $_SERVER['REQUEST_METHOD'];
$pathInfo = isset($_SERVER['PATH_INFO']) ? $_SERVER['PATH_INFO'] : '';
$parts = explode('/', trim($pathInfo, '/'));

// Parse action from path
$action = isset($parts[0]) ? $parts[0] : '';
$id = isset($parts[1]) ? intval($parts[1]) : 0;

try {
    switch ($action) {
        case 'list':
            handleListRoles();
            break;
        case 'options':
            handleRoleOptions();
            break;
        case 'add':
            if ($requestMethod === 'POST') {
                handleAddRole();
            }
            break;
        case 'view':
            if ($requestMethod === 'GET' && $id > 0) {
                handleViewRole($id);
            }
            break;
        case 'update':
            if ($requestMethod === 'PUT' && $id > 0) {
                handleUpdateRole($id);
            }
            break;
        case 'delete':
            if ($requestMethod === 'DELETE' && $id > 0) {
                handleDeleteRole($id);
            }
            break;
        case 'assign-permission':
            if ($requestMethod === 'POST' && $id > 0) {
                handleAssignPermission($id);
            }
            break;
        case 'revoke-permission':
            if ($requestMethod === 'POST' && $id > 0) {
                handleRevokePermission($id);
            }
            break;
        case 'permissions':
            if ($requestMethod === 'GET') {
                handleGetPermissions();
            }
            break;
        case 'export':
            if ($requestMethod === 'GET') {
                handleExportRoles();
            }
            break;
        default:
            jsonResponse(['error' => 'Invalid endpoint'], 404);
    }
} catch (Exception $e) {
    jsonResponse(['error' => 'Server error: ' . $e->getMessage()], 500);
}

/**
 * Get all roles with permission counts
 */
function handleListRoles() {
    global $pdo;
    
    $page = isset($_GET['page']) ? max(1, intval($_GET['page'])) : 1;
    $perPage = isset($_GET['per_page']) ? min(100, max(1, intval($_GET['per_page']))) : 10;
    $search = isset($_GET['search']) ? trim($_GET['search']) : '';
    
    $offset = ($page - 1) * $perPage;
    
    // Build query - Filter by api and web guard for frontend
    $query = '
        SELECT r.id, r.name, r.display_name, r.guard_name, r.created_at, r.updated_at,
               COUNT(DISTINCT rhp.permission_id) as permission_count,
               COUNT(DISTINCT mhr.model_id) as user_count
        FROM roles r
        LEFT JOIN role_has_permissions rhp ON r.id = rhp.role_id
        LEFT JOIN model_has_roles mhr ON r.id = mhr.role_id
        WHERE r.guard_name IN ("api", "web")
    ';
    
    $params = [];
    
    // Add search filter
    if (!empty($search)) {
        $query .= ' AND (r.name LIKE ? OR r.display_name LIKE ?)';
        $searchTerm = '%' . $search . '%';
        $params = array_merge($params, [$searchTerm, $searchTerm]);
    }
    
    $query .= ' GROUP BY r.id';
    
    // Get total count
    $countQuery = 'SELECT COUNT(DISTINCT r.id) as total FROM roles r WHERE r.guard_name IN ("api", "web")';
    $countParams = [];
    
    if (!empty($search)) {
        $countQuery .= ' AND (r.name LIKE ? OR r.display_name LIKE ?)';
        $searchTerm = '%' . $search . '%';
        $countParams = array_merge($countParams, [$searchTerm, $searchTerm]);
    }
    
    $countStmt = $pdo->prepare($countQuery);
    $countStmt->execute($countParams);
    $totalRows = $countStmt->fetch()['total'] ?? 0;
    
    // Add pagination
    $query .= ' ORDER BY r.created_at DESC LIMIT ' . intval($perPage) . ' OFFSET ' . intval($offset);
    
    // Execute query
    $stmt = $pdo->prepare($query);
    $stmt->execute($params);
    $roles = $stmt->fetchAll();
    
    // Format response
    $formattedRoles = array_map(function($role) {
        return formatRoleResponse($role);
    }, $roles);
    
    jsonResponse([
        'success' => true,
        'data' => $formattedRoles,
        'pagination' => [
            'page' => $page,
            'per_page' => $perPage,
            'total' => $totalRows,
            'total_pages' => ceil($totalRows / $perPage)
        ]
    ]);
}

/**
 * Get simple role options for dropdowns
 */
function handleRoleOptions() {
    global $pdo;
    
    // Get all api and web guard roles sorted by display name
    $query = 'SELECT id, name, display_name FROM roles WHERE guard_name IN ("api", "web") ORDER BY display_name';
    $stmt = $pdo->prepare($query);
    $stmt->execute();
    $roles = $stmt->fetchAll();
    
    // Format for select dropdown
    $options = [];
    foreach ($roles as $role) {
        $options[] = [
            'value' => $role['id'],
            'label' => $role['display_name'] ?: $role['name']
        ];
    }
    
    jsonResponse([
        'success' => true,
        'data' => $options
    ]);
}

/**
 * Create new role
 */
function handleAddRole() {
    global $pdo;
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    // Validate required fields
    $errors = [];
    if (empty($input['name'])) $errors['name'] = 'Name is required';
    if (empty($input['display_name'])) $errors['display_name'] = 'Display name is required';
    
    if (!empty($errors)) {
        jsonResponse(['error' => 'Validation failed', 'errors' => $errors], 422);
    }
    
    // Check if role name already exists
    $stmt = $pdo->prepare('SELECT id FROM roles WHERE name = ?');
    $stmt->execute([$input['name']]);
    if ($stmt->fetch()) {
        jsonResponse(['error' => 'Role name already exists'], 409);
    }
    
    try {
        $stmt = $pdo->prepare('
            INSERT INTO roles (name, guard_name, display_name, created_at, updated_at)
            VALUES (?, ?, ?, NOW(), NOW())
        ');
        
        $stmt->execute([
            $input['name'],
            'web',
            $input['display_name']
        ]);
        
        $roleId = $pdo->lastInsertId();
        
        // Fetch created role
        $stmt = $pdo->prepare('
            SELECT r.id, r.name, r.display_name, r.guard_name, r.created_at, r.updated_at,
                   COUNT(DISTINCT rhp.permission_id) as permission_count,
                   COUNT(DISTINCT mhr.model_id) as user_count
            FROM roles r
            LEFT JOIN role_has_permissions rhp ON r.id = rhp.role_id
            LEFT JOIN model_has_roles mhr ON r.id = mhr.role_id
            WHERE r.id = ?
            GROUP BY r.id
        ');
        $stmt->execute([$roleId]);
        $role = $stmt->fetch();
        
        jsonResponse([
            'success' => true,
            'message' => 'Role created successfully',
            'data' => formatRoleResponse($role)
        ], 201);
    } catch (Exception $e) {
        jsonResponse(['error' => 'Failed to create role: ' . $e->getMessage()], 500);
    }
}

/**
 * Get role with all permissions
 */
function handleViewRole($id) {
    global $pdo;
    
    $stmt = $pdo->prepare('
        SELECT r.id, r.name, r.display_name, r.guard_name, r.created_at, r.updated_at,
               COUNT(DISTINCT rhp.permission_id) as permission_count,
               COUNT(DISTINCT mhr.model_id) as user_count
        FROM roles r
        LEFT JOIN role_has_permissions rhp ON r.id = rhp.role_id
        LEFT JOIN model_has_roles mhr ON r.id = mhr.role_id
        WHERE r.id = ?
        GROUP BY r.id
    ');
    
    $stmt->execute([$id]);
    $role = $stmt->fetch();
    
    if (!$role) {
        jsonResponse(['error' => 'Role not found'], 404);
    }
    
    // Get all permissions for this role
    $stmt = $pdo->prepare('
        SELECT p.id, p.name
        FROM permissions p
        INNER JOIN role_has_permissions rhp ON p.id = rhp.permission_id
        WHERE rhp.role_id = ?
        ORDER BY p.name
    ');
    $stmt->execute([$id]);
    $permissions = $stmt->fetchAll();
    
    jsonResponse([
        'success' => true,
        'data' => array_merge(formatRoleResponse($role), [
            'permissions' => array_map(function($p) {
                return [
                    'id' => intval($p['id']),
                    'name' => $p['name']
                ];
            }, $permissions)
        ])
    ]);
}

/**
 * Update role details
 */
function handleUpdateRole($id) {
    global $pdo;
    
    // Check if role exists
    $stmt = $pdo->prepare('SELECT id FROM roles WHERE id = ?');
    $stmt->execute([$id]);
    if (!$stmt->fetch()) {
        jsonResponse(['error' => 'Role not found'], 404);
    }
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    try {
        $updateFields = [];
        $params = [];
        
        if (isset($input['display_name'])) {
            $updateFields[] = 'display_name = ?';
            $params[] = $input['display_name'];
        }
        
        if (!empty($updateFields)) {
            $updateFields[] = 'updated_at = NOW()';
            $params[] = $id;
            
            $stmt = $pdo->prepare('UPDATE roles SET ' . implode(', ', $updateFields) . ' WHERE id = ?');
            $stmt->execute($params);
        }
        
        // Fetch updated role
        $stmt = $pdo->prepare('
            SELECT r.id, r.name, r.display_name, r.guard_name, r.created_at, r.updated_at,
                   COUNT(DISTINCT rhp.permission_id) as permission_count,
                   COUNT(DISTINCT mhr.model_id) as user_count
            FROM roles r
            LEFT JOIN role_has_permissions rhp ON r.id = rhp.role_id
            LEFT JOIN model_has_roles mhr ON r.id = mhr.role_id
            WHERE r.id = ?
            GROUP BY r.id
        ');
        $stmt->execute([$id]);
        $role = $stmt->fetch();
        
        jsonResponse([
            'success' => true,
            'message' => 'Role updated successfully',
            'data' => formatRoleResponse($role)
        ]);
    } catch (Exception $e) {
        jsonResponse(['error' => 'Failed to update role: ' . $e->getMessage()], 500);
    }
}

/**
 * Delete role - only if no users have it
 */
function handleDeleteRole($id) {
    global $pdo;
    
    // Check if role exists
    $stmt = $pdo->prepare('SELECT id FROM roles WHERE id = ?');
    $stmt->execute([$id]);
    if (!$stmt->fetch()) {
        jsonResponse(['error' => 'Role not found'], 404);
    }
    
    // Check if any users have this role
    $stmt = $pdo->prepare('SELECT COUNT(*) as count FROM model_has_roles WHERE role_id = ?');
    $stmt->execute([$id]);
    $result = $stmt->fetch();
    
    if ($result['count'] > 0) {
        jsonResponse(['error' => 'Cannot delete role. ' . $result['count'] . ' user(s) have this role.'], 409);
    }
    
    try {
        // Delete role
        $stmt = $pdo->prepare('DELETE FROM roles WHERE id = ?');
        $stmt->execute([$id]);
        
        jsonResponse([
            'success' => true,
            'message' => 'Role deleted successfully'
        ]);
    } catch (Exception $e) {
        jsonResponse(['error' => 'Failed to delete role: ' . $e->getMessage()], 500);
    }
}

/**
 * Assign permission to role
 */
function handleAssignPermission($id) {
    global $pdo;
    
    // Check if role exists
    $stmt = $pdo->prepare('SELECT id FROM roles WHERE id = ?');
    $stmt->execute([$id]);
    if (!$stmt->fetch()) {
        jsonResponse(['error' => 'Role not found'], 404);
    }
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (empty($input['permission_id'])) {
        jsonResponse(['error' => 'permission_id is required'], 422);
    }
    
    // Check if permission exists
    $stmt = $pdo->prepare('SELECT id FROM permissions WHERE id = ?');
    $stmt->execute([intval($input['permission_id'])]);
    if (!$stmt->fetch()) {
        jsonResponse(['error' => 'Permission not found'], 404);
    }
    
    try {
        $stmt = $pdo->prepare('
            INSERT IGNORE INTO role_has_permissions (role_id, permission_id)
            VALUES (?, ?)
        ');
        $stmt->execute([$id, intval($input['permission_id'])]);
        
        jsonResponse([
            'success' => true,
            'message' => 'Permission assigned successfully'
        ]);
    } catch (Exception $e) {
        jsonResponse(['error' => 'Failed to assign permission: ' . $e->getMessage()], 500);
    }
}

/**
 * Remove permission from role
 */
function handleRevokePermission($id) {
    global $pdo;
    
    // Check if role exists
    $stmt = $pdo->prepare('SELECT id FROM roles WHERE id = ?');
    $stmt->execute([$id]);
    if (!$stmt->fetch()) {
        jsonResponse(['error' => 'Role not found'], 404);
    }
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (empty($input['permission_id'])) {
        jsonResponse(['error' => 'permission_id is required'], 422);
    }
    
    try {
        $stmt = $pdo->prepare('
            DELETE FROM role_has_permissions 
            WHERE role_id = ? AND permission_id = ?
        ');
        $stmt->execute([$id, intval($input['permission_id'])]);
        
        jsonResponse([
            'success' => true,
            'message' => 'Permission revoked successfully'
        ]);
    } catch (Exception $e) {
        jsonResponse(['error' => 'Failed to revoke permission: ' . $e->getMessage()], 500);
    }
}

/**
 * Get all available permissions
 */
function handleGetPermissions() {
    global $pdo;
    
    $stmt = $pdo->prepare('SELECT id, name FROM permissions ORDER BY name');
    $stmt->execute();
    $permissions = $stmt->fetchAll();
    
    jsonResponse([
        'success' => true,
        'data' => array_map(function($p) {
            return [
                'id' => intval($p['id']),
                'name' => $p['name']
            ];
        }, $permissions)
    ]);
}

/**
 * Export roles and permissions as JSON
 */
function handleExportRoles() {
    global $pdo;
    
    // Get all roles with their permissions
    $stmt = $pdo->prepare('
        SELECT r.id, r.name, r.display_name, r.guard_name, r.created_at,
               COUNT(DISTINCT rhp.permission_id) as permission_count,
               COUNT(DISTINCT mhr.model_id) as user_count
        FROM roles r
        LEFT JOIN role_has_permissions rhp ON r.id = rhp.role_id
        LEFT JOIN model_has_roles mhr ON r.id = mhr.role_id
        GROUP BY r.id
        ORDER BY r.created_at DESC
    ');
    $stmt->execute();
    $roles = $stmt->fetchAll();
    
    // Get all permissions
    $stmt = $pdo->prepare('SELECT id, name FROM permissions ORDER BY name');
    $stmt->execute();
    $permissions = $stmt->fetchAll();
    
    // Set export headers
    header('Content-Disposition: attachment; filename="roles_' . date('Y-m-d_H-i-s') . '.json"');
    header('Content-Type: application/json');
    
    echo json_encode([
        'exported_at' => date('Y-m-d H:i:s'),
        'total_roles' => count($roles),
        'total_permissions' => count($permissions),
        'roles' => array_map(function($r) {
            return [
                'id' => intval($r['id']),
                'name' => $r['name'],
                'displayName' => $r['display_name'],
                'guardName' => $r['guard_name'],
                'permissionCount' => intval($r['permission_count']),
                'userCount' => intval($r['user_count']),
                'createdAt' => $r['created_at']
            ];
        }, $roles),
        'permissions' => array_map(function($p) {
            return [
                'id' => intval($p['id']),
                'name' => $p['name'],
                'guardName' => $p['guard_name']
            ];
        }, $permissions)
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Format role response
 */
function formatRoleResponse($role) {
    return [
        'id' => intval($role['id']),
        'name' => $role['name'],
        'displayName' => $role['display_name'],
        'guardName' => $role['guard_name'] ?? 'web',
        'permissionCount' => intval($role['permission_count']),
        'userCount' => intval($role['user_count']),
        'createdAt' => $role['created_at'],
        'updatedAt' => $role['updated_at']
    ];
}
