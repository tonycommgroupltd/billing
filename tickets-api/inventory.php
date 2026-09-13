<?php
/**
 * Inventory API
 * Location: api/inventory.php
 * Description: Inventory management system with router image uploads
 * Access: api.tonycommgroupltd.com/api/inventory.php
 */

require_once __DIR__ . '/helpers.php';

setCorsHeaders();
header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];

// Parse the request path - handle both direct calls and calls through index.php
$pathInfo = $_SERVER['PATH_INFO'] ?? '';
$requestUri = $_SERVER['REQUEST_URI'] ?? '';

// Try to extract path from REQUEST_URI if PATH_INFO is empty
if (empty($pathInfo) && !empty($requestUri)) {
    $parsedUri = parse_url($requestUri);
    $path = $parsedUri['path'] ?? '';
    
    // Remove query string if present
    $path = strtok($path, '?');
    
    // Split path into parts
    $pathParts = array_filter(explode('/', trim($path, '/')));
    $pathParts = array_values($pathParts); // Re-index array
    
    // Find 'inventory' in path and get what comes after
    $inventoryIndex = array_search('inventory', $pathParts);
    if ($inventoryIndex !== false && isset($pathParts[$inventoryIndex + 1])) {
        // Get the part after 'inventory'
        $action = $pathParts[$inventoryIndex + 1];
        $id = $pathParts[$inventoryIndex + 2] ?? null;
    } else {
        // If 'inventory' not found, try to get first part after 'api'
        $apiIndex = array_search('api', $pathParts);
        if ($apiIndex !== false && isset($pathParts[$apiIndex + 2])) {
            // Skip 'api' and 'inventory', get next part
            $action = $pathParts[$apiIndex + 2];
            $id = $pathParts[$apiIndex + 3] ?? null;
        } else {
            // Last resort: get first non-empty part
            $action = $pathParts[0] ?? '';
            $id = $pathParts[1] ?? null;
        }
    }
} else if (!empty($pathInfo)) {
    // Use PATH_INFO (like tickets.php)
    $request = explode('/', trim($pathInfo, '/'));
    $action = $request[0] ?? '';
    $id = $request[1] ?? null;
} else {
    // Fallback
    $action = '';
    $id = null;
}

// Debug logging (remove in production)
if (isset($_GET['debug'])) {
    error_log("=== Inventory API Debug ===");
    error_log("PATH_INFO: " . ($pathInfo ?: 'empty'));
    error_log("REQUEST_URI: " . ($requestUri ?: 'empty'));
    error_log("Action: " . ($action ?: 'empty'));
    error_log("ID: " . ($id ?: 'empty'));
    error_log("Method: $method");
    error_log("========================");
}

// If accessing inventory.php directly without action, show API info
if (empty($action) || $action === 'inventory.php') {
    if ($method === 'GET') {
        echo json_encode([
            'success' => true,
            'name' => 'Inventory API',
            'version' => '1.0',
            'endpoints' => [
                'GET /api/inventory/items' => 'Get all inventory items',
                'GET /api/inventory/items/{id}' => 'Get single inventory item',
                'POST /api/inventory/items' => 'Add new inventory item (with image support)',
                'PUT /api/inventory/items/{id}' => 'Update inventory item',
                'DELETE /api/inventory/items/{id}' => 'Delete inventory item',
                'GET /api/inventory/categories' => 'Get all categories',
                'GET /api/inventory/stats' => 'Get inventory statistics'
            ],
            'database' => 'tonycommgroupltd_db'
        ]);
        exit();
    }
}

try {
    $db = getDB();
    
    // Route based on action
    if ($action === 'items') {
        if ($method === 'GET') {
            if ($id) {
                getInventoryItem($db, $id);
            } else {
                listInventoryItems($db);
            }
        } elseif ($method === 'POST') {
            addInventoryItem($db);
        } elseif ($method === 'PUT' && $id) {
            updateInventoryItem($db, $id);
        } elseif ($method === 'DELETE' && $id) {
            deleteInventoryItem($db, $id);
        } else {
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
        }
    } elseif ($action === 'categories') {
        if ($method === 'GET') {
            getCategories($db);
        } else {
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
        }
    } elseif ($action === 'stats') {
        if ($method === 'GET') {
            getInventoryStats($db);
        } else {
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
        }
    } elseif ($action === 'pending-balances') {
        if ($method === 'GET') {
            listTechnicianPendingBalances($db);
        } else {
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
        }
    } elseif ($action === 'disbursements') {
        if ($method === 'GET') {
            listDisbursements($db);
        } elseif ($method === 'POST' && $id && strpos($_SERVER['REQUEST_URI'] ?? '', '/return') !== false) {
            // POST /inventory/disbursements/{id}/return
            returnDisbursement($db, $id);
        } elseif ($method === 'POST') {
            createDisbursement($db);
        } elseif ($method === 'DELETE' && $id) {
            deleteDisbursement($db, $id);
        } else {
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
        }
    } elseif ($action === 'users') {
        if ($method === 'GET') {
            getInventoryUsers($db);
        } else {
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
        }
    } elseif ($action === 'search-serial') {
        // GET /inventory/search-serial?q=XXXX  — find routers by last-4 of serial
        if ($method === 'GET') {
            searchRouterBySerial($db);
        } else {
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
        }
    } elseif ($action === 'finalize-assignment') {
        // POST /inventory/finalize-assignment — send summary SMS + notification when admin clicks Done
        if ($method === 'POST') {
            finalizeAssignment($db);
        } else {
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
        }
    } elseif ($action === 'discarded') {
        // GET /inventory/discarded — drop cable write-offs (does not restock warehouse)
        if ($method === 'GET') {
            listDiscardedCable($db);
        } else {
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
        }
    } elseif ($action === 'cable-usage') {
        // GET /inventory/cable-usage?roll=T400 — numbered roll ticket usage report
        if ($method === 'GET') {
            listCableRollUsage($db);
        } else {
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
        }
    } elseif ($action === 'activity-logs') {
        // GET /inventory/activity-logs — merged audit trail (adds, deletes, disbursements)
        if ($method === 'GET') {
            getActivityLogs($db);
        } else {
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
        }
    } elseif ($action === 'link-ticket') {
        // POST /inventory/link-ticket  — attach a router to a ticket
        if ($method === 'POST') {
            linkRouterToTicket($db);
        } else {
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
        }
    } elseif ($action === 'requests') {
        if ($method === 'GET') {
            if ($id) {
                getRequest($db, $id);
            } else {
                listRequests($db);
            }
        } elseif ($method === 'POST') {
            if ($id && strpos($_SERVER['REQUEST_URI'] ?? '', '/approve') !== false) {
                approveRequest($db, $id);
            } elseif ($id && strpos($_SERVER['REQUEST_URI'] ?? '', '/reject') !== false) {
                rejectRequest($db, $id);
            } else {
                createRequest($db);
            }
        } else {
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
        }
    } else {
        http_response_code(404);
        echo json_encode([
            'success' => false, 
            'error' => 'Endpoint not found',
            'action' => $action,
            'method' => $method,
            'path_info' => $pathInfo ?? 'none',
            'request_uri' => $requestUri ?? 'none'
        ]);
    }
    
} catch (PDOException $e) {
    http_response_code(500);
    error_log("Inventory API PDO Error: " . $e->getMessage());
    echo json_encode([
        'success' => false,
        'error' => 'Database error: ' . $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine()
    ]);
} catch (Exception $e) {
    http_response_code(500);
    error_log("Inventory API Error: " . $e->getMessage());
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine()
    ]);
}

// =============================================
// CHECK IF TABLE EXISTS
// =============================================
function checkInventoryTable($db) {
    try {
        $sql = "SHOW TABLES LIKE 'inventory_items'";
        $stmt = $db->prepare($sql);
        $stmt->execute();
        $result = $stmt->fetch();
        return !empty($result);
    } catch (Exception $e) {
        return false;
    }
}

// =============================================
// CREATE TABLE IF NOT EXISTS
// =============================================
function createInventoryTable($db) {
    try {
        $sql = "CREATE TABLE IF NOT EXISTS `inventory_items` (
          `id`                 BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          `name`               VARCHAR(255) NOT NULL                    COMMENT 'Router number / item name',
          `description`        TEXT DEFAULT NULL                        COMMENT 'Item description (legacy)',
          `category`           VARCHAR(100) DEFAULT NULL                COMMENT 'e.g. GPON Router, Tools',
          `quantity_available` INT(11) NOT NULL DEFAULT 0               COMMENT 'Available quantity',
          `quantity_total`     INT(11) NOT NULL DEFAULT 0               COMMENT 'Total quantity',
          `quantity_requested` INT(11) NOT NULL DEFAULT 0               COMMENT 'Requested quantity',
          `quantity_disbursed` INT(11) NOT NULL DEFAULT 0               COMMENT 'Disbursed quantity',
          `unit`               VARCHAR(50) DEFAULT 'pcs'               COMMENT 'Unit of measurement',
          `minimum_quantity`   INT(11) DEFAULT 5                        COMMENT 'Minimum stock level',
          `unit_price`         DECIMAL(10,2) DEFAULT 0.00              COMMENT 'Unit price',
          `is_serialized`      TINYINT(1) DEFAULT 0                    COMMENT 'Has serial numbers',
          `serial_number`      VARCHAR(100) DEFAULT NULL                COMMENT 'Scanned barcode / serial',
          `status`             ENUM('active','disbursed','inactive','faulty') NOT NULL DEFAULT 'active',
          `image_url`          VARCHAR(500) DEFAULT NULL,
          `added_by_id`        BIGINT(20) UNSIGNED DEFAULT NULL         COMMENT 'FK to users.id',
          `added_by_name`      VARCHAR(255) DEFAULT NULL                COMMENT 'Name of uploader',
          `comment`            TEXT DEFAULT NULL                        COMMENT 'Free-text remark',
          `created_at`         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          `updated_at`         TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY `uq_serial_number`  (`serial_number`),
          UNIQUE KEY `uq_name_category`  (`name`, `category`),
          KEY `idx_category`    (`category`),
          KEY `idx_status`      (`status`),
          KEY `idx_added_by_id` (`added_by_id`),
          KEY `idx_created_at`  (`created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Inventory items table';";
        
        $db->exec($sql);
        return true;
    } catch (Exception $e) {
        error_log("Failed to create inventory_items table: " . $e->getMessage());
        return false;
    }
}

// =============================================
// LIST INVENTORY ITEMS
// =============================================
function listInventoryItems($db) {
    try {
        // Check if table exists, create if not
        if (!checkInventoryTable($db)) {
            if (!createInventoryTable($db)) {
                http_response_code(500);
                echo json_encode([
                    'success' => false,
                    'error' => 'Failed to create inventory_items table. Please run the SQL schema manually.'
                ]);
                return;
            }
        }
        
        $params = $_GET ?? [];
        $search = $params['search'] ?? '';
        $category = $params['category'] ?? '';
        $status = $params['status'] ?? '';
        
        // Default to showing active items if no status filter is specified
        $sql = "SELECT * FROM inventory_items WHERE 1=1";
        $conditions = [];
        $bindings = [];
        
        // Only filter by status if explicitly provided, otherwise show all (including active)
        // This ensures newly added items with status='active' are shown
        if (!empty($status)) {
            $conditions[] = "status = ?";
            $bindings[] = $status;
        }
        
        if (!empty($search)) {
            $conditions[] = "(name LIKE ? OR description LIKE ? OR serial_number LIKE ? OR comment LIKE ? OR added_by_name LIKE ?)";
            $searchTerm = "%$search%";
            $bindings[] = $searchTerm;
            $bindings[] = $searchTerm;
            $bindings[] = $searchTerm;
            $bindings[] = $searchTerm;
            $bindings[] = $searchTerm;
        }
        
        if (!empty($category)) {
            $conditions[] = "category = ?";
            $bindings[] = $category;
        }
        
        if (!empty($conditions)) {
            $sql .= " AND " . implode(" AND ", $conditions);
        }
        
        $sql .= " ORDER BY created_at DESC";
        
        $stmt = $db->prepare($sql);
        $stmt->execute($bindings);
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        error_log("List inventory items - Found " . count($items) . " items");
        if (count($items) > 0) {
            error_log("First item: " . json_encode($items[0]));
        }
        
        // Format items
        foreach ($items as &$item) {
            $item = formatInventoryItem($item);
        }
        
        echo json_encode([
            'success' => true,
            'data' => $items,
            'count' => count($items)
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Database error: ' . $e->getMessage()
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Error: ' . $e->getMessage()
        ]);
    }
}

// =============================================
// GET SINGLE INVENTORY ITEM
// =============================================
function getInventoryItem($db, $id) {
    try {
        // Check if table exists, create if not
        if (!checkInventoryTable($db)) {
            if (!createInventoryTable($db)) {
                http_response_code(500);
                echo json_encode([
                    'success' => false,
                    'error' => 'Failed to create inventory_items table. Please run the SQL schema manually.'
                ]);
                return;
            }
        }
        
        $sql = "SELECT * FROM inventory_items WHERE id = ?";
        $stmt = $db->prepare($sql);
        $stmt->execute([$id]);
        $item = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$item) {
            http_response_code(404);
            echo json_encode([
                'success' => false,
                'error' => 'Item not found'
            ]);
            return;
        }
        
        echo json_encode([
            'success' => true,
            'data' => formatInventoryItem($item)
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Database error: ' . $e->getMessage()
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Error: ' . $e->getMessage()
        ]);
    }
}

// =============================================
// ADD INVENTORY ITEM
// =============================================
function addInventoryItem($db) {
    $transactionActive = false;
    try {
        // Check if table exists, create if not
        if (!checkInventoryTable($db)) {
            if (!createInventoryTable($db)) {
                http_response_code(500);
                echo json_encode([
                    'success' => false,
                    'error' => 'Failed to create inventory_items table. Please run the SQL schema manually.'
                ]);
                return;
            }
        }
        
        $data = getRequestBody();
        $inputSerial = trim((string)($data['serial_number'] ?? ''));
        
        // Validate required fields
        if (empty($data['name']) && $inputSerial === '') {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'error' => 'Name or serial number is required'
            ]);
            return;
        }
        
        $db->beginTransaction();
        $transactionActive = true;
        
        try {
        // Handle router number auto-generation if it's a router
        $serialNumber = $inputSerial;
        if (empty($serialNumber) && !empty($data['category']) && 
            (stripos($data['category'], 'router') !== false || stripos($data['category'], 'GPON') !== false)) {
            // Auto-generate router number
            $serialNumber = generateNextRouterNumber($db);
            $data['serial_number'] = $serialNumber;
            // Also update name if not provided
            if (empty($data['name'])) {
                $data['name'] = "Router $serialNumber";
            }
        }
        
        // For non-serialized items, persist NULL instead of empty string so UNIQUE(serial_number)
        // does not fail on duplicate '' values.
        if ($serialNumber === '') {
            $serialNumber = null;
        }

        // Prepare data
        $name = $data['name'] ?? "Router {$serialNumber}";
        $description = $data['description'] ?? '';
        $category = $data['category'] ?? 'Other';
        $quantity = intval($data['quantity'] ?? 1);
        $unit = $data['unit'] ?? 'pcs';
        $minimumQuantity = intval($data['minimum_quantity'] ?? 1);
        $unitPrice = floatval($data['unit_price'] ?? 0);
        $isSerialized = !empty($data['is_serialized']) ? 1 : 0;
        $status = $data['status'] ?? 'active';
        $addedById   = !empty($data['added_by_id'])   ? intval($data['added_by_id'])   : null;
        $addedByName = $data['added_by_name'] ?? null;
        $comment     = $data['comment'] ?? null;

        // --- Duplicate checks (return 409 so the frontend can show a clear error) ---
        if (!empty($serialNumber)) {
            $dupSerial = $db->prepare("SELECT id FROM inventory_items WHERE serial_number = ? LIMIT 1");
            $dupSerial->execute([$serialNumber]);
            if ($dupSerial->fetch()) {
                http_response_code(409);
                echo json_encode([
                    'success' => false,
                    'error'   => "Serial number {$serialNumber} already exists in inventory",
                    'code'    => 'DUPLICATE_SERIAL'
                ]);
                $db->rollBack();
                return;
            }
        }
        // Only enforce unique (name, category) for GPON Routers
        if (!empty($name) && $category === 'GPON Router') {
            $dupName = $db->prepare("SELECT id FROM inventory_items WHERE name = ? AND category = ? LIMIT 1");
            $dupName->execute([$name, $category]);
            if ($dupName->fetch()) {
                http_response_code(409);
                echo json_encode([
                    'success' => false,
                    'error'   => "Router number {$name} already exists in inventory",
                    'code'    => 'DUPLICATE_ROUTER_NUMBER'
                ]);
                $db->rollBack();
                return;
            }
        }

        // Insert inventory item
        $sql = "INSERT INTO inventory_items 
                (name, description, category, quantity_available, quantity_total, 
                 unit, minimum_quantity, unit_price, is_serialized, serial_number, 
                 status, added_by_id, added_by_name, comment, created_at, updated_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())";
        
        $stmt = $db->prepare($sql);
        $stmt->execute([
            $name, $description, $category, $quantity, $quantity,
            $unit, $minimumQuantity, $unitPrice, $isSerialized, $serialNumber,
            $status, $addedById, $addedByName, $comment
        ]);
        
        $itemId = $db->lastInsertId();
        
        // Handle image upload if provided
        $imageUrl = null;
        if (!empty($data['image'])) {
            $imageUrl = saveInventoryImage($db, $itemId, $data['image'], $data['image_name'] ?? null);
        }
        
        // Update item with image URL if saved
        if ($imageUrl) {
            $updateSql = "UPDATE inventory_items SET image_url = ? WHERE id = ?";
            $updateStmt = $db->prepare($updateSql);
            $updateStmt->execute([$imageUrl, $itemId]);
        }
        
        $db->commit();
        
        // Get the created item
        $sql = "SELECT * FROM inventory_items WHERE id = ?";
        $stmt = $db->prepare($sql);
        $stmt->execute([$itemId]);
        $item = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$item) {
            throw new Exception('Failed to retrieve created item');
        }

        // New numbered drop-cable roll starts with full meters available
        if (isDropCableRollItem($item)) {
            $mpp = resolveDropCableMetersFromItemRow($item) ?: 1000;
            setCableRollRemainingMeters($db, $itemId, $mpp);
            $item['remaining_meters'] = $mpp;
        }
        
        $formattedItem = formatInventoryItem($item);

        // Log the add event
        $logAction = (stripos($category, 'router') !== false || stripos($category, 'GPON') !== false)
            ? 'router_added' : 'item_added';
        logInventoryActivity($db, $logAction, $itemId, $name, $category, $serialNumber ?: null, $quantity, $addedById, $addedByName, $comment ?: '');
        
        error_log("Inventory item created successfully - ID: $itemId, Name: {$formattedItem['name']}, Serial: {$formattedItem['serial_number']}");
        
        echo json_encode([
            'success' => true,
            'data' => $formattedItem,
            'message' => 'Inventory item added successfully'
        ]);
        
        } catch (Exception $e) {
            if ($transactionActive) {
                $db->rollBack();
                $transactionActive = false;
            }
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'error' => 'Failed to add inventory item: ' . $e->getMessage()
            ]);
            return;
        }
    } catch (PDOException $e) {
        if ($transactionActive) {
            $db->rollBack();
            $transactionActive = false;
        }
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Database error: ' . $e->getMessage()
        ]);
    } catch (Exception $e) {
        if ($transactionActive) {
            $db->rollBack();
            $transactionActive = false;
        }
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Error: ' . $e->getMessage()
        ]);
    }
}

// =============================================
// UPDATE INVENTORY ITEM
// =============================================
function updateInventoryItem($db, $id) {
    $transactionActive = false;
    $pendingActivityLog = null;
    try {
        $data = getRequestBody();

        // DDL must run outside transactions (MySQL implicit commit).
        ensureActivityLogTable($db);
        
        // Check if item exists
        $checkSql = "SELECT * FROM inventory_items WHERE id = ?";
        $checkStmt = $db->prepare($checkSql);
        $checkStmt->execute([$id]);
        $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);
        if (!$existing) {
            http_response_code(404);
            echo json_encode([
                'success' => false,
                'error' => 'Item not found'
            ]);
            return;
        }
        
        $db->beginTransaction();
        $transactionActive = true;
        
        try {
            $updates = [];
            $bindings = [];

            // Optional actor metadata for audit logs
            $actorId   = !empty($data['actor_id']) ? intval($data['actor_id']) : null;
            $actorName = trim($data['actor_name'] ?? '');
            
            if (array_key_exists('serial_number', $data)) {
                $normalizedSerial = trim((string)$data['serial_number']);
                $data['serial_number'] = ($normalizedSerial === '') ? null : $normalizedSerial;
            }

            $fields = ['name', 'description', 'category', 'unit', 'minimum_quantity',
                       'unit_price', 'is_serialized', 'serial_number', 'status',
                       'added_by_id', 'added_by_name', 'comment', 'ticket_id', 'ticket_number'];
            
            foreach ($fields as $field) {
                if (isset($data[$field])) {
                    $updates[] = "$field = ?";
                    $bindings[] = $data[$field];
                }
            }

            // Stock adjustment flow for non-router items (preferred over raw quantity overwrite)
            // Example: +10 restock, -4 returned/damaged/issued correction.
            if (isset($data['stock_adjustment']) && $data['stock_adjustment'] !== '') {
                $adj = intval($data['stock_adjustment']);
                if ($adj !== 0) {
                    $reason = trim($data['stock_reason'] ?? '');
                    if ($reason === '') {
                        if ($db->inTransaction()) {
                            $db->rollBack();
                        }
                        $transactionActive = false;
                        http_response_code(400);
                        echo json_encode([
                            'success' => false,
                            'error' => 'Reason is required for stock adjustment'
                        ]);
                        return;
                    }

                    $isRouter = stripos($existing['category'] ?? '', 'router') !== false;
                    if ($isRouter) {
                        if ($db->inTransaction()) {
                            $db->rollBack();
                        }
                        $transactionActive = false;
                        http_response_code(400);
                        echo json_encode([
                            'success' => false,
                            'error' => 'Stock adjustment is only for non-router items'
                        ]);
                        return;
                    }

                    $currentAvailable = intval($existing['quantity_available'] ?? 0);
                    $currentTotal     = intval($existing['quantity_total'] ?? 0);
                    $newAvailable     = $currentAvailable + $adj;
                    $newTotal         = $currentTotal + $adj;

                    if ($newAvailable < 0 || $newTotal < 0) {
                        if ($db->inTransaction()) {
                            $db->rollBack();
                        }
                        $transactionActive = false;
                        http_response_code(409);
                        echo json_encode([
                            'success' => false,
                            'error' => "Invalid adjustment. Available: {$currentAvailable}, Total: {$currentTotal}, Adjustment: {$adj}"
                        ]);
                        return;
                    }

                    $updates[] = "quantity_available = ?";
                    $bindings[] = $newAvailable;
                    $updates[] = "quantity_total = ?";
                    $bindings[] = $newTotal;

                    // Log after commit — DDL in ensureActivityLogTable breaks open transactions.
                    $dir    = $adj > 0 ? 'increased' : 'decreased';
                    $note   = "Stock {$dir} by " . abs($adj) .
                              " (available: {$currentAvailable} -> {$newAvailable}, total: {$currentTotal} -> {$newTotal})" .
                              ($reason ? " | Reason: {$reason}" : "");
                    $pendingActivityLog = [
                        'action'       => 'item_stock_adjusted',
                        'item_id'      => $existing['id'],
                        'item_name'    => $existing['name'],
                        'item_category'=> $existing['category'] ?? null,
                        'serial_number'=> $existing['serial_number'] ?? null,
                        'quantity'     => $adj,
                        'actor_id'     => $actorId,
                        'actor_name'   => $actorName ?: null,
                        'notes'        => $note,
                    ];
                }
            }
            
            if (isset($data['quantity'])) {
                $updates[] = "quantity_available = ?";
                $updates[] = "quantity_total = ?";
                $bindings[] = intval($data['quantity']);
                $bindings[] = intval($data['quantity']);
            }
            
            // Handle image update
            if (!empty($data['image'])) {
                $imageUrl = saveInventoryImage($db, $id, $data['image'], $data['image_name'] ?? null);
                if ($imageUrl) {
                    $updates[] = "image_url = ?";
                    $bindings[] = $imageUrl;
                }
            }
            
            if (empty($updates)) {
                if ($db->inTransaction()) {
                    $db->rollBack();
                }
                $transactionActive = false;
                http_response_code(400);
                echo json_encode([
                    'success' => false,
                    'error' => 'No fields to update'
                ]);
                return;
            }
            
            $updates[] = "updated_at = NOW()";
            $bindings[] = $id;
            
            $sql = "UPDATE inventory_items SET " . implode(", ", $updates) . " WHERE id = ?";
            $stmt = $db->prepare($sql);
            $stmt->execute($bindings);
            
            if ($db->inTransaction()) {
                $db->commit();
            }
            $transactionActive = false;

            if ($pendingActivityLog) {
                logInventoryActivity(
                    $db,
                    $pendingActivityLog['action'],
                    $pendingActivityLog['item_id'],
                    $pendingActivityLog['item_name'],
                    $pendingActivityLog['item_category'],
                    $pendingActivityLog['serial_number'],
                    $pendingActivityLog['quantity'],
                    $pendingActivityLog['actor_id'],
                    $pendingActivityLog['actor_name'],
                    $pendingActivityLog['notes']
                );
            }
            
            // Get updated item
            $sql = "SELECT * FROM inventory_items WHERE id = ?";
            $stmt = $db->prepare($sql);
            $stmt->execute([$id]);
            $item = $stmt->fetch(PDO::FETCH_ASSOC);
            
            echo json_encode([
                'success' => true,
                'data' => formatInventoryItem($item),
                'message' => 'Inventory item updated successfully'
            ]);
            
        } catch (Exception $e) {
            if ($transactionActive && $db->inTransaction()) {
                $db->rollBack();
                $transactionActive = false;
            }
            throw $e;
        }
    } catch (PDOException $e) {
        if ($transactionActive && $db->inTransaction()) {
            $db->rollBack();
            $transactionActive = false;
        }
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Database error: ' . $e->getMessage()
        ]);
    } catch (Exception $e) {
        if ($transactionActive && $db->inTransaction()) {
            $db->rollBack();
            $transactionActive = false;
        }
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Error: ' . $e->getMessage()
        ]);
    }
}

// =============================================
// DELETE INVENTORY ITEM
// =============================================
function deleteInventoryItem($db, $id) {
    // Fetch item before deletion so we can log it
    $checkStmt = $db->prepare("SELECT id, name, category, serial_number, quantity_available, added_by_id, added_by_name FROM inventory_items WHERE id = ?");
    $checkStmt->execute([$id]);
    $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);
    if (!$existing) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Item not found']);
        return;
    }

    // Who is performing the delete? Accept actor from request body or query string
    $body = getRequestBody();
    $actorId   = !empty($body['deleted_by_id'])   ? intval($body['deleted_by_id'])   : null;
    $actorName = $body['deleted_by_name'] ?? null;

    // Delete item
    $db->prepare("DELETE FROM inventory_items WHERE id = ?")->execute([$id]);

    // Log the deletion
    $logAction = (stripos($existing['category'] ?? '', 'router') !== false || stripos($existing['category'] ?? '', 'GPON') !== false)
        ? 'router_deleted' : 'item_deleted';
    logInventoryActivity($db, $logAction, $existing['id'], $existing['name'], $existing['category'] ?? null, $existing['serial_number'] ?? null, $existing['quantity_available'] ?? 1, $actorId, $actorName, 'Deleted from inventory');

    echo json_encode(['success' => true, 'message' => 'Inventory item deleted successfully']);
}

// =============================================
// GET CATEGORIES
// =============================================
function getCategories($db) {
    try {
        // Check if table exists, create if not
        if (!checkInventoryTable($db)) {
            if (!createInventoryTable($db)) {
                http_response_code(500);
                echo json_encode([
                    'success' => false,
                    'error' => 'Failed to create inventory_items table. Please run the SQL schema manually.'
                ]);
                return;
            }
        }
        
        $sql = "SELECT DISTINCT category FROM inventory_items WHERE category IS NOT NULL AND category != '' ORDER BY category";
        $stmt = $db->prepare($sql);
        $stmt->execute();
        $categories = $stmt->fetchAll(PDO::FETCH_COLUMN);
        
        echo json_encode([
            'success' => true,
            'data' => $categories
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Database error: ' . $e->getMessage()
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Error: ' . $e->getMessage()
        ]);
    }
}

// =============================================
// GET INVENTORY STATS
// =============================================
function getInventoryStats($db) {
    try {
        // Check if table exists, create if not
        if (!checkInventoryTable($db)) {
            if (!createInventoryTable($db)) {
                http_response_code(500);
                echo json_encode([
                    'success' => false,
                    'error' => 'Failed to create inventory_items table. Please run the SQL schema manually.'
                ]);
                return;
            }
        }
        
        $sql = "SELECT 
                    COUNT(*) as total_items,
                    SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_items,
                    SUM(CASE WHEN quantity_available < minimum_quantity THEN 1 ELSE 0 END) as low_stock_items,
                    SUM(quantity_available) as total_quantity_available
                FROM inventory_items";
        $stmt = $db->prepare($sql);
        $stmt->execute();
        $stats = $stmt->fetch(PDO::FETCH_ASSOC);
        
        echo json_encode([
            'success' => true,
            'data' => $stats
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Database error: ' . $e->getMessage()
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Error: ' . $e->getMessage()
        ]);
    }
}

// =============================================
// GENERATE NEXT ROUTER NUMBER
// =============================================
function generateNextRouterNumber($db) {
    try {
        // Check if table exists first
        if (!checkInventoryTable($db)) {
            return "B860";
        }
        
        // Get the highest router number starting with B, but only >= B860
        // This ignores older routers (B8250, etc.) and starts fresh from B860
        $startNumber = 860;
        $sql = "SELECT serial_number FROM inventory_items 
                WHERE serial_number LIKE 'B%' 
                AND serial_number REGEXP '^B[0-9]+$'
                AND CAST(SUBSTRING(serial_number, 2) AS UNSIGNED) >= ?
                ORDER BY CAST(SUBSTRING(serial_number, 2) AS UNSIGNED) DESC 
                LIMIT 1";
        
        $stmt = $db->prepare($sql);
        $stmt->execute([$startNumber]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($result && !empty($result['serial_number'])) {
            // Extract number from B860 -> 860
            $currentNumber = intval(substr($result['serial_number'], 1));
            $nextNumber = $currentNumber + 1;
            return "B$nextNumber";
        }
        
    // No routers found, start from B860
    return "B860";
    } catch (Exception $e) {
        error_log("Error generating router number: " . $e->getMessage());
        // Default to B860 on error
        return "B860";
    }
}

// =============================================
// SAVE INVENTORY IMAGE
// =============================================
function saveInventoryImage($db, $itemId, $imageData, $imageName = null) {
    try {
        // Handle base64 image
        if (is_string($imageData) && strpos($imageData, 'data:image') === 0) {
            // Base64 image from camera/upload
            $base64String = $imageData;
            
            // Extract mime type
            preg_match('/data:image\/(\w+);base64,/', $base64String, $matches);
            $mimeType = 'image/' . ($matches[1] ?? 'jpeg');
            $extension = $matches[1] ?? 'jpg';
            
            // Remove base64 header
            $base64String = preg_replace('/^data:image\/\w+;base64,/', '', $base64String);
            $imageContent = base64_decode($base64String);
            
            // Validate decoded content
            if ($imageContent === false || strlen($imageContent) < 100) {
                throw new Exception('Invalid base64 image data');
            }
            
            // Generate unique filename
            $fileName = 'inventory_' . $itemId . '_' . time() . '_' . uniqid() . '.' . $extension;
            $uploadDir = __DIR__ . '/uploads/inventory/';
            $filePath = '/uploads/inventory/' . $fileName;
            
            // Create directory if it doesn't exist
            if (!file_exists($uploadDir)) {
                if (!mkdir($uploadDir, 0777, true)) {
                    error_log("Failed to create upload directory: $uploadDir");
                    throw new Exception('Failed to create upload directory');
                }
            }
            
            // Check if directory is writable
            if (!is_writable($uploadDir)) {
                error_log("Upload directory is not writable: $uploadDir");
                throw new Exception('Upload directory is not writable');
            }
            
            // Save file
            $bytesWritten = file_put_contents($uploadDir . $fileName, $imageContent);
            if ($bytesWritten === false) {
                error_log("Failed to write image file: " . $uploadDir . $fileName);
                throw new Exception('Failed to write image file');
            }
            
            // Get base URL dynamically
            $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
            $host = $_SERVER['HTTP_HOST'] ?? 'tickets.tonycommgroupltd.com';
            $baseUrl = $protocol . '://' . $host . '/api';
            $imageUrl = $baseUrl . $filePath;
            
            error_log("Image saved successfully: $imageUrl");
            return $imageUrl;
        }
        
        return null;
        
    } catch (Exception $e) {
        error_log('Failed to save inventory image: ' . $e->getMessage());
        return null;
    }
}

// =============================================
// FORMAT INVENTORY ITEM
// =============================================
function formatInventoryItem($item) {
    return [
        'id'                 => intval($item['id']),
        'name'               => $item['name'] ?? '',
        'description'        => $item['description'] ?? '',
        'category'           => $item['category'] ?? '',
        'quantity_available' => intval($item['quantity_available'] ?? 0),
        'quantity_total'     => intval($item['quantity_total'] ?? 0),
        'quantity_requested' => intval($item['quantity_requested'] ?? 0),
        'quantity_disbursed' => intval($item['quantity_disbursed'] ?? 0),
        'quantity_discarded' => intval($item['quantity_discarded'] ?? 0),
        'unit'               => $item['unit'] ?? 'pcs',
        'minimum_quantity'   => intval($item['minimum_quantity'] ?? 0),
        'unit_price'         => floatval($item['unit_price'] ?? 0),
        'is_serialized'      => !empty($item['is_serialized']),
        'serial_number'      => $item['serial_number'] ?? null,
        'status'             => $item['status'] ?? 'active',
        'image_url'          => $item['image_url'] ?? null,
        'added_by_id'        => $item['added_by_id'] ? intval($item['added_by_id']) : null,
        'added_by_name'      => $item['added_by_name'] ?? null,
        'comment'            => $item['comment'] ?? null,
        'assigned_to_id'     => $item['assigned_to_id'] ? intval($item['assigned_to_id']) : null,
        'assigned_to_name'   => $item['assigned_to_name'] ?? null,
        'remaining_meters'   => isset($item['remaining_meters']) && $item['remaining_meters'] !== null
            ? intval($item['remaining_meters'])
            : null,
        'ticket_id'          => $item['ticket_id'] ? intval($item['ticket_id']) : null,
        'ticket_number'      => $item['ticket_number'] ?? null,
        'used_by_id'         => $item['used_by_id'] ? intval($item['used_by_id']) : null,
        'used_by_name'       => $item['used_by_name'] ?? null,
        'created_at'         => $item['created_at'] ?? null,
        'updated_at'         => $item['updated_at'] ?? null,
    ];
}

// =============================================
// ACTIVITY LOG TABLE + HELPERS
// =============================================
function ensureActivityLogTable($db) {
    $db->exec("
        CREATE TABLE IF NOT EXISTS `inventory_activity_log` (
            `id`            BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            `action`        VARCHAR(50) NOT NULL,
            `item_id`       BIGINT(20) UNSIGNED DEFAULT NULL,
            `item_name`     VARCHAR(255) DEFAULT NULL,
            `item_category` VARCHAR(255) DEFAULT NULL,
            `serial_number` VARCHAR(255) DEFAULT NULL,
            `quantity`      INT DEFAULT 1,
            `actor_id`      BIGINT(20) UNSIGNED DEFAULT NULL,
            `actor_name`    VARCHAR(255) DEFAULT NULL,
            `notes`         TEXT DEFAULT NULL,
            `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_action`    (`action`),
            KEY `idx_item_id`   (`item_id`),
            KEY `idx_actor_id`  (`actor_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
}

function logInventoryActivity($db, $action, $itemId, $itemName, $itemCategory, $serialNumber, $quantity, $actorId, $actorName, $notes = '') {
    try {
        ensureActivityLogTable($db);
        $stmt = $db->prepare("
            INSERT INTO inventory_activity_log
                (action, item_id, item_name, item_category, serial_number, quantity, actor_id, actor_name, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([$action, $itemId, $itemName, $itemCategory, $serialNumber, $quantity, $actorId, $actorName, $notes]);
    } catch (Exception $e) { /* non-fatal */ }
}

// =============================================
// GET ACTIVITY LOGS (merged: adds + deletes + disbursements)
// =============================================
function getActivityLogs($db) {
    try {
        ensureActivityLogTable($db);
        ensureDisbursementsTable($db);

        // Fetch activity log (item_added, item_deleted, router_added, router_deleted)
        $actRows = $db->query("
            SELECT
                CONCAT('act_', id) AS id,
                action,
                NULL            AS type,
                item_id,
                item_name,
                item_category,
                serial_number,
                quantity,
                actor_id        AS actor_id,
                actor_name      AS actor_name,
                NULL            AS assigned_to_id,
                NULL            AS assigned_to_name,
                NULL            AS assigned_by_id,
                NULL            AS assigned_by_name,
                NULL            AS ticket_id,
                NULL            AS ticket_number,
                NULL            AS ticket_subject,
                notes,
                created_at
            FROM inventory_activity_log
            ORDER BY created_at DESC
        ")->fetchAll(PDO::FETCH_ASSOC);

        // Fetch disbursements (issued + used on tickets)
        $disbRows = $db->query("
            SELECT
                CONCAT('disb_', d.id) AS id,
                CASE
                    WHEN d.type = 'router' AND (d.ticket_number IS NOT NULL OR ii.ticket_number IS NOT NULL) THEN 'router_used'
                    WHEN d.type = 'router' THEN 'router_issued'
                    WHEN d.ticket_number IS NOT NULL OR ii.ticket_number IS NOT NULL THEN 'item_used'
                    ELSE 'item_issued'
                END AS action,
                d.type,
                d.item_id,
                d.item_name,
                d.item_category,
                d.serial_number,
                d.quantity,
                NULL                                                    AS actor_id,
                NULL                                                    AS actor_name,
                d.assigned_to_id,
                d.assigned_to_name,
                d.assigned_by_id,
                d.assigned_by_name,
                COALESCE(d.ticket_id,     ii.ticket_id)     AS ticket_id,
                COALESCE(d.ticket_number, ii.ticket_number) AS ticket_number,
                t.subject                                               AS ticket_subject,
                d.notes,
                d.created_at
            FROM inventory_disbursements d
            LEFT JOIN inventory_items ii ON ii.id = d.item_id
            LEFT JOIN tickets t ON t.id = COALESCE(d.ticket_id, ii.ticket_id)
            ORDER BY d.created_at DESC
        ")->fetchAll(PDO::FETCH_ASSOC);

        // Merge and sort by created_at DESC
        $all = array_merge($actRows, $disbRows);
        usort($all, fn($a, $b) => strtotime($b['created_at']) - strtotime($a['created_at']));

        echo json_encode(['success' => true, 'data' => $all]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}

// =============================================
// ENSURE DISBURSEMENTS TABLE EXISTS
// =============================================
function ensureDisbursementsTable($db) {
    static $done = false;
    if ($done) {
        return;
    }
    $done = true;

    $db->exec("
        CREATE TABLE IF NOT EXISTS `inventory_disbursements` (
            `id`               BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            `type`             ENUM('router','item') NOT NULL DEFAULT 'item',
            `item_id`          BIGINT(20) UNSIGNED DEFAULT NULL,
            `item_name`        VARCHAR(255) NOT NULL,
            `item_category`    VARCHAR(255) DEFAULT NULL,
            `serial_number`    VARCHAR(255) DEFAULT NULL,
            `assigned_to_id`   BIGINT(20) UNSIGNED DEFAULT NULL,
            `assigned_to_name` VARCHAR(255) DEFAULT NULL,
            `assigned_by_id`   BIGINT(20) UNSIGNED DEFAULT NULL,
            `assigned_by_name` VARCHAR(255) DEFAULT NULL,
            `quantity`         INT NOT NULL DEFAULT 1,
            `notes`            TEXT DEFAULT NULL,
            `ticket_id`        BIGINT(20) UNSIGNED DEFAULT NULL,
            `ticket_number`    VARCHAR(50) DEFAULT NULL,
            `created_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_assigned_to` (`assigned_to_id`),
            KEY `idx_item_id` (`item_id`),
            KEY `idx_ticket_id` (`ticket_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    // MySQL 8 has no ADD COLUMN IF NOT EXISTS — probe information_schema first.
    $ensureCol = function ($table, $column, $ddl) use ($db) {
        $stmt = $db->prepare(
            'SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
        );
        $stmt->execute([$table, $column]);
        if ((int) $stmt->fetchColumn() === 0) {
            $db->exec("ALTER TABLE `{$table}` ADD COLUMN {$ddl}");
        }
    };
    $ensureCol('inventory_disbursements', 'ticket_id', '`ticket_id` BIGINT(20) UNSIGNED DEFAULT NULL');
    $ensureCol('inventory_disbursements', 'ticket_number', '`ticket_number` VARCHAR(50) DEFAULT NULL');
    ensureCableRollMetersColumn($db);
    $ensureCol('inventory_items', 'assigned_to_id', '`assigned_to_id` BIGINT(20) UNSIGNED DEFAULT NULL');
    $ensureCol('inventory_items', 'assigned_to_name', '`assigned_to_name` VARCHAR(255) DEFAULT NULL');
    $ensureCol('inventory_items', 'ticket_id', '`ticket_id` BIGINT(20) UNSIGNED DEFAULT NULL');
    $ensureCol('inventory_items', 'ticket_number', '`ticket_number` VARCHAR(50) DEFAULT NULL');
    $ensureCol('inventory_items', 'used_by_id', '`used_by_id` BIGINT(20) UNSIGNED DEFAULT NULL');
    $ensureCol('inventory_items', 'used_by_name', '`used_by_name` VARCHAR(255) DEFAULT NULL');
}

// =============================================
// LIST DISBURSEMENTS
// =============================================
function listDisbursements($db) {
    try {
        ensureDisbursementsTable($db);
        $params = $_GET ?? [];
        $assignedTo     = $params['assigned_to_id'] ?? '';
        $assignedToMany = $params['assigned_to_ids'] ?? '';
        $ticketId       = $params['ticket_id']       ?? '';
        $onlyUsed       = !empty($params['with_ticket']) ? true : false; // only rows that have a ticket

        // LEFT JOIN inventory_items + tickets to include ticket subject
        $sql = "
            SELECT d.*,
                   COALESCE(d.ticket_number, ii.ticket_number) AS ticket_number,
                   COALESCE(d.ticket_id,     ii.ticket_id)     AS linked_ticket_id,
                   ii.used_by_name   AS used_by_name,
                   COALESCE(d.serial_number, ii.serial_number) AS serial_number,
                   ii.unit           AS unit,
                   t.subject         AS ticket_subject
            FROM inventory_disbursements d
            LEFT JOIN inventory_items ii ON ii.id = d.item_id
            LEFT JOIN tickets t ON t.id = COALESCE(d.ticket_id, ii.ticket_id)
            WHERE 1=1
        ";
        $bindings = [];
        if (!empty($assignedToMany)) {
            $ids = array_values(array_filter(array_map('intval', explode(',', (string)$assignedToMany))));
            if (!empty($ids)) {
                $ph = implode(',', array_fill(0, count($ids), '?'));
                $sql .= " AND d.assigned_to_id IN ($ph)";
                $bindings = array_merge($bindings, $ids);
            }
        } elseif (!empty($assignedTo)) {
            $sql .= " AND d.assigned_to_id = ?";
            $bindings[] = intval($assignedTo);
        }
        if (!empty($ticketId)) {
            $sql .= " AND d.ticket_id = ?";
            $bindings[] = intval($ticketId);
        }
        if ($onlyUsed) {
            $sql .= " AND d.ticket_id IS NOT NULL AND d.type = 'item'";
        }
        $sql .= " ORDER BY d.created_at DESC";

        $stmt = $db->prepare($sql);
        $stmt->execute($bindings);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode(['success' => true, 'data' => $rows]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error: ' . $e->getMessage()]);
    }
}

// =============================================
// SMS NOTIFICATION FOR DISBURSEMENT
// =============================================
function sendDisbursementSMS($db, $assignedToId, $assignedToName, $assignedByName, $type, $itemName, $serialNumber, $quantity, $itemCategory) {
    try {
        // Skip SMS if no recipient user ID
        if (!$assignedToId) return;

        // Look up recipient's phone number from users table
        $stmt = $db->prepare("SELECT phone FROM users WHERE id = ? LIMIT 1");
        $stmt->execute([$assignedToId]);
        $userRow = $stmt->fetch(PDO::FETCH_ASSOC);
        $phone = $userRow['phone'] ?? null;

        if (empty($phone)) return; // No phone on record — skip silently

        // Build a clear, friendly SMS
        $issuedBy = $assignedByName ?: 'Admin';
        $date     = date('d M Y, H:i');

        if ($type === 'router') {
            $serial = !empty($serialNumber) ? " (S/N: {$serialNumber})" : "";
            $message = "Hi {$assignedToName},\n"
                . "Router {$itemName}{$serial} has been issued to you.\n"
                . "Issued by: {$issuedBy}\n"
                . "Date: {$date}\n"
                . "Please check your inventory dashboard.\n"
                . "- TonyCom Network";
        } else {
            $message = "Hi {$assignedToName},\n"
                . "{$quantity} x {$itemName} ({$itemCategory}) has been issued to you.\n"
                . "Issued by: {$issuedBy}\n"
                . "Date: {$date}\n"
                . "Please check your inventory dashboard.\n"
                . "- TonyCom Network";
        }

        require_once __DIR__ . '/advantasms-helper.php';
        $sms = new AdvantaSMSAPI();
        $sms->sendSingleSMS($phone, $message, 'INV-DISB-' . time());

    } catch (Exception $e) {
        // Non-fatal — log silently, never break the disbursement response
        error_log('Inventory SMS notification failed: ' . $e->getMessage());
    }
}

// =============================================
// Drop cable: 1k roll = 1000 m, 2k roll = 2000 m (disbursed as pieces)
// =============================================
function getDropCableMetersPerPiece($itemName) {
    $n = strtolower(preg_replace('/\s+/', '', (string)$itemName));
    if (preg_match('/2k|2km/', $n)) {
        return 2000;
    }
    if (preg_match('/1k|1km/', $n)) {
        return 1000;
    }
    return null;
}

function resolveDropCableMetersFromItemRow($itemRow) {
    if (!$itemRow) {
        return null;
    }
    $fromName = getDropCableMetersPerPiece($itemRow['name'] ?? '');
    if ($fromName) {
        return $fromName;
    }
    $desc = trim(($itemRow['description'] ?? '') . ' ' . ($itemRow['comment'] ?? ''));
    return getDropCableMetersPerPiece($desc);
}

function isDropCableCategory($category) {
    $c = strtolower((string)$category);
    return strpos($c, 'drop') !== false && strpos($c, 'cable') !== false;
}

/** Patch cord / patchcable accessory (1 pcs per router). */
function isPatchcordItem($name, $category = '') {
    $hay = strtolower(trim((string)$name . ' ' . (string)$category));
    // Accept common spellings: Patch Cord, patchcord, PATCHCODES, patch cable, etc.
    return strpos($hay, 'patchcord') !== false
        || strpos($hay, 'patch cord') !== false
        || strpos($hay, 'patch-cord') !== false
        || strpos($hay, 'patch cable') !== false
        || strpos($hay, 'patchcode') !== false
        || strpos($hay, 'patch code') !== false
        || strpos($hay, 'patch-code') !== false;
}

function patchcordNotesForRouter($routerName) {
    $routerName = trim((string)$routerName);
    return $routerName !== '' ? ('Auto with router ' . $routerName) : 'Auto with router';
}

/** Warehouse patch-cord stock row with available qty (locked by caller if needed). */
function findWarehousePatchcordItem($db, $requireStock = true) {
    $stmt = $db->query("SELECT * FROM inventory_items ORDER BY id ASC");
    $rows = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];
    $fallback = null;
    foreach ($rows as $row) {
        if (!isPatchcordItem($row['name'] ?? '', $row['category'] ?? '')) {
            continue;
        }
        if ((int)($row['quantity_available'] ?? 0) > 0) {
            return $row;
        }
        if ($fallback === null) {
            $fallback = $row;
        }
    }
    return $requireStock ? null : $fallback;
}

/**
 * Issue 1 patch cord to the same tech when a router is disbursed.
 * Must run inside an open transaction.
 */
function issuePatchcordWithRouter($db, $assignedToId, $assignedToName, $assignedById, $assignedByName, $routerName) {
    $item = findWarehousePatchcordItem($db, true);
    if (!$item) {
        return [
            'ok' => false,
            'error' => 'Cannot issue a router without a Patch Cord. Add Patch Cord stock under Inventory → Other Stock, then try again.',
        ];
    }

    $itemId = (int)$item['id'];
    $lock = $db->prepare("SELECT id, name, category, quantity_available, unit FROM inventory_items WHERE id = ? FOR UPDATE");
    $lock->execute([$itemId]);
    $locked = $lock->fetch(PDO::FETCH_ASSOC);
    if (!$locked || (int)($locked['quantity_available'] ?? 0) < 1) {
        return [
            'ok' => false,
            'error' => 'Patch Cord stock is empty. Add stock under Inventory → Other Stock before issuing routers.',
        ];
    }

    $upd = $db->prepare("UPDATE inventory_items
        SET quantity_available = quantity_available - 1, updated_at = NOW()
        WHERE id = ?");
    $upd->execute([$itemId]);

    $notes = patchcordNotesForRouter($routerName);
    $ins = $db->prepare("INSERT INTO inventory_disbursements
        (type, item_id, item_name, item_category, serial_number,
         assigned_to_id, assigned_to_name,
         assigned_by_id, assigned_by_name,
         quantity, notes, ticket_id, ticket_number, created_at)
        VALUES ('item',?,?,?,?,?,?,?,?,?, ?, NULL, NULL, NOW())");
    $ins->execute([
        $itemId,
        $locked['name'] ?? 'Patch Cord',
        $locked['category'] ?? 'Patch Cord',
        null,
        $assignedToId,
        $assignedToName ?: null,
        $assignedById,
        $assignedByName ?: null,
        1,
        $notes,
    ]);

    return [
        'ok' => true,
        'disbursement_id' => (int)$db->lastInsertId(),
        'item_id' => $itemId,
        'item_name' => $locked['name'] ?? 'Patch Cord',
        'item_category' => $locked['category'] ?? 'Patch Cord',
        'quantity' => 1,
        'notes' => $notes,
    ];
}

/**
 * Deduct 1 pending patch cord from the tech when a router is linked to a ticket.
 * Must run inside an open transaction when possible.
 */
function consumePatchcordOnRouterInstall($db, $usedById, $usedByName, $ticketId, $ticketNumber, $routerName, $assignedById = null, $assignedByName = null) {
    $stmt = $db->query("SELECT id, name, category FROM inventory_items ORDER BY id ASC");
    $rows = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];
    $chosen = null;
    foreach ($rows as $row) {
        if (!isPatchcordItem($row['name'] ?? '', $row['category'] ?? '')) {
            continue;
        }
        $bal = getTechnicianItemBalance(
            $db,
            (int)$usedById,
            (int)$row['id'],
            $row['name'] ?? '',
            null,
            (string)$usedByName
        );
        if ($bal >= 1) {
            $chosen = $row;
            break;
        }
    }

    if (!$chosen) {
        return [
            'ok' => false,
            'warning' => 'Router linked, but no Patch Cord is pending on this technician. Issue a Patch Cord from Disbursement, then log it on the ticket.',
        ];
    }

    $notes = patchcordNotesForRouter($routerName);
    $ins = $db->prepare("INSERT INTO inventory_disbursements
        (type, item_id, item_name, item_category, serial_number,
         assigned_to_id, assigned_to_name,
         assigned_by_id, assigned_by_name,
         quantity, notes, ticket_id, ticket_number, created_at)
        VALUES ('item',?,?,?,?,?,?,?,?,?,?,?,?,NOW())");
    $ins->execute([
        (int)$chosen['id'],
        $chosen['name'] ?? 'Patch Cord',
        $chosen['category'] ?? 'Patch Cord',
        null,
        $usedById ?: null,
        $usedByName ?: null,
        $assignedById ?: $usedById,
        $assignedByName ?: $usedByName,
        1,
        $notes,
        $ticketId ?: null,
        $ticketNumber ?: null,
    ]);

    return [
        'ok' => true,
        'disbursement_id' => (int)$db->lastInsertId(),
        'item_id' => (int)$chosen['id'],
        'item_name' => $chosen['name'] ?? 'Patch Cord',
        'quantity' => 1,
    ];
}

function reverseCompanionPatchcordForRouter($db, array $routerDis) {
    $routerName = trim((string)($routerDis['item_name'] ?? ''));
    $assignedToId = (int)($routerDis['assigned_to_id'] ?? 0);
    $assignedToName = trim((string)($routerDis['assigned_to_name'] ?? ''));
    $note = patchcordNotesForRouter($routerName);

    $sql = "SELECT * FROM inventory_disbursements
            WHERE type = 'item'
              AND (ticket_id IS NULL OR ticket_id = 0)
              AND (ticket_number IS NULL OR TRIM(ticket_number) = '')
              AND notes = ?
              AND created_at >= DATE_SUB(?, INTERVAL 1 DAY)
              AND created_at <= DATE_ADD(?, INTERVAL 1 DAY)";
    $bindings = [$note, $routerDis['created_at'] ?? date('Y-m-d H:i:s'), $routerDis['created_at'] ?? date('Y-m-d H:i:s')];
    if ($assignedToId > 0) {
        $sql .= " AND assigned_to_id = ?";
        $bindings[] = $assignedToId;
    } elseif ($assignedToName !== '') {
        $sql .= " AND TRIM(COALESCE(assigned_to_name, '')) = ?";
        $bindings[] = $assignedToName;
    }
    $sql .= " ORDER BY id DESC LIMIT 1";
    $stmt = $db->prepare($sql);
    $stmt->execute($bindings);
    $comp = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$comp) {
        return null;
    }

    if (!empty($comp['item_id'])) {
        $upd = $db->prepare("UPDATE inventory_items
            SET quantity_available = quantity_available + ?, updated_at = NOW()
            WHERE id = ?");
        $upd->execute([(int)($comp['quantity'] ?? 1), (int)$comp['item_id']]);
    }
    $db->prepare("DELETE FROM inventory_disbursements WHERE id = ?")->execute([(int)$comp['id']]);
    return $comp;
}

/** Numbered roll e.g. T400 (not bulk "Drop Cable 1k" stock row). */
function isDropCableRollItem($itemRow) {
    if (!$itemRow || !isDropCableCategory($itemRow['category'] ?? '')) {
        return false;
    }
    $name = trim((string)($itemRow['name'] ?? ''));
    if ($name === '') {
        return false;
    }
    return getDropCableMetersPerPiece($name) === null;
}

/** Persist remaining meters on numbered drop-cable rolls (survives return / reassign). */
function ensureCableRollMetersColumn($db) {
    static $done = false;
    if ($done) {
        return;
    }
    $done = true;
    try {
        $stmt = $db->prepare(
            'SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
        );
        $stmt->execute(['inventory_items', 'remaining_meters']);
        if ((int)$stmt->fetchColumn() === 0) {
            $db->exec(
                "ALTER TABLE `inventory_items`
                 ADD COLUMN `remaining_meters` INT DEFAULT NULL
                 COMMENT 'Meters left on numbered drop-cable roll'"
            );
        }
    } catch (Exception $e) {
        error_log('ensureCableRollMetersColumn: ' . $e->getMessage());
    }
}

/** Lifetime ticket meters used on this physical roll (all technicians). */
function totalCableRollTicketMetersUsed($db, $serial, $rollItemId = null) {
    $serial = normalizeCableRollNumber($serial);
    $used = 0;
    if ($serial !== '') {
        $stmt = $db->prepare("
            SELECT COALESCE(SUM(quantity), 0) FROM inventory_disbursements
            WHERE type = 'item'
              AND UPPER(TRIM(COALESCE(serial_number, ''))) = ?
              AND (ticket_id IS NOT NULL OR (ticket_number IS NOT NULL AND TRIM(ticket_number) != ''))
        ");
        $stmt->execute([$serial]);
        $used = (int)$stmt->fetchColumn();
    }
    if ($rollItemId) {
        $stmt = $db->prepare("
            SELECT COALESCE(SUM(quantity), 0) FROM inventory_disbursements
            WHERE type = 'item'
              AND item_id = ?
              AND (ticket_id IS NOT NULL OR (ticket_number IS NOT NULL AND TRIM(ticket_number) != ''))
              AND (serial_number IS NULL OR TRIM(serial_number) = '')
        ");
        $stmt->execute([(int)$rollItemId]);
        $used += (int)$stmt->fetchColumn();
    }
    return max(0, $used);
}

/**
 * Meters left on a numbered roll. Stored value wins; otherwise infer from roll size − lifetime usage.
 */
function getCableRollRemainingMeters($db, $itemRow) {
    if (!$itemRow) {
        return 0;
    }
    $mpp = resolveDropCableMetersFromItemRow($itemRow) ?: 1000;
    if (array_key_exists('remaining_meters', $itemRow)
        && $itemRow['remaining_meters'] !== null
        && $itemRow['remaining_meters'] !== ''
    ) {
        return max(0, min($mpp, (int)$itemRow['remaining_meters']));
    }
    $serial = normalizeCableRollNumber($itemRow['name'] ?? '');
    $used = totalCableRollTicketMetersUsed($db, $serial, (int)($itemRow['id'] ?? 0) ?: null);
    return max(0, $mpp - $used);
}

function setCableRollRemainingMeters($db, $itemId, $meters) {
    if (!$itemId) {
        return;
    }
    ensureCableRollMetersColumn($db);
    $db->prepare("UPDATE inventory_items SET remaining_meters = ?, updated_at = NOW() WHERE id = ?")
        ->execute([max(0, (int)$meters), (int)$itemId]);
}

/**
 * Release a numbered roll back to warehouse keeping leftover meters for the next assignee.
 * @return int remaining meters stored on the roll
 */
function releaseCableRollKeepingRemaining($db, $itemRow, $fallbackRemaining = null) {
    if (!$itemRow || empty($itemRow['id'])) {
        return 0;
    }
    ensureCableRollMetersColumn($db);
    $remaining = $fallbackRemaining !== null
        ? max(0, (int)$fallbackRemaining)
        : getCableRollRemainingMeters($db, $itemRow);
    $mpp = resolveDropCableMetersFromItemRow($itemRow) ?: 1000;
    $remaining = min($mpp, $remaining);
    $db->prepare("UPDATE inventory_items
        SET status = 'active',
            assigned_to_id = NULL,
            assigned_to_name = NULL,
            remaining_meters = ?,
            updated_at = NOW()
        WHERE id = ?")->execute([$remaining, (int)$itemRow['id']]);
    return $remaining;
}

function dropCableTypeLabel($meters) {
    return ((int)$meters >= 2000) ? 'Drop Cable 2k' : 'Drop Cable 1k';
}

function isCableRollNumber($value) {
    return (bool)preg_match('/^T\d+$/i', trim((string)$value));
}

function normalizeCableRollNumber($value) {
    $v = trim((string)$value);
    return $v === '' ? '' : strtoupper($v);
}

/** Numbered roll e.g. T456 from a disbursement or inventory item row. */
function resolveCableRollSerial($db, array $dis) {
    $serial = normalizeCableRollNumber($dis['serial_number'] ?? '');
    if ($serial !== '') {
        return $serial;
    }
    if (!empty($dis['item_id'])) {
        $stmt = $db->prepare("SELECT name, category, description, comment FROM inventory_items WHERE id = ? LIMIT 1");
        $stmt->execute([(int)$dis['item_id']]);
        $item = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($item && isDropCableRollItem($item)) {
            return normalizeCableRollNumber($item['name']);
        }
    }
    $itemName = trim((string)($dis['item_name'] ?? ''));
    if (isCableRollNumber($itemName)) {
        return normalizeCableRollNumber($itemName);
    }
    return '';
}

function resolveCableRollItemId($db, array $dis, $serial = '') {
    if (!empty($dis['item_id'])) {
        $stmt = $db->prepare("SELECT id, name, category FROM inventory_items WHERE id = ? LIMIT 1");
        $stmt->execute([(int)$dis['item_id']]);
        $item = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($item && isDropCableRollItem($item)) {
            return (int)$item['id'];
        }
    }
    $serial = normalizeCableRollNumber($serial ?: ($dis['serial_number'] ?? ''));
    if ($serial !== '') {
        $stmt = $db->prepare("SELECT id FROM inventory_items WHERE UPPER(TRIM(name)) = ? LIMIT 1");
        $stmt->execute([$serial]);
        $found = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($found) {
            return (int)$found['id'];
        }
    }
    return null;
}

function loadDisbursementForDiscard($db, array $row) {
    if (!empty($row['disbursement_id'])) {
        $stmt = $db->prepare("SELECT * FROM inventory_disbursements WHERE id = ? LIMIT 1");
        $stmt->execute([(int)$row['disbursement_id']]);
        $dis = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($dis) {
            return $dis;
        }
    }
    return $row;
}

function cableTicketUsageMatchesRoll(array $row, $serialNumber, $rollItemId, $mpp) {
    if (empty($row['ticket_id']) && empty($row['ticket_number'])) {
        return false;
    }
    $rowMpp = getDropCableMetersPerPiece($row['item_name'] ?? '');
    if ($rowMpp === null) {
        if ($serialNumber === '' || !isCableRollNumber($row['item_name'] ?? '')) {
            return false;
        }
        $rowMpp = $mpp;
    } elseif ($rowMpp !== $mpp) {
        return false;
    }

    $sn = normalizeCableRollNumber($row['serial_number'] ?? '');
    if ($serialNumber !== '') {
        if ($sn !== '' && strcasecmp($sn, $serialNumber) === 0) {
            return true;
        }
        if ($rollItemId && (int)($row['item_id'] ?? 0) === (int)$rollItemId) {
            return true;
        }
        if (isCableRollNumber($row['item_name'] ?? '') && strcasecmp(trim($row['item_name']), $serialNumber) === 0) {
            return true;
        }
        return false;
    }

    return $sn === '';
}

// =============================================
// Technician pending balance (disbursed minus used on tickets)
// =============================================
function resolveInventoryTechnician($db, $assignedToId, $assignedToName = '') {
    $id = (int)($assignedToId ?? 0);
    $name = trim((string)$assignedToName);
    if ($id <= 0 && $name !== '') {
        try {
            $stmt = $db->prepare("SELECT id FROM users WHERE TRIM(name) = ? OR TRIM(username) = ? LIMIT 1");
            $stmt->execute([$name, $name]);
            $found = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($found) {
                $id = (int)$found['id'];
            }
        } catch (PDOException $e) {
            // users table may be unavailable — name-only matching still works below
        }
    }
    return ['id' => $id, 'name' => $name];
}

function fetchTechnicianItemDisbursements($db, $assignedToId, $assignedToName = '') {
    $tech = resolveInventoryTechnician($db, $assignedToId, $assignedToName);
    $id = $tech['id'];
    $name = $tech['name'];
    if ($id <= 0 && $name === '') {
        return [];
    }
    if ($id > 0 && $name !== '') {
        $stmt = $db->prepare("
            SELECT quantity, ticket_id, ticket_number, item_name, serial_number, assigned_to_id, assigned_to_name, assigned_by_id, assigned_by_name, created_at
            FROM inventory_disbursements
            WHERE type = 'item'
              AND (
                assigned_to_id = ? OR TRIM(COALESCE(assigned_to_name, '')) = ?
                OR assigned_by_id = ? OR TRIM(COALESCE(assigned_by_name, '')) = ?
              )
        ");
        $stmt->execute([$id, $name, $id, $name]);
    } elseif ($id > 0) {
        $stmt = $db->prepare("
            SELECT quantity, ticket_id, ticket_number, item_name, serial_number, assigned_to_id, assigned_to_name, assigned_by_id, assigned_by_name, created_at
            FROM inventory_disbursements
            WHERE type = 'item'
              AND (assigned_to_id = ? OR assigned_by_id = ?)
        ");
        $stmt->execute([$id, $id]);
    } else {
        $stmt = $db->prepare("
            SELECT quantity, ticket_id, ticket_number, item_name, serial_number, assigned_to_id, assigned_to_name, assigned_by_id, assigned_by_name, created_at
            FROM inventory_disbursements
            WHERE type = 'item'
              AND (
                TRIM(COALESCE(assigned_to_name, '')) = ?
                OR TRIM(COALESCE(assigned_by_name, '')) = ?
              )
        ");
        $stmt->execute([$name, $name]);
    }
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function cableUsageBeforeCutoff(array $row, $beforeDate = null) {
    if (!$beforeDate) {
        return true;
    }
    $rowAt = $row['created_at'] ?? null;
    if (!$rowAt) {
        return true;
    }
    $cutoff = strtotime((string)$beforeDate);
    $rowTs = strtotime((string)$rowAt);
    if ($cutoff === false || $rowTs === false) {
        return true;
    }
    return $rowTs <= $cutoff;
}

function getTechnicianItemBalance($db, $assignedToId, $itemId, $itemName, $serialNumber = null, $assignedToName = '') {
    // Do not call ensureDisbursementsTable() here — DDL inside a transaction breaks commit/rollback
    $tech = resolveInventoryTechnician($db, $assignedToId, $assignedToName);
    if ($tech['id'] <= 0 && $tech['name'] === '') {
        return 0;
    }

    if ($itemId && empty($itemName)) {
        $nameStmt = $db->prepare("SELECT name FROM inventory_items WHERE id = ? LIMIT 1");
        $nameStmt->execute([$itemId]);
        $nameRow = $nameStmt->fetch(PDO::FETCH_ASSOC);
        $itemName = $nameRow['name'] ?? $itemName;
    }

    $serialNumber = trim((string)$serialNumber);
    $metersPerPiece = getDropCableMetersPerPiece($itemName);

    // Drop cable: per numbered roll (serial_number) or pooled bulk by type (1k / 2k)
    if ($metersPerPiece) {
        $rows = fetchTechnicianItemDisbursements($db, $tech['id'], $tech['name']);

        if ($serialNumber !== '') {
            $serialNumber = normalizeCableRollNumber($serialNumber);
            // Physical roll remaining meters is the source of truth once the roll is held
            // by this technician (survives return → reassign with leftover meters).
            $rollItem = null;
            if ($itemId) {
                $rollStmt = $db->prepare("SELECT * FROM inventory_items WHERE id = ? LIMIT 1");
                $rollStmt->execute([(int)$itemId]);
                $rollItem = $rollStmt->fetch(PDO::FETCH_ASSOC) ?: null;
            }
            if (!$rollItem) {
                $rollStmt = $db->prepare("SELECT * FROM inventory_items WHERE UPPER(TRIM(name)) = ? LIMIT 1");
                $rollStmt->execute([$serialNumber]);
                $rollItem = $rollStmt->fetch(PDO::FETCH_ASSOC) ?: null;
            }
            if ($rollItem && isDropCableRollItem($rollItem) && ($rollItem['status'] ?? '') === 'disbursed') {
                $heldById = $tech['id'] > 0 && (int)($rollItem['assigned_to_id'] ?? 0) === $tech['id'];
                $heldByName = $tech['name'] !== ''
                    && strcasecmp(trim((string)($rollItem['assigned_to_name'] ?? '')), $tech['name']) === 0;
                if ($heldById || $heldByName) {
                    return getCableRollRemainingMeters($db, $rollItem);
                }
            }

            $assignedMeters = 0;
            $usedMeters = 0;
            foreach ($rows as $row) {
                if (getDropCableMetersPerPiece($row['item_name'] ?? '') !== $metersPerPiece) {
                    continue;
                }
                if (strcasecmp(trim((string)($row['serial_number'] ?? '')), $serialNumber) !== 0) {
                    continue;
                }
                $q = (int)($row['quantity'] ?? 0);
                if (empty($row['ticket_id']) && empty($row['ticket_number'])) {
                    $assignedMeters += $q * $metersPerPiece;
                } else {
                    $usedMeters += $q;
                }
            }
            return max(0, $assignedMeters - $usedMeters);
        }

        $assignedPcs = 0;
        $used = 0;
        foreach ($rows as $row) {
            if (getDropCableMetersPerPiece($row['item_name'] ?? '') !== $metersPerPiece) {
                continue;
            }
            if (trim((string)($row['serial_number'] ?? '')) !== '') {
                continue;
            }
            $q = (int)($row['quantity'] ?? 0);
            if (empty($row['ticket_id']) && empty($row['ticket_number'])) {
                $assignedPcs += $q;
            } else {
                $used += $q;
            }
        }
        return max(0, ($assignedPcs * $metersPerPiece) - $used);
    }

    $techId = $tech['id'];
    $techName = $tech['name'];
    if ($itemId) {
        if ($techId > 0 && $techName !== '') {
            $stmt = $db->prepare("
                SELECT
                    COALESCE(SUM(CASE WHEN ticket_id IS NULL AND (ticket_number IS NULL OR TRIM(ticket_number) = '') THEN quantity ELSE 0 END), 0) AS assigned_qty,
                    COALESCE(SUM(CASE WHEN ticket_id IS NOT NULL OR (ticket_number IS NOT NULL AND TRIM(ticket_number) != '') THEN quantity ELSE 0 END), 0) AS used_qty
                FROM inventory_disbursements
                WHERE type = 'item'
                  AND item_id = ?
                  AND (assigned_to_id = ? OR TRIM(COALESCE(assigned_to_name, '')) = ?)
            ");
            $stmt->execute([$itemId, $techId, $techName]);
        } elseif ($techId > 0) {
            $stmt = $db->prepare("
                SELECT
                    COALESCE(SUM(CASE WHEN ticket_id IS NULL AND (ticket_number IS NULL OR TRIM(ticket_number) = '') THEN quantity ELSE 0 END), 0) AS assigned_qty,
                    COALESCE(SUM(CASE WHEN ticket_id IS NOT NULL OR (ticket_number IS NOT NULL AND TRIM(ticket_number) != '') THEN quantity ELSE 0 END), 0) AS used_qty
                FROM inventory_disbursements
                WHERE type = 'item' AND assigned_to_id = ? AND item_id = ?
            ");
            $stmt->execute([$techId, $itemId]);
        } else {
            $stmt = $db->prepare("
                SELECT
                    COALESCE(SUM(CASE WHEN ticket_id IS NULL AND (ticket_number IS NULL OR TRIM(ticket_number) = '') THEN quantity ELSE 0 END), 0) AS assigned_qty,
                    COALESCE(SUM(CASE WHEN ticket_id IS NOT NULL OR (ticket_number IS NOT NULL AND TRIM(ticket_number) != '') THEN quantity ELSE 0 END), 0) AS used_qty
                FROM inventory_disbursements
                WHERE type = 'item' AND TRIM(COALESCE(assigned_to_name, '')) = ? AND item_id = ?
            ");
            $stmt->execute([$techName, $itemId]);
        }
    } else {
        if ($techId > 0 && $techName !== '') {
            $stmt = $db->prepare("
                SELECT
                    COALESCE(SUM(CASE WHEN ticket_id IS NULL AND (ticket_number IS NULL OR TRIM(ticket_number) = '') THEN quantity ELSE 0 END), 0) AS assigned_qty,
                    COALESCE(SUM(CASE WHEN ticket_id IS NOT NULL OR (ticket_number IS NOT NULL AND TRIM(ticket_number) != '') THEN quantity ELSE 0 END), 0) AS used_qty
                FROM inventory_disbursements
                WHERE type = 'item'
                  AND item_id IS NULL AND item_name = ?
                  AND (assigned_to_id = ? OR TRIM(COALESCE(assigned_to_name, '')) = ?)
            ");
            $stmt->execute([$itemName, $techId, $techName]);
        } elseif ($techId > 0) {
            $stmt = $db->prepare("
                SELECT
                    COALESCE(SUM(CASE WHEN ticket_id IS NULL AND (ticket_number IS NULL OR TRIM(ticket_number) = '') THEN quantity ELSE 0 END), 0) AS assigned_qty,
                    COALESCE(SUM(CASE WHEN ticket_id IS NOT NULL OR (ticket_number IS NOT NULL AND TRIM(ticket_number) != '') THEN quantity ELSE 0 END), 0) AS used_qty
                FROM inventory_disbursements
                WHERE type = 'item' AND assigned_to_id = ? AND item_id IS NULL AND item_name = ?
            ");
            $stmt->execute([$techId, $itemName]);
        } else {
            $stmt = $db->prepare("
                SELECT
                    COALESCE(SUM(CASE WHEN ticket_id IS NULL AND (ticket_number IS NULL OR TRIM(ticket_number) = '') THEN quantity ELSE 0 END), 0) AS assigned_qty,
                    COALESCE(SUM(CASE WHEN ticket_id IS NOT NULL OR (ticket_number IS NOT NULL AND TRIM(ticket_number) != '') THEN quantity ELSE 0 END), 0) AS used_qty
                FROM inventory_disbursements
                WHERE type = 'item' AND TRIM(COALESCE(assigned_to_name, '')) = ? AND item_id IS NULL AND item_name = ?
            ");
            $stmt->execute([$techName, $itemName]);
        }
    }
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    $assigned = (int)($row['assigned_qty'] ?? 0);
    $used = (int)($row['used_qty'] ?? 0);

    return max(0, $assigned - $used);
}

/** Meters logged on tickets for one cable roll or bulk pool (matches getTechnicianItemBalance). */
function getCableMetersUsedOnTickets($db, $assignedToId, $itemName, $serialNumber = '', $assignedToName = '', $beforeDate = null, $rollItemId = null) {
    $serialNumber = normalizeCableRollNumber($serialNumber);
    $mpp = getDropCableMetersPerPiece($itemName);
    if (!$mpp && $serialNumber !== '') {
        $mpp = 1000;
    }
    $tech = resolveInventoryTechnician($db, $assignedToId, $assignedToName);
    if (!$mpp || ($tech['id'] <= 0 && $tech['name'] === '')) {
        return 0;
    }
    $used = 0;
    foreach (fetchTechnicianItemDisbursements($db, $tech['id'], $tech['name']) as $row) {
        if (!cableUsageBeforeCutoff($row, $beforeDate)) {
            continue;
        }
        if (!cableTicketUsageMatchesRoll($row, $serialNumber, $rollItemId, $mpp)) {
            continue;
        }
        $used += (int)($row['quantity'] ?? 0);
    }
    return $used;
}

// =============================================
// LIST TECHNICIAN PENDING BALANCES (server truth)
// =============================================
function listTechnicianPendingBalances($db) {
    try {
        ensureDisbursementsTable($db);
        $params = $_GET ?? [];
        $where = "WHERE d.assigned_to_id IS NOT NULL";
        $bindings = [];

        if (!empty($params['assigned_to_id'])) {
            $where .= " AND d.assigned_to_id = ?";
            $bindings[] = intval($params['assigned_to_id']);
        } elseif (!empty($params['assigned_to_ids'])) {
            $ids = array_values(array_filter(array_map('intval', explode(',', (string)$params['assigned_to_ids']))));
            if (!empty($ids)) {
                $ph = implode(',', array_fill(0, count($ids), '?'));
                $where .= " AND d.assigned_to_id IN ($ph)";
                $bindings = array_merge($bindings, $ids);
            }
        }

        $sql = "
            SELECT DISTINCT
                d.assigned_to_id,
                d.assigned_to_name,
                d.item_id,
                d.item_name,
                COALESCE(d.serial_number, '') AS serial_number,
                d.item_category,
                d.type
            FROM inventory_disbursements d
            $where
            ORDER BY assigned_to_name ASC, serial_number ASC, item_name ASC
        ";
        $stmt = $db->prepare($sql);
        $stmt->execute($bindings);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $byUser = [];
        $seen = [];

        foreach ($rows as $r) {
            $uid = (int)($r['assigned_to_id'] ?? 0);
            if (!$uid) {
                continue;
            }
            if (!isset($byUser[$uid])) {
                $byUser[$uid] = [
                    'assigned_to_id'   => $uid,
                    'assigned_to_name' => $r['assigned_to_name'] ?? '',
                    'cables'           => [],
                    'items'            => [],
                    'routers'          => [],
                ];
            }
            if (!isset($seen[$uid])) {
                $seen[$uid] = [];
            }

            if (($r['type'] ?? '') === 'router') {
                $routerKey = 'router:' . ($r['item_id'] ?: ($r['serial_number'] ?: $r['item_name']));
                if (isset($seen[$uid][$routerKey])) {
                    continue;
                }
                $seen[$uid][$routerKey] = true;
                $pendingStmt = $db->prepare("
                    SELECT COUNT(*) FROM inventory_disbursements
                    WHERE type = 'router' AND assigned_to_id = ? AND ticket_id IS NULL
                      AND (item_id = ? OR (item_id IS NULL AND item_name = ?))
                ");
                $pendingStmt->execute([$uid, $r['item_id'], $r['item_name']]);
                if ((int)$pendingStmt->fetchColumn() > 0) {
                    $byUser[$uid]['routers'][] = [
                        'item_id'       => $r['item_id'],
                        'item_name'     => $r['item_name'],
                        'serial_number' => $r['serial_number'] ?: null,
                    ];
                }
                continue;
            }

            $itemName = trim((string)($r['item_name'] ?? ''));
            $serial   = trim((string)($r['serial_number'] ?? ''));
            $mpp      = getDropCableMetersPerPiece($itemName);

            if ($mpp) {
                $dedupe = $serial !== '' ? ('roll:' . strtoupper($serial)) : ('bulk:' . $mpp);
                if (isset($seen[$uid][$dedupe])) {
                    continue;
                }
                $seen[$uid][$dedupe] = true;

                $techName = $r['assigned_to_name'] ?? '';
                $balance = getTechnicianItemBalance($db, $uid, $r['item_id'], $itemName, $serial, $techName);
                if ($balance <= 0) {
                    continue;
                }
                $byUser[$uid]['cables'][] = [
                    'roll_number'     => $serial !== '' ? strtoupper($serial) : null,
                    'item_name'       => $itemName,
                    'item_id'         => $r['item_id'],
                    'item_category'   => $r['item_category'] ?? '',
                    'meters_pending'  => $balance,
                    'meters_per_roll' => $mpp,
                    'meters_used'     => getCableMetersUsedOnTickets($db, $uid, $itemName, $serial, $techName),
                ];
            } else {
                $dedupe = 'item:' . ($r['item_id'] ?: $itemName);
                if (isset($seen[$uid][$dedupe])) {
                    continue;
                }
                $seen[$uid][$dedupe] = true;

                $balance = getTechnicianItemBalance($db, $uid, $r['item_id'], $itemName, null, $r['assigned_to_name'] ?? '');
                if ($balance <= 0) {
                    continue;
                }
                $byUser[$uid]['items'][] = [
                    'item_id'       => $r['item_id'],
                    'item_name'     => $itemName,
                    'item_category' => $r['item_category'] ?? '',
                    'qty_pending'   => $balance,
                ];
            }
        }

        $result = array_values(array_filter($byUser, function ($u) {
            return !empty($u['cables']) || !empty($u['items']) || !empty($u['routers']);
        }));

        echo json_encode(['success' => true, 'data' => $result]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error: ' . $e->getMessage()]);
    }
}

// =============================================
// CABLE ROLL USAGE REPORT (numbered rolls e.g. T400)
// =============================================
function normalizeCableRollQuery($raw) {
    $t = strtoupper(preg_replace('/[\r\n\t]/', '', trim((string)$raw)));
    if ($t === '') {
        return '';
    }
    if (preg_match('/^T\d+$/', $t)) {
        return $t;
    }
    if (preg_match('/^\d+$/', $t)) {
        return 'T' . $t;
    }
    return $t;
}

function listCableRollUsage($db) {
    try {
        ensureDisbursementsTable($db);
        $params     = $_GET ?? [];
        $rollFilter = normalizeCableRollQuery($params['roll'] ?? $params['serial'] ?? '');
        $search     = trim((string)($params['search'] ?? ''));

        $rollMap = [];

        $itemStmt = $db->query("
            SELECT id, name, description, comment, category, status,
                   assigned_to_id, assigned_to_name, created_at
            FROM inventory_items
            WHERE LOWER(category) LIKE '%drop%cable%'
              AND name NOT REGEXP '^[Dd]rop[[:space:]]*[Cc]able[[:space:]]*(1|2)[Kk]'
            ORDER BY name ASC
        ");
        foreach ($itemStmt->fetchAll(PDO::FETCH_ASSOC) as $item) {
            $rollNo = strtoupper(trim((string)($item['name'] ?? '')));
            if ($rollNo === '') {
                continue;
            }
            $rollMap[$rollNo] = $item;
        }

        $serialStmt = $db->query("
            SELECT DISTINCT UPPER(TRIM(serial_number)) AS roll_no
            FROM inventory_disbursements
            WHERE type = 'item'
              AND serial_number IS NOT NULL
              AND TRIM(serial_number) != ''
              AND UPPER(TRIM(serial_number)) REGEXP '^T[0-9]+$'
        ");
        foreach ($serialStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $rollNo = $row['roll_no'] ?? '';
            if ($rollNo !== '' && !isset($rollMap[$rollNo])) {
                $rollMap[$rollNo] = [
                    'id' => null,
                    'name' => $rollNo,
                    'description' => '',
                    'comment' => '',
                    'category' => 'Drop Cable',
                    'status' => 'unknown',
                    'assigned_to_name' => null,
                    'created_at' => null,
                ];
            }
        }

        ksort($rollMap, SORT_NATURAL);
        $rolls = [];

        foreach ($rollMap as $rollNo => $item) {
            if ($rollFilter !== '' && strcasecmp($rollNo, $rollFilter) !== 0) {
                continue;
            }
            if ($search !== '') {
                $hay = strtolower($rollNo . ' ' . ($item['assigned_to_name'] ?? ''));
                if (strpos($hay, strtolower($search)) === false) {
                    continue;
                }
            }

            $mpp = resolveDropCableMetersFromItemRow($item);
            if (!$mpp) {
                $mpp = 1000;
            }

            $itemId = !empty($item['id']) ? (int)$item['id'] : null;
            $disbSql = "
                SELECT d.*, t.subject AS ticket_subject
                FROM inventory_disbursements d
                LEFT JOIN tickets t ON t.id = d.ticket_id
                WHERE d.type = 'item'
                  AND (
                    UPPER(TRIM(COALESCE(d.serial_number, ''))) = ?
                    " . ($itemId ? "OR d.item_id = ?" : "") . "
                  )
                ORDER BY d.created_at ASC
            ";
            $disbStmt = $db->prepare($disbSql);
            $disbBindings = [$rollNo];
            if ($itemId) {
                $disbBindings[] = $itemId;
            }
            $disbStmt->execute($disbBindings);
            $disbRows = $disbStmt->fetchAll(PDO::FETCH_ASSOC);

            $metersUsed     = 0;
            $metersAssigned = 0;
            $tickets        = [];
            $assignedTo     = $item['assigned_to_name'] ?? null;
            $cableType      = null;

            foreach ($disbRows as $row) {
                $qty = (int)($row['quantity'] ?? 0);
                $rowMpp = getDropCableMetersPerPiece($row['item_name'] ?? '') ?: $mpp;
                if (!$cableType && !empty($row['item_name'])) {
                    $cableType = $row['item_name'];
                }
                if (!empty($row['ticket_id'])) {
                    $metersUsed += $qty;
                    $tickets[] = [
                        'disbursement_id'  => (int)$row['id'],
                        'ticket_id'        => (int)$row['ticket_id'],
                        'ticket_number'    => $row['ticket_number'] ?? null,
                        'subject'          => $row['ticket_subject'] ?? null,
                        'meters'           => $qty,
                        'used_at'          => $row['created_at'] ?? null,
                        'assigned_to_name' => $row['assigned_to_name'] ?? null,
                        'assigned_by_name' => $row['assigned_by_name'] ?? null,
                        'notes'            => $row['notes'] ?? null,
                    ];
                } else {
                    $metersAssigned += $qty * $rowMpp;
                }
                if (!$assignedTo && !empty($row['assigned_to_name'])) {
                    $assignedTo = $row['assigned_to_name'];
                }
            }

            if ($metersAssigned <= 0 && $item['status'] === 'disbursed') {
                $metersAssigned = $mpp;
            }

            $remainingOnRoll = getCableRollRemainingMeters($db, $item);
            // Prefer stored leftover meters when the roll is in warehouse or assigned
            $metersPending = ($item['status'] ?? '') === 'disbursed'
                ? $remainingOnRoll
                : $remainingOnRoll;

            $rolls[] = [
                'roll_number'       => $rollNo,
                'item_id'           => $itemId,
                'cable_type'        => $cableType ?: dropCableTypeLabel($mpp),
                'roll_meters'       => $mpp,
                'status'            => $item['status'] ?? 'active',
                'assigned_to_name'  => $assignedTo,
                'fed_at'            => $item['created_at'] ?? null,
                'meters_used'       => max(0, $mpp - $remainingOnRoll),
                'meters_pending'    => $metersPending,
                'remaining_meters'  => $remainingOnRoll,
                'meters_total'      => $mpp,
                'ticket_count'      => count($tickets),
                'tickets'           => array_reverse($tickets),
            ];
        }

        usort($rolls, function ($a, $b) {
            return strnatcasecmp($a['roll_number'], $b['roll_number']);
        });

        echo json_encode(['success' => true, 'data' => $rolls]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error: ' . $e->getMessage()]);
    }
}

// =============================================
// CREATE DISBURSEMENT
// =============================================
function createDisbursement($db) {
    try {
        ensureDisbursementsTable($db);
        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        $type           = $data['type'] ?? 'item';          // 'router' or 'item'
        $itemId         = !empty($data['item_id'])   ? intval($data['item_id'])   : null;
        $itemName       = trim($data['item_name']    ?? '');
        $itemCategory   = trim($data['item_category'] ?? '');
        $serialNumber   = trim($data['serial_number'] ?? '');
        $assignedToId   = !empty($data['assigned_to_id'])   ? intval($data['assigned_to_id'])   : null;
        $assignedToName = trim($data['assigned_to_name'] ?? '');
        $assignedById   = !empty($data['assigned_by_id'])   ? intval($data['assigned_by_id'])   : null;
        $assignedByName = trim($data['assigned_by_name'] ?? '');
        $quantity       = max(1, intval($data['quantity'] ?? 1));
        $notes          = trim($data['notes'] ?? '');
        $ticketId       = !empty($data['ticket_id'])       ? intval($data['ticket_id'])       : null;
        $ticketNumber   = trim($data['ticket_number']      ?? '');
        $patchIssue     = null;

        // For ticket-based item usage assigned_to_name may be empty (use assigned_by as the actor)
        if (empty($itemName)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'item_name is required']);
            return;
        }
        if (empty($assignedToName) && empty($ticketId)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'assigned_to_name or ticket_id is required']);
            return;
        }

        $db->beginTransaction();

        // Ticket usage: deduct from technician balance only (warehouse already reduced on disburse)
        if ($type === 'item' && $ticketId && $assignedToId) {
            $balance = getTechnicianItemBalance($db, $assignedToId, $itemId, $itemName, $serialNumber, $assignedToName);
            if ($balance < $quantity) {
                if ($db->inTransaction()) {
                    $db->rollBack();
                }
                http_response_code(409);
                $mpp = getDropCableMetersPerPiece($itemName);
                $itemLabel = $serialNumber ?: ($itemName ?: 'item');
                $balanceLabel = $mpp ? "{$balance} m" : "{$balance}";
                $requestLabel = $mpp ? "{$quantity} m" : "{$quantity}";
                echo json_encode([
                    'success' => false,
                    'error' => $mpp
                        ? "Not enough drop cable on your account ({$itemLabel}). Available: {$balanceLabel}, requested: {$requestLabel}."
                        : "Not enough {$itemLabel} on your account. Available: {$balanceLabel}, requested: {$requestLabel}.",
                ]);
                return;
            }
            // Numbered roll: permanently reduce leftover meters on the physical roll
            $rollId = $itemId;
            $rollSerial = normalizeCableRollNumber($serialNumber);
            if (!$rollId && $rollSerial !== '') {
                $findRoll = $db->prepare("SELECT id FROM inventory_items WHERE UPPER(TRIM(name)) = ? LIMIT 1");
                $findRoll->execute([$rollSerial]);
                $found = $findRoll->fetch(PDO::FETCH_ASSOC);
                $rollId = $found ? (int)$found['id'] : null;
            }
            if ($rollId) {
                $rollStmt = $db->prepare("SELECT * FROM inventory_items WHERE id = ? FOR UPDATE");
                $rollStmt->execute([(int)$rollId]);
                $rollRow = $rollStmt->fetch(PDO::FETCH_ASSOC);
                if ($rollRow && isDropCableRollItem($rollRow)) {
                    $left = getCableRollRemainingMeters($db, $rollRow);
                    if ($quantity > $left) {
                        if ($db->inTransaction()) {
                            $db->rollBack();
                        }
                        http_response_code(409);
                        echo json_encode([
                            'success' => false,
                            'error' => "Not enough meters left on roll {$rollSerial}. Available: {$left} m, requested: {$quantity} m.",
                        ]);
                        return;
                    }
                    setCableRollRemainingMeters($db, $rollId, $left - $quantity);
                }
            }
        } elseif ($type === 'router' && $itemId) {
            // Mark the router as disbursed and record who it was assigned to.
            // A new disbursement starts a new lifecycle, so clear any ticket
            // link left by the router's previous installation.
            $upd = $db->prepare("UPDATE inventory_items
                SET status = 'disbursed',
                    assigned_to_id   = ?,
                    assigned_to_name = ?,
                    ticket_id        = NULL,
                    ticket_number    = NULL,
                    used_by_id       = NULL,
                    used_by_name     = NULL,
                    updated_at       = NOW()
                WHERE id = ?");
            $upd->execute([$assignedToId, $assignedToName, $itemId]);

            // Router + Patch Cord always travel together from the warehouse.
            $patchIssue = issuePatchcordWithRouter(
                $db,
                $assignedToId,
                $assignedToName,
                $assignedById,
                $assignedByName,
                $itemName
            );
            if (empty($patchIssue['ok'])) {
                if ($db->inTransaction()) {
                    $db->rollBack();
                }
                http_response_code(409);
                echo json_encode([
                    'success' => false,
                    'error' => $patchIssue['error'] ?? 'Patch Cord is required with every router.',
                ]);
                return;
            }
        } elseif ($type === 'item' && $itemId && !$ticketId) {
            $itemRowStmt = $db->prepare("SELECT * FROM inventory_items WHERE id = ? FOR UPDATE");
            $itemRowStmt->execute([$itemId]);
            $itemRow = $itemRowStmt->fetch(PDO::FETCH_ASSOC);

            if ($itemRow && isDropCableRollItem($itemRow)) {
                ensureCableRollMetersColumn($db);
                // Re-read after ensuring column exists
                $itemRowStmt->execute([$itemId]);
                $itemRow = $itemRowStmt->fetch(PDO::FETCH_ASSOC);
                if (($itemRow['status'] ?? '') === 'disbursed') {
                    if ($db->inTransaction()) {
                        $db->rollBack();
                    }
                    http_response_code(409);
                    echo json_encode([
                        'success' => false,
                        'error' => 'Roll ' . ($itemRow['name'] ?? '') . ' is already disbursed to ' . ($itemRow['assigned_to_name'] ?? 'someone')
                    ]);
                    return;
                }
                $mpp = resolveDropCableMetersFromItemRow($itemRow) ?: 1000;
                $remaining = getCableRollRemainingMeters($db, $itemRow);
                if ($remaining <= 0) {
                    if ($db->inTransaction()) {
                        $db->rollBack();
                    }
                    http_response_code(409);
                    echo json_encode([
                        'success' => false,
                        'error' => 'Roll ' . ($itemRow['name'] ?? '') . ' has 0 m remaining — feed a new roll or discard this one.',
                    ]);
                    return;
                }
                // Persist remaining so the assignee only sees leftover meters (not a fresh full roll).
                setCableRollRemainingMeters($db, $itemId, $remaining);
                $upd = $db->prepare("UPDATE inventory_items
                    SET status = 'disbursed',
                        assigned_to_id   = ?,
                        assigned_to_name = ?,
                        remaining_meters = ?,
                        updated_at       = NOW()
                    WHERE id = ?");
                $upd->execute([$assignedToId, $assignedToName, $remaining, $itemId]);
                $itemName = dropCableTypeLabel($mpp);
                $serialNumber = trim($itemRow['name'] ?? '');
                $quantity = 1;
                $remainNote = "Remaining {$remaining} m on roll";
                $notes = $notes !== '' ? ($notes . ' | ' . $remainNote) : $remainNote;
            } else {
                // Disburse to technician — reduce warehouse stock (bulk items)
                $check = $db->prepare("SELECT quantity_available, unit FROM inventory_items WHERE id = ? FOR UPDATE");
                $check->execute([$itemId]);
                $row = $check->fetch(PDO::FETCH_ASSOC);
                if (!$row) {
                    if ($db->inTransaction()) {
                        $db->rollBack();
                    }
                    http_response_code(404);
                    echo json_encode(['success' => false, 'error' => 'Item not found']);
                    return;
                }
                if (($row['quantity_available'] ?? 0) < $quantity) {
                    if ($db->inTransaction()) {
                        $db->rollBack();
                    }
                    http_response_code(409);
                    $unitLabel = $row['unit'] ?? 'units';
                    echo json_encode([
                        'success' => false,
                        'error' => 'Not enough stock. Available: ' . ($row['quantity_available'] ?? 0) . ' ' . $unitLabel
                    ]);
                    return;
                }
                $upd = $db->prepare("UPDATE inventory_items
                    SET quantity_available = quantity_available - ?,
                        updated_at = NOW()
                    WHERE id = ?");
                $upd->execute([$quantity, $itemId]);
            }
        }

        // Insert disbursement record
        $ins = $db->prepare("INSERT INTO inventory_disbursements
            (type, item_id, item_name, item_category, serial_number,
             assigned_to_id, assigned_to_name,
             assigned_by_id, assigned_by_name,
             quantity, notes, ticket_id, ticket_number, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())");
        $ins->execute([
            $type, $itemId, $itemName, $itemCategory, $serialNumber ?: null,
            $assignedToId, $assignedToName ?: null,
            $assignedById, $assignedByName ?: null,
            $quantity, $notes ?: null,
            $ticketId, $ticketNumber ?: null
        ]);
        $newId = $db->lastInsertId();

        if ($db->inTransaction()) {
            $db->commit();
        }

        // SMS and final notification are sent only when admin clicks "Done"
        // via the /inventory/finalize-assignment endpoint — nothing to do here.

        $row = $db->prepare("SELECT * FROM inventory_disbursements WHERE id = ?");
        $row->execute([$newId]);
        $payload = [
            'success' => true,
            'data' => $row->fetch(PDO::FETCH_ASSOC),
        ];
        if ($type === 'router' && !empty($patchIssue['ok'])) {
            $payload['patchcord'] = $patchIssue;
        }
        echo json_encode($payload);
    } catch (PDOException $e) {
        if ($db->inTransaction()) $db->rollBack();
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error: ' . $e->getMessage()]);
    }
}

// =============================================
// FINALIZE ASSIGNMENT — send summary SMS + notification
// Called once when admin clicks "Done" on the disbursement page
// =============================================
function finalizeAssignment($db) {
    try {
        $data          = json_decode(file_get_contents('php://input'), true) ?? [];
        $assignedToId  = !empty($data['assigned_to_id'])   ? intval($data['assigned_to_id'])   : null;
        $assignedToName= trim($data['assigned_to_name']    ?? '');
        $assignedByName= trim($data['assigned_by_name']    ?? 'Admin');
        $routers       = $data['routers']  ?? []; // [{name, serial}]
        $items         = $data['items']    ?? []; // [{name, category, quantity}]

        if (!$assignedToId) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'assigned_to_id required']);
            return;
        }
        if (empty($routers) && empty($items)) {
            echo json_encode(['success' => true, 'message' => 'Nothing to notify']);
            return;
        }

        $date = date('d M Y, H:i');

        // ── Build SMS ────────────────────────────────────────────────────────────
        $lines = ["Hi {$assignedToName},"];
        $lines[] = "The following inventory has been issued to you by {$assignedByName}:";
        $lines[] = "";

        if (!empty($routers)) {
            $lines[] = "Routers (" . count($routers) . "):";
            foreach ($routers as $r) {
                $serial = !empty($r['serial']) ? " (S/N: {$r['serial']})" : '';
                $lines[] = "- {$r['name']}{$serial}";
            }
            $lines[] = "";
        }

        if (!empty($items)) {
            $lines[] = "Items:";
            foreach ($items as $it) {
                $lines[] = "- {$it['quantity']} x {$it['name']} ({$it['category']})";
            }
            $lines[] = "";
        }

        $lines[] = "Date: {$date}";
        $lines[] = "Check your inventory dashboard.";
        $lines[] = "- TonyCom Network";

        $message = implode("\n", $lines);

        // ── Send SMS ─────────────────────────────────────────────────────────────
        $smsResult = sendDisbursementSMSRaw($db, $assignedToId, $message);

        // ── In-app notification (one summary) ───────────────────────────────────
        // Inline helpers — no external file dependency
        if (!function_exists('ensureNotifTable')) {
            function ensureNotifTable($db) {
                $db->exec("CREATE TABLE IF NOT EXISTS `notifications` (
                    `id` BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
                    `user_id` BIGINT(20) UNSIGNED NOT NULL DEFAULT 0,
                    `type` VARCHAR(50) NOT NULL DEFAULT 'info',
                    `title` VARCHAR(255) NOT NULL DEFAULT '',
                    `message` TEXT NOT NULL,
                    `icon` VARCHAR(50) DEFAULT 'package-fill',
                    `link` VARCHAR(255) DEFAULT NULL,
                    `is_read` TINYINT(1) NOT NULL DEFAULT 0,
                    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (`id`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
                // Migrate: add columns that may be missing from older table versions
                $migrate = [
                    'user_id'    => "BIGINT(20) UNSIGNED NOT NULL DEFAULT 0",
                    'type'       => "VARCHAR(50) NOT NULL DEFAULT 'info'",
                    'title'      => "VARCHAR(255) NOT NULL DEFAULT ''",
                    'icon'       => "VARCHAR(50) DEFAULT 'package-fill'",
                    'link'       => "VARCHAR(255) DEFAULT NULL",
                    'is_read'    => "TINYINT(1) NOT NULL DEFAULT 0",
                    'created_at' => "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP",
                ];
                foreach ($migrate as $col => $def) {
                    try { $db->exec("ALTER TABLE `notifications` ADD COLUMN `{$col}` {$def}"); } catch (Exception $e) {}
                }
                // Fix: drop Laravel's customer_id FK so staff-user notifications work
                try { $db->exec("ALTER TABLE `notifications` DROP FOREIGN KEY `notifications_customer_id_foreign`"); } catch (Exception $e) {}
                try { $db->exec("ALTER TABLE `notifications` MODIFY COLUMN `customer_id` BIGINT(20) UNSIGNED NULL DEFAULT NULL"); } catch (Exception $e) {}
            }
        }
        if (!function_exists('createNotification')) {
            function createNotification($db, $userId, $type, $title, $message, $icon = 'package-fill', $link = null) {
                try {
                    ensureNotifTable($db);
                    $db->prepare("INSERT INTO notifications (user_id, type, title, message, icon, link) VALUES (?,?,?,?,?,?)")
                       ->execute([$userId, $type, $title, $message, $icon, $link]);
                } catch (Exception $e) {
                    error_log('createNotification: ' . $e->getMessage());
                }
            }
        }
        $routerCount = count($routers);
        $itemCount   = count($items);
        $parts = [];
        if ($routerCount) $parts[] = "{$routerCount} router" . ($routerCount > 1 ? 's' : '');
        if ($itemCount)   $parts[] = "{$itemCount} item type" . ($itemCount  > 1 ? 's' : '');
        $summary = implode(' and ', $parts);

        createNotification(
            $db, $assignedToId,
            'inventory',
            'Inventory Assigned to You',
            "{$summary} issued to you by {$assignedByName} on {$date}. Check your dashboard.",
            'package-fill',
            '/admin/inventory/my-inventory'
        );

        // Build a human-readable SMS status for the frontend
        $smsStatus = 'unknown';
        $smsNote   = '';
        if (!empty($smsResult['sent'])) {
            $smsStatus = 'sent';
            $smsNote   = 'SMS sent to ' . ($smsResult['phone'] ?? '');
        } elseif (($smsResult['reason'] ?? '') === 'no_phone') {
            $smsStatus = 'no_phone';
            $smsNote   = 'No phone number on file for this user — in-app notification created instead.';
        } elseif (($smsResult['reason'] ?? '') === 'user_not_found') {
            $smsStatus = 'user_not_found';
            $smsNote   = 'User not found in users table.';
        } else {
            $smsStatus = 'failed';
            $smsNote   = 'SMS delivery failed: ' . ($smsResult['reason'] ?? 'unknown error');
        }

        echo json_encode([
            'success'    => true,
            'message'    => 'Assignment notification sent',
            'sms_status' => $smsStatus,
            'sms_note'   => $smsNote,
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}

// Internal helper — send raw SMS text to a user by their ID
// Returns array: ['sent' => bool, 'reason' => string, 'phone' => string|null, 'api_response' => mixed]
function sendDisbursementSMSRaw($db, $userId, $message) {
    try {
        $stmt = $db->prepare("SELECT phone FROM users WHERE id = ? LIMIT 1");
        $stmt->execute([$userId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            error_log("SMS: user {$userId} not found in users table");
            return ['sent' => false, 'reason' => 'user_not_found', 'phone' => null];
        }

        $phone = trim($row['phone'] ?? '');
        if (empty($phone)) {
            error_log("SMS: user {$userId} has no phone number stored");
            return ['sent' => false, 'reason' => 'no_phone', 'phone' => null];
        }

        require_once __DIR__ . '/advantasms-helper.php';
        $sms    = new AdvantaSMSAPI();
        $result = $sms->sendSingleSMS($phone, $message, 'INV-DONE-' . time());

        // AdvantaSMS always returns HTTP 200 — check the actual response-code in the body
        $apiCode = $result['response']['responses'][0]['response-code'] ?? null;
        $apiDesc = $result['response']['responses'][0]['response-description'] ?? ($result['error'] ?? 'api_error');
        // response-code 200 = success; anything else (402 = low balance, 1006 = bad creds, etc.) = failure
        $sent = ($result['http_code'] === 200) && ($apiCode == 200);

        error_log("SMS to {$phone}: " . ($sent ? 'SENT' : 'FAILED') . " (code={$apiCode}) | " . json_encode($result));

        return [
            'sent'         => $sent,
            'reason'       => $sent ? 'ok' : (string)$apiDesc,
            'phone'        => $phone,
            'api_response' => $result['response'] ?? $result['raw_response'] ?? null,
        ];
    } catch (Exception $e) {
        error_log('SMS send exception: ' . $e->getMessage());
        return ['sent' => false, 'reason' => $e->getMessage(), 'phone' => null];
    }
}

// =============================================
// DISCARDED DROP CABLE TABLE
// =============================================
function ensureDiscardedTable($db) {
    static $done = false;
    if ($done) {
        return;
    }
    $done = true;

    $db->exec("
        CREATE TABLE IF NOT EXISTS `inventory_discarded` (
            `id`                  BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            `disbursement_id`     BIGINT(20) UNSIGNED DEFAULT NULL,
            `item_id`             BIGINT(20) UNSIGNED DEFAULT NULL,
            `item_name`           VARCHAR(255) NOT NULL,
            `item_category`       VARCHAR(255) DEFAULT NULL,
            `quantity_pcs`        INT NOT NULL DEFAULT 1,
            `quantity_meters`     INT DEFAULT NULL,
            `assigned_to_id`      BIGINT(20) UNSIGNED DEFAULT NULL,
            `assigned_to_name`    VARCHAR(255) DEFAULT NULL,
            `discarded_by_id`     BIGINT(20) UNSIGNED DEFAULT NULL,
            `discarded_by_name`   VARCHAR(255) DEFAULT NULL,
            `notes`               TEXT DEFAULT NULL,
            `created_at`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_item_id` (`item_id`),
            KEY `idx_created_at` (`created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    try {
        $db->exec("ALTER TABLE `inventory_items`
            ADD COLUMN IF NOT EXISTS `quantity_discarded` INT(11) NOT NULL DEFAULT 0
            COMMENT 'Written-off quantity (pieces for drop cable)'");
    } catch (Exception $e) { /* column may exist */ }

    $extraCols = [
        'serial_number'    => "VARCHAR(50) DEFAULT NULL",
        'meters_used'      => "INT DEFAULT NULL COMMENT 'Meters used on tickets before discard'",
        'remaining_meters' => "INT DEFAULT NULL COMMENT 'Unusable pending meters written off'",
        'roll_meters'      => "INT DEFAULT NULL COMMENT 'Roll size e.g. 1000 or 2000'",
    ];
    foreach ($extraCols as $col => $def) {
        try {
            $db->exec("ALTER TABLE `inventory_discarded` ADD COLUMN IF NOT EXISTS `$col` $def");
        } catch (Exception $e) { /* column may exist */ }
    }
}

function formatDiscardUsageTicketRow($row, $qty) {
    return [
        'disbursement_id'  => (int)($row['id'] ?? 0),
        'ticket_id'        => (int)($row['ticket_id'] ?? 0),
        'ticket_number'    => $row['ticket_number'] ?? null,
        'subject'          => $row['ticket_subject'] ?? null,
        'meters'           => $qty,
        'used_at'          => $row['created_at'] ?? null,
        'assigned_to_name' => $row['assigned_to_name'] ?? null,
        'assigned_by_name' => $row['assigned_by_name'] ?? null,
    ];
}

/** Ticket usage rows for a technician's cable (bulk pool or numbered roll). */
function fetchCableUsageTicketsList($db, $assignedToId, $itemName, $serialNumber = '', $assignedToName = '', $beforeDate = null, $rollItemId = null) {
    $serialNumber = normalizeCableRollNumber($serialNumber);
    $mpp = getDropCableMetersPerPiece($itemName);
    if (!$mpp && $serialNumber !== '') {
        $mpp = 1000;
    }
    $tech = resolveInventoryTechnician($db, $assignedToId, $assignedToName);
    if (!$mpp || ($tech['id'] <= 0 && $tech['name'] === '')) {
        return [];
    }
    $techId = $tech['id'];
    $techName = $tech['name'];
    if ($techId > 0 && $techName !== '') {
        $stmt = $db->prepare("
            SELECT d.*, t.subject AS ticket_subject
            FROM inventory_disbursements d
            LEFT JOIN tickets t ON t.id = d.ticket_id
            WHERE d.type = 'item'
              AND (
                d.assigned_to_id = ? OR TRIM(COALESCE(d.assigned_to_name, '')) = ?
                OR d.assigned_by_id = ? OR TRIM(COALESCE(d.assigned_by_name, '')) = ?
              )
              AND (d.ticket_id IS NOT NULL OR (d.ticket_number IS NOT NULL AND TRIM(d.ticket_number) != ''))
            ORDER BY d.created_at ASC
        ");
        $stmt->execute([$techId, $techName, $techId, $techName]);
    } elseif ($techId > 0) {
        $stmt = $db->prepare("
            SELECT d.*, t.subject AS ticket_subject
            FROM inventory_disbursements d
            LEFT JOIN tickets t ON t.id = d.ticket_id
            WHERE d.type = 'item'
              AND (d.assigned_to_id = ? OR d.assigned_by_id = ?)
              AND (d.ticket_id IS NOT NULL OR (d.ticket_number IS NOT NULL AND TRIM(d.ticket_number) != ''))
            ORDER BY d.created_at ASC
        ");
        $stmt->execute([$techId, $techId]);
    } else {
        $stmt = $db->prepare("
            SELECT d.*, t.subject AS ticket_subject
            FROM inventory_disbursements d
            LEFT JOIN tickets t ON t.id = d.ticket_id
            WHERE d.type = 'item'
              AND (
                TRIM(COALESCE(d.assigned_to_name, '')) = ?
                OR TRIM(COALESCE(d.assigned_by_name, '')) = ?
              )
              AND (d.ticket_id IS NOT NULL OR (d.ticket_number IS NOT NULL AND TRIM(d.ticket_number) != ''))
            ORDER BY d.created_at ASC
        ");
        $stmt->execute([$techName, $techName]);
    }
    $tickets = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        if (!cableUsageBeforeCutoff($row, $beforeDate)) {
            continue;
        }
        if (!cableTicketUsageMatchesRoll($row, $serialNumber, $rollItemId, $mpp)) {
            continue;
        }
        $tickets[] = formatDiscardUsageTicketRow($row, (int)($row['quantity'] ?? 0));
    }
    return array_reverse($tickets);
}

/** Pending vs used meters for a cable assignment being discarded. */
function computeCableDiscardContext($db, $dis, $qtyPcs) {
    $serial = resolveCableRollSerial($db, $dis);
    $rollItemId = resolveCableRollItemId($db, $dis, $serial);

    $mpp = getDropCableMetersPerPiece($dis['item_name'] ?? '');
    if (!$mpp && !empty($dis['item_id'])) {
        $itemStmt = $db->prepare("SELECT * FROM inventory_items WHERE id = ?");
        $itemStmt->execute([(int)$dis['item_id']]);
        $itemRow = $itemStmt->fetch(PDO::FETCH_ASSOC);
        if ($itemRow) {
            $mpp = resolveDropCableMetersFromItemRow($itemRow);
        }
    }
    if (!$mpp && $rollItemId) {
        $itemStmt = $db->prepare("SELECT * FROM inventory_items WHERE id = ?");
        $itemStmt->execute([$rollItemId]);
        $itemRow = $itemStmt->fetch(PDO::FETCH_ASSOC);
        if ($itemRow) {
            $mpp = resolveDropCableMetersFromItemRow($itemRow);
        }
    }
    if (!$mpp && $serial !== '') {
        $mpp = 1000;
    }

    $tech = resolveInventoryTechnician($db, $dis['assigned_to_id'] ?? 0, $dis['assigned_to_name'] ?? '');
    $userId = $tech['id'];
    $userName = $tech['name'];
    $itemName = getDropCableMetersPerPiece($dis['item_name'] ?? '')
        ? ($dis['item_name'] ?? '')
        : dropCableTypeLabel($mpp ?: 1000);
    $balanceItemId = $rollItemId ?: ($dis['item_id'] ?? null);
    $canLookup = ($userId > 0 || $userName !== '');

    $tickets = $canLookup
        ? fetchCableUsageTicketsList($db, $userId, $itemName, $serial, $userName, null, $rollItemId)
        : [];
    $metersUsed = $canLookup
        ? getCableMetersUsedOnTickets($db, $userId, $itemName, $serial, $userName, null, $rollItemId)
        : 0;
    $pendingMeters = ($canLookup && $mpp)
        ? getTechnicianItemBalance($db, $userId, $balanceItemId, $itemName, $serial !== '' ? $serial : null, $userName)
        : 0;

    if ($mpp) {
        $remaining = min(max(0, $pendingMeters), max(0, (int)$qtyPcs * $mpp));
        if ($pendingMeters > 0 && $remaining <= 0) {
            $remaining = $pendingMeters;
        }
    } else {
        $remaining = (int)$qtyPcs;
    }

    return [
        'serial_number'    => $serial !== '' ? $serial : null,
        'roll_item_id'     => $rollItemId,
        'roll_meters'      => $mpp,
        'meters_used'      => $metersUsed,
        'remaining_meters' => $remaining,
        'quantity_meters'  => $remaining,
        'tickets'          => $tickets,
    ];
}

function enrichDiscardedCableRow($db, $row, $includeTickets = false) {
    $sourceDis = loadDisbursementForDiscard($db, $row);
    $tech = resolveInventoryTechnician($db, $row['assigned_to_id'] ?? 0, $row['assigned_to_name'] ?? '');
    $userId = $tech['id'];
    $userName = $tech['name'];
    $canLookup = ($userId > 0 || $userName !== '');

    $serial = normalizeCableRollNumber($row['serial_number'] ?? '');
    if ($serial === '') {
        $serial = resolveCableRollSerial($db, $sourceDis);
    }
    $rollItemId = resolveCableRollItemId($db, $sourceDis, $serial);
    if (!$rollItemId && !empty($row['item_id'])) {
        $rollItemId = resolveCableRollItemId($db, $row, $serial);
    }

    $itemName = getDropCableMetersPerPiece($row['item_name'] ?? '')
        ? ($row['item_name'] ?? '')
        : dropCableTypeLabel((int)($row['roll_meters'] ?? 0) ?: 1000);
    $mpp = (int)($row['roll_meters'] ?? 0) ?: getDropCableMetersPerPiece($itemName);
    if (!$mpp && $rollItemId) {
        $itemStmt = $db->prepare("SELECT * FROM inventory_items WHERE id = ?");
        $itemStmt->execute([$rollItemId]);
        $itemRow = $itemStmt->fetch(PDO::FETCH_ASSOC);
        if ($itemRow) {
            $mpp = resolveDropCableMetersFromItemRow($itemRow);
        }
    }
    $qtyPcs = max(1, (int)($row['quantity_pcs'] ?? 1));
    $beforeDate = $row['created_at'] ?? null;

    if ($serial !== '' && empty($row['serial_number']) && !empty($row['id'])) {
        try {
            $db->prepare("UPDATE inventory_discarded SET serial_number = ? WHERE id = ? AND (serial_number IS NULL OR TRIM(serial_number) = '')")
                ->execute([$serial, (int)$row['id']]);
        } catch (Exception $e) { /* non-fatal */ }
        $row['serial_number'] = $serial;
    } elseif ($serial !== '') {
        $row['serial_number'] = $serial;
    }
    if ($rollItemId) {
        $row['item_id'] = $rollItemId;
    }

    if ($canLookup && $userId > 0 && empty($row['assigned_to_id'])) {
        $row['assigned_to_id'] = $userId;
    }

    $tickets = $canLookup
        ? fetchCableUsageTicketsList($db, $userId, $itemName, $serial, $userName, $beforeDate, $rollItemId)
        : [];
    $metersUsed = $canLookup
        ? getCableMetersUsedOnTickets($db, $userId, $itemName, $serial, $userName, $beforeDate, $rollItemId)
        : 0;

    $storedRemaining = (int)($row['remaining_meters'] ?? $row['quantity_meters'] ?? 0);
    $remaining = $storedRemaining;

    // Legacy rows often stored full roll (1000 m) instead of pending balance after ticket use
    if ($mpp > 0) {
        if ($metersUsed > 0) {
            $inferred = max(0, ($qtyPcs * $mpp) - $metersUsed);
            if ($storedRemaining <= 0 || $storedRemaining >= ($qtyPcs * $mpp)) {
                $remaining = $inferred;
            } elseif ($storedRemaining + $metersUsed > ($qtyPcs * $mpp)) {
                $remaining = max(0, ($qtyPcs * $mpp) - $metersUsed);
            }
        }
    }

    $row['roll_meters'] = $mpp ?: $row['roll_meters'];
    $row['meters_used'] = $metersUsed;
    $row['remaining_meters'] = $remaining;
    $row['quantity_meters'] = $remaining;
    $row['ticket_count'] = count($tickets);
    if ($includeTickets) {
        $row['tickets'] = $tickets;
    }
    return $row;
}

function fetchDiscardedUsageTickets($db, $discardRow) {
    return enrichDiscardedCableRow($db, $discardRow, true)['tickets'] ?? [];
}

function recordCableDiscard($db, $dis, $qtyPcs, $actorId, $actorName, $notes, $disbursementId, array $ctx = null) {
    ensureDiscardedTable($db);
    if ($ctx === null) {
        $ctx = computeCableDiscardContext($db, $dis, $qtyPcs);
    }
    $meters = $ctx['quantity_meters'] ?? null;

    $ins = $db->prepare("INSERT INTO inventory_discarded
        (disbursement_id, item_id, item_name, item_category, quantity_pcs, quantity_meters,
         serial_number, meters_used, remaining_meters, roll_meters,
         assigned_to_id, assigned_to_name, discarded_by_id, discarded_by_name, notes, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())");
    $storeItemId = !empty($ctx['roll_item_id']) ? (int)$ctx['roll_item_id'] : ($dis['item_id'] ?? null);

    $ins->execute([
        $disbursementId,
        $storeItemId,
        getDropCableMetersPerPiece($dis['item_name'] ?? '')
            ? ($dis['item_name'] ?? '')
            : dropCableTypeLabel($ctx['roll_meters'] ?? 1000),
        $dis['item_category'] ?? null,
        $qtyPcs,
        $meters,
        $ctx['serial_number'] ?? null,
        $ctx['meters_used'] ?? null,
        $ctx['remaining_meters'] ?? null,
        $ctx['roll_meters'] ?? null,
        $dis['assigned_to_id'] ?? null,
        $dis['assigned_to_name'] ?? null,
        $actorId,
        $actorName ?: null,
        $notes ?: null,
    ]);

    if (!empty($dis['item_id'])) {
        $db->prepare("UPDATE inventory_items
            SET quantity_discarded = COALESCE(quantity_discarded, 0) + ?,
                updated_at = NOW()
            WHERE id = ?")->execute([$qtyPcs, $dis['item_id']]);
    }

    return $ctx;
}

// =============================================
// LIST DISCARDED DROP CABLE
// GET /inventory/discarded
// GET /inventory/discarded?id=123 — detail with ticket usage
// =============================================
function getDiscardedCableDetail($db, $id) {
    $stmt = $db->prepare("SELECT * FROM inventory_discarded WHERE id = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Discarded entry not found']);
        return;
    }
    $row = enrichDiscardedCableRow($db, $row, true);
    echo json_encode(['success' => true, 'data' => $row]);
}

function listDiscardedCable($db) {
    try {
        ensureDiscardedTable($db);
        $detailId = !empty($_GET['id']) ? (int)$_GET['id'] : 0;
        if ($detailId > 0) {
            getDiscardedCableDetail($db, $detailId);
            return;
        }

        $stmt = $db->query("
            SELECT * FROM inventory_discarded
            ORDER BY created_at DESC
            LIMIT 500
        ");
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $rows = array_map(function ($row) use ($db) {
            return enrichDiscardedCableRow($db, $row, false);
        }, $rows);
        echo json_encode(['success' => true, 'data' => $rows]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error: ' . $e->getMessage()]);
    }
}

// =============================================
// RETURN OR DISCARD PART OF AN ITEM DISBURSEMENT
// POST /inventory/disbursements/{id}/return
// body: quantity, disposition=return|discard (discard = drop cable write-off, no restock)
// =============================================
function returnDisbursement($db, $id) {
    try {
        ensureDisbursementsTable($db);
        ensureActivityLogTable($db);

        $stmt = $db->prepare("SELECT * FROM inventory_disbursements WHERE id = ?");
        $stmt->execute([$id]);
        $dis = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$dis) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Disbursement not found']);
            return;
        }

        if (($dis['type'] ?? '') !== 'item') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Only item assignments can be returned or discarded']);
            return;
        }
        if (!empty($dis['ticket_id']) || !empty($dis['ticket_number'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Used-on-ticket rows cannot be returned from this screen']);
            return;
        }

        $body        = getRequestBody();
        $returnQty   = max(1, intval($body['quantity'] ?? 0));
        $actorId     = !empty($body['actor_id'])   ? intval($body['actor_id'])   : null;
        $actorName   = trim($body['actor_name']    ?? '');
        $returnNotes = trim($body['notes']         ?? '');
        $disposition = strtolower(trim($body['disposition'] ?? 'return'));
        if ($disposition !== 'discard' && $returnNotes !== '' && stripos($returnNotes, 'discard') !== false) {
            $disposition = 'discard';
        }
        $isDiscard   = ($disposition === 'discard');
        $issuedQty   = max(0, intval($dis['quantity'] ?? 0));

        if ($isDiscard && !getDropCableMetersPerPiece($dis['item_name'] ?? '')) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Discard is only supported for drop cable (1k / 2k)']);
            return;
        }

        if ($returnQty <= 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Quantity must be greater than zero']);
            return;
        }
        if ($returnQty > $issuedQty) {
            http_response_code(409);
            echo json_encode(['success' => false, 'error' => "Cannot process {$returnQty}. Assigned quantity is {$issuedQty}"]);
            return;
        }

        $serial = trim((string)($dis['serial_number'] ?? ''));
        // Numbered rolls may be returned with ticket usage — leftover meters stay on the roll.
        $isNumberedCableReturn = !$isDiscard && $serial !== '' && (
            getDropCableMetersPerPiece($dis['item_name'] ?? '')
            || isCableRollNumber($serial)
        );
        if (!$isDiscard && !$isNumberedCableReturn && $serial !== '' && !empty($dis['assigned_to_id'])) {
            $usageStmt = $db->prepare("
                SELECT COUNT(*) FROM inventory_disbursements
                WHERE type = 'item' AND serial_number = ? AND assigned_to_id = ?
                  AND ticket_id IS NOT NULL AND id != ?
            ");
            $usageStmt->execute([$serial, (int)$dis['assigned_to_id'], (int)$id]);
            if ((int)$usageStmt->fetchColumn() > 0) {
                http_response_code(409);
                echo json_encode([
                    'success' => false,
                    'error' => 'This cable roll has ticket usage — use Discard for the remaining balance, not Return to warehouse',
                ]);
                return;
            }
        }

        // For numbered drop-cable returns, always release the full assignment row (1 roll)
        // and keep remaining meters on the inventory item for the next assignee.
        $cableRemainingKept = null;
        if ($isNumberedCableReturn) {
            $returnQty = $issuedQty;
        }

        $remainingQty = $issuedQty - $returnQty;

        $discardCtx = null;
        if ($isDiscard) {
            $discardCtx = computeCableDiscardContext($db, $dis, $returnQty);
        }

        $db->beginTransaction();

        if (!$isDiscard && !empty($dis['item_id'])) {
            $itemStmt = $db->prepare("SELECT * FROM inventory_items WHERE id = ?");
            $itemStmt->execute([$dis['item_id']]);
            $itemRow = $itemStmt->fetch(PDO::FETCH_ASSOC);
            if ($itemRow && (isDropCableRollItem($itemRow) || !empty($dis['serial_number']))) {
                $balanceLeft = getTechnicianItemBalance(
                    $db,
                    (int)($dis['assigned_to_id'] ?? 0),
                    (int)$dis['item_id'],
                    $dis['item_name'] ?? '',
                    $serial,
                    $dis['assigned_to_name'] ?? ''
                );
                $cableRemainingKept = releaseCableRollKeepingRemaining($db, $itemRow, $balanceLeft);
            } else {
                $updItem = $db->prepare("UPDATE inventory_items
                    SET quantity_available = quantity_available + ?, updated_at = NOW()
                    WHERE id = ?");
                $updItem->execute([$returnQty, $dis['item_id']]);
            }
        }

        if ($isDiscard) {
            recordCableDiscard($db, $dis, $returnQty, $actorId, $actorName, $returnNotes, (int)$id, $discardCtx);
            if (!empty($dis['item_id'])) {
                $itemStmt = $db->prepare("SELECT * FROM inventory_items WHERE id = ?");
                $itemStmt->execute([$dis['item_id']]);
                $itemRow = $itemStmt->fetch(PDO::FETCH_ASSOC);
                if ($itemRow && (isDropCableRollItem($itemRow) || trim((string)($dis['serial_number'] ?? '')) !== '')) {
                    // Numbered roll only — bulk Drop Cable 1k/2k stock row stays active
                    setCableRollRemainingMeters($db, (int)$dis['item_id'], 0);
                    $db->prepare("UPDATE inventory_items
                        SET status = 'inactive', assigned_to_id = NULL, assigned_to_name = NULL, updated_at = NOW()
                        WHERE id = ?")->execute([$dis['item_id']]);
                }
            }
        }

        if ($remainingQty > 0) {
            $label = $isDiscard ? 'Discarded' : 'Returned';
            $extra = $returnNotes ? " | Note: {$returnNotes}" : "";
            $newNote = trim((string)($dis['notes'] ?? ''));
            $newNote = $newNote ? ($newNote . " | {$label} {$returnQty} on " . date('Y-m-d H:i') . $extra)
                                : ("{$label} {$returnQty} on " . date('Y-m-d H:i') . $extra);

            $updDis = $db->prepare("UPDATE inventory_disbursements
                SET quantity = ?, notes = ?, created_at = created_at
                WHERE id = ?");
            $updDis->execute([$remainingQty, $newNote, $id]);
        } else {
            $db->prepare("DELETE FROM inventory_disbursements WHERE id = ?")->execute([$id]);
        }

        if ($db->inTransaction()) {
            $db->commit();
        }

        $who = $dis['assigned_to_name'] ?? 'unknown user';
        if ($isDiscard) {
            $rem = $discardCtx['remaining_meters'] ?? null;
            $used = $discardCtx['meters_used'] ?? null;
            $mLabel = $rem !== null
                ? "{$rem} m unusable pending"
                : ($returnQty . ' pc');
            if ($used) {
                $mLabel .= " ({$used} m used on tickets)";
            }
            $logNote = "Unusable pending cable discarded from {$who}: {$mLabel} — not restocked"
                . ($returnNotes ? " — {$returnNotes}" : '');
            logInventoryActivity(
                $db,
                'cable_discarded',
                $dis['item_id'] ?? null,
                $dis['item_name'] ?? null,
                $dis['item_category'] ?? null,
                $dis['serial_number'] ?? null,
                $returnQty,
                $actorId,
                $actorName ?: null,
                $logNote
            );
        } else {
            $logNote = "Returned by {$who}";
            if ($cableRemainingKept !== null) {
                $logNote .= " — {$cableRemainingKept} m remaining on roll";
            }
            $logNote .= ($returnNotes ? " — {$returnNotes}" : "");
            logInventoryActivity(
                $db,
                'item_returned',
                $dis['item_id'] ?? null,
                $dis['item_name'] ?? null,
                $dis['item_category'] ?? null,
                $dis['serial_number'] ?? null,
                $returnQty,
                $actorId,
                $actorName ?: null,
                $logNote
            );
        }

        echo json_encode([
            'success' => true,
            'disposition' => $isDiscard ? 'discard' : 'return',
            'processed_quantity' => $returnQty,
            'remaining_quantity' => $remainingQty,
            'meters_discarded' => $isDiscard ? ($discardCtx['remaining_meters'] ?? null) : null,
            'meters_used' => $isDiscard ? ($discardCtx['meters_used'] ?? null) : null,
            'remaining_meters' => $isDiscard
                ? ($discardCtx['remaining_meters'] ?? null)
                : $cableRemainingKept,
            'serial_number' => $isDiscard
                ? ($discardCtx['serial_number'] ?? null)
                : ($serial !== '' ? $serial : null),
            'message' => $isDiscard
                ? ($remainingQty > 0
                    ? 'Unusable pending cable discarded (not restocked)'
                    : 'Assignment fully discarded — unusable pending cable written off')
                : ($cableRemainingKept !== null
                    ? "Roll returned with {$cableRemainingKept} m remaining — next assignee gets this leftover"
                    : ($remainingQty > 0 ? 'Item returned to warehouse stock' : 'Assignment fully returned')),
        ]);
    } catch (PDOException $e) {
        if ($db->inTransaction()) $db->rollBack();
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error: ' . $e->getMessage()]);
    }
}

// =============================================
// DELETE DISBURSEMENT (undo)
// =============================================
function deleteDisbursement($db, $id) {
    try {
        ensureDisbursementsTable($db);
        $stmt = $db->prepare("SELECT * FROM inventory_disbursements WHERE id = ?");
        $stmt->execute([$id]);
        $dis = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$dis) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Disbursement not found']);
            return;
        }

        if (($dis['type'] ?? '') === 'item' && (!empty($dis['ticket_id']) || !empty($dis['ticket_number']))) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'error' => 'Ticket usage rows cannot be removed here — undo from the ticket or contact an administrator',
            ]);
            return;
        }

        // Who is performing the undo? Accept from request body
        $body      = getRequestBody();
        $actorId   = !empty($body['actor_id'])   ? intval($body['actor_id'])   : null;
        $actorName = $body['actor_name'] ?? null;

        $db->beginTransaction();

        $kept = null;
        $logNoteExtra = '';

        if ($dis['type'] === 'router' && $dis['item_id']) {
            // Revert router to active, clear assignment
            $upd = $db->prepare("UPDATE inventory_items
                SET status = 'active', assigned_to_id = NULL, assigned_to_name = NULL, updated_at = NOW()
                WHERE id = ?");
            $upd->execute([$dis['item_id']]);
            reverseCompanionPatchcordForRouter($db, $dis);
        } elseif ($dis['type'] === 'item' && $dis['item_id']) {
            $itemStmt = $db->prepare("SELECT * FROM inventory_items WHERE id = ?");
            $itemStmt->execute([$dis['item_id']]);
            $itemRow = $itemStmt->fetch(PDO::FETCH_ASSOC);
            if ($itemRow && isDropCableRollItem($itemRow)) {
                $balanceLeft = getTechnicianItemBalance(
                    $db,
                    (int)($dis['assigned_to_id'] ?? 0),
                    (int)$dis['item_id'],
                    $dis['item_name'] ?? '',
                    $dis['serial_number'] ?? '',
                    $dis['assigned_to_name'] ?? ''
                );
                $kept = releaseCableRollKeepingRemaining($db, $itemRow, $balanceLeft);
                $logNoteExtra = " — {$kept} m remaining on roll";
            } else {
                $upd = $db->prepare("UPDATE inventory_items
                    SET quantity_available = quantity_available + ?, updated_at = NOW()
                    WHERE id = ?");
                $upd->execute([$dis['quantity'], $dis['item_id']]);
            }
        }

        $db->prepare("DELETE FROM inventory_disbursements WHERE id = ?")->execute([$id]);
        $db->commit();

        // Build a descriptive log note
        $wasTicket   = !empty($dis['ticket_number']);
        $logAction   = ($dis['type'] === 'router') ? 'router_unassigned' : 'item_unassigned';
        $assignedTo  = $dis['assigned_to_name'] ?? 'unknown';
        $ticketNote  = $wasTicket ? " (was on ticket #{$dis['ticket_number']})" : "";
        $logNote     = "Removed from {$assignedTo}{$ticketNote}{$logNoteExtra}";
        logInventoryActivity(
            $db, $logAction,
            $dis['item_id'],
            $dis['item_name'],
            $dis['item_category'] ?? null,
            $dis['serial_number'] ?? null,
            $dis['quantity'] ?? 1,
            $actorId,
            $actorName,
            $logNote
        );

        echo json_encode([
            'success' => true,
            'remaining_meters' => $kept,
        ]);
    } catch (PDOException $e) {
        if ($db->inTransaction()) $db->rollBack();
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error: ' . $e->getMessage()]);
    }
}

// =============================================
// GET USERS (technicians & engineers only, for assignment dropdown)
// =============================================
function getInventoryUsers($db) {
    try {
        $search = trim($_GET['search'] ?? '');

        $sql = "
            SELECT DISTINCT u.id, u.name, u.email
            FROM users u
            INNER JOIN model_has_roles mhr ON mhr.model_id = u.id
                AND mhr.model_type = 'App\\\\Models\\\\User'
            INNER JOIN roles r ON r.id = mhr.role_id
                AND r.guard_name IN ('api', 'web')
                AND r.name IN ('technician', 'engineer')
            WHERE u.deleted_at IS NULL
        ";
        $bindings = [];

        if (!empty($search)) {
            $sql .= " AND (u.name LIKE ? OR u.email LIKE ?)";
            $term = "%$search%";
            $bindings[] = $term;
            $bindings[] = $term;
        }

        $sql .= " ORDER BY u.name LIMIT 200";

        $stmt = $db->prepare($sql);
        $stmt->execute($bindings);
        $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'data' => $users]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error: ' . $e->getMessage()]);
    }
}

// =============================================
// LIST REQUESTS
// =============================================
function listRequests($db) {
    try {
        // Placeholder - implement when requests table is created
        echo json_encode([
            'success' => true,
            'data' => []
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Database error: ' . $e->getMessage()
        ]);
    }
}

// =============================================
// GET SINGLE REQUEST
// =============================================
function getRequest($db, $id) {
    try {
        // Placeholder - implement when requests table is created
        http_response_code(404);
        echo json_encode([
            'success' => false,
            'error' => 'Request not found'
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Database error: ' . $e->getMessage()
        ]);
    }
}

// =============================================
// CREATE REQUEST
// =============================================
function createRequest($db) {
    try {
        // Placeholder - implement when requests table is created
        http_response_code(501);
        echo json_encode([
            'success' => false,
            'error' => 'Not implemented yet'
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Database error: ' . $e->getMessage()
        ]);
    }
}

// =============================================
// APPROVE REQUEST
// =============================================
function approveRequest($db, $id) {
    try {
        // Placeholder - implement when requests table is created
        http_response_code(501);
        echo json_encode([
            'success' => false,
            'error' => 'Not implemented yet'
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Database error: ' . $e->getMessage()
        ]);
    }
}

// =============================================
// REJECT REQUEST
// =============================================
function rejectRequest($db, $id) {
    try {
        // Placeholder - implement when requests table is created
        http_response_code(501);
        echo json_encode([
            'success' => false,
            'error' => 'Not implemented yet'
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Database error: ' . $e->getMessage()
        ]);
    }
}

// =============================================
// SEARCH ROUTER BY LAST-4 CHARS OF SERIAL
// GET /inventory/search-serial?q=XXXX
// =============================================
function searchRouterBySerial($db) {
    try {
        ensureDisbursementsTable($db);
        $q = trim($_GET['q'] ?? '');
        if (strlen($q) < 2) {
            echo json_encode(['success' => true, 'data' => []]);
            return;
        }
        $stmt = $db->prepare("
            SELECT * FROM inventory_items
            WHERE category = 'GPON Router'
              AND serial_number IS NOT NULL
              AND serial_number != ''
              AND serial_number LIKE ?
            ORDER BY name ASC
            LIMIT 20
        ");
        $stmt->execute(['%' . $q]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'data' => array_map('formatInventoryItem', $rows)]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}

// =============================================
// LINK ROUTER TO TICKET
// POST /inventory/link-ticket
// =============================================
function linkRouterToTicket($db) {
    try {
        ensureDisbursementsTable($db);
        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        $itemId       = !empty($data['item_id'])      ? intval($data['item_id'])      : null;
        $ticketId     = !empty($data['ticket_id'])     ? intval($data['ticket_id'])     : null;
        $ticketNumber = trim($data['ticket_number']    ?? '');
        $usedById     = !empty($data['used_by_id'])    ? intval($data['used_by_id'])    : null;
        $usedByName   = trim($data['used_by_name']     ?? '');

        if (!$itemId || !$ticketId) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'item_id and ticket_id are required']);
            return;
        }

        $check = $db->prepare("SELECT * FROM inventory_items WHERE id = ? AND category = 'GPON Router' LIMIT 1");
        $check->execute([$itemId]);
        $router = $check->fetch(PDO::FETCH_ASSOC);
        if (!$router) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Router not found in inventory']);
            return;
        }

        $upd = $db->prepare("
            UPDATE inventory_items
            SET ticket_id     = ?,
                ticket_number = ?,
                used_by_id    = ?,
                used_by_name  = ?,
                updated_at    = NOW()
            WHERE id = ?
        ");
        $upd->execute([$ticketId, $ticketNumber ?: null, $usedById, $usedByName ?: null, $itemId]);

        $patchConsume = consumePatchcordOnRouterInstall(
            $db,
            $usedById,
            $usedByName,
            $ticketId,
            $ticketNumber,
            $router['name'] ?? '',
            $usedById,
            $usedByName
        );

        $fetch = $db->prepare("SELECT * FROM inventory_items WHERE id = ?");
        $fetch->execute([$itemId]);
        $updated = $fetch->fetch(PDO::FETCH_ASSOC);

        $payload = ['success' => true, 'data' => formatInventoryItem($updated)];
        if (!empty($patchConsume['ok'])) {
            $payload['patchcord'] = $patchConsume;
        } elseif (!empty($patchConsume['warning'])) {
            $payload['patchcord_warning'] = $patchConsume['warning'];
        }
        echo json_encode($payload);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}

