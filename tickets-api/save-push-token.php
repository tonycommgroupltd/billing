<?php
require_once __DIR__ . '/helpers.php';

setCorsHeaders();

header('Content-Type: application/json');

require_once __DIR__ . '/config.php';

// Get JSON input
$input = json_decode(file_get_contents('php://input'), true);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $user_id = $input['user_id'] ?? null;
    $push_token = $input['push_token'] ?? null;
    $platform = $input['platform'] ?? 'unknown';
    $device_info = $input['device_info'] ?? null;

    if (!$user_id || !$push_token) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing required fields']);
        exit();
    }

    try {
        // Create table if not exists
        $createTableSQL = "
            CREATE TABLE IF NOT EXISTS push_tokens (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                push_token VARCHAR(255) NOT NULL,
                platform ENUM('ios', 'android', 'unknown') DEFAULT 'unknown',
                device_info TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                is_active TINYINT(1) DEFAULT 1,
                UNIQUE KEY unique_user_token (user_id, push_token),
                INDEX idx_user_id (user_id),
                INDEX idx_active (is_active)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ";
        $conn->exec($createTableSQL);

        // Insert or update token
        $stmt = $conn->prepare("
            INSERT INTO push_tokens (user_id, push_token, platform, device_info, is_active)
            VALUES (:user_id, :push_token, :platform, :device_info, 1)
            ON DUPLICATE KEY UPDATE
                platform = :platform,
                device_info = :device_info,
                is_active = 1,
                updated_at = CURRENT_TIMESTAMP
        ");

        $stmt->execute([
            ':user_id' => $user_id,
            ':push_token' => $push_token,
            ':platform' => $platform,
            ':device_info' => json_encode($device_info)
        ]);

        echo json_encode([
            'success' => true,
            'message' => 'Push token saved successfully'
        ]);

    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode([
            'error' => 'Database error',
            'message' => $e->getMessage()
        ]);
    }
} else {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
}
