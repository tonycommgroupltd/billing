<?php

namespace App\Console\Commands;

use App\Models\Plan;
use App\Models\Router;
use App\Models\Service;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use RouterOS\Client;
use RouterOS\Query;

class SyncPppoeSecrets extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'mikrotik:sync-pppoe';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Sync PPPoE secrets from services table to MikroTik';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $router = Router::find(3);

        $client = new Client([
            'host' => $router->host,
            'user' => $router->api_login,
            'pass' => $router->api_password,
            'port' => (int) $router->api_port,
        ]);

        // preload plans (performance fix)
        $plans = Plan::all()->keyBy('id');

        $services = Service::whereNull('synced_at')
            ->where('router_id', 3)
            ->get();

        foreach ($services as $service) {

            try {

                $plan = $plans[$service->plan_id] ?? null;

                if (!$plan) {
                    $this->error("No plan for service ID {$service->id}");
                    continue;
                }

                $profile = 'EXPIRED';

                if (
                    isset($service->status['value']) &&
                    (int)$service->status['value'] === 2
                ) {
                    $profile = $plan->rate_limit['label'];
                }

                // 🔍 check if user already exists in MikroTik
                $checkQuery = new Query('/ppp/secret/print');
                $checkQuery->where('name', $service->mikrotik_name);

                $exists = $client->query($checkQuery)->read();

                if (!empty($exists)) {
                    $this->warn("Exists: {$service->mikrotik_name}");
                    $service->synced_at = now();
                    $service->save();
                    continue;
                }

                // ➕ create secret
                $query = new Query('/ppp/secret/add');

                $query->equal('name', $service->mikrotik_name)
                    ->equal('password', $service->mikrotik_password)
                    ->equal('service', 'pppoe')
                    ->equal('profile', $profile)
                    ->equal('comment', 'Auto synced from App');

                $client->query($query)->read();

                // verify success before saving
                $service->synced_at = now();
                $service->save();

                $this->info("Added: {$service->mikrotik_name}");
            } catch (\Throwable $e) {

                Log::error("PPPoe sync failed", [
                    'service_id' => $service->id,
                    'error' => $e->getMessage()
                ]);

                $this->error("Failed: {$service->mikrotik_name}");
            }
        }

        return 0;
    }
}
