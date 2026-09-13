<?php

return [
    'olt_base_url' => env('OLT_API_URL', env('REACT_APP_OLT_API_URL', 'https://isp.tonycommgroupltd.com/olt-api')),
    'olt_api_key' => env('OLT_API_KEY', env('REACT_APP_OLT_API_KEY', '')),
    'tr069_base_url' => env('TR069_API_URL', env('REACT_APP_TR069_API_URL', 'https://isp.tonycommgroupltd.com/tr069-api')),
    'tr069_api_key' => env('TR069_API_KEY', env('REACT_APP_TR069_API_KEY', '')),
    'tickets_api_url' => env('TICKETS_API_URL', 'https://isp.tonycommgroupltd.com/tickets-api'),
    'vpn_base_url' => env('VPN_API_URL', env('REACT_APP_VPN_API_URL', 'https://isp.tonycommgroupltd.com/vpn-api')),
    'vpn_api_key' => env('VPN_API_KEY', env('REACT_APP_VPN_API_KEY', '')),
];
