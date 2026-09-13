<?php

return [
    /*
    |--------------------------------------------------------------------------
    | High-availability / peer settings
    |--------------------------------------------------------------------------
    |
    | Values must live in config (not raw env() calls in app code) so they
    | still work when `php artisan config:cache` is used.
    |
    */

    'server_role' => env('APP_SERVER_ROLE', 'production'),

    'standby_api_url' => env('STANDBY_API_URL', 'https://acs.tcom.co.ke/api/v1'),

    'server_logs_peer_key' => env('SERVER_LOGS_PEER_KEY'),
];
