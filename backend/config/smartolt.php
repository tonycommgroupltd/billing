<?php

/*
| SmartOLT cloud API + the authorization defaults used on the TCOMM-MAIN OLT.
|
| Rate limits (SmartOLT docs — treat the API as an integration, NOT a database):
|   - Account budget: 1000 calls/hour, 10 calls/sec (bursts >15/sec blocked)
|   - get_all_onus_details / get_all_onus_details_per_olt: 15 calls/hour
|   - get_onu_signal: 500/hour
|   - Heavy OLT-detail endpoints: 30 calls / 10 minutes / OLT
|
| Our authorize path uses ONLY per-ONU endpoints (get_onu_details, authorize_onu,
| set_onu_wan_mode_pppoe, enable_tr069, …). The full ONU dump is reserved for the
| rare manual “Link existing ONUs” sync and is hard-capped below.
*/

return [
    'enabled' => filter_var(env('SMARTOLT_ENABLED', true), FILTER_VALIDATE_BOOL),
    'base_url' => rtrim(env('SMARTOLT_BASE_URL', 'https://tonycomm.smartolt.com'), '/'),
    'api_key' => env('SMARTOLT_API_KEY', env('SMARTOLT_READ_API_KEY')),

    'connect_timeout' => (int) env('SMARTOLT_CONNECT_TIMEOUT', 10),
    'timeout' => (int) env('SMARTOLT_TIMEOUT', 60),
    'heavy_timeout' => (int) env('SMARTOLT_HEAVY_TIMEOUT', 150),

    // Zones / ONU types rarely change — long cache.
    'lookup_cache_ttl' => (int) env('SMARTOLT_LOOKUP_CACHE_TTL', 6 * 60 * 60),

    // Full ONU dump: SmartOLT allows 15/hour. Cache for 4h and hard-cap at 10/hour
    // so Contabo + tr069-api + manual sync cannot burn the budget.
    'onu_cache_ttl' => (int) env('SMARTOLT_ONU_CACHE_TTL', 4 * 60 * 60),
    'get_all_onus_details_hourly_budget' => (int) env('SMARTOLT_ALL_ONUS_HOURLY_BUDGET', 10),

    // Soft throttle between any two SmartOLT HTTP calls from this app.
    'min_request_gap_ms' => (int) env('SMARTOLT_MIN_REQUEST_GAP_MS', 150),

    'defaults' => [
        'olt_id' => env('SMARTOLT_OLT_ID', '2'),
        'pon_type' => env('SMARTOLT_PON_TYPE', 'gpon'),
        'gpon_channel' => env('SMARTOLT_GPON_CHANNEL', 'gpon'),
        'vlan' => env('SMARTOLT_VLAN', '300'),
        'onu_mode' => env('SMARTOLT_ONU_MODE', 'Routing'),
        'tag_transform_mode' => env('SMARTOLT_TAG_TRANSFORM', 'translate'),
        'onu_type' => env('SMARTOLT_DEFAULT_ONU_TYPE', 'HG8546M'),
        'upload_speed_profile' => env('SMARTOLT_UPLOAD_PROFILE', '1G'),
        'download_speed_profile' => env('SMARTOLT_DOWNLOAD_PROFILE', '1G'),
        'mgmt_ip_mode' => env('SMARTOLT_MGMT_IP_MODE', 'DHCP'),
        'mgmt_ip_vlan' => env('SMARTOLT_MGMT_IP_VLAN', '15'),
        'enable_tr069' => filter_var(env('SMARTOLT_ENABLE_TR069', true), FILTER_VALIDATE_BOOL),
        'tr069_profile' => env('SMARTOLT_TR069_PROFILE', 'SmartOLT'),
    ],
];
