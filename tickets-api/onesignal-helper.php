<?php
/**
 * OneSignal Notification Helper
 * 
 * This file provides functions to send notifications via OneSignal
 * NO FIREBASE REQUIRED - Completely Firebase-free!
 * 
 * Setup:
 * 1. Go to https://onesignal.com and create an account
 * 2. Create a new app for Mobile
 * 3. Get your App ID and REST API Key
 * 4. Replace YOUR_ONESIGNAL_APP_ID and YOUR_ONESIGNAL_REST_API_KEY below
 */

// Configuration - Set these from your OneSignal dashboard
define('ONESIGNAL_APP_ID', 'YOUR_ONESIGNAL_APP_ID');
define('ONESIGNAL_REST_API_KEY', 'YOUR_ONESIGNAL_REST_API_KEY');

/**
 * Send notification to specific players by Player ID
 * 
 * @param array $playerIds Array of OneSignal player IDs
 * @param string $title Notification title
 * @param string $message Notification message/body
 * @param array $data Additional data to send with notification
 * @return array OneSignal API response
 */
function sendOneSignalNotificationToPlayers($playerIds, $title, $message, $data = []) {
    if (empty($playerIds)) {
        return ['error' => 'No player IDs provided'];
    }

    $fields = [
        'app_id' => ONESIGNAL_APP_ID,
        'include_player_ids' => $playerIds,
        'contents' => ['en' => $message],
        'headings' => ['en' => $title],
        'data' => $data
    ];

    return sendToOneSignal($fields);
}

/**
 * Send notification to users by role/tag
 * 
 * @param string $role User role (admin, manager, technician, engineer, etc.)
 * @param string $title Notification title
 * @param string $message Notification message
 * @param array $data Additional data
 * @return array OneSignal API response
 */
function sendOneSignalNotificationByRole($role, $title, $message, $data = []) {
    $fields = [
        'app_id' => ONESIGNAL_APP_ID,
        'filters' => [
            ['field' => 'tag', 'key' => 'role', 'relation' => '=', 'value' => $role]
        ],
        'contents' => ['en' => $message],
        'headings' => ['en' => $title],
        'data' => $data
    ];

    return sendToOneSignal($fields);
}

/**
 * Send notification to all users
 * 
 * @param string $title Notification title
 * @param string $message Notification message
 * @param array $data Additional data
 * @return array OneSignal API response
 */
function sendOneSignalNotificationToAll($title, $message, $data = []) {
    $fields = [
        'app_id' => ONESIGNAL_APP_ID,
        'included_segments' => ['All'],
        'contents' => ['en' => $message],
        'headings' => ['en' => $title],
        'data' => $data
    ];

    return sendToOneSignal($fields);
}

/**
 * Send notification by user IDs (stored in database)
 * 
 * @param array $userIds Array of your app's user IDs
 * @param string $title Notification title
 * @param string $message Notification message
 * @param array $data Additional data
 * @return array OneSignal API response
 */
function sendOneSignalNotificationByUserIds($userIds, $title, $message, $data = []) {
    global $conn;

    // Get player IDs for these users
    $placeholders = implode(',', array_fill(0, count($userIds), '?'));
    $stmt = $conn->prepare("
        SELECT DISTINCT player_id FROM onesignal_players 
        WHERE user_id IN ($placeholders) AND is_active = 1
    ");
    $stmt->execute($userIds);
    $results = $stmt->fetchAll(PDO::FETCH_COLUMN);

    if (empty($results)) {
        return ['error' => 'No active players found for these users'];
    }

    return sendOneSignalNotificationToPlayers($results, $title, $message, $data);
}

/**
 * Internal function to make API call to OneSignal
 */
function sendToOneSignal($fields) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, 'https://onesignal.com/api/v1/notifications');
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json; charset=utf-8',
        'Authorization: Basic ' . ONESIGNAL_REST_API_KEY
    ]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, TRUE);
    curl_setopt($ch, CURLOPT_HEADER, FALSE);
    curl_setopt($ch, CURLOPT_POST, TRUE);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($fields));
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, FALSE);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $result = json_decode($response, true);
    $result['http_code'] = $httpCode;
    
    return $result;
}

/**
 * USAGE EXAMPLES IN YOUR OTHER API FILES:
 * 
 * ============================================
 * 1. When inventory is requested by technician
 * ============================================
 * require_once 'onesignal-helper.php';
 * 
 * sendOneSignalNotificationByRole('Admin', 
 *     'New Inventory Request',
 *     'Technician John requested 2x GPON Routers',
 *     ['type' => 'inventory_request', 'request_id' => $requestId, 'page' => '/admin/inventory/request']
 * );
 * 
 * ============================================
 * 2. When ticket is assigned to technician
 * ============================================
 * require_once 'onesignal-helper.php';
 * 
 * sendOneSignalNotificationByUserIds(
 *     [$technicianId],
 *     'New Ticket Assigned',
 *     'Installation at Customer #1234 - 245 Kampala Road',
 *     ['type' => 'ticket', 'ticket_id' => $ticketId, 'page' => '/admin/tickets/details/' . $ticketId]
 * );
 * 
 * ============================================
 * 3. Low inventory alert to admins
 * ============================================
 * require_once 'onesignal-helper.php';
 * 
 * sendOneSignalNotificationByRole('Admin',
 *     'Low Stock Alert ⚠️',
 *     'GPON Routers HG8546M: Only 3 units remaining',
 *     ['type' => 'low_inventory', 'item_id' => $itemId, 'page' => '/admin/inventory/list']
 * );
 * 
 * ============================================
 * 4. Router disbursed notification
 * ============================================
 * require_once 'onesignal-helper.php';
 * 
 * sendOneSignalNotificationByUserIds(
 *     [$technicianId],
 *     'Router Ready for Pickup',
 *     'GPON Router HG8546M SN: 485754432738 is ready',
 *     ['type' => 'disbursement', 'disburse_id' => $disburseId, 'page' => '/admin/inventory/disbursed']
 * );
 * 
 * ============================================
 * 5. Payment received notification
 * ============================================
 * require_once 'onesignal-helper.php';
 * 
 * sendOneSignalNotificationByUserIds(
 *     [$customerId],
 *     'Payment Confirmed ✓',
 *     'We received your payment of UGX 50,000',
 *     ['type' => 'payment', 'invoice_id' => $invoiceId, 'page' => '/customer/invoices']
 * );
 * 
 * ============================================
 * 6. Service approval notification
 * ============================================
 * require_once 'onesignal-helper.php';
 * 
 * sendOneSignalNotificationByUserIds(
 *     [$customerId],
 *     'Service Activated',
 *     'Your 20Mbps internet service is now active!',
 *     ['type' => 'service', 'service_id' => $serviceId]
 * );
 */
