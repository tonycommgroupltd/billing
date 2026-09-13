<?php

namespace App\Services;

use App\Models\Plan;
use App\Models\Router;
use App\Models\Service;
use Illuminate\Support\Facades\Log;
use RouterOS\Client;
use RouterOS\Config;
use RouterOS\Query;

class OnuWebAccessService
{
    /**
     * Resolve customer ONU web access via PPPoE remote address (10.10.x.x).
     * VPN: open https://{pppoe_ip}/ when WireGuard routes 10.10.0.0/16.
     * Public: hub nginx reverse proxy http://102.0.15.254:{port}/ → customer WAN
     *         (rewrites private IP redirects so browsers stay on the public URL).
     */
    public function provision(Service $service, ?HubOnuProxyService $hubProxy = null): array
    {
        $hubProxy ??= app(HubOnuProxyService::class);

        $plan = Plan::find($service->plan_id);
        if (!$plan || !$plan->router_id) {
            return $this->fail('No router linked to this service plan.');
        }

        $router = Router::find($plan->router_id);
        if (!$router || empty($router->host)) {
            return $this->fail('Router record is missing or has no host.');
        }

        $username = $service->mikrotik_name;
        if (!$username) {
            return $this->fail('Service has no PPPoE login.');
        }

        try {
            $client = $this->connect($router);
        } catch (\Throwable $e) {
            Log::warning('ONU web access: router connect failed', [
                'service_id' => $service->id,
                'router' => $router->host,
                'error' => $e->getMessage(),
            ]);

            return $this->fail('Could not connect to NAS: ' . $e->getMessage());
        }

        $pppIp = $this->findActivePppIp($client, $username);
        if (!$pppIp) {
            return $this->fail('Customer is offline — PPPoE session not active on NAS.');
        }

        $gateway = app(OnuRouterGateway::class)->forRouter($router);
        if (!$gateway) {
            return $this->fail(
                'Router "' . ($router->title ?: $router->host) . '" has no WireGuard path to the hub for ONU access yet.'
            );
        }

        $cidrs = $gateway['ppp_cidrs'] ?? ['10.10.0.0/16'];
        if (!app(OnuRouterGateway::class)->ipInCidrs($pppIp, $cidrs)) {
            return $this->fail(
                'Customer WAN IP ' . $pppIp . ' is outside this router\'s ONU pools (' . implode(', ', $cidrs) . ').'
            );
        }

        $pppIface = $this->findActivePppInterface($client, $username);
        $hubPublicHost = config('onu.hub_public_host', '102.0.15.254');
        $httpPort = $hubProxy->httpPort((int) $service->id);
        $httpsPort = $httpPort + 1;

        try {
            $this->ensureVpnPoolForwardRules($client, $gateway['wg_iface'] ?? 'wg-tcom', $cidrs);
            // Install hub /32 before probing so non-Faiba routers are reachable.
            $path = $hubProxy->ensureCustomerPath($pppIp, $gateway);
            if (!($path['ok'] ?? false)) {
                return array_merge($this->fail($path['message'] ?? 'Hub route failed.'), [
                    'pppoe_ip' => $pppIp,
                    'gateway' => $gateway['name'],
                ]);
            }
            $reachable = $this->probeOnu($client, $pppIp);
        } catch (\Throwable $e) {
            Log::warning('ONU web access: NAS setup failed', [
                'service_id' => $service->id,
                'error' => $e->getMessage(),
            ]);

            return $this->fail('Failed to prepare NAS access: ' . $e->getMessage());
        }

        // Hub curl probe (incl. Huawei https://WAN:80 legacy TLS) — not MikroTik fetch.
        $webPorts = $hubProxy->probeUpstreamWeb($pppIp);
        $httpWeb = $webPorts['http'] ?? false;
        $httpsWeb = $webPorts['https'] ?? false;
        $https80 = $webPorts['https80'] ?? false;
        $upstreamMode = $webPorts['mode'] ?? 'none';
        if ($upstreamMode === 'none' || (!$httpWeb && !$httpsWeb && !$https80)) {
            return array_merge($this->fail(
                'Customer is online at ' . $pppIp . ' but the ONU web UI is not reachable on ports 80/443 from the hub (LAN-only management or filtered).'
            ), [
                'pppoe_ip' => $pppIp,
                'reachable' => $reachable,
                'http_available' => false,
                'https_available' => false,
                'gateway' => $gateway['name'],
            ]);
        }

        $hubResult = $hubProxy->ensureCustomerProxy((int) $service->id, $pppIp, $upstreamMode, $gateway);
        $hubOk = $hubResult['ok'] ?? false;

        // Prefer HTTP public URL — nginx rewrites private HTTPS redirects into this host:port.
        $publicHttpUrl = 'http://' . $hubPublicHost . ':' . $httpPort . '/';
        $publicHttpsUrl = 'https://' . $hubPublicHost . ':' . $httpsPort . '/';
        $vpnHttpUrl = 'http://' . $pppIp . '/';
        $vpnHttpsUrl = $https80 ? ('https://' . $pppIp . ':80/') : ('https://' . $pppIp . '/');

        $publicUrl = $hubResult['public_url'] ?? $publicHttpUrl;
        $vpnUrl = ($httpsWeb || $https80) ? $vpnHttpsUrl : $vpnHttpUrl;

        if (!$hubOk && !$reachable) {
            return array_merge($this->fail($hubResult['message'] ?? 'Could not reach ONU or configure public access.'), [
                'vpn_url' => $vpnUrl,
                'pppoe_ip' => $pppIp,
            ]);
        }

        return [
            'ok' => true,
            'url' => $publicUrl,
            'vpn_url' => $vpnUrl,
            'hub_public_url' => $publicUrl,
            'public_url' => $publicUrl,
            'public_http_url' => $publicHttpUrl,
            'public_https_url' => $publicHttpsUrl,
            'vpn_http_url' => $vpnHttpUrl,
            'vpn_https_url' => $vpnHttpsUrl,
            'vpn_host' => config('onu.hub_vpn_host', '10.88.0.1'),
            'hub_public_host' => $hubPublicHost,
            'public_host' => $hubPublicHost,
            'http_port' => $httpPort,
            'https_port' => $httpsPort,
            'public_port' => $httpPort,
            'http_available' => $httpWeb,
            'https_available' => $httpsWeb || $https80,
            'https80_available' => $https80,
            'upstream_mode' => $upstreamMode,
            'gateway' => $gateway['name'],
            'gateway_wg_ip' => $gateway['wg_ip'],
            'onu_ip' => $pppIp,
            'pppoe_ip' => $pppIp,
            'ppp_interface' => $pppIface,
            'reachable' => $reachable,
            'hub_proxy_ok' => $hubOk,
            'proxy_mode' => $hubResult['mode'] ?? 'nginx',
            'note' => $hubOk
                ? 'Opens via hub reverse proxy (rewrites private IP redirects). Use ' . $publicHttpUrl
                : 'Hub proxy failed; VPN URL may still work on WireGuard: ' . $vpnUrl,
        ];
    }

    private function connect(Router $router): Client
    {
        return new Client(new Config([
            'host' => $router->host,
            'user' => $router->api_login,
            'pass' => $router->api_password,
            'port' => (int) ($router->api_port ?: 8728),
            'timeout' => 25,
        ]));
    }

    private function query(Client $client, string $path, array $equals = []): array
    {
        $q = new Query($path);
        foreach ($equals as $k => $v) {
            $q->equal($k, $v);
        }

        return $client->query($q)->read();
    }

    private function findActivePppInterface(Client $client, string $username): ?string
    {
        foreach ($this->query($client, '/ppp/active/print') as $row) {
            if (($row['name'] ?? '') === $username) {
                $candidates = [
                    '<pppoe-' . $username . '>',
                    '<' . $username . '>',
                ];
                foreach ($this->query($client, '/interface/print') as $iface) {
                    $name = $iface['name'] ?? '';
                    if (!($iface['running'] ?? false)) {
                        continue;
                    }
                    if (in_array($name, $candidates, true)) {
                        return $name;
                    }
                }

                return $candidates[0];
            }
        }

        return null;
    }

    private function findActivePppIp(Client $client, string $username): ?string
    {
        foreach ($this->query($client, '/ppp/active/print') as $row) {
            if (($row['name'] ?? '') === $username) {
                return $row['address'] ?? null;
            }
        }

        return null;
    }

    /**
     * @param  array<int,string>  $poolCidrs
     */
    private function ensureVpnPoolForwardRules(Client $client, string $wgIface = 'wg-tcom', array $poolCidrs = ['10.10.0.0/16']): void
    {
        foreach ($poolCidrs as $cidr) {
            $tag = str_replace(['.', '/'], ['-', '_'], $cidr);
            $rules = [
                [
                    'comment' => "onu-vpn-{$tag}-in",
                    'chain' => 'forward',
                    'action' => 'accept',
                    'in-interface' => $wgIface,
                    'dst-address' => $cidr,
                ],
                [
                    'comment' => "onu-vpn-{$tag}-out",
                    'chain' => 'forward',
                    'action' => 'accept',
                    'out-interface' => $wgIface,
                    'src-address' => $cidr,
                ],
                [
                    'comment' => "onu-vpn-{$tag}-vpn-to-pppoe",
                    'chain' => 'forward',
                    'action' => 'accept',
                    'in-interface' => $wgIface,
                    'src-address' => '10.88.0.0/24',
                    'dst-address' => $cidr,
                ],
                [
                    'comment' => "onu-vpn-{$tag}-pppoe-to-vpn",
                    'chain' => 'forward',
                    'action' => 'accept',
                    'out-interface' => $wgIface,
                    'dst-address' => '10.88.0.0/24',
                    'src-address' => $cidr,
                ],
            ];

            foreach ($rules as $rule) {
                $comment = $rule['comment'];
                foreach ($this->query($client, '/ip/firewall/filter/print') as $row) {
                    if (($row['comment'] ?? '') === $comment) {
                        continue 2;
                    }
                }
                $add = $rule;
                $add['place-before'] = '0';
                $this->query($client, '/ip/firewall/filter/add', $add);
            }
        }
    }

    private function probeWebPorts(Client $client, string $pppIp): array
    {
        return [
            'http' => $this->probeWebPort($client, 'http://' . $pppIp . '/'),
            'https' => $this->probeWebPort($client, 'https://' . $pppIp . '/'),
        ];
    }

    private function probeWebPort(Client $client, string $url): bool
    {
        try {
            foreach ($this->query($client, '/tool/fetch', [
                'url' => $url,
                'mode' => 'http',
                'duration' => '8',
                'check-certificate' => 'no',
            ]) as $row) {
                if (($row['status'] ?? '') === 'finished') {
                    return true;
                }
                if (isset($row['http-code']) && (int) $row['http-code'] > 0) {
                    return true;
                }
            }
        } catch (\Throwable $e) {
            return false;
        }

        return false;
    }

    private function probeOnu(Client $client, string $pppIp): bool
    {
        try {
            $ping = $this->query($client, '/ping', [
                'address' => $pppIp,
                'count' => '2',
            ]);
            foreach ($ping as $row) {
                if (isset($row['received']) && (int) $row['received'] > 0) {
                    return true;
                }
            }
        } catch (\Throwable $e) {
            return false;
        }

        return false;
    }

    private function fail(string $message): array
    {
        return [
            'ok' => false,
            'message' => $message,
        ];
    }
}
