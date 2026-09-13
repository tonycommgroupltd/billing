<?php
/**
 * Save OneSignal Player ID
 * 
 * This endpoint receives the OneSignal player ID from the mobile app
 * and stores it in the database for sending notifications later.
 */

require_once __DIR__ . '/helpers.php';

setCorsHeaders();

header('Content-Type: application/json');

require_once __DIR__ . '/config.php';

$input = json_decode(file_get_contents('php://input'), true);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $user_id = $input['user_id'] ?? null;
    $player_id = $input['player_id'] ?? null;
    $role = $input['role'] ?? 'user';

    if (!$user_id || !$player_id) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing user_id or player_id']);
        exit();
    }

    try {
        // Create table if not exists
        $createTableSQL = "
            CREATE TABLE IF NOT EXISTS onesignal_players (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                player_id VARCHAR(255) NOT NULL,
                role VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                is_active TINYINT(1) DEFAULT 1,
                UNIQUE KEY unique_player (player_id),
                INDEX idx_user_id (user_id),
                INDEX idx_role (role)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ";
        $conn->exec($createTableSQL);

        // Insert or update player ID
        $stmt = $conn->prepare("
            INSERT INTO onesignal_players (user_id, player_id, role, is_active)
            VALUES (:user_id, :player_id, :role, 1)
            ON DUPLICATE KEY UPDATE
                user_id = :user_id,
                role = :role,
                is_active = 1,
                updated_at = CURRENT_TIMESTAMP
        ");

        $stmt->execute([
            ':user_id' => $user_id,
            ':player_id' => $player_id,
            ':role' => $role
        ]);

        http_response_code(200);
        echo json_encode([
            'success' => true,
            'message' => 'OneSignal player ID saved successfully'
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
