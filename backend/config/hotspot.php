<?php

return [
    'enabled' => filter_var(env('HOTSPOT_ENABLED', true), FILTER_VALIDATE_BOOL),

    // Legacy single-source keys (also used as the primary "mwananchi" source).
    'api_url' => env(
        'HOTSPOT_API_URL',
        'https://mwananchi.tcom.co.ke/integration/v1/index.php'
    ),
    'client_id' => env('HOTSPOT_CLIENT_ID', 'app-tcom'),
    'secret' => env('HOTSPOT_API_SECRET'),
    'advanced_url' => env(
        'HOTSPOT_ADVANCED_URL',
        'https://mwananchi.tcom.co.ke/admin/'
    ),
    'connect_timeout' => (int) env('HOTSPOT_CONNECT_TIMEOUT', 10),
    'timeout' => (int) env('HOTSPOT_TIMEOUT', 45),

    /**
     * Extra hotspot platforms merged into APP.TCOM Hotspot as one view.
     * Example: TPay Hotspot (Heshima, Hilton, …) on Contabo sibling VPS.
     */
    'tpay_api_url' => env(
        'HOTSPOT_TPAY_API_URL',
        'https://tpay.co.ke/hotspot/integration/v1/index.php'
    ),
    'tpay_api_secret' => env('HOTSPOT_TPAY_API_SECRET') ?: env('HOTSPOT_API_SECRET'),
    'tpay_advanced_url' => env(
        'HOTSPOT_TPAY_ADVANCED_URL',
        'https://tpay.co.ke/hotspot/admin/'
    ),
    'tpay_enabled' => filter_var(env('HOTSPOT_TPAY_ENABLED', true), FILTER_VALIDATE_BOOL),
];
