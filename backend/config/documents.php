<?php

return [
    'public_url' => env('DOCUMENT_PUBLIC_URL', 'https://isp.tonycommgroupltd.com'),
    'share_days' => (int) env('DOCUMENT_SHARE_DAYS', 30),
    'encryption_key' => env('DOCUMENT_ENCRYPTION_KEY', env('APP_KEY')),
    'company' => [
        'name' => 'Tonycomm Group Limited',
        'phone' => '0110345166',
        'email' => env('DOCUMENT_COMPANY_EMAIL', 'tonycommgroupltd@gmail.com'),
        'website' => env('DOCUMENT_COMPANY_WEBSITE', 'www.tonycommgroupltd.com'),
        'address' => env('DOCUMENT_COMPANY_ADDRESS', 'P.O. Box 441-20100, Nakuru, Kenya'),
        'logo' => env('DOCUMENT_LOGO_PATH', 'assets/images/tonycomm-logo.png'),
    ],
];
