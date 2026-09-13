<?php

namespace App\Console\Commands;

use App\Models\Service;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

class SyncCustomerServicesToYii extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'app:sync-customer-services-to-yii';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Command description';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $services = Service::whereNull('synced_at')->withTrashed()->get();
        foreach ($services as $service) {
            $payload = [
                'id' => $service->id,
                'parent_id' => null,
                'customer_id' => $service->customer_id,
                'tariff_id' => $service->plan_id,
                'top_up_tariff_id' => null,
                'bundle_service_id' => null,
                'router_id' => $service->router_id,
                'access_device' => 0,
                'description' => 'Internet Service',
                'quantity' => 1,
                'unit' => '',
                'unit_price' => number_format($service->price, 4, '.', ''),
                'start_date' => optional($service->start_date)->format('Y-m-d') ?? now()->format('Y-m-d'),
                'end_date' => optional($service->end_date)->format('Y-m-d'),
                'status' => $service->status['value'] == 2 ? 'active' : 'disabled',
                'status_new' => null,
                'discount' => '0',
                'discount_value' => null,
                'discount_type' => 'percent',
                'discount_start_date' => null,
                'discount_end_date' => null,
                'discount_text' => null,
                'deleted' => $service->deleted_at ? '1' : '0',
                'login' => $service->mikrotik_name,
                'password' => $service->mikrotik_password,
                'ipv4_pool_id' => null,
                'sector_id' => 0,
                'taking_ipv4' => '0',
                'taking_ipv6' => '0',
                'ipv4' => null,
                'ipv4_route' => null,
                'ipv6' => null,
                'ipv6_delegated' => null,
                'ipv6_pool_id' => null,
                'mac' => null,
                'port_id' => null,
                'period' => '-1',
                'updated_at' => now()->format('Y-m-d H:i:s'),
                'old_end_date' => null,
                'on_approve' => '0',
            ];

            $response = Http::post('https://billing.tonycommgroupltd.com/api/services-sync', $payload);

            if ($response->successful()) {
                $service->update(['synced_at' => now()]);
                $this->info("Synced services #{$service->id}");
            } else {
                $this->error("Failed to sync #{$service->id}: " . $response->body());
            }
        }
    }
}
