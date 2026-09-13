<?php

namespace App\Console\Commands;

use App\Models\MessageDetail;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

class SendBulkSMS extends Command
{
    protected $signature = 'sms:send-bulk';
    protected $description = 'Send queued SMS in batches of 20';

    public function handle()
    {
        $totalProcessed = 0;

        for ($i = 0; $i < 5; $i++) {
            $batch = MessageDetail::where('status', 'pending')->limit(20)->get();

            if ($batch->isEmpty()) {
                $this->info("No pending SMS to send.");
                return;
            }

            $payload = [
                'count' => $batch->count(),
                'smslist' => $batch->map(function ($sms) {
                    $message = str_replace('\r\n', "\r\n", $sms->message);
                    return [
                        'partnerID'    => config('services.advanta.partner_id'),
                        'apikey'       => config('services.advanta.api_key'),
                        'pass_type'    => 'plain',
                        'clientsmsid'  => $sms->id,
                        'mobile'       => $sms->recipient,
                        'message'      => $message,
                        'shortcode'    => config('services.advanta.shortcode')
                    ];
                })->toArray()
            ];

            $response = Http::post('https://quicksms.advantasms.com/api/services/sendbulk/', $payload);

            if ($response->successful()) {
                $responses = $response->json('responses');

                foreach ($responses as $res) {
                    $sms = MessageDetail::where('id', $res['clientsmsid'])->first();
                    if ($sms) {
                        $sms->update([
                            'status' => $res['response-code'] == 200 ? 'sent' : 'failed',
                            'message_id' => $res['messageid']
                        ]);
                    }
                }

                $batchCount = $batch->count();
                $totalProcessed += $batchCount;
                $j = $i + 1;
                $this->info("Batch {$j} processed: {$batchCount} messages.");

                // Pause to respect the 100-per-minute rate limit
                if ($i < 4) {
                    sleep(12);
                }
            } else {
                $this->error("API call failed: " . $response->status());
                break;
            }
        }
        $this->info("Done. Total messages processed: {$totalProcessed}");
    }
}
