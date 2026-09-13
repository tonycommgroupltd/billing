<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\Router;
use App\Models\Service;

class OnlineCustomers extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'online:customers';

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
        $routers = Router::whereNotNull('host')->whereNotNull('api_login')->whereNotNull('api_password')->whereNotNull('api_port')->get();
        foreach ($routers as $router) {
            $secrets = [];
            $response = check_online_customers($router);
            if ($response) {
                foreach ($response as $data) {
                    $secrets[] = $data['name'];
                    Service::join('plans', 'services.plan_id', '=', 'plans.id')->where('plans.router_id', $router->id)->where('mikrotik_name', $data['name'])->update(['online' => 1, 'mikrotik_ipv4' => $data['address'], 'log' => ['uptime' => $data['uptime'], 'caller-id' => $data['caller-id']]]);
                }
                Service::join('plans', 'services.plan_id', '=', 'plans.id')->where('plans.router_id', $router->id)->whereNotIn('mikrotik_name', $secrets)->update(['online' => 0, 'mikrotik_ipv4' => NULL]);
            }
        }
    }
}
