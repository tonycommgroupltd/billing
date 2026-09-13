<?php
/**
 * Splynx Database Import & Export API
 * Shows: Customer ID, Name, Service Status, Plan, Price, Start Date, Billing Type
 * 
 * POST ?action=upload     - Upload SQL dump, import customers + services + plans
 * GET  ?action=customers  - Get customers with service details
 * GET  ?action=export     - Download as Excel (.xls) file
 * GET  ?action=status     - Check if data has been imported
 */

require_once __DIR__ . '/helpers.php';

setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

ini_set('upload_max_filesize', '200M');
ini_set('post_max_size', '250M');
ini_set('max_execution_time', '600');
ini_set('memory_limit', '512M');
ini_set('max_input_time', '300');

$user = checkAuth();

$config = require __DIR__ . '/config.php';
$pdo = new PDO(
    "mysql:host={$config['db']['host']};dbname={$config['db']['database']};charset=utf8mb4;port=" . ($config['db']['port'] ?? 3306),
    $config['db']['username'],
    $config['db']['password'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);

$action = $_GET['action'] ?? '';

try {
    switch ($action) {
        case 'upload':
            handleUpload($pdo);
            break;
        case 'customers':
            getCustomers($pdo);
            break;
        case 'export':
            exportExcel($pdo);
            break;
        case 'status':
            getImportStatus($pdo);
            break;
        default:
            jsonResponse(['success' => false, 'message' => 'Invalid action. Use: upload, customers, export, status'], 400);
    }
} catch (Exception $e) {
    jsonResponse(['success' => false, 'message' => $e->getMessage()], 500);
}

// ===================== FUNCTIONS =====================

/**
 * Column mapping: source table columns -> splynx_ table columns
 * Only columns listed here will be imported; extras from the SQL dump are dropped.
 */
function getColumnMap($srcTable) {
    $maps = [
        'customers' => [
            'id' => 'id', 'name' => 'name', 'phone_number' => 'phone_number',
            'city' => 'city', 'created_at' => 'created_at', 'updated_at' => 'updated_at',
            'deleted_at' => 'deleted_at'
        ],
        'plans' => [
            'id' => 'id', 'title' => 'title', 'price' => 'price',
            'rate_limit' => 'rate_limit', 'deleted_at' => 'deleted_at'
        ],
        'services' => [
            'id' => 'id', 'customer_id' => 'customer_id', 'plan_id' => 'plan_id',
            'price' => 'price', 'start_date' => 'start_date', 'end_date' => 'end_date',
            'billing_type' => 'billing_type', 'billing_period' => 'billing_period',
            'bill_to' => 'bill_to', 'mikrotik_name' => 'mikrotik_name',
            'mikrotik_password' => 'mikrotik_password', 'status' => 'status',
            'created_at' => 'created_at', 'updated_at' => 'updated_at',
            'deleted_at' => 'deleted_at'
        ]
    ];
    return $maps[$srcTable] ?? [];
}

/**
 * Parse the INSERT statement, remap columns, and execute
 * Source: INSERT INTO `services` (`id`, `mikrotik_id`, `customer_id`, ...) VALUES (...);
 * We drop columns not in our target table and rewrite to INSERT INTO `splynx_services` (...)
 */
function executeRemappedInsert($pdo, $srcTable, $fullInsert) {
    $targetTable = 'splynx_' . $srcTable;
    $colMap = getColumnMap($srcTable);
    if (empty($colMap)) return;

    // Extract column list from: INSERT INTO `table` (`col1`, `col2`, ...) VALUES
    if (!preg_match("/INSERT INTO `$srcTable`\s*\((.+?)\)\s*VALUES/i", $fullInsert, $m)) {
        return;
    }

    $srcColsRaw = $m[1];
    // Parse source column names
    preg_match_all("/`(\w+)`/", $srcColsRaw, $colMatches);
    $srcCols = $colMatches[1]; // e.g. ['id', 'mikrotik_id', 'customer_id', ...]

    // Figure out which column indices to keep
    $keepIndices = [];
    $targetCols = [];
    foreach ($srcCols as $idx => $col) {
        if (isset($colMap[$col])) {
            $keepIndices[] = $idx;
            $targetCols[] = '`' . $colMap[$col] . '`';
        }
    }

    if (empty($targetCols)) return;

    // Extract the VALUES part: everything after "VALUES" until the final ";"
    $valuesPos = strpos($fullInsert, 'VALUES');
    if ($valuesPos === false) return;
    $valuesStr = substr($fullInsert, $valuesPos + 6);
    $valuesStr = rtrim(trim($valuesStr), ';');

    // Parse individual value tuples: (val1, val2, ...), (val1, val2, ...), ...
    // We need to handle nested parens, quoted strings with commas/parens inside
    $tuples = parseValueTuples($valuesStr);

    if (empty($tuples)) return;

    // Build new INSERT with only the columns we want
    $targetColList = implode(', ', $targetCols);
    $newTuples = [];

    foreach ($tuples as $tuple) {
        // Parse individual values from this tuple
        $values = parseTupleValues($tuple);
        if (count($values) !== count($srcCols)) {
            // Column count mismatch, skip this tuple
            continue;
        }

        // Keep only the values for columns we want
        $filteredValues = [];
        foreach ($keepIndices as $idx) {
            $filteredValues[] = $values[$idx];
        }
        $newTuples[] = '(' . implode(', ', $filteredValues) . ')';
    }

    if (empty($newTuples)) return;

    // Execute in batches to avoid query size limits
    $batchSize = 50;
    $batches = array_chunk($newTuples, $batchSize);

    foreach ($batches as $batch) {
        $sql = "INSERT INTO `$targetTable` ($targetColList) VALUES " . implode(",\n", $batch);
        try {
            $pdo->exec($sql);
        } catch (PDOException $e) {
            error_log("Import error $targetTable: " . $e->getMessage());
        }
    }
}

/**
 * Parse "(v1,v2,...), (v1,v2,...)" into array of tuple strings (without outer parens)
 */
function parseValueTuples($str) {
    $tuples = [];
    $depth = 0;
    $start = -1;
    $inQuote = false;
    $quoteChar = '';
    $len = strlen($str);

    for ($i = 0; $i < $len; $i++) {
        $ch = $str[$i];

        // Handle escape sequences
        if ($i > 0 && $str[$i - 1] === '\\') {
            continue;
        }

        if ($inQuote) {
            if ($ch === $quoteChar) {
                // Check for escaped quote '' 
                if ($i + 1 < $len && $str[$i + 1] === $quoteChar) {
                    $i++; // skip next
                    continue;
                }
                $inQuote = false;
            }
            continue;
        }

        if ($ch === '\'' || $ch === '"') {
            $inQuote = true;
            $quoteChar = $ch;
            continue;
        }

        if ($ch === '(') {
            if ($depth === 0) {
                $start = $i + 1;
            }
            $depth++;
        } elseif ($ch === ')') {
            $depth--;
            if ($depth === 0 && $start >= 0) {
                $tuples[] = substr($str, $start, $i - $start);
                $start = -1;
            }
        }
    }

    return $tuples;
}

/**
 * Parse "val1, val2, val3" from inside a tuple into individual value strings
 * Handles quoted strings with commas inside
 */
function parseTupleValues($tuple) {
    $values = [];
    $current = '';
    $inQuote = false;
    $quoteChar = '';
    $len = strlen($tuple);

    for ($i = 0; $i < $len; $i++) {
        $ch = $tuple[$i];

        if ($ch === '\\' && $inQuote) {
            // Escaped character — take it and the next char
            $current .= $ch;
            if ($i + 1 < $len) {
                $i++;
                $current .= $tuple[$i];
            }
            continue;
        }

        if ($inQuote) {
            if ($ch === $quoteChar) {
                // Check for '' escape
                if ($i + 1 < $len && $tuple[$i + 1] === $quoteChar) {
                    $current .= $ch . $tuple[$i + 1];
                    $i++;
                    continue;
                }
                $inQuote = false;
            }
            $current .= $ch;
            continue;
        }

        if ($ch === '\'' || $ch === '"') {
            $inQuote = true;
            $quoteChar = $ch;
            $current .= $ch;
            continue;
        }

        if ($ch === ',') {
            $values[] = trim($current);
            $current = '';
            continue;
        }

        $current .= $ch;
    }

    if (strlen(trim($current)) > 0) {
        $values[] = trim($current);
    }

    return $values;
}

function ensureTables($pdo) {
    $pdo->exec("DROP TABLE IF EXISTS splynx_services");
    $pdo->exec("DROP TABLE IF EXISTS splynx_plans");
    $pdo->exec("DROP TABLE IF EXISTS splynx_customers");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS splynx_customers (
            id BIGINT UNSIGNED PRIMARY KEY,
            name VARCHAR(255),
            phone_number VARCHAR(255),
            city VARCHAR(255),
            created_at TIMESTAMP NULL,
            updated_at TIMESTAMP NULL,
            deleted_at TIMESTAMP NULL,
            imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_name (name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS splynx_plans (
            id BIGINT UNSIGNED PRIMARY KEY,
            title VARCHAR(255),
            price DOUBLE(8,2) NOT NULL DEFAULT 0,
            rate_limit TEXT,
            deleted_at TIMESTAMP NULL,
            imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS splynx_services (
            id BIGINT UNSIGNED PRIMARY KEY,
            customer_id BIGINT UNSIGNED NOT NULL,
            plan_id BIGINT UNSIGNED DEFAULT NULL,
            price DOUBLE(8,2) NOT NULL DEFAULT 0,
            start_date DATETIME DEFAULT NULL,
            end_date DATETIME DEFAULT NULL,
            billing_type LONGTEXT,
            billing_period JSON DEFAULT NULL,
            bill_to DATETIME DEFAULT NULL,
            mikrotik_name VARCHAR(255) DEFAULT '',
            mikrotik_password VARCHAR(255) DEFAULT '',
            status LONGTEXT,
            created_at TIMESTAMP NULL,
            updated_at TIMESTAMP NULL,
            deleted_at TIMESTAMP NULL,
            imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_customer (customer_id),
            INDEX idx_plan (plan_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
}

function handleUpload($pdo) {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'POST method required'], 405);
        return;
    }

    if (!isset($_FILES['sqlfile']) || $_FILES['sqlfile']['error'] !== UPLOAD_ERR_OK) {
        $errorMsg = 'No file uploaded';
        if (isset($_FILES['sqlfile'])) {
            $uploadErrors = [
                UPLOAD_ERR_INI_SIZE => 'File exceeds server upload limit',
                UPLOAD_ERR_FORM_SIZE => 'File exceeds form limit',
                UPLOAD_ERR_PARTIAL => 'File only partially uploaded',
                UPLOAD_ERR_NO_FILE => 'No file selected',
                UPLOAD_ERR_NO_TMP_DIR => 'Missing temp directory',
                UPLOAD_ERR_CANT_WRITE => 'Failed to write to disk',
            ];
            $errorMsg = $uploadErrors[$_FILES['sqlfile']['error']] ?? 'Upload error code: ' . $_FILES['sqlfile']['error'];
        }
        jsonResponse(['success' => false, 'message' => $errorMsg], 400);
        return;
    }

    $file = $_FILES['sqlfile']['tmp_name'];
    $filename = $_FILES['sqlfile']['name'];
    $filesize = $_FILES['sqlfile']['size'];

    ensureTables($pdo);

    $handle = fopen($file, 'r');
    if (!$handle) {
        jsonResponse(['success' => false, 'message' => 'Could not read uploaded file'], 500);
        return;
    }

    // Tables we care about
    $tablesWeWant = ['customers', 'plans', 'services'];
    $buffer = '';
    $inInsert = false;
    $currentInsertTable = null;

    while (!feof($handle)) {
        $line = fgets($handle);
        if ($line === false) break;
        $trimmed = trim($line);

        // Skip empty lines and pure comments (not inside an INSERT)
        if (!$inInsert && (empty($trimmed) || strpos($trimmed, '--') === 0 || strpos($trimmed, '/*') === 0)) {
            continue;
        }

        // Detect start of INSERT INTO `tablename`
        if (!$inInsert && preg_match("/^INSERT INTO `(\w+)`/i", $trimmed, $m)) {
            $srcTable = $m[1];
            if (in_array($srcTable, $tablesWeWant)) {
                $inInsert = true;
                $currentInsertTable = $srcTable;
                $buffer = $trimmed;
                // Check if this single line has the complete statement
                if (substr(rtrim($buffer), -1) === ';') {
                    executeRemappedInsert($pdo, $currentInsertTable, $buffer);
                    $buffer = '';
                    $inInsert = false;
                    $currentInsertTable = null;
                }
            }
            continue;
        }

        // Continue building multi-line INSERT
        if ($inInsert && $currentInsertTable) {
            $buffer .= ' ' . $trimmed;
            if (substr(rtrim($trimmed), -1) === ';') {
                executeRemappedInsert($pdo, $currentInsertTable, $buffer);
                $buffer = '';
                $inInsert = false;
                $currentInsertTable = null;
            }
        }
    }
    // Handle any remaining buffer
    if ($inInsert && !empty($buffer) && $currentInsertTable) {
        executeRemappedInsert($pdo, $currentInsertTable, $buffer);
    }
    fclose($handle);

    $counts = [
        'customers' => (int)$pdo->query("SELECT COUNT(*) as cnt FROM splynx_customers")->fetch()['cnt'],
        'plans' => (int)$pdo->query("SELECT COUNT(*) as cnt FROM splynx_plans")->fetch()['cnt'],
        'services' => (int)$pdo->query("SELECT COUNT(*) as cnt FROM splynx_services")->fetch()['cnt']
    ];

    jsonResponse([
        'success' => true,
        'message' => 'Import complete',
        'file' => ['name' => $filename, 'size_mb' => round($filesize / 1048576, 2)],
        'imported' => $counts
    ]);
}

/**
 * Parse JSON-encoded status field like {"label":"Active","value":2}
 */
function parseJsonLabel($jsonStr) {
    if (empty($jsonStr)) return '';
    $decoded = json_decode($jsonStr, true);
    if (is_array($decoded) && isset($decoded['label'])) {
        return $decoded['label'];
    }
    return $jsonStr;
}

function getCustomers($pdo) {
    $search = $_GET['search'] ?? '';
    $page = max(1, (int)($_GET['page'] ?? 1));
    $perPage = min(200, max(10, (int)($_GET['per_page'] ?? 100)));
    $offset = ($page - 1) * $perPage;

    $where = ["c.deleted_at IS NULL"];
    $params = [];

    if (!empty($search)) {
        $where[] = "(c.name LIKE ? OR c.id = ? OR c.phone_number LIKE ?)";
        $params[] = "%$search%";
        $params[] = $search;
        $params[] = "%$search%";
    }

    $whereSQL = 'WHERE ' . implode(' AND ', $where);

    // Count total customers
    $countStmt = $pdo->prepare("SELECT COUNT(*) as total FROM splynx_customers c $whereSQL");
    $countStmt->execute($params);
    $total = (int)$countStmt->fetch()['total'];

    // Get customers with their services — one row per service
    $sql = "
        SELECT 
            c.id,
            c.name,
            c.phone_number,
            s.id as service_id,
            s.status as service_status,
            COALESCE(p.title, 'Unknown') as plan,
            s.price,
            s.start_date,
            s.billing_type,
            s.bill_to,
            s.deleted_at as service_deleted
        FROM splynx_customers c
        LEFT JOIN splynx_services s ON s.customer_id = c.id AND s.deleted_at IS NULL
        LEFT JOIN splynx_plans p ON s.plan_id = p.id
        $whereSQL
        ORDER BY c.name ASC, s.id ASC
        LIMIT $perPage OFFSET $offset
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    // Format the data
    $data = [];
    foreach ($rows as $row) {
        $statusLabel = '';
        if ($row['service_id']) {
            $statusLabel = parseJsonLabel($row['service_status']);
        }
        $billingLabel = '';
        if ($row['billing_type']) {
            $billingLabel = parseJsonLabel($row['billing_type']);
        }

        $data[] = [
            'id' => (int)$row['id'],
            'name' => $row['name'],
            'phone' => $row['phone_number'],
            'service_id' => $row['service_id'] ? (int)$row['service_id'] : null,
            'status' => $statusLabel ?: ($row['service_id'] ? 'Unknown' : 'No Service'),
            'plan' => $row['service_id'] ? $row['plan'] : 'No Service',
            'price' => $row['service_id'] ? (float)$row['price'] : 0,
            'start_date' => $row['start_date'] ? date('Y-m-d', strtotime($row['start_date'])) : '',
            'billing_type' => $billingLabel,
            'bill_to' => $row['bill_to'] ? date('Y-m-d', strtotime($row['bill_to'])) : ''
        ];
    }

    jsonResponse([
        'success' => true,
        'data' => $data,
        'pagination' => [
            'page' => $page,
            'per_page' => $perPage,
            'total' => $total,
            'total_pages' => (int)ceil($total / $perPage)
        ]
    ]);
}

function exportExcel($pdo) {
    $search = $_GET['search'] ?? '';
    $where = ["c.deleted_at IS NULL"];
    $params = [];

    if (!empty($search)) {
        $where[] = "(c.name LIKE ? OR c.id = ? OR c.phone_number LIKE ?)";
        $params[] = "%$search%";
        $params[] = $search;
        $params[] = "%$search%";
    }

    $whereSQL = 'WHERE ' . implode(' AND ', $where);

    $sql = "
        SELECT 
            c.id,
            c.name,
            c.phone_number,
            s.id as service_id,
            s.status as service_status,
            COALESCE(p.title, 'Unknown') as plan,
            s.price,
            s.start_date,
            s.billing_type,
            s.bill_to
        FROM splynx_customers c
        LEFT JOIN splynx_services s ON s.customer_id = c.id AND s.deleted_at IS NULL
        LEFT JOIN splynx_plans p ON s.plan_id = p.id
        $whereSQL
        ORDER BY c.name ASC, s.id ASC
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $filename = 'splynx_customers_' . date('Y-m-d') . '.xls';
    header('Content-Type: application/vnd.ms-excel; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Cache-Control: no-cache');
    header('Pragma: no-cache');

    echo '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">';
    echo '<head><meta charset="utf-8"><style>';
    echo 'table { border-collapse: collapse; width: 100%; }';
    echo 'th { background-color: #4472C4; color: white; font-weight: bold; padding: 8px 12px; border: 1px solid #2F5496; text-align: left; }';
    echo 'td { padding: 6px 12px; border: 1px solid #D6DCE4; }';
    echo 'tr:nth-child(even) { background-color: #D9E2F3; }';
    echo '.price { text-align: right; }';
    echo '.active { color: #008000; font-weight: bold; }';
    echo '.inactive { color: #FF0000; }';
    echo '</style></head><body>';
    echo '<table>';
    echo '<thead><tr>';
    echo '<th>Customer ID</th><th>Name</th><th>Phone</th><th>Status</th><th>Plan</th><th>Price (KSh)</th><th>Start Date</th><th>Billing Type</th><th>Bill To</th>';
    echo '</tr></thead><tbody>';

    $rowCount = 0;
    while ($row = $stmt->fetch()) {
        $status = $row['service_id'] ? parseJsonLabel($row['service_status']) : 'No Service';
        $billingType = parseJsonLabel($row['billing_type']);
        $plan = $row['service_id'] ? htmlspecialchars($row['plan']) : 'No Service';
        $price = $row['service_id'] ? number_format($row['price'], 2) : '';
        $startDate = $row['start_date'] ? date('Y-m-d', strtotime($row['start_date'])) : '';
        $billTo = $row['bill_to'] ? date('Y-m-d', strtotime($row['bill_to'])) : '';
        $statusClass = (stripos($status, 'Active') !== false) ? 'active' : 'inactive';

        echo '<tr>';
        echo '<td>' . $row['id'] . '</td>';
        echo '<td>' . htmlspecialchars($row['name']) . '</td>';
        echo '<td>' . htmlspecialchars($row['phone_number']) . '</td>';
        echo '<td class="' . $statusClass . '">' . htmlspecialchars($status) . '</td>';
        echo '<td>' . $plan . '</td>';
        echo '<td class="price">' . $price . '</td>';
        echo '<td>' . $startDate . '</td>';
        echo '<td>' . htmlspecialchars($billingType) . '</td>';
        echo '<td>' . $billTo . '</td>';
        echo '</tr>';
        $rowCount++;
    }

    echo '</tbody></table>';
    echo '<br><p><strong>Total Records: ' . $rowCount . '</strong> | Generated: ' . date('Y-m-d H:i:s') . '</p>';
    echo '</body></html>';
    exit;
}

function getImportStatus($pdo) {
    try {
        $stmt = $pdo->query("SELECT COUNT(*) as cnt FROM splynx_customers");
        $count = (int)$stmt->fetch()['cnt'];
        $svcCount = 0;
        try {
            $svcCount = (int)$pdo->query("SELECT COUNT(*) as cnt FROM splynx_services WHERE deleted_at IS NULL")->fetch()['cnt'];
        } catch (PDOException $e) {}
        jsonResponse(['success' => true, 'imported' => $count > 0, 'customer_count' => $count, 'service_count' => $svcCount]);
    } catch (PDOException $e) {
        jsonResponse(['success' => true, 'imported' => false, 'customer_count' => 0, 'service_count' => 0]);
    }
}
