<?php
/**
 * Shared API defaults.
 *
 * Environment-specific secrets belong in config.local.php, which is ignored
 * by Git. Keeping local overrides here also supports older endpoints that
 * require config.php directly instead of calling loadAppConfig().
 */
$config = [
    'db' => [
        'host' => 'localhost',
        'database' => 'tonycommgroupltd_db',
        'username' => '',
        'password' => '',
        'charset' => 'utf8mb4',
        'port' => 3306
    ],
    
    // Mock authentication tokens
    'mock_tokens' => [
        'mock-jwt-token-for-super-admin',
        'mock-jwt-token-for-main-admin',
        'mock-jwt-token-for-administrator'
    ],
    
    // CORS allowed origins
    'allowed_origins' => [
        'https://tickets.tonycommgroupltd.com',  // Production subdomain
        'https://app.tonycommgroupltd.com',      // cPanel SPA (direct cross-origin fallback)
        'https://isp.tonycommgroupltd.com',      // Unified ISP app
        'https://test.tonycommgroupltd.com',     // Test subdomain
        'http://localhost:3001',                  // Development
        'http://localhost:3000'                   // Development alternative
    ],

    // KRA eTIMS Virtual FD (VSCU) — override in config.local.php per environment
    'kra_etims' => [
        'base_url' => 'http://127.0.0.1:8888/api/v1',
        'auth_user' => 'admin',
        'auth_pass' => 'admin',
        'timeout_seconds' => 30,
    ],

    // APP.TCOM (Laravel ISP) — unified login token exchange
    'isp_api' => [
        'base_url' => 'https://isp.tonycommgroupltd.com/api/v1',
        'jwt_secret' => '', // Set in config.local.php — must match Laravel JWT_SECRET
    ],

    // Public URL prefix for ticket router photo uploads (nginx: /tickets-api/uploads/…)
    'tickets_public_base_url' => 'https://isp.tonycommgroupltd.com/tickets-api',
];

$localPath = __DIR__ . '/config.local.php';
if (is_file($localPath)) {
    $local = require $localPath;
    if (is_array($local)) {
        $config = array_replace_recursive($config, $local);
    }
}

return $config;

