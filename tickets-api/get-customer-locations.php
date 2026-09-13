<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once 'helpers.php';

try {
    $pdo = getDB();
    
    // Fetch all customers with location data
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
        ORDER BY name ASC
    ");
    
    $stmt->execute();
    $customers = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Format as GeoJSON for map display
    $features = [];
    foreach ($customers as $customer) {
        $features[] = [
            'type' => 'Feature',
            'geometry' => [
                'type' => 'Point',
                'coordinates' => [
                    floatval($customer['longitude']),
                    floatval($customer['latitude'])
                ]
            ],
            'properties' => [
                'id' => $customer['id'],
                'name' => $customer['name'],
                'phone' => $customer['phone'],
                'email' => $customer['email'],
                'address' => $customer['address'],
                'status' => $customer['status'],
                'plan' => $customer['plan']
            ]
        ];
    }
    
    $geojson = [
        'type' => 'FeatureCollection',
        'features' => $features
    ];
    
    echo json_encode([
        'status' => 'success',
        'data' => $geojson,
        'count' => count($features)
    ]);
    
} catch (PDOException $e) {
    error_log("Database error in get-customer-locations: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'status' => 'error', 
        'message' => 'Database error occurred',
        'data' => [
            'type' => 'FeatureCollection',
            'features' => []
        ]
    ]);
}
?>
