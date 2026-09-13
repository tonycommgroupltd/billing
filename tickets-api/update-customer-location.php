<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once 'helpers.php';

// Get customer ID from URL
$uri = $_SERVER['REQUEST_URI'];
preg_match('/update-customer-location\/(\d+)/', $uri, $matches);
$customer_id = $matches[1] ?? null;

if (!$customer_id) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Customer ID is required']);
    exit();
}

// Get JSON input
$input = json_decode(file_get_contents('php://input'), true);
$latitude = $input['latitude'] ?? null;
$longitude = $input['longitude'] ?? null;

if ($latitude === null || $longitude === null) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Latitude and longitude are required']);
    exit();
}

// Validate coordinates
if (!is_numeric($latitude) || !is_numeric($longitude)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Invalid coordinates']);
    exit();
}

if ($latitude < -90 || $latitude > 90 || $longitude < -180 || $longitude > 180) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Coordinates out of range']);
    exit();
}

try {
    $pdo = getDB();
    
    // Check if customer exists
    $stmt = $pdo->prepare("SELECT id, name FROM customers WHERE id = ?");
    $stmt->execute([$customer_id]);
    $customer = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$customer) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Customer not found']);
        exit();
    }
    
    // Update customer location
    $update_stmt = $pdo->prepare("
        UPDATE customers 
        SET latitude = ?, longitude = ?, updated_at = NOW() 
        WHERE id = ?
    ");
    
    $result = $update_stmt->execute([$latitude, $longitude, $customer_id]);
    
    if ($result) {
        echo json_encode([
            'status' => 'success',
            'message' => 'Customer location updated successfully',
            'data' => [
                'customer_id' => $customer_id,
                'customer_name' => $customer['name'],
                'latitude' => $latitude,
                'longitude' => $longitude
            ]
        ]);
    } else {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Failed to update customer location']);
    }
    
} catch (PDOException $e) {
    error_log("Database error in update-customer-location: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Database error occurred']);
}
?>
