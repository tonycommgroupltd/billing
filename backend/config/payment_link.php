<?php

return [
    'base_url' => rtrim(env('PAY_PORTAL_URL', 'https://isp.tonycommgroupltd.com/pay'), '/'),
    'secret' => env('PAY_LINK_SECRET', env('APP_KEY')),
    'ttl_days' => (int) env('PAY_LINK_TTL_DAYS', 30),
];
