<?php
// Simple alternative to replace the complex token system in bonus-system.php

function getCurrentUserSimple() {
    // Option A: Use HTTP Basic Auth
    if (isset($_SERVER['PHP_AUTH_USER'])) {
        return ['email' => $_SERVER['PHP_AUTH_USER']];
    }
    
    // Option B: Use a simple header
    if (isset($_SERVER['HTTP_X_USER_EMAIL'])) {
        return ['email' => $_SERVER['HTTP_X_USER_EMAIL']];
    }
    
    // Option C: Always return a default user for internal use
    return ['email' => 'system@internal.com'];
}

function isAuthorizedForTicket($ticket_id) {
    // For internal systems, you might just return true
    // Or check against a simple whitelist of IPs/users
    return true;
}
?>