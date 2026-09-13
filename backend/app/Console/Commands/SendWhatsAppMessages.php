<?php

namespace App\Console\Commands;

use App\Models\MessageStatus;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Carbon\Carbon;
use App\Services\TwilioService;
use Twilio\Rest\Client;

class SendWhatsAppMessages extends Command
{
    // The name and signature of the console command
    protected $signature = 'send:whatsapp-messages';

    // The console command description
    protected $description = 'Send WhatsApp messages and update the status in the database';

    // Execute the console command
    public function handle()
    {
        $twilio = new Client(
            config('services.twilio.sid'),
            config('services.twilio.token')
        );
        $from = config('services.twilio.whatsapp_from');
        // Limit of messages to send per minute
        $limit = 100;

        // Track how many messages we have sent
        $sentCount = 0;

        // Fetch all pending messages
        $messages = MessageStatus::where('status', 'pending')->get();

        // Get the current minute (to avoid crossing over into the next minute)
        $currentMinute = Carbon::now()->minute;

        // Iterate through each message and send it
        foreach ($messages as $message) {
            // Check if we've reached the limit
            if ($sentCount >= $limit) {
                $this->info("Limit of $limit messages reached for this minute.");
                break; // Stop sending more messages
            }

            try {
                $messageData = [
                    'to' => 'whatsapp:' . format_w_phone($message->phone_number),
                    'messagingServiceSid' => config('services.twilio.messaging_service_sid'),
                ];
                $messageData['contentSid'] = 'HX3ad4962b55d18532fcd333ed42f56dcb';
                $msg = $twilio->messages->create('whatsapp:' . format_w_phone($message->phone_number), $messageData);

                // Update message status to 'sent'
                $message->update(['status' => $msg->status, 'external_id' => $msg->sid]);

                // Increment the sent count
                $sentCount++;

                $this->info("Message sent to {$message->phone_number}");
            } catch (\Exception $e) {
                // Log the error and update the message status to 'failed'
                $message->update(['status' => 'failed']);
                Log::error("Error sending message to {$message->phone_number}: " . $e->getMessage());
            }
        }

        // Provide a summary of how many messages were sent
        $this->info("$sentCount messages were sent in this minute.");
    }
}
