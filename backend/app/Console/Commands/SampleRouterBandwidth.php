<?php

namespace App\Console\Commands;

use App\Services\RouterBandwidthService;
use Illuminate\Console\Command;

class SampleRouterBandwidth extends Command
{
    protected $signature = 'routers:sample-bandwidth {--prune : Also delete samples older than 8 days}';

    protected $description = 'Sample WAN TX/RX (bits/s) from every MikroTik router via API';

    public function handle(RouterBandwidthService $service): int
    {
        $result = $service->sampleAll();
        $this->info("Bandwidth samples ok={$result['ok']} fail={$result['fail']}");

        if ($this->option('prune')) {
            $deleted = $service->pruneOlderThanDays(8);
            $this->info("Pruned {$deleted} old samples");
        }

        return self::SUCCESS;
    }
}
