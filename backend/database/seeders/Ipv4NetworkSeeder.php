<?php

namespace Database\Seeders;

use App\Models\Ipv4Network;
use App\Models\Router;
use Illuminate\Database\Seeder;

class Ipv4NetworkSeeder extends Seeder
{
    public function run(): void
    {
        // Remove expired / wrong pool types only — keep public + private
        Ipv4Network::query()
            ->where(function ($q) {
                $q->where('pool_name', 'EXPIRED')
                    ->orWhere('cidr', 'like', '90.%')
                    ->orWhere('cidr', 'like', '80.%');
            })
            ->delete();

        $main = Router::query()
            ->where(function ($q) {
                $q->where('host', '102.0.15.249')
                    ->orWhere('host', '102.0.25.70')
                    ->orWhere('nas_ip', '102.0.15.94')
                    ->orWhere('nas_ip', '102.0.25.70');
            })
            ->first();

        $faiba2 = Router::query()
            ->where(function ($q) {
                $q->where('host', '102.0.26.60')
                    ->orWhere('nas_ip', '102.0.26.60');
            })
            ->first();

        $defaults = [];

        if ($main) {
            $defaults = array_merge($defaults, [
                [
                    'router_id' => $main->id,
                    'title' => 'Main gateway /29',
                    'cidr' => '102.0.15.248/29',
                    'gateway' => '102.0.15.249',
                    'purpose' => 'Public customer / gateway block',
                    'location' => 'Main router — bridge1',
                    'type' => 'wan_block',
                    'api_host' => '102.0.15.249',
                    'scan_mode' => 'enumerate',
                ],
                [
                    'router_id' => $main->id,
                    'title' => 'Airtel uplink',
                    'cidr' => '102.0.15.94/32',
                    'gateway' => '102.0.15.94',
                    'purpose' => 'Router WAN uplink',
                    'location' => 'Main router — vlan539_Airtel',
                    'type' => 'wan_block',
                    'api_host' => '102.0.15.249',
                    'scan_mode' => 'enumerate',
                ],
                [
                    'router_id' => $main->id,
                    'title' => 'Secondary WAN 25.70',
                    'cidr' => '102.0.25.70/32',
                    'gateway' => '102.0.15.249',
                    'purpose' => 'Secondary public WAN',
                    'location' => 'Main router — vlan539_Airtel',
                    'type' => 'wan_block',
                    'api_host' => '102.0.15.249',
                    'scan_mode' => 'enumerate',
                ],
                [
                    'router_id' => $main->id,
                    'title' => 'Bridge public /29',
                    'cidr' => '102.0.29.192/29',
                    'gateway' => '102.0.29.193',
                    'purpose' => 'Public /29 on bridge1',
                    'location' => 'Main router — bridge1',
                    'type' => 'wan_block',
                    'api_host' => '102.0.15.249',
                    'scan_mode' => 'enumerate',
                ],
                [
                    'router_id' => $main->id,
                    'title' => 'PPPoE pool (fttx)',
                    'cidr' => '10.10.0.10-10.10.255.254',
                    'pool_name' => 'fttx',
                    'purpose' => 'Private PPPoE customer IPs',
                    'location' => 'Main router',
                    'type' => 'private',
                    'api_host' => '102.0.15.249',
                    'scan_mode' => 'pool',
                ],
                [
                    'router_id' => $main->id,
                    'title' => 'DHCP pool (svlan)',
                    'cidr' => '10.20.1.1-10.20.255.254',
                    'pool_name' => 'svlan_dhcp',
                    'purpose' => 'Private DHCP customer IPs',
                    'location' => 'Main router',
                    'type' => 'private',
                    'api_host' => '102.0.15.249',
                    'scan_mode' => 'pool',
                ],
            ]);
        }

        if ($faiba2) {
            $defaults = array_merge($defaults, [
                [
                    'router_id' => $faiba2->id,
                    'title' => 'Faiba 2 WAN',
                    'cidr' => '102.0.26.60/32',
                    'gateway' => '102.0.26.60',
                    'purpose' => 'Router WAN',
                    'location' => 'Faiba 2 — vlan_airtel',
                    'type' => 'wan_block',
                    'api_host' => '102.0.26.60',
                    'scan_mode' => 'enumerate',
                ],
                [
                    'router_id' => $faiba2->id,
                    'title' => 'PPPoE pool (fttx)',
                    'cidr' => '10.10.0.3-10.10.255.254',
                    'pool_name' => 'fttx',
                    'purpose' => 'Private PPPoE customer IPs',
                    'location' => 'Faiba 2 router',
                    'type' => 'private',
                    'api_host' => '102.0.26.60',
                    'scan_mode' => 'pool',
                ],
                [
                    'router_id' => $faiba2->id,
                    'title' => 'CGNAT pool (100.64)',
                    'cidr' => '100.64.0.2-100.64.15.254',
                    'pool_name' => 'hs-pool-20',
                    'purpose' => 'Private CGNAT customer IPs',
                    'location' => 'Faiba 2 router — bridge1',
                    'type' => 'private',
                    'api_host' => '102.0.26.60',
                    'scan_mode' => 'pool',
                ],
                [
                    'router_id' => $faiba2->id,
                    'title' => 'TR-069 pool',
                    'cidr' => '10.200.0.10-10.200.0.250',
                    'pool_name' => 'tr069-pool',
                    'purpose' => 'Private TR-069 management IPs',
                    'location' => 'Faiba 2 router',
                    'type' => 'private',
                    'api_host' => '102.0.26.60',
                    'scan_mode' => 'pool',
                ],
            ]);
        }

        foreach ($defaults as $row) {
            Ipv4Network::query()->updateOrCreate(
                [
                    'router_id' => $row['router_id'],
                    'cidr' => $row['cidr'],
                    'type' => $row['type'],
                ],
                $row
            );
        }
    }
}
