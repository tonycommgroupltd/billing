<?php

namespace App\Services;

use App\Models\Router;

/**
 * Resolve hub WireGuard next-hop for a NAS (multi-router ONU path).
 */
class OnuRouterGateway
{
    /**
     * @return array{router_id:int,name:string,wg_ip:string,wg_pubkey:string,wg_iface:string,ppp_cidrs:array<int,string>,base_allowed_ips:array<int,string>}|null
     */
    public function forRouter(Router $router): ?array
    {
        $gateways = config('onu.gateways', []);
        $iface = (string) config('onu.wg_iface', 'wg-tcom');

        if (isset($gateways[$router->id]) && $this->usable($gateways[$router->id])) {
            return $this->normalize((int) $router->id, $gateways[$router->id], $iface);
        }

        $host = (string) ($router->host ?: '');
        $nasIp = (string) ($router->nas_ip ?: '');
        foreach ($gateways as $id => $gw) {
            $hosts = $gw['hosts'] ?? [];
            if (!is_array($hosts)) {
                continue;
            }
            if (($host !== '' && in_array($host, $hosts, true))
                || ($nasIp !== '' && in_array($nasIp, $hosts, true))) {
                if ($this->usable($gw)) {
                    return $this->normalize((int) $id, $gw, $iface);
                }
            }
        }

        if ((int) $router->id === 3 || $host === '102.0.26.60') {
            $ip = (string) config('onu.faiba_wg_ip');
            $pub = (string) config('onu.faiba_wg_pubkey');
            if ($ip !== '' && $pub !== '') {
                return [
                    'router_id' => 3,
                    'name' => 'Faiba 2',
                    'wg_ip' => $ip,
                    'wg_pubkey' => $pub,
                    'wg_iface' => $iface,
                    'ppp_cidrs' => ['10.10.0.0/16'],
                    'base_allowed_ips' => ['10.10.0.0/16', '102.0.15.250/32'],
                ];
            }
        }

        return null;
    }

    /** @param  array<int,string>  $cidrs */
    public function ipInCidrs(string $ip, array $cidrs): bool
    {
        $long = ip2long($ip);
        if ($long === false) {
            return false;
        }

        foreach ($cidrs as $cidr) {
            if (!str_contains($cidr, '/')) {
                if ($ip === $cidr) {
                    return true;
                }
                continue;
            }
            [$subnet, $bits] = explode('/', $cidr, 2);
            $subnetLong = ip2long($subnet);
            $mask = -1 << (32 - (int) $bits);
            if ($subnetLong !== false && ($long & $mask) === ($subnetLong & $mask)) {
                return true;
            }
        }

        return false;
    }

    private function usable(array $gw): bool
    {
        return !empty($gw['wg_ip']) && !empty($gw['wg_pubkey']);
    }

    private function normalize(int $id, array $gw, string $iface): array
    {
        $cidrs = $gw['ppp_cidrs'] ?? config('onu.default_ppp_cidrs', ['10.10.0.0/16']);
        if (!is_array($cidrs) || $cidrs === []) {
            $cidrs = ['10.10.0.0/16'];
        }

        return [
            'router_id' => $id,
            'name' => (string) ($gw['name'] ?? ('router-' . $id)),
            'wg_ip' => (string) $gw['wg_ip'],
            'wg_pubkey' => (string) $gw['wg_pubkey'],
            'wg_iface' => $iface,
            'ppp_cidrs' => array_values($cidrs),
            'base_allowed_ips' => array_values($gw['base_allowed_ips'] ?? $cidrs),
        ];
    }
}
