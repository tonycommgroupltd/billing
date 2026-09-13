<?php

namespace App\Console\Commands;

use App\Models\IpStat;
use App\Models\Service;
use Carbon\Carbon;
use Illuminate\Console\Command;

class deletePast extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'app:delete-past';

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
        $services = Service::where('status->value', 2)->where('billing_type->value', 1)->get();
        foreach ($services as $service) {
            $date = Carbon::parse($service->bill_to)->subMonth();
            IpStat::where('created_at', '<=', $date)->where('name', $service->mikrotik_name)->limit(1000)->delete();
        }
    }
}
