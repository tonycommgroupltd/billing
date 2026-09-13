<?php

namespace App\Console\Commands;

use App\Models\IpStat;
use Carbon\Carbon;
use Illuminate\Console\Command;

class UpdateIpStats extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'app:update-ip-stats';

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
        $stats = IpStat::whereNull('name')->where('created_at', '>=', Carbon::now()->subMinutes(6)->toDateTimeString())->get();
        foreach ($stats as $stat) {
            $data = IpStat::where('ipv4_address', $stat->ipv4_address)->whereNotNull('name')->latest()->first();
            if ($data) {
                $stat->name = $data->name;
                $stat->session_id = $data->session_id;
                $stat->caller_id = $data->caller_id;
                $stat->save();
            }
        }
    }
}
