<?php

namespace App\Console\Commands;

use App\Models\MikrotikApiLog;
use App\Models\Plan;
use App\Models\Router;
use App\Models\Service;
use Illuminate\Console\Command;
use RouterOS\Client;
use RouterOS\Query;

class RetryMikrotikConnections extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'app:retry-mikrotik-connections';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Retry failed MikroTik API connections';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $logs = MikrotikApiLog::where('status', 'retrying')
            ->where(function ($query) {
                $query->whereNull('next_retry_at')
                    ->orWhere('next_retry_at', '<=', now());
            })
            ->limit(10)
            ->get();
        foreach ($logs as $log) {
            try {
                $router = Router::find($log->router_id);
                $service = Service::find($log->service_id);
                $client = new Client([
                    'host' => $router->host,
                    'user' => $router->api_login,
                    'pass' => $router->api_password,
                    'port' => (int)$router->api_port,
                    'timeout' => 3,
                ]);
                if ($service->status['value'] == 1) {
                    $query =
                        (new Query('/ppp/secret/enable'))
                        ->equal('numbers', $service->mikrotik_name);
                    $client->query($query)->read();
                } else if ($service->status['value'] == 3) {
                    $plan = Plan::find($service->plan_id);
                    $query =
                        (new Query('/ppp/secret/set'))
                        ->equal('.id', $service->mikrotik_id)
                        ->equal('name', $service->mikrotik_name)
                        ->equal('profile', $plan->rate_limit['label']);
                    $client->query($query)->read();
                }
                $service->status = [
                    'label' => 'Active',
                    'value' => 2
                ];
                $service->save();
                $log->update([
                    'status' => 'success',
                    'error' => null,
                    'retry_count' => $log->retry_count + 1,
                    'attempted_at' => now(),
                ]);

                $this->info("Connected successfully to {$router->host}");
            } catch (\Exception $e) {
                $log->update([
                    'retry_count' => $log->retry_count + 1,
                    'error' => $e->getMessage(),
                    'next_retry_at' => now()->addMinutes(1),
                    'attempted_at' => now(),
                ]);
                $this->warn("Failed to connect to {$log->host}: {$e->getMessage()}");
            }
        }
    }
}
