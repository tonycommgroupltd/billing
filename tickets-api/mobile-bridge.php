<?php
/**
 * ============================================
 * Mobile Bridge Helper
 * ============================================
 * 
 * Calls the VPS Express API webhooks to sync
 * admin ticket events (reply, status, assign)
 * back to the mobile customer app.
 *
 * Used by tickets.php when admin actions happen
 * on tickets that originated from the mobile app.
 * ============================================
 */

define('VPS_WEBHOOK_URL', 'http://78.159.111.191:3500/api/tickets/webhook');
define('VPS_BRIDGE_KEY',  'tcom_mobile_bridge_2026_secure');

/**
 * Check if a ticket is a mobile-originated ticket.
 * Mobile tickets have created_by = 'TCOM Mobile App' or subject starts with '[Mobile]'.
 */
function isMobileTicket($ticket) {
    if (!$ticket) return false;
    if (($ticket['created_by'] ?? '') === 'TCOM Mobile App') return true;
    if (strpos($ticket['subject'] ?? '', '[Mobile]') === 0) return true;
    return false;
}

/**
 * Send a POST to the VPS webhook. Fire-and-forget via curl.
 */
function callVpsWebhook($endpoint, $payload) {
    $url = VPS_WEBHOOK_URL . '/' . $endpoint;
    
    try {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($payload),
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'X-API-Key: ' . VPS_BRIDGE_KEY,
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error    = curl_error($ch);
        curl_close($ch);
        
        if ($error) {
            error_log("Mobile bridge curl error ({$endpoint}): {$error}");
            return false;
        }
        if ($httpCode >= 400) {
            error_log("Mobile bridge HTTP {$httpCode} ({$endpoint}): {$response}");
            return false;
        }
        
        error_log("Mobile bridge OK ({$endpoint}): ticket {$payload['admin_ticket_id']}");
        return true;
    } catch (Exception $e) {
        error_log("Mobile bridge exception ({$endpoint}): " . $e->getMessage());
        return false;
    }
}

/**
 * Notify mobile app that an admin replied to a ticket.
 * 
 * @param int    $ticketId    — admin ticket ID
 * @param string $message     — reply text
 * @param string $senderName  — admin user name
 */
function notifyMobileReply($ticketId, $message, $senderName = 'TCOM Support') {
    callVpsWebhook('reply', [
        'admin_ticket_id' => (int)$ticketId,
        'message'         => $message,
        'sender_name'     => $senderName,
    ]);
}

/**
 * Notify mobile app that ticket status changed.
 */
function notifyMobileStatusChange($ticketId, $newStatus, $message = null) {
    callVpsWebhook('status', [
        'admin_ticket_id' => (int)$ticketId,
        'status'          => $newStatus,
        'message'         => $message,
    ]);
}

/**
 * Notify mobile app that ticket was assigned.
 */
function notifyMobileAssignment($ticketId, $assignedTo, $message = null) {
    callVpsWebhook('assigned', [
        'admin_ticket_id' => (int)$ticketId,
        'assigned_to'     => $assignedTo,
        'message'         => $message,
    ]);
}
