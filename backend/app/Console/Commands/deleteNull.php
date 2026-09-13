<?php

namespace App\Console\Commands;

use App\Models\IpStat;
use Carbon\Carbon;
use Illuminate\Console\Command;

class deleteNull extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'app:delete-null';

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
        IpStat::where('created_at', '<=', Carbon::yesterday())->whereNull('name')->limit(10000)->delete();
    }
}
