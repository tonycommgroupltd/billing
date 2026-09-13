<?php

namespace App\Services;

use App\Models\Plan;
use App\Models\PppoeBandwidthSample;
use App\Models\Radacct;
use App\Models\Router;
use App\Models\Service;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use RouterOS\Client;
use RouterOS\Query;

/**
 * Per-customer PPPoE live rates + short history for the customer view card.
 *
 * Storage is intentionally tiny: sample online sessions every few minutes and
 * prune after ~26 hours. Live polls from the UI are not written to the DB.
 */
class PppoeBandwidthService
{
    public function __construct(private RouterBandwidthService $routerBw)
    {
    }

    /**
     * @return array{service:Service,router:Router,username:string}|array{error:string,status:int}
     */
    public function resolveServiceContext(int $customerId, ?int $serviceId = null): array
    {
        $query = Service::query()
            ->whereNull('deleted_at')
            ->where('customer_id', $customerId);

        if ($serviceId) {
            $query->where('id', $serviceId);
        }

        $service = $query->orderByDesc('id')->first();

        if (!$service) {
            return ['error' => 'No service found for this customer.', 'status' => 404];
        }

        $username = trim((string) $service->mikrotik_name);
        if ($username === '') {
            return ['error' => 'This service has no PPPoE username.', 'status' => 422];
        }

        $routerId = $service->router_id ?: optional(Plan::find($service->plan_id))->router_id;
        if (!$routerId) {
            return ['error' => 'No router linked to this service plan.', 'status' => 422];
        }

        $router = Router::find($routerId);
        if (!$router || empty($router->host)) {
            return ['error' => 'Router record is missing or has no host.', 'status' => 422];
        }

        return [
            'service' => $service,
            'router' => $router,
            'username' => $username,
        ];
    }

    /**
     * Live MikroTik sample for one PPPoE session.
     *
     * @return array<string,mixed>
     */
    public function liveForCustomer(int $customerId, ?int $serviceId = null): array
    {
        $ctx = $this->resolveServiceContext($customerId, $serviceId);
        if (isset($ctx['error'])) {
            return $ctx;
        }

        /** @var Service $service */
        $service = $ctx['service'];
        /** @var Router $router */
        $router = $ctx['router'];
        $username = $ctx['username'];

        try {
            $client = $this->routerBw->clientFor($router);
        } catch (\Throwable $e) {
            return [
                'error' => 'Could not connect to NAS: ' . $e->getMessage(),
                'status' => 502,
                'online' => false,
                'service_id' => $service->id,
                'username' => $username,
                'router' => $router->title ?: $router->host,
            ];
        }

        $active = $this->findActivePpp($client, $username);
        if (!$active) {
            return [
                'success' => true,
                'online' => false,
                'service_id' => $service->id,
                'username' => $username,
                'router' => $router->title ?: $router->host,
                'router_id' => $router->id,
                'interface' => null,
                'download_bps' => 0,
                'upload_bps' => 0,
                'sampled_at' => Carbon::now()->toIso8601String(),
                'message' => 'PPPoE session is offline on the NAS.',
            ];
        }

        try {
            $m = $this->monitorStable($client, $active['interface']);
        } catch (\Throwable $e) {
            return [
                'error' => 'Could not read interface rates: ' . $e->getMessage(),
                'status' => 502,
                'online' => true,
                'service_id' => $service->id,
                'username' => $username,
                'router' => $router->title ?: $router->host,
                'interface' => $active['interface'],
            ];
        }

        $plan = Plan::find($service->plan_id);
        $rates = $this->sanitizeCustomerRates($m['tx_bps'], $m['rx_bps'], $plan);

        // PPPoE server iface: TX → customer download, RX → customer upload
        return [
            'success' => true,
            'online' => true,
            'service_id' => $service->id,
            'username' => $username,
            'router' => $router->title ?: $router->host,
            'router_id' => $router->id,
            'interface' => $m['interface'],
            'address' => $active['address'],
            'uptime' => $active['uptime'],
            'download_bps' => $rates['download_bps'],
            'upload_bps' => $rates['upload_bps'],
            'sampled_at' => $m['sampled_at'],
        ];
    }

    /**
     * @return array{points:list<array{t:string,download:int,upload:int}>,service_id:int,username:?string,range:string}
     */
    public function historyForCustomer(int $customerId, ?int $serviceId = null, string $range = '24h'): array
    {
        $ctx = $this->resolveServiceContext($customerId, $serviceId);
        if (isset($ctx['error'])) {
            return $ctx;
        }

        /** @var Service $service */
        $service = $ctx['service'];

        if (!Schema::hasTable('pppoe_bandwidth_samples')) {
            return [
                'success' => true,
                'service_id' => $service->id,
                'username' => $ctx['username'],
                'range' => $range,
                'points' => [],
                'message' => 'History table not ready yet.',
            ];
        }

        $hours = match ($range) {
            '1h' => 1,
            '6h' => 6,
            default => 24,
        };

        $from = Carbon::now()->subHours($hours);
        $rows = PppoeBandwidthSample::query()
            ->where('service_id', $service->id)
            ->where('sampled_at', '>=', $from)
            ->orderBy('sampled_at')
            ->get(['sampled_at', 'download_bps', 'upload_bps']);

        // Bucket to ~2–5 minutes so the chart stays smooth without hammering the UI
        $bucketSeconds = $hours <= 1 ? 60 : ($hours <= 6 ? 120 : 300);
        $buckets = [];
        foreach ($rows as $row) {
            $down = (int) $row->download_bps;
            $up = (int) $row->upload_bps;
            // Hide legacy bogus spikes still in DB until scrub runs
            if ($this->isBogusSpike($down, $up)) {
                continue;
            }
            $ts = $row->sampled_at?->timestamp ?? 0;
            if ($ts <= 0) {
                continue;
            }
            $key = (int) (floor($ts / $bucketSeconds) * $bucketSeconds);
            if (!isset($buckets[$key])) {
                $buckets[$key] = ['download' => 0, 'upload' => 0, 'n' => 0];
            }
            $buckets[$key]['download'] += $down;
            $buckets[$key]['upload'] += $up;
            $buckets[$key]['n']++;
        }

        $points = [];
        ksort($buckets);
        foreach ($buckets as $key => $agg) {
            $n = max(1, $agg['n']);
            $points[] = [
                't' => Carbon::createFromTimestamp($key)->toIso8601String(),
                'download' => (int) round($agg['download'] / $n),
                'upload' => (int) round($agg['upload'] / $n),
            ];
        }

        return [
            'success' => true,
            'service_id' => $service->id,
            'username' => $ctx['username'],
            'range' => $range,
            'points' => $points,
        ];
    }

    /**
     * Sample all online PPPoE sessions (grouped by router). Returns counters.
     *
     * Uses byte-counter deltas over ~1s instead of monitor-traffic once.
     * Batch once-samples on busy NAS boxes return fake 80–100 Mbps spikes.
     *
     * @return array{ok:int,fail:int,skipped:int}
     */
    public function sampleOnline(): array
    {
        if (!Schema::hasTable('pppoe_bandwidth_samples')) {
            return ['ok' => 0, 'fail' => 0, 'skipped' => 0];
        }

        $ok = 0;
        $fail = 0;
        $skipped = 0;

        $onlineUsernames = Radacct::query()
            ->whereNull('acctstoptime')
            ->distinct()
            ->pluck('username')
            ->map(fn ($u) => trim((string) $u))
            ->filter()
            ->values()
            ->all();

        if (empty($onlineUsernames)) {
            return ['ok' => 0, 'fail' => 0, 'skipped' => 0];
        }

        $services = Service::query()
            ->whereNull('deleted_at')
            ->whereIn('mikrotik_name', $onlineUsernames)
            ->get(['id', 'customer_id', 'plan_id', 'router_id', 'mikrotik_name']);

        $plans = Plan::query()
            ->whereIn('id', $services->pluck('plan_id')->filter()->unique()->all())
            ->get()
            ->keyBy('id');

        $planRouter = $plans->mapWithKeys(fn (Plan $p) => [$p->id => $p->router_id]);

        $byRouter = [];
        foreach ($services as $service) {
            $routerId = $service->router_id ?: ($planRouter[$service->plan_id] ?? null);
            if (!$routerId) {
                $skipped++;
                continue;
            }
            $byRouter[$routerId][] = $service;
        }

        foreach ($byRouter as $routerId => $routerServices) {
            $router = Router::find($routerId);
            if (!$router || empty($router->host)) {
                $skipped += count($routerServices);
                continue;
            }

            try {
                $client = $this->routerBw->clientFor($router);
            } catch (\Throwable $e) {
                Log::warning('[pppoe-bw] connect failed router ' . $routerId . ': ' . $e->getMessage());
                $fail += count($routerServices);
                continue;
            }

            $activeByName = [];
            try {
                foreach ($client->query(new Query('/ppp/active/print'))->read() as $row) {
                    $name = trim((string) ($row['name'] ?? ''));
                    if ($name !== '') {
                        $activeByName[$name] = $row;
                    }
                }
            } catch (\Throwable $e) {
                Log::warning('[pppoe-bw] /ppp/active failed router ' . $routerId . ': ' . $e->getMessage());
                $fail += count($routerServices);
                continue;
            }

            // Build iface → service map for this router
            $ifaceToService = [];
            foreach ($routerServices as $service) {
                $username = trim((string) $service->mikrotik_name);
                if ($username === '' || !isset($activeByName[$username])) {
                    $skipped++;
                    continue;
                }
                $ifaceHint = trim((string) ($activeByName[$username]['interface'] ?? ''));
                $iface = $ifaceHint !== '' ? $ifaceHint : ('<pppoe-' . $username . '>');
                $ifaceToService[$iface] = $service;
            }

            if (empty($ifaceToService)) {
                continue;
            }

            try {
                $ratesByIface = $this->byteDeltaRates($client, array_keys($ifaceToService), 1.0);
            } catch (\Throwable $e) {
                Log::warning('[pppoe-bw] byte-delta failed router ' . $routerId . ': ' . $e->getMessage());
                $fail += count($ifaceToService);
                continue;
            }

            $now = Carbon::now();
            $insert = [];

            foreach ($ifaceToService as $iface => $service) {
                if (!isset($ratesByIface[$iface])) {
                    $fail++;
                    continue;
                }
                $m = $ratesByIface[$iface];
                $plan = $plans->get($service->plan_id);
                $rates = $this->sanitizeCustomerRates($m['tx_bps'], $m['rx_bps'], $plan);
                $insert[] = [
                    'service_id' => $service->id,
                    'router_id' => $router->id,
                    'username' => trim((string) $service->mikrotik_name),
                    'interface' => $iface,
                    'download_bps' => $rates['download_bps'],
                    'upload_bps' => $rates['upload_bps'],
                    'sampled_at' => $now,
                ];
                $ok++;
            }

            if (!empty($insert)) {
                foreach (array_chunk($insert, 200) as $chunk) {
                    DB::table('pppoe_bandwidth_samples')->insert($chunk);
                }
            }
        }

        return compact('ok', 'fail', 'skipped');
    }

    public function pruneOlderThanHours(int $hours = 26): int
    {
        if (!Schema::hasTable('pppoe_bandwidth_samples')) {
            return 0;
        }

        return PppoeBandwidthSample::query()
            ->where('sampled_at', '<', Carbon::now()->subHours($hours))
            ->delete();
    }

    /**
     * Remove known-bad monitor-traffic spikes already stored in history.
     * Pattern: one side ~80–100 Mbps while the other is nearly idle.
     */
    public function scrubBogusSamples(): int
    {
        if (!Schema::hasTable('pppoe_bandwidth_samples')) {
            return 0;
        }

        // Absolute junk from batch monitor-traffic once (seen ~90–97 Mbps)
        $hard = PppoeBandwidthSample::query()
            ->where(function ($q) {
                $q->where('upload_bps', '>=', 40_000_000)
                    ->orWhere('download_bps', '>=', 40_000_000);
            })
            ->where(function ($q) {
                $q->whereRaw('LEAST(upload_bps, download_bps) <= 500000')
                    ->orWhereRaw('GREATEST(upload_bps, download_bps) >= 80000000');
            })
            ->delete();

        return (int) $hard;
    }

    /**
     * Two short monitor-traffic reads; keep the lower of each direction.
     * Single "once" polls can spike on a busy API.
     *
     * @return array{interface:string,rx_bps:int,tx_bps:int,sampled_at:string}
     */
    private function monitorStable(Client $client, string $iface): array
    {
        $a = $this->routerBw->monitorOnce($client, $iface);
        usleep(450000);
        $b = $this->routerBw->monitorOnce($client, $iface);

        return [
            'interface' => $iface,
            'rx_bps' => min((int) $a['rx_bps'], (int) $b['rx_bps']),
            'tx_bps' => min((int) $a['tx_bps'], (int) $b['tx_bps']),
            'sampled_at' => Carbon::now()->toIso8601String(),
        ];
    }

    /**
     * Reliable batch rates from interface byte counters over $seconds.
     *
     * @param  list<string>  $ifaces
     * @return array<string,array{rx_bps:int,tx_bps:int}>
     */
    private function byteDeltaRates(Client $client, array $ifaces, float $seconds = 1.0): array
    {
        $want = array_fill_keys($ifaces, true);
        $snap = function () use ($client, $want): array {
            $out = [];
            $rows = $client->query(
                (new Query('/interface/print'))
                    ->equal('.proplist', 'name,rx-byte,tx-byte')
            )->read();
            foreach ($rows as $row) {
                $name = (string) ($row['name'] ?? '');
                if ($name === '' || !isset($want[$name])) {
                    continue;
                }
                $out[$name] = [
                    'rx' => (int) ($row['rx-byte'] ?? 0),
                    'tx' => (int) ($row['tx-byte'] ?? 0),
                ];
            }

            return $out;
        };

        $t0 = microtime(true);
        $before = $snap();
        $sleepUs = (int) max(400000, round($seconds * 1_000_000));
        usleep($sleepUs);
        $after = $snap();
        $elapsed = max(0.35, microtime(true) - $t0);

        $rates = [];
        foreach ($ifaces as $iface) {
            if (!isset($before[$iface], $after[$iface])) {
                continue;
            }
            $drx = max(0, $after[$iface]['rx'] - $before[$iface]['rx']);
            $dtx = max(0, $after[$iface]['tx'] - $before[$iface]['tx']);
            $rates[$iface] = [
                'rx_bps' => (int) round(($drx * 8) / $elapsed),
                'tx_bps' => (int) round(($dtx * 8) / $elapsed),
            ];
        }

        return $rates;
    }

    /**
     * Drop MikroTik garbage spikes and soft-cap to plan speed.
     * tx = download to customer, rx = upload from customer.
     *
     * @return array{download_bps:int,upload_bps:int}
     */
    private function sanitizeCustomerRates(int $txBps, int $rxBps, ?Plan $plan): array
    {
        $down = max(0, $txBps);
        $up = max(0, $rxBps);

        // Classic bogus once-sample: ~80–100 Mbps one way, other nearly idle
        if ($this->isBogusSpike($down, $up)) {
            $down = 0;
            $up = 0;
        }

        // Hard ceiling for a single PPPoE session sample (rejects API nonsense)
        $hardCeil = 120_000_000; // 120 Mbps
        $down = min($down, $hardCeil);
        $up = min($up, $hardCeil);

        $planCeil = $this->planCeilBps($plan);
        if ($planCeil !== null) {
            $down = min($down, $planCeil);
            $up = min($up, $planCeil);
        }

        return [
            'download_bps' => $down,
            'upload_bps' => $up,
        ];
    }

    private function isBogusSpike(int $downBps, int $upBps): bool
    {
        $hi = max($downBps, $upBps);
        $lo = min($downBps, $upBps);

        if ($hi >= 80_000_000) {
            return true;
        }

        return $hi >= 40_000_000 && $lo <= 500_000;
    }

    /**
     * Soft max bps from plan label (e.g. 5M) allowing burst headroom.
     */
    private function planCeilBps(?Plan $plan): ?int
    {
        if (!$plan) {
            return null;
        }

        $label = (string) data_get($plan->rate_limit, 'label', '');
        $title = (string) ($plan->title ?? '');
        $text = trim($label !== '' ? $label : $title);
        if ($text === '') {
            return null;
        }

        if (!preg_match('/(\d+(?:\.\d+)?)\s*([gmk])?b?/i', $text, $m)) {
            return null;
        }

        $n = (float) $m[1];
        $unit = strtoupper($m[2] ?? 'M');
        $mbps = match ($unit) {
            'G' => $n * 1000.0,
            'K' => $n / 1000.0,
            default => $n,
        };

        if ($mbps <= 0) {
            return null;
        }

        // 2.5× plan + 2 Mbps slack for short bursts / measurement noise
        return (int) round(($mbps * 2.5 + 2.0) * 1_000_000);
    }

    /**
     * @return array{interface:string,address:?string,uptime:?string}|null
     */
    private function findActivePpp(Client $client, string $username): ?array
    {
        foreach ($client->query((new Query('/ppp/active/print'))->where('name', $username))->read() as $row) {
            if (($row['name'] ?? '') !== $username) {
                continue;
            }
            $iface = $this->resolvePppInterfaceName($client, $username, $row);

            return [
                'interface' => $iface ?: ('<pppoe-' . $username . '>'),
                'address' => $row['address'] ?? null,
                'uptime' => $row['uptime'] ?? null,
            ];
        }

        return null;
    }

    private function resolvePppInterfaceName(Client $client, string $username, array $activeRow): ?string
    {
        $candidates = [
            '<pppoe-' . $username . '>',
            '<' . $username . '>',
            (string) ($activeRow['interface'] ?? ''),
            (string) ($activeRow['caller-id'] ?? ''),
        ];
        $candidates = array_values(array_filter(array_unique($candidates)));

        try {
            foreach ($client->query(new Query('/interface/print'))->read() as $iface) {
                $name = (string) ($iface['name'] ?? '');
                if ($name !== '' && in_array($name, $candidates, true)) {
                    return $name;
                }
            }
        } catch (\Throwable $e) {
            // fall through
        }

        return $candidates[0] ?? null;
    }
}
