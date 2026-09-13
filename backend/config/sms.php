<?php

return [
    'apikey' => env('SMS_API_KEY'),
    'partnerID' => env('SMS_PARTNER_ID'),
    'shortcode' => env('SMS_SHORTCODE'),

    /*
    |--------------------------------------------------------------------------
    | Mail Classes
    |--------------------------------------------------------------------------
    |
    | Here you can add all the available mail classes that can be selected for
    | customization.
    |
    | The key of this array should be saved to the mail-template,
    | this way you are not limited by the namespace of the template.
    |
    | F.E. 'test-mail' => App\Mail\TestMail::class,
    |
    */
    'messages' => [
        'invoice_create' => App\Messages\InvoiceCreateMessage::class,
        'payment_reminder' => App\Messages\PaymentReminderMessage::class,
        'account_creation' => App\Messages\AccountCreationMessage::class,
        'on_payment' => App\Messages\OnPaymentMessage::class,
    ],

    /*
    |--------------------------------------------------------------------------
    | Message Designs
    |--------------------------------------------------------------------------
    |
    | Message templates can have different designs, these are views that are
    | filled with $content.
    |
    | Supported:    - default include notation (message.designs.default)
    |
    */
    'designs' => [
        'message.designs.default' => 'default',
    ],

    /*
    |--------------------------------------------------------------------------
    | Render engines
    |--------------------------------------------------------------------------
    |
    | The possible render engines your system provides. These engines receive
    | the message, design and body and define how the message is rendered.
    |
    | The key of this array is saved to the message-template, this way you are not
    | limited by the namespace of the template.
    |
    | Provided: - Html engine for regular HTML wysiwyg
    |           - Editor-js engine for Editor.js wysiwyg json data
    |
    */
    'render_engines' => [
        'advanta' => App\MessageRenderEngines\AdvantaEngine::class,
    ],

];
