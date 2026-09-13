<?php

namespace App\Console\Commands;

use App\Services\PppoeBandwidthService;
use Illuminate\Console\Command;

class SamplePppoeBandwidth extends Command
{
    protected $signature = 'pppoe:sample-bandwidth
                            {--prune : Also delete samples older than 26 hours}
                            {--scrub : Delete known bogus spike samples from history}';

    protected $description = 'Sample download/upload rates for online PPPoE sessions (short retention)';

    public function handle(PppoeBandwidthService $service): int
    {
        if ($this->option('scrub')) {
            $scrubbed = $service->scrubBogusSamples();
            $this->info("Scrubbed {$scrubbed} bogus PPPoE samples");
        }

        $result = $service->sampleOnline();
        $this->info("PPPoE bandwidth ok={$result['ok']} fail={$result['fail']} skipped={$result['skipped']}");

        if ($this->option('prune')) {
            $deleted = $service->pruneOlderThanHours(26);
            $this->info("Pruned {$deleted} old PPPoE samples");
        }

        return self::SUCCESS;
    }
}
