<?php

namespace App\Services;

use App\Models\Ipv4Network;
use App\Models\Radacct;
use App\Models\Router;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use RouterOS\Client;
use RouterOS\Config;
use RouterOS\Query;

class Ipv4ScanService
{
    private const CACHE_TTL = 120;

    /** 90.x and 80.x are EXPIRED customer pools — never treated as public IPv4 here. */
    private function isPublicWanIp(?string $ip): bool
    {
        if (!$ip || !str_starts_with($ip, '102.0.')) {
            return false;
        }

        return !preg_match('/^(90\.|80\.)/', $ip);
    }

    private function enabledNetworksQuery()
    {
        return Ipv4Network::query()->where('enabled', true);
    }

    private function isExpiredPoolName(?string $name): bool
    {
        return $name && strtoupper($name) === 'EXPIRED';
    }

    /**
     * Lightweight dashboard numbers only.
     * Never triggers a live MikroTik scan (or shutdown scan) — that exceeded
     * PHP's 30s limit and turned /dashboard-stats into a CORS/500 failure.
     * Uses the existing ipv4_scan_v4 cache from the IPv4 Networks page only.
     */
    public function dashboardStats(): array
    {
        $empty = [
            'ipv4_networks' => 0,
            'public_addresses_total' => 0,
            'public_addresses_used' => 0,
            'public_addresses_free' => 0,
            'private_addresses_total' => 0,
            'private_addresses_used' => 0,
        ];

        $scan = Cache::get('ipv4_scan_v4');
        if (!is_array($scan) || empty($scan['summary'])) {
            return $empty;
        }

        $publicCount = collect($scan['networks'] ?? [])->where('type', 'wan_block')->count();
        $privateCount = collect($scan['networks'] ?? [])->where('type', 'private')->count();

        return [
            'ipv4_networks' => $publicCount + $privateCount,
            'public_addresses_total' => $scan['summary']['public_total'] ?? 0,
            'public_addresses_used' => $scan['summary']['public_used'] ?? 0,
            'public_addresses_free' => $scan['summary']['public_free'] ?? 0,
            'private_addresses_total' => $scan['summary']['private_total'] ?? 0,
            'private_addresses_used' => $scan['summary']['private_used'] ?? 0,
        ];
    }

    public function scanAll(bool $refresh = false): array
    {
        $cacheKey = 'ipv4_scan_v4';

        if (!$refresh && Cache::has($cacheKey)) {
            return Cache::get($cacheKey);
        }

        $networks = $this->enabledNetworksQuery()
            ->with('router')
            ->orderBy('type')
            ->orderBy('router_id')
            ->orderBy('title')
            ->get();

        $ipsByHost = [];
        foreach ($networks->where('type', 'wan_block') as $network) {
            $host = $this->resolveApiHost($network);
            if (!$host) {
                continue;
            }
            $ipsByHost[$host] = array_values(array_unique(array_merge(
                $ipsByHost[$host] ?? [],
                $this->expandCidr($network->cidr)
            )));
        }

        $routerSnapshots = [];
        $results = [];

        foreach ($networks as $network) {
            $host = $this->resolveApiHost($network);
            if ($host && !isset($routerSnapshots[$host])) {
                $routerSnapshots[$host] = $this->fetchRouterSnapshot(
                    $network->router,
                    $host,
                    $ipsByHost[$host] ?? []
                );
            }

            $snapshot = $host ? ($routerSnapshots[$host] ?? $this->emptySnapshot($host)) : $this->emptySnapshot(null);
            $results[] = $this->scanNetwork($network, $snapshot);
        }

        $payload = [
            'scanned_at' => now()->toIso8601String(),
            'networks' => $results,
            'public_networks' => array_values(array_filter($results, fn ($n) => ($n['type'] ?? '') === 'wan_block')),
            'private_networks' => array_values(array_filter($results, fn ($n) => ($n['type'] ?? '') === 'private')),
            'summary' => $this->summarize($results),
        ];

        Cache::put($cacheKey, $payload, self::CACHE_TTL);

        return $payload;
    }

    public function scanNetworkModel(Ipv4Network $network, bool $refresh = false): array
    {
        $host = $this->resolveApiHost($network);
        $ips = $this->expandCidr($network->cidr);
        $snapshot = $host
            ? $this->fetchRouterSnapshot($network->router, $host, $ips)
            : $this->emptySnapshot(null);

        return $this->scanNetwork($network, $snapshot);
    }

    private function scanNetwork(Ipv4Network $network, array $snapshot): array
    {
        if ($network->scan_mode === 'pool') {
            return $this->scanPool($network, $snapshot);
        }

        if ($network->scan_mode === 'aggregate') {
            return $this->scanAggregate($network, $snapshot, []);
        }

        return $this->scanEnumerate($network, $snapshot);
    }

    private function scanPool(Ipv4Network $network, array $snapshot): array
    {
        $poolName = $network->pool_name;
        $range = $network->cidr;
        if ($poolName && isset($snapshot['pools'][$poolName]['ranges'])) {
            $range = $snapshot['pools'][$poolName]['ranges'];
        }

        $total = $this->countIpRange($range);
        $usedEntries = $poolName ? ($snapshot['pool_used'][$poolName] ?? []) : [];
        $used = count($usedEntries);
        $free = max(0, $total - $used);

        $addresses = array_map(function ($entry) use ($network) {
            return [
                'ip' => $entry['address'],
                'status' => 'used',
                'purpose' => 'Assigned from pool ' . ($network->pool_name ?? ''),
                'where' => $network->location ?: ($network->router?->title ?? ''),
                'detail' => $entry['owner'] ?? null,
                'username' => null,
            ];
        }, array_slice($usedEntries, 0, 50));

        return [
            'id' => $network->id,
            'title' => $network->title,
            'cidr' => $range,
            'gateway' => $network->gateway,
            'purpose' => $network->purpose,
            'location' => $network->location,
            'pool_name' => $poolName,
            'type' => $network->type,
            'router_id' => $network->router_id,
            'router_title' => $network->router?->title,
            'api_host' => $this->resolveApiHost($network),
            'scan_mode' => 'pool',
            'total' => $total,
            'used' => $used,
            'reserved' => 0,
            'free' => $free,
            'addresses' => $addresses,
            'router_reachable' => $snapshot['reachable'],
            'router_error' => $snapshot['error'],
        ];
    }

    private function scanEnumerate(Ipv4Network $network, array $snapshot): array
    {
        $ips = $this->expandCidr($network->cidr);
        $assignments = $network->ip_assignments ?? [];
        $addresses = [];

        foreach ($ips as $ip) {
            $status = $this->resolveStatus($ip, $network, $snapshot, $assignments[$ip] ?? null);
            $addresses[] = [
                'ip' => $ip,
                'status' => $status['status'],
                'purpose' => $status['purpose'],
                'where' => $status['where'],
                'detail' => $status['detail'],
                'username' => $status['username'],
            ];
        }

        $used = collect($addresses)->where('status', 'used')->count();
        $free = collect($addresses)->where('status', 'free')->count();

        return [
            'id' => $network->id,
            'title' => $network->title,
            'cidr' => $network->cidr,
            'gateway' => $network->gateway,
            'purpose' => $network->purpose,
            'location' => $network->location,
            'type' => $network->type,
            'router_id' => $network->router_id,
            'router_title' => $network->router?->title,
            'api_host' => $this->resolveApiHost($network),
            'scan_mode' => $network->scan_mode,
            'total' => count($addresses),
            'used' => $used,
            'reserved' => 0,
            'free' => $free,
            'addresses' => $addresses,
            'router_reachable' => $snapshot['reachable'],
            'router_error' => $snapshot['error'],
        ];
    }

    private function scanAggregate(Ipv4Network $network, array $snapshot, array $reserved): array
    {
        [$startIp, $endIp, $total] = $this->rangeFromCidr($network->cidr);
        $usedIps = $this->collectUsedIpsInRange($snapshot, $startIp, $endIp);
        $interfaceIps = $this->collectInterfaceIpsInRange($snapshot, $startIp, $endIp);

        $used = max(count($usedIps), 0);
        $reservedInRange = count(array_filter($reserved, fn ($ip) => $this->ipInRange($ip, $startIp, $endIp)));
        $reservedTotal = max($reservedInRange, count($interfaceIps));
        $free = max(0, $total - $used - $reservedTotal);

        return [
            'id' => $network->id,
            'title' => $network->title,
            'cidr' => $network->cidr,
            'gateway' => $network->gateway,
            'purpose' => $network->purpose,
            'location' => $network->location,
            'type' => $network->type,
            'router_id' => $network->router_id,
            'router_title' => $network->router?->title,
            'api_host' => $this->resolveApiHost($network),
            'scan_mode' => $network->scan_mode,
            'total' => $total,
            'used' => $used,
            'reserved' => $reservedTotal,
            'free' => $free,
            'sample_used' => array_slice(array_values($usedIps), 0, 25),
            'addresses' => [],
            'router_reachable' => $snapshot['reachable'],
            'router_error' => $snapshot['error'],
        ];
    }

    private function resolveStatus(
        string $ip,
        Ipv4Network $network,
        array $snapshot,
        ?array $manual = null
    ): array {
        $where = $network->location ?: ($network->router?->title ?? '');
        $iface = $snapshot['interface_by_ip'][$ip] ?? null;
        $pingOk = !empty($snapshot['ping_alive'][$ip]);

        if ($manual) {
            return [
                'status' => 'used',
                'purpose' => $manual['purpose'] ?? 'Assigned',
                'where' => $manual['location'] ?? $where,
                'detail' => null,
                'username' => null,
            ];
        }

        if ($iface) {
            $label = str_contains($network->cidr, '/32')
                ? 'Router WAN IP (on ' . $iface . ')'
                : (($ip === $this->normalizeIp($network->gateway))
                    ? 'Gateway (on ' . $iface . ')'
                    : 'Router interface ' . $iface);

            return [
                'status' => 'used',
                'purpose' => $label,
                'where' => $where,
                'detail' => $pingOk ? 'Ping OK' : 'On router (no ping reply)',
                'username' => null,
            ];
        }

        if ($pingOk) {
            return [
                'status' => 'used',
                'purpose' => 'In use — responds to ping from router',
                'where' => $where,
                'detail' => 'Ping OK',
                'username' => null,
            ];
        }

        if (isset($snapshot['ppp_active'][$ip])) {
            return [
                'status' => 'used',
                'purpose' => 'PPPoE session on this IP',
                'where' => $where,
                'detail' => null,
                'username' => $snapshot['ppp_active'][$ip],
            ];
        }

        if (isset($snapshot['radacct_active'][$ip])) {
            return [
                'status' => 'used',
                'purpose' => 'RADIUS session on this IP',
                'where' => $where,
                'detail' => null,
                'username' => $snapshot['radacct_active'][$ip],
            ];
        }

        return [
            'status' => 'free',
            'purpose' => 'Unused — no ping reply, available to assign',
            'where' => $where,
            'detail' => null,
            'username' => null,
        ];
    }

    private function fetchRouterSnapshot(?Router $router, string $host, array $ipsToPing = []): array
    {
        $cacheKey = 'ipv4_router_snapshot_v3_' . md5($host . '|' . implode(',', $ipsToPing));
        if (Cache::has($cacheKey)) {
            return Cache::get($cacheKey);
        }

        $snapshot = $this->emptySnapshot($host);

        if (!$router || !$router->api || !$router->api_login || !$router->api_password) {
            $snapshot['error'] = 'Router API credentials not configured';
            return $snapshot;
        }

        try {
            $client = new Client(new Config([
                'host' => $host,
                'user' => $router->api_login,
                'pass' => $router->api_password,
                'port' => (int) ($router->api_port ?: 8728),
                'timeout' => 25,
            ]));

            $interfaceIps = [];
            $interfaceByIp = [];
            foreach ($client->query(new Query('/ip/address/print'))->read() as $row) {
                $addr = explode('/', $row['address'] ?? '')[0] ?? null;
                if ($addr && $this->isPublicWanIp($addr)) {
                    $interfaceIps[] = $this->normalizeIp($addr);
                    $interfaceByIp[$this->normalizeIp($addr)] = $row['interface'] ?? null;
                }
            }

            $pppActive = [];
            foreach ($client->query(new Query('/ppp/active/print'))->read() as $row) {
                $addr = $this->normalizeIp($row['address'] ?? '');
                if ($addr && $this->isPublicWanIp($addr)) {
                    $pppActive[$addr] = $row['name'] ?? null;
                }
            }

            $nasIps = array_values(array_unique(array_filter([
                $this->normalizeIp($router->host ?? ''),
                $this->normalizeIp($router->nas_ip ?? ''),
                $this->normalizeIp($host),
            ])));

            $radacctActive = Radacct::query()
                ->whereNull('acctstoptime')
                ->whereIn('nasipaddress', $nasIps)
                ->whereNotNull('framedipaddress')
                ->where('framedipaddress', 'like', '102.0.%')
                ->orderByDesc('radacctid')
                ->get(['username', 'framedipaddress'])
                ->unique('framedipaddress')
                ->mapWithKeys(fn ($row) => [
                    $this->normalizeIp($row->framedipaddress) => $row->username,
                ])
                ->all();

            $pingAlive = [];
            foreach ($ipsToPing as $ip) {
                if ($this->isPublicWanIp($ip)) {
                    $pingAlive[$ip] = $this->pingFromRouter($client, $ip);
                }
            }

            $pools = [];
            foreach ($client->query(new Query('/ip/pool/print'))->read() as $row) {
                $name = $row['name'] ?? null;
                if (!$name || $this->isExpiredPoolName($name)) {
                    continue;
                }
                $pools[$name] = [
                    'ranges' => $row['ranges'] ?? '',
                ];
            }

            $poolUsed = [];
            foreach ($client->query(new Query('/ip/pool/used/print'))->read() as $row) {
                $name = $row['pool'] ?? null;
                if (!$name || $this->isExpiredPoolName($name)) {
                    continue;
                }
                $poolUsed[$name][] = [
                    'address' => $row['address'] ?? '',
                    'owner' => $row['owner'] ?? '',
                ];
            }

            $snapshot = [
                'host' => $host,
                'reachable' => true,
                'error' => null,
                'interface_ips' => array_values(array_unique($interfaceIps)),
                'interface_by_ip' => $interfaceByIp,
                'ppp_active' => $pppActive,
                'radacct_active' => $radacctActive,
                'ping_alive' => $pingAlive,
                'pools' => $pools,
                'pool_used' => $poolUsed,
            ];
        } catch (\Throwable $e) {
            Log::warning('IPv4 scan MikroTik API failed for ' . $host . ': ' . $e->getMessage());
            $snapshot['error'] = $e->getMessage();
        }

        Cache::put($cacheKey, $snapshot, self::CACHE_TTL);

        return $snapshot;
    }

    private function emptySnapshot(?string $host): array
    {
        return [
            'host' => $host,
            'reachable' => false,
            'error' => $host ? null : 'No API host configured',
            'interface_ips' => [],
            'interface_by_ip' => [],
            'ppp_active' => [],
            'radacct_active' => [],
            'ping_alive' => [],
            'pools' => [],
            'pool_used' => [],
        ];
    }

    private function pingFromRouter(Client $client, string $ip): bool
    {
        try {
            $query = (new Query('/ping'))
                ->equal('address', $ip)
                ->equal('count', '2')
                ->equal('interval', '0.2');

            foreach ($client->query($query)->read() as $row) {
                if (isset($row['time']) && ($row['host'] ?? $ip) === $ip) {
                    return true;
                }
            }
        } catch (\Throwable $e) {
            Log::debug('Ping failed for ' . $ip . ': ' . $e->getMessage());
        }

        return false;
    }

    private function resolveApiHost(Ipv4Network $network): ?string
    {
        if ($network->api_host) {
            return $network->api_host;
        }

        if ($network->router?->host) {
            return $network->router->host;
        }

        return null;
    }

    private function summarize(array $networks): array
    {
        $publicTotal = 0;
        $publicUsed = 0;
        $publicFree = 0;
        $privateTotal = 0;
        $privateUsed = 0;
        $privateFree = 0;

        foreach ($networks as $network) {
            if (($network['type'] ?? '') === 'private') {
                $privateTotal += $network['total'] ?? 0;
                $privateUsed += $network['used'] ?? 0;
                $privateFree += $network['free'] ?? 0;
            } else {
                $publicTotal += $network['total'] ?? 0;
                $publicUsed += $network['used'] ?? 0;
                $publicFree += $network['free'] ?? 0;
            }
        }

        return [
            'public_total' => $publicTotal,
            'public_used' => $publicUsed,
            'public_free' => $publicFree,
            'private_total' => $privateTotal,
            'private_used' => $privateUsed,
            'private_free' => $privateFree,
        ];
    }

    private function countIpRange(string $range): int
    {
        if (!str_contains($range, '-')) {
            return str_contains($range, '/') ? ($this->rangeFromCidr($range)[2] ?? 0) : 1;
        }

        [$start, $end] = array_map('trim', explode('-', $range, 2));
        $startLong = ip2long($start);
        $endLong = ip2long($end);

        if ($startLong === false || $endLong === false || $endLong < $startLong) {
            return 0;
        }

        return (int) ($endLong - $startLong + 1);
    }

    private function expandCidr(string $cidr): array
    {
        if (!str_contains($cidr, '/')) {
            return [$this->normalizeIp($cidr)];
        }

        [$ip, $prefix] = explode('/', $cidr, 2);
        $prefix = (int) $prefix;
        if ($prefix < 0 || $prefix > 32) {
            return [];
        }

        if ($prefix === 32) {
            return [$this->normalizeIp($ip)];
        }

        if ($prefix < 16) {
            return [];
        }

        $start = ip2long($ip) & (-1 << (32 - $prefix));
        $size = 1 << (32 - $prefix);
        $ips = [];

        for ($i = 1; $i < $size - 1; $i++) {
            $ips[] = long2ip($start + $i);
        }

        return $ips;
    }

    private function rangeFromCidr(string $cidr): array
    {
        if (!str_contains($cidr, '/')) {
            $ip = $this->normalizeIp($cidr);
            return [$ip, $ip, 1];
        }

        [$ip, $prefix] = explode('/', $cidr, 2);
        $prefix = (int) $prefix;
        $start = ip2long($ip) & (-1 << (32 - $prefix));
        $size = 1 << (32 - $prefix);
        $end = long2ip($start + $size - 1);
        $total = max(1, $size - 2);

        return [long2ip($start + 1), long2ip($start + $size - 2), $total];
    }

    private function collectUsedIpsInRange(array $snapshot, string $startIp, string $endIp): array
    {
        $used = [];

        foreach (['ppp_active', 'radacct_active', 'arp'] as $bucket) {
            foreach ($snapshot[$bucket] ?? [] as $ip => $meta) {
                if ($this->isPublicWanIp($ip) && $this->ipInRange($ip, $startIp, $endIp)) {
                    $used[$ip] = is_string($meta) ? $meta : true;
                }
            }
        }

        return $used;
    }

    private function collectInterfaceIpsInRange(array $snapshot, string $startIp, string $endIp): array
    {
        return array_values(array_filter(
            $snapshot['interface_ips'] ?? [],
            fn ($ip) => $this->ipInRange($ip, $startIp, $endIp)
        ));
    }

    private function ipInRange(string $ip, string $startIp, string $endIp): bool
    {
        $value = ip2long($ip);
        return $value !== false
            && $value >= ip2long($startIp)
            && $value <= ip2long($endIp);
    }

    private function normalizeIp(?string $ip): ?string
    {
        if (!$ip) {
            return null;
        }

        return trim(explode('/', $ip)[0]);
    }
}
