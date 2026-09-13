<?php

namespace App\Console\Commands;

use App\Models\IpStat;
use App\Models\Service;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class identifyIp extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'app:identify-ip';

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
        /*$stats = IpStat::leftJoin('services', function ($q) {
            $q->on('services.mikrotik_name', '=', 'ip_stats.name')
                ->on('services.router_id', '=', 'ip_stats.router_id');
        })->whereNull('ip_stats.customer_id')->whereNotNull('ip_stats.name')->whereNull('services.deleted_at')->where('ip_stats.created_at', '>=', Carbon::now()->subHour()->toDateTimeString())->update(['ip_stats.customer_id' => DB::raw("`services`.`customer_id`")]);*/
        /*foreach ($stats as $stat) {
            $data = Service::where('mikrotik_name', $stat->name)->where('router_id', $stat->router_id)->first();
            if ($data) {
                $stat->customer_id = $data->customer_id;
                $stat->save();
            }
        }*/
    }
}
