<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;
use Twilio\Exceptions\TwilioException;
use Twilio\Rest\Client;

class TwilioService
{
    protected $twilio;
    protected $from;

    public function __construct()
    {
        $this->twilio = new Client(
            config('services.twilio.sid'),
            config('services.twilio.token')
        );
        $this->from = config('services.twilio.whatsapp_from');
    }

    public function sendWhatsAppMessage(string $to, string $message): void
    {
        $this->twilio->messages->create(
            'whatsapp:' . $to, // recipient
            [
                'from' => $this->from,
                'body' => $message
            ]
        );
    }

    public function sendWhatsAppTemplateUsingService(
        string $to,
        string $messagingServiceSid,
        ?string $contentSid = null,
        array $variables = [],
        ?string $body = null
    ): void {
        if (!$contentSid && !$body) {
            throw new \InvalidArgumentException('Either contentSid or body must be provided.');
        }

        $messageData = [
            'to' => 'whatsapp:' . $to,
            'messagingServiceSid' => $messagingServiceSid,
        ];

        if ($contentSid) {
            $messageData['contentSid'] = $contentSid;

            if (!empty($variables)) {
                $messageData['contentVariables'] = json_encode(
                    collect($variables)->mapWithKeys(
                        fn($v, $i) => [strval($i + 1) => strval($v)]
                    )->toArray()
                );
            }
        } else {
            $messageData['body'] = $body;
        }

        try {
            $message = $this->twilio->messages->create('whatsapp:' . $to, $messageData);

            Log::info('Twilio WhatsApp message sent', [
                'to' => $to,
                'sid' => $message->sid,
                'status' => $message->status,
                'contentSid' => $contentSid,
                'body' => $body,
            ]);
        } catch (TwilioException $e) {
            Log::error('Twilio WhatsApp message failed', [
                'to' => $to,
                'error' => $e->getMessage(),
                'data' => $messageData,
            ]);

            throw $e; // optional: re-throw if you want to handle it higher up
        }
    }
}
