<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Whatsapp API URI
    |--------------------------------------------------------------------------
    |
    | The Whatsapp Message API URI.
    |
    */

    'api_uri' => env('WHATSAPP_API_URI', 'https://graph.facebook.com/v19.0/'),

    /*
    |--------------------------------------------------------------------------
    | WHATSAPP BUSINESS ACCOUNT ID
    |--------------------------------------------------------------------------
    |
    | The Whatsapp business account id (waba_id).
    |
    */

    'whatsapp_business_account_id' => env('WHATSAPP_BUSINESS_ACCOUNT_ID', ''),

    /*
    |--------------------------------------------------------------------------
    | WHATSAPP APP SECRET
    |--------------------------------------------------------------------------
    |
    | The Whatsapp business account user access token.
    |
    */
    'app_secret' => env('WHATSAPP_APP_SECRET', ''),

    /*
    |--------------------------------------------------------------------------
    | ACCESS TOKEN
    |--------------------------------------------------------------------------
    |
    | The Whatsapp business account user access token.
    |
    */
    'access_token' => env('WHATSAPP_ACCESS_TOKEN', ''),

    /*
    |--------------------------------------------------------------------------
    | SEPARATOR
    |--------------------------------------------------------------------------
    |
    | The Whatsapp separator is used for the separat your string message.
    | For example: $message = 'Hello,123'; then set your .env file variable (SEPARATO=,).
    |
    */
    'separator' => env('WHATSAPP_SEPARATOR', '~'),

    /*
    |--------------------------------------------------------------------------
    | FROM PHONE NUMBER ID
    |--------------------------------------------------------------------------
    |
    | The Whatsapp register phome number Id.
    |
    */
    'from_phone_number_id' => env('FROM_PHONE_NUMBER_ID', ''),

    'webhook' => [
        /**
         * Wether to enable the webhook routes
         */
        'enabled' => env('WHATSAPP_WEBHOOK_ENABLED', true),

        /**
         * The webhook verification token.
         * For more information check https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
         */
        'verify_token' => env('WHATSAPP_WEBHOOK_VERIFY_TOKEN'),

        /**
         * Wether the webhook request signature should be verified or not.
         */
        'verify_signature' => env('WHATSAPP_WEBHOOK_SIGNATURE_VERIFY', false),
    ],

];
