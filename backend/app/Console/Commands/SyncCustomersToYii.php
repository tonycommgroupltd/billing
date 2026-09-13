<?php

namespace App\Console\Commands;

use App\Models\Customer;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class SyncCustomersToYii extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'app:sync-customers-to-yii';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Sync unsynced customers to Yii2';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $customers = Customer::whereNull('synced_at')->get();

        foreach ($customers as $customer) {
            $billingType = $customer->billing_type;
            $billingTypeEnum = match ($billingType['value'] ?? null) {
                1 => 'recurring',
                2 => 'prepaid',
                default => 'recurring', // fallback
            };
            $categoryData = $customer->category;
            $categoryEnum = match ($categoryData['value'] ?? null) {
                1 => 'person',
                2 => 'company',
                default => 'person',
            };
            $payload = [
                'id' => $customer->id,
                'billing_type' => $billingTypeEnum,
                'partner_id' => 1,
                'location_id' => 1,
                'added_by' => 'api',
                'added_by_id' => $customer->user_id ?? 0,
                'status' => 'new',
                'login' => str_pad($customer->id, 6, '0', STR_PAD_LEFT),
                'category' => $categoryEnum,
                'password' => bcrypt('default123'),
                'name' => $customer->name ?? '',
                'email' => 'user' . $customer->id . '@example.com',
                'billing_email' => null,
                'phone' => $customer->phone_number ?? '',
                'street_1' => $customer->address ?? '',
                'zip_code' => '00000',
                'city' => $customer->city ?? '',
                'gps' => null,
                'gdpr_agreed' => 'empty_answer',
                'date_add' => optional($customer->created_at)->format('Y-m-d'),
                'last_online' => null,
                'deleted' => $customer->deleted_at ? '1' : '0',
                'last_update' => optional($customer->updated_at)->format('Y-m-d H:i:s'),
                'daily_prepaid_cost' => 0,
                'mrr_total' => 0,
                'conversion_date' => null,
                'color_number' => rand(2, 8),
            ];

            $response = Http::post('https://billing.tonycommgroupltd.com/api/customers-sync', $payload);

            if ($response->successful()) {
                $customer->update(['synced_at' => now()]);
                $this->info("Synced customer #{$customer->id}");
            } else {
                $this->error("Failed to sync #{$customer->id}: " . $response->body());
            }
        }
    }
}
