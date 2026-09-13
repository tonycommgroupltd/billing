<?php
/**
 * Send Push Notification Helper
 * 
 * This script helps send push notifications to mobile devices
 * Usage: Include this file and call sendPushNotification()
 */

require_once 'config.php';

/**
 * Send push notification to a specific user
 * 
 * @param int $userId The user ID to send notification to
 * @param string $title Notification title
 * @param string $message Notification message
 * @param array $data Additional data payload
 * @return array Result of the push notification
 */
function sendPushNotification($userId, $title, $message, $data = []) {
    global $conn;
    
    // Get user's push tokens
    $stmt = $conn->prepare("
        SELECT push_token, platform 
        FROM push_tokens 
        WHERE user_id = :user_id AND is_active = 1
    ");
    $stmt->execute([':user_id' => $userId]);
    $tokens = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    if (empty($tokens)) {
        return ['success' => false, 'message' => 'No active push tokens found'];
    }
    
    $results = [];
    foreach ($tokens as $tokenData) {
        if ($tokenData['platform'] === 'android') {
            $results[] = sendAndroidPush($tokenData['push_token'], $title, $message, $data);
        } elseif ($tokenData['platform'] === 'ios') {
            $results[] = sendIOSPush($tokenData['push_token'], $title, $message, $data);
        }
    }
    
    return $results;
}

/**
 * Send push notification to Android device via FCM
 */
function sendAndroidPush($token, $title, $message, $data = []) {
    // You need to get this from Firebase Console:
    // https://console.firebase.google.com/ -> Project Settings -> Cloud Messaging -> Server Key
    $fcmServerKey = 'YOUR_FCM_SERVER_KEY_HERE';
    
    $url = 'https://fcm.googleapis.com/fcm/send';
    
    $notification = [
        'to' => $token,
        'notification' => [
            'title' => $title,
            'body' => $message,
            'sound' => 'default',
            'badge' => 1,
            'priority' => 'high'
        ],
        'data' => $data,
        'priority' => 'high'
    ];
    
    $headers = [
        'Authorization: key=' . $fcmServerKey,
        'Content-Type: application/json'
    ];
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($notification));
    
    $result = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    return [
        'platform' => 'android',
        'success' => $httpCode === 200,
        'response' => json_decode($result, true)
    ];
}

/**
 * Send push notification to iOS device via APNS
 */
function sendIOSPush($token, $title, $message, $data = []) {
    // iOS push requires APNS certificate setup
    // This is a placeholder - requires proper APNS implementation
    
    return [
        'platform' => 'ios',
        'success' => false,
        'message' => 'iOS push not yet configured - requires APNS certificate'
    ];
}

/**
 * Send notification to multiple users by role
 */
function sendPushToRole($role, $title, $message, $data = []) {
    global $conn;
    
    $stmt = $conn->prepare("
        SELECT DISTINCT pt.user_id
        FROM push_tokens pt
        INNER JOIN users u ON pt.user_id = u.id
        WHERE u.role = :role AND pt.is_active = 1
    ");
    $stmt->execute([':role' => $role]);
    $userIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
    
    $results = [];
    foreach ($userIds as $userId) {
        $results[] = sendPushNotification($userId, $title, $message, $data);
    }
    
    return $results;
}

/**
 * Example usage in your other API files:
 * 
 * // When inventory is requested
 * require_once 'push-notification-helper.php';
 * sendPushToRole('Admin', 'New Inventory Request', 'John requested 2x GPON Routers', [
 *     'type' => 'inventory_request',
 *     'request_id' => $requestId
 * ]);
 * 
 * // When ticket is assigned
 * sendPushNotification($technicianId, 'New Ticket Assigned', 'Installation at Customer #1234', [
 *     'type' => 'ticket',
 *     'ticket_id' => $ticketId
 * ]);
 * 
 * // Low inventory alert
 * sendPushToRole('Admin', 'Low Stock Alert', 'GPON Routers: Only 3 remaining', [
 *     'type' => 'low_inventory',
 *     'item_id' => $itemId
 * ]);
 */
