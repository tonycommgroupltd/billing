<?php

namespace App\Services;

use App\Models\Router;
use App\Models\RouterBandwidthSample;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use RouterOS\Client;
use RouterOS\Config;
use RouterOS\Query;

class RouterBandwidthService
{
    public function clientFor(Router $router): Client
    {
        if (empty($router->host) || empty($router->api_login) || $router->api_password === null) {
            throw new \RuntimeException("Router {$router->id} is missing API credentials.");
        }

        return new Client(new Config([
            'host' => $router->host,
            'user' => $router->api_login,
            'pass' => $router->api_password,
            'port' => (int) ($router->api_port ?: 8728),
            'timeout' => 8,
        ]));
    }

    /**
     * Resolve WAN/monitor interface: saved value, else default-route iface, else first ethernet.
     */
    public function resolveMonitorInterface(Router $router, ?Client $client = null): ?string
    {
        if (!empty($router->monitor_interface)) {
            return $router->monitor_interface;
        }

        $client = $client ?: $this->clientFor($router);

        try {
            $routes = $client->query(
                (new Query('/ip/route/print'))
                    ->where('dst-address', '0.0.0.0/0')
                    ->where('active', 'true')
            )->read();

            foreach ($routes as $route) {
                foreach (['immediate-gw', 'gateway'] as $key) {
                    $gw = (string) ($route[$key] ?? '');
                    if ($gw !== '' && preg_match('/%([^\\s,]+)/', $gw, $m)) {
                        $iface = $m[1];
                        $router->monitor_interface = $iface;
                        $router->save();
                        return $iface;
                    }
                }
                if (!empty($route['vrf-interface'])) {
                    $iface = (string) $route['vrf-interface'];
                    $router->monitor_interface = $iface;
                    $router->save();
                    return $iface;
                }
            }
        } catch (\Throwable $e) {
            Log::warning("WAN resolve failed for router {$router->id}: " . $e->getMessage());
        }

        try {
            $ethers = $client->query(new Query('/interface/ethernet/print'))->read();
            if (!empty($ethers[0]['name'])) {
                $iface = (string) $ethers[0]['name'];
                $router->monitor_interface = $iface;
                $router->save();
                return $iface;
            }
        } catch (\Throwable $e) {
            // ignore
        }

        return null;
    }

    /**
     * Parse stored customer iface list (comma-separated).
     *
     * @return list<string>
     */
    public function parseCustomerInterfaces(?string $stored): array
    {
        if ($stored === null || trim($stored) === '') {
            return [];
        }

        return array_values(array_filter(array_map('trim', explode(',', $stored))));
    }

    /**
     * Resolve customer-facing interfaces for "internet out".
     *
     * MikroTik bridge iface counters often undercount hardware-offloaded traffic.
     * Prefer summing bridge *ports* (OLT uplinks, etc.), excluding the WAN parent.
     *
     * Stored on routers.customer_interface as comma-separated names.
     *
     * @return list<string>
     */
    public function resolveCustomerInterfaces(Router $router, ?Client $client = null, ?string $wan = null): array
    {
        $saved = $this->parseCustomerInterfaces($router->customer_interface);
        if (!empty($saved)) {
            return $saved;
        }

        $client = $client ?: $this->clientFor($router);
        $wan = $wan ?: $router->monitor_interface;
        $exclude = [];
        if ($wan) {
            $exclude[strtolower($wan)] = true;
        }

        try {
            $vlans = $client->query(new Query('/interface/vlan/print'))->read();
            foreach ($vlans as $v) {
                $name = (string) ($v['name'] ?? '');
                if ($wan && strcasecmp($name, $wan) === 0 && !empty($v['interface'])) {
                    $exclude[strtolower((string) $v['interface'])] = true;
                }
            }
        } catch (\Throwable $e) {
            // ignore
        }

        $portNames = [];
        try {
            $bridges = $client->query(new Query('/interface/bridge/print'))->read();
            foreach ($bridges as $b) {
                $bn = (string) ($b['name'] ?? '');
                if ($bn === '') {
                    continue;
                }
                $ports = $client->query(
                    (new Query('/interface/bridge/port/print'))->where('bridge', $bn)
                )->read();
                foreach ($ports as $p) {
                    $iname = (string) ($p['interface'] ?? '');
                    if ($iname === '') {
                        continue;
                    }
                    $low = strtolower($iname);
                    if (isset($exclude[$low])) {
                        continue;
                    }
                    if (preg_match('/management|mgmt|^lo$|loopback/i', $iname)) {
                        continue;
                    }
                    $portNames[$iname] = true;
                }
            }
        } catch (\Throwable $e) {
            Log::warning("Bridge port resolve failed router {$router->id}: " . $e->getMessage());
        }

        $candidates = array_keys($portNames);

        // Fallback: running non-WAN ether/vlan/sfp (not pppoe)
        if (empty($candidates)) {
            try {
                $ifaces = $client->query(new Query('/interface/print'))->read();
                foreach ($ifaces as $i) {
                    $name = (string) ($i['name'] ?? '');
                    $type = strtolower((string) ($i['type'] ?? ''));
                    $running = strtolower((string) ($i['running'] ?? ''));
                    $disabled = strtolower((string) ($i['disabled'] ?? 'false'));
                    if ($name === '' || isset($exclude[strtolower($name)])) {
                        continue;
                    }
                    if (in_array($disabled, ['true', 'yes', '1'], true)) {
                        continue;
                    }
                    if (!in_array($running, ['true', 'yes'], true)) {
                        continue;
                    }
                    if (preg_match('/^pppoe-|^<|>|wg|wireguard|loopback|^lo$/i', $name)) {
                        continue;
                    }
                    if (in_array($type, ['ether', 'vlan', 'bonding', 'bridge'], true)
                        || preg_match('/sfp|ether|vlan|bond|bridge|olt|uplink/i', $name)) {
                        $candidates[] = $name;
                    }
                }
            } catch (\Throwable $e) {
                // ignore
            }
        }

        $candidates = array_values(array_unique($candidates));
        $scored = [];
        foreach (array_slice($candidates, 0, 28) as $name) {
            try {
                $m = $this->monitorOnce($client, $name);
                $scored[] = [
                    'name' => $name,
                    'tx' => $m['tx_bps'],
                    'rx' => $m['rx_bps'],
                ];
            } catch (\Throwable $e) {
                // skip
            }
        }

        usort($scored, fn ($a, $b) => $b['tx'] <=> $a['tx']);

        $picked = [];
        if (!empty($scored)) {
            $topTx = (int) $scored[0]['tx'];
            $threshold = max(5_000_000, (int) round($topTx * 0.02));
            foreach ($scored as $s) {
                $isOlt = (bool) preg_match('/olt|uplink|ftth|ffth/i', $s['name']);
                if ($s['tx'] >= $threshold || ($isOlt && $s['tx'] >= 1_000_000)) {
                    $picked[] = $s['name'];
                }
            }
            if (empty($picked) && $topTx > 0) {
                $picked[] = $scored[0]['name'];
            }
        }

        $picked = array_slice($picked, 0, 6);
        $router->customer_interface = empty($picked) ? null : implode(',', $picked);
        $router->save();

        return $picked;
    }

    /**
     * Backward-compatible single string (first / joined list).
     */
    public function resolveCustomerInterface(Router $router, ?Client $client = null, ?string $wan = null): ?string
    {
        $list = $this->resolveCustomerInterfaces($router, $client, $wan);
        return empty($list) ? null : implode(',', $list);
    }

    /**
     * Single-interface monitor-traffic once.
     *
     * @return array{interface:string,rx_bps:int,tx_bps:int,sampled_at:string}
     */
    public function monitorOnce(Client $client, string $iface): array
    {
        $out = $client->query(
            (new Query('/interface/monitor-traffic'))
                ->equal('interface', $iface)
                ->equal('once')
        )->read();

        if (empty($out[0])) {
            throw new \RuntimeException("Empty monitor-traffic for {$iface}");
        }

        return [
            'interface' => $iface,
            'rx_bps' => (int) ($out[0]['rx-bits-per-second'] ?? 0),
            'tx_bps' => (int) ($out[0]['tx-bits-per-second'] ?? 0),
            'sampled_at' => Carbon::now()->toIso8601String(),
        ];
    }

    /**
     * Sum monitor-traffic across multiple interfaces.
     *
     * @param  list<string>  $ifaces
     * @return array{interface:string,rx_bps:int,tx_bps:int,sampled_at:string}|null
     */
    public function monitorSum(Client $client, array $ifaces): ?array
    {
        $rx = 0;
        $tx = 0;
        $ok = [];
        foreach ($ifaces as $iface) {
            if ($iface === '') {
                continue;
            }
            try {
                $m = $this->monitorOnce($client, $iface);
                $rx += $m['rx_bps'];
                $tx += $m['tx_bps'];
                $ok[] = $iface;
            } catch (\Throwable $e) {
                Log::warning("monitorSum skip {$iface}: " . $e->getMessage());
            }
        }
        if (empty($ok)) {
            return null;
        }

        return [
            'interface' => implode(',', $ok),
            'rx_bps' => $rx,
            'tx_bps' => $tx,
            'sampled_at' => Carbon::now()->toIso8601String(),
        ];
    }

    /**
     * Live WAN sample (backward compatible for View.js realtime chart).
     */
    public function liveSample(Router $router, ?string $interface = null): array
    {
        $client = $this->clientFor($router);
        $iface = $interface ?: $this->resolveMonitorInterface($router, $client);
        if (!$iface) {
            throw new \RuntimeException("No monitor interface for router {$router->id}");
        }

        $m = $this->monitorOnce($client, $iface);

        return [
            'router_id' => $router->id,
            'title' => $router->title,
            'host' => $router->host,
            'interface' => $m['interface'],
            'rx_bps' => $m['rx_bps'],
            'tx_bps' => $m['tx_bps'],
            'sampled_at' => $m['sampled_at'],
        ];
    }

    /**
     * Live dual sample: WAN + customer path(s).
     * internet_in  = WAN RX (from ISP)
     * internet_out = sum of customer/OLT port TX (to PPPoE/hotspot clients)
     */
    public function liveDualSample(Router $router): array
    {
        $client = $this->clientFor($router);
        $wan = $this->resolveMonitorInterface($router, $client);
        if (!$wan) {
            throw new \RuntimeException("No WAN/monitor interface for router {$router->id}");
        }

        $wanM = $this->monitorOnce($client, $wan);
        $customerIfaces = $this->resolveCustomerInterfaces($router, $client, $wan);
        $customerM = !empty($customerIfaces) ? $this->monitorSum($client, $customerIfaces) : null;

        $internetIn = $wanM['rx_bps'];
        $internetOut = $customerM['tx_bps'] ?? null;
        $customerLabel = $customerM['interface'] ?? null;

        return [
            'router_id' => $router->id,
            'title' => $router->title,
            'host' => $router->host,
            'wan_interface' => $wan,
            'customer_interface' => $customerLabel,
            'customer_interfaces' => $customerIfaces,
            'interface' => $wan, // compat
            'rx_bps' => $wanM['rx_bps'],
            'tx_bps' => $wanM['tx_bps'],
            'customer_rx_bps' => $customerM['rx_bps'] ?? null,
            'customer_tx_bps' => $customerM['tx_bps'] ?? null,
            'internet_in_bps' => $internetIn,
            'internet_out_bps' => $internetOut,
            'sampled_at' => Carbon::now()->toIso8601String(),
        ];
    }

    public function persistSample(Router $router): ?RouterBandwidthSample
    {
        try {
            $live = $this->liveDualSample($router);
            return RouterBandwidthSample::create([
                'router_id' => $router->id,
                'interface' => $live['wan_interface'],
                'customer_interface' => $live['customer_interface'],
                'rx_bps' => $live['rx_bps'],
                'tx_bps' => $live['tx_bps'],
                'customer_rx_bps' => $live['customer_rx_bps'],
                'customer_tx_bps' => $live['customer_tx_bps'],
                'sampled_at' => Carbon::now(),
            ]);
        } catch (\Throwable $e) {
            Log::warning("Bandwidth sample failed router {$router->id}: " . $e->getMessage());
            return null;
        }
    }

    public function sampleAll(): array
    {
        $ok = 0;
        $fail = 0;
        foreach (Router::query()->whereNotNull('host')->whereNotNull('api_login')->get() as $router) {
            if ($this->persistSample($router)) {
                $ok++;
            } else {
                $fail++;
            }
        }
        return compact('ok', 'fail');
    }

    public function pruneOlderThanDays(int $days = 8): int
    {
        return RouterBandwidthSample::where('sampled_at', '<', Carbon::now()->subDays($days))->delete();
    }

    /**
     * History points for charts.
     *
     * @return array{wan_interface:?string,customer_interface:?string,points:array<int,array{t:string,in:int,out:?int,wan_tx:int,customer_rx:?int}>}
     */
    public function history(Router $router, string $range = '7d'): array
    {
        $hours = match ($range) {
            '1h' => 1,
            '24h' => 24,
            '7d' => 24 * 7,
            default => 24 * 7,
        };

        $from = Carbon::now()->subHours($hours);
        $query = RouterBandwidthSample::query()
            ->where('router_id', $router->id)
            ->where('sampled_at', '>=', $from)
            ->orderBy('sampled_at');

        $wanIface = $router->monitor_interface;
        $custIface = $router->customer_interface;

        $mapRow = function ($r) {
            $out = $r->customer_tx_bps;
            // Older rows before bridge sampling: no customer columns
            if ($out === null) {
                $out = null;
            }
            return [
                't' => $r->sampled_at->toIso8601String(),
                'in' => (int) $r->rx_bps,
                'out' => $out === null ? null : (int) $out,
                'wan_tx' => (int) $r->tx_bps,
                'customer_rx' => $r->customer_rx_bps === null ? null : (int) $r->customer_rx_bps,
                // Compat for old frontend
                'rx' => (int) $r->rx_bps,
                'tx' => $out === null ? (int) $r->tx_bps : (int) $out,
            ];
        };

        if ($hours <= 24) {
            $rows = $query->get();
            if ($rows->isNotEmpty()) {
                $wanIface = $rows->last()->interface ?: $wanIface;
                $custIface = $rows->last()->customer_interface ?: $custIface;
            }
            return [
                'interface' => $wanIface,
                'wan_interface' => $wanIface,
                'customer_interface' => $custIface,
                'points' => $rows->map($mapRow)->all(),
            ];
        }

        $rows = $query->get();
        if ($rows->isNotEmpty()) {
            $wanIface = $rows->last()->interface ?: $wanIface;
            $custIface = $rows->last()->customer_interface ?: $custIface;
        }

        $buckets = [];
        foreach ($rows as $r) {
            $key = $r->sampled_at->copy()->startOfMinute()->minute(intval($r->sampled_at->minute / 5) * 5)->format('Y-m-d H:i:00');
            if (!isset($buckets[$key])) {
                $buckets[$key] = ['in' => 0, 'out' => 0, 'out_n' => 0, 'wan_tx' => 0, 'customer_rx' => 0, 'rx_n' => 0, 'n' => 0];
            }
            $buckets[$key]['in'] += (int) $r->rx_bps;
            $buckets[$key]['wan_tx'] += (int) $r->tx_bps;
            $buckets[$key]['n']++;
            if ($r->customer_tx_bps !== null) {
                $buckets[$key]['out'] += (int) $r->customer_tx_bps;
                $buckets[$key]['out_n']++;
            }
            if ($r->customer_rx_bps !== null) {
                $buckets[$key]['customer_rx'] += (int) $r->customer_rx_bps;
                $buckets[$key]['rx_n']++;
            }
        }

        $points = [];
        foreach ($buckets as $key => $b) {
            $n = max(1, $b['n']);
            $out = $b['out_n'] > 0 ? (int) round($b['out'] / $b['out_n']) : null;
            $points[] = [
                't' => Carbon::parse($key)->toIso8601String(),
                'in' => (int) round($b['in'] / $n),
                'out' => $out,
                'wan_tx' => (int) round($b['wan_tx'] / $n),
                'customer_rx' => $b['rx_n'] > 0 ? (int) round($b['customer_rx'] / $b['rx_n']) : null,
                'rx' => (int) round($b['in'] / $n),
                'tx' => $out ?? (int) round($b['wan_tx'] / $n),
            ];
        }

        return [
            'interface' => $wanIface,
            'wan_interface' => $wanIface,
            'customer_interface' => $custIface,
            'points' => $points,
        ];
    }

    public function overview(): array
    {
        $out = [];
        foreach (Router::query()->orderBy('id')->get() as $router) {
            $latest = RouterBandwidthSample::query()
                ->where('router_id', $router->id)
                ->orderByDesc('sampled_at')
                ->first();

            $live = null;
            try {
                $live = $this->liveDualSample($router);
            } catch (\Throwable $e) {
                $live = ['error' => $e->getMessage()];
            }

            $latestPayload = null;
            if ($latest) {
                $latestPayload = [
                    'wan_interface' => $latest->interface,
                    'customer_interface' => $latest->customer_interface,
                    'interface' => $latest->interface,
                    'rx_bps' => (int) $latest->rx_bps,
                    'tx_bps' => (int) $latest->tx_bps,
                    'customer_rx_bps' => $latest->customer_rx_bps === null ? null : (int) $latest->customer_rx_bps,
                    'customer_tx_bps' => $latest->customer_tx_bps === null ? null : (int) $latest->customer_tx_bps,
                    'internet_in_bps' => (int) $latest->rx_bps,
                    'internet_out_bps' => $latest->customer_tx_bps === null ? null : (int) $latest->customer_tx_bps,
                    'sampled_at' => $latest->sampled_at?->toIso8601String(),
                ];
            }

            $out[] = [
                'id' => $router->id,
                'title' => $router->title,
                'host' => $router->host,
                'monitor_interface' => $router->monitor_interface,
                'customer_interface' => $router->customer_interface,
                'latest' => $latestPayload,
                'live' => $live,
            ];
        }
        return $out;
    }
}
