<?php

namespace App\Console\Commands;

use App\Models\Customer;
use App\Models\MessageDetail;
use Illuminate\Console\Command;

class SeedSMSForCustomers extends Command
{
    protected $signature = 'sms:seed-customers {message} {--active-only : Only customers with an active service (status=2)} {--send-via=sms : Customer send_via filter (sms|whatsapp|all)}';
    protected $description = 'Queue SMS for customers with given message';

    public function handle()
    {
        $messageText = $this->argument('message');
        $messageHash = md5($messageText);

        $query = Customer::query()->active()->select('id', 'phone_number');

        $sendVia = (string) $this->option('send-via');
        if ($sendVia !== 'all') {
            $query->where('send_via', $sendVia);
        }

        if ($this->option('active-only')) {
            $query->whereHas('services', function ($sq) {
                $sq->where('status->value', 2);
            });
        }

        $customers = $query->get();
        $count = 0;
        foreach ($customers as $customer) {
            $mobile = $this->formatMobile($customer->phone_number);

            if (!$mobile) {
                continue; // skip invalid mobile
            }

            $exists = MessageDetail::where('recipient', $mobile)
                ->where('message_hash', $messageHash)
                ->exists();

            if (!$exists) {
                MessageDetail::create([
                    'message' => $messageText,
                    'message_hash' => $messageHash,
                    'recipient' => $mobile,
                    'notice' => '',
                    'customer_id' => $customer->id,
                    'status' => 'pending',
                    //'template_id' => 10,
                    'components' => []
                ]);
                $count++;
            }
        }

        $this->info("Queued {$count} unique SMS messages.");
    }

    private function formatMobile($mobile)
    {
        $mobile = preg_replace('/\D/', '', $mobile); // remove all non-digits

        // Handle common Kenyan formats like 07XX..., 01XX...
        if (preg_match('/^(07|01)\d{8}$/', $mobile)) {
            return '254' . substr($mobile, 1); // e.g., 0712345678 → 254712345678
        }

        // If already in international format with +254 or 254
        if (preg_match('/^254\d{9}$/', $mobile)) {
            return $mobile;
        }

        if (preg_match('/^\+254\d{9}$/', $mobile)) {
            return substr($mobile, 1); // remove '+' from +2547XXXXXXX
        }

        // Optionally, log or skip invalid numbers
        return null;
    }
}
