<?php
// Fixed version of get-customer-locations.php with better error handling
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Function to return JSON error response
function json_error($message, $code = 500) {
    http_response_code($code);
    echo json_encode([
        'status' => 'error',
        'message' => $message,
        'data' => [
            'type' => 'FeatureCollection',
            'features' => []
        ]
    ]);
    exit();
}

// Function to return JSON success response
function json_success($data, $count = 0) {
    echo json_encode([
        'status' => 'success',
        'data' => $data,
        'count' => $count
    ]);
    exit();
}

// Check if required files exist
if (!file_exists('config.php')) {
    json_error('Configuration file not found');
}

try {
    require_once 'helpers.php';
    $pdo = getDB();
} catch (Exception $e) {
    json_error('Database connection error: ' . $e->getMessage());
}

try {
    // Test database connection
    $pdo->query('SELECT 1');
} catch (PDOException $e) {
    json_error('Database connection failed: ' . $e->getMessage());
}

try {
    // Check if customers table exists
    $stmt = $pdo->prepare("SHOW TABLES LIKE 'customers'");
    $stmt->execute();
    $table_exists = $stmt->rowCount() > 0;
    
    if (!$table_exists) {
        json_error('Customers table does not exist');
    }
    
    // Fetch customers with location data
    $stmt = $pdo->prepare("
        SELECT 
            id,
            name,
            phone_number as phone,
            email,
            address,
            latitude,
            longitude,
            status,
            preferred_plan as plan
        FROM customers 
        WHERE latitude IS NOT NULL 
        AND longitude IS NOT NULL
        AND latitude != 0 
        AND longitude != 0
        AND latitude BETWEEN -90 AND 90
        AND longitude BETWEEN -180 AND 180
        ORDER BY name ASC
        LIMIT 1000
    ");
    
    $stmt->execute();
    $customers = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Format as GeoJSON for map display
    $features = [];
    foreach ($customers as $customer) {
        $lat = floatval($customer['latitude']);
        $lng = floatval($customer['longitude']);
        
        // Validate coordinates
        if ($lat == 0 && $lng == 0) continue;
        if ($lat < -90 || $lat > 90) continue;
        if ($lng < -180 || $lng > 180) continue;
        
        $features[] = [
            'type' => 'Feature',
            'geometry' => [
                'type' => 'Point',
                'coordinates' => [$lng, $lat]
            ],
            'properties' => [
                'id' => $customer['id'],
                'name' => $customer['name'] ?: 'Unnamed Customer',
                'phone' => $customer['phone'] ?: '',
                'email' => $customer['email'] ?: '',
                'address' => $customer['address'] ?: '',
                'status' => $customer['status'] ?: 'unknown',
                'plan' => $customer['plan'] ?: ''
            ]
        ];
    }
    
    $geojson = [
        'type' => 'FeatureCollection',
        'features' => $features
    ];
    
    json_success($geojson, count($features));
    
} catch (PDOException $e) {
    error_log("Database error in get-customer-locations: " . $e->getMessage());
    json_error('Database query failed: ' . $e->getMessage());
} catch (Exception $e) {
    error_log("General error in get-customer-locations: " . $e->getMessage());
    json_error('Server error: ' . $e->getMessage());
}
?>