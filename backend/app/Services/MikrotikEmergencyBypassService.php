<?php

namespace App\Services;

use App\Models\Plan;
use App\Models\Router;
use App\Models\Service;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use RouterOS\Client;
use RouterOS\Config;
use RouterOS\Query;

class MikrotikEmergencyBypassService
{
    public const STATE_FILE = 'emergency-radius-bypass.json';

    public const SYNC_PROGRESS_FILE = 'emergency-bypass-sync-progress.json';

    public const RADIUS_AUTH_VALUE = 3;

    public const STANDBY_API_SOURCE = '102.0.15.254/32';

    /** Contabo legacy + new VPS (YOUR_VPS_IP) — Mikrotik API allowed sources */
    public const PRODUCTION_API_SOURCE = '100.42.182.120/32,YOUR_VPS_IP/32';

    /**
     * @return array<int, array<string, mixed>>
     */
    public function syncSecrets(Router $router, bool $activeOnly = false, bool $dryRun = false): array
    {
        $client = $this->clientFor($router);
        $plans = Plan::where('router_id', $router->id)->get()->keyBy('id');
        $planIds = $plans->keys()->all();

        $query = Service::query()
            ->whereIn('plan_id', $planIds)
            ->whereNotNull('mikrotik_name')
            ->where('mikrotik_name', '!=', '');

        if ($activeOnly) {
            $query->where('status->value', 2);
        }

        $stats = ['added' => 0, 'updated' => 0, 'skipped' => 0, 'failed' => 0, 'errors' => []];
        $processed = 0;
        $this->markRouterSyncRunning($router);

        foreach ($query->cursor() as $service) {
            $plan = $plans[$service->plan_id] ?? null;
            if (!$plan) {
                $stats['skipped']++;
            } else {
                try {
                    $result = $this->upsertSecret($client, $service, $plan, $dryRun);
                    $stats[$result['action'] === 'added' ? 'added' : 'updated']++;
                } catch (\Throwable $e) {
                    $stats['failed']++;
                    $stats['errors'][] = [
                        'service_id' => $service->id,
                        'username' => $service->mikrotik_name,
                        'message' => $e->getMessage(),
                    ];
                    Log::warning('Emergency bypass secret sync failed', [
                        'router_id' => $router->id,
                        'service_id' => $service->id,
                        'username' => $service->mikrotik_name,
                        'error' => $e->getMessage(),
                    ]);
                }
            }

            $processed++;
            $this->touchRouterSyncProgress($router->id, $processed, $stats);
        }

        $this->markRouterSyncDone($router->id, $processed, $stats);

        return $stats;
    }

    public function isApiBypassActive(): bool
    {
        return $this->getPppAuthMode() === 'api';
    }

    public function getPppAuthMode(): string
    {
        $state = $this->loadState();

        return ($state['ppp_auth_mode'] ?? 'radius') === 'api' ? 'api' : 'radius';
    }

    /**
     * @return array<string, mixed>
     */
    public function syncService(Service $service, bool $dryRun = false): array
    {
        $plan = Plan::find($service->plan_id);
        if (!$plan) {
            throw new \RuntimeException('Plan not found for service.');
        }

        $router = Router::find($plan->router_id);
        if (!$router) {
            throw new \RuntimeException('Router not found for service.');
        }

        if ((int) ($router->authorization['value'] ?? 0) !== self::RADIUS_AUTH_VALUE) {
            return ['action' => 'skipped', 'reason' => 'not_radius_router'];
        }

        $client = $this->clientFor($router);
        $result = $this->upsertSecret($client, $service, $plan, $dryRun);

        if (!$dryRun) {
            $this->touchServiceSync($service);
        }

        return array_merge($result, [
            'router_id' => $router->id,
            'username' => $service->mikrotik_name,
        ]);
    }

    public function pushServiceActive(Service $service): bool
    {
        $plan = Plan::find($service->plan_id);
        if (!$plan) {
            return false;
        }

        $router = Router::find($plan->router_id);
        if (!$router || (int) ($router->authorization['value'] ?? 0) !== self::RADIUS_AUTH_VALUE) {
            return false;
        }

        try {
            $client = $this->clientFor($router);
            $this->upsertSecret($client, $service, $plan, false);
            $this->disconnectSession($client, $service->mikrotik_name);
            $this->touchServiceSync($service);

            return true;
        } catch (\Throwable $e) {
            Log::warning('Bypass pushServiceActive failed', [
                'service_id' => $service->id,
                'error' => $e->getMessage(),
            ]);

            return false;
        }
    }

    public function pushServiceDisabled(Service $service): bool
    {
        return $this->pushServiceState($service, false);
    }

    public function pushServiceExpired(Service $service): bool
    {
        return $this->pushServiceState($service, false, true);
    }

    /**
     * @return array<string, mixed>
     */
    public function dashboardStatus(): array
    {
        $state = $this->loadState() ?? [];
        $routers = [];

        foreach ($this->radiusRouters() as $router) {
            $row = [
                'id' => $router->id,
                'title' => $router->title,
                'host' => $router->host,
                'api_ok' => false,
                'api_error' => null,
                'use_radius' => null,
                'accounting' => null,
                'last_sync' => $state['routers'][(string) $router->id]['sync'] ?? null,
            ];

            $probe = $this->probeApi($router);
            $row['api_ok'] = $probe['ok'];
            $row['api_error'] = $probe['error'] ?? null;
            $row['identity'] = $probe['identity'] ?? null;

            if ($probe['ok']) {
                try {
                    $aaa = $this->readAaaSettings($router);
                    $row['use_radius'] = $this->normalizeBool($aaa['use-radius'] ?? null);
                    $row['accounting'] = $this->normalizeBool($aaa['accounting'] ?? null);
                } catch (\Throwable $e) {
                    $row['api_error'] = $e->getMessage();
                }
            }

            $routers[] = $row;
        }

        return [
            'ppp_auth_mode' => $this->getPppAuthMode(),
            'applied_at' => $state['applied_at'] ?? null,
            'host' => $state['host'] ?? null,
            'routers' => $routers,
            'ready' => collect($routers)->every(fn ($r) => $r['api_ok']),
            'all_local_auth' => $this->getPppAuthMode() === 'api'
                && collect($routers)->every(fn ($r) => $r['use_radius'] === false),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function switchToApiMode(bool $activeOnly = false): array
    {
        $routers = $this->radiusRouters();
        $this->beginSyncProgress('switch_api', $routers, $activeOnly);

        try {
            $state = $this->loadState() ?? [];
            $state['routers'] = $state['routers'] ?? [];
            $state['applied_at'] = now()->toIso8601String();
            $state['host'] = gethostname() ?: php_uname('n');
            $state['ppp_auth_mode'] = 'api';

            foreach ($routers as $router) {
                $sync = $this->syncSecrets($router, $activeOnly, false);
                $aaa = $this->setUseRadius($router, false, false);
                $state['routers'][(string) $router->id] = [
                    'title' => $router->title,
                    'host' => $router->host,
                    'sync' => $sync,
                    'aaa' => $aaa,
                ];
            }

            $this->saveState($state);

            return $this->dashboardStatus();
        } finally {
            $this->finishSyncProgress();
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function switchToRadiusMode(): array
    {
        foreach ($this->radiusRouters() as $router) {
            $this->setUseRadius($router, true, false);
        }

        $state = $this->loadState() ?? [];
        $state['ppp_auth_mode'] = 'radius';
        unset($state['applied_at']);
        $this->saveState($state);

        return $this->dashboardStatus();
    }

    /**
     * @return array<string, mixed>
     */
    public function syncAll(bool $activeOnly = false): array
    {
        $routers = $this->radiusRouters();
        $this->beginSyncProgress('sync', $routers, $activeOnly);

        try {
            $state = $this->loadState() ?? [];
            $state['routers'] = $state['routers'] ?? [];
            $summary = ['routers' => [], 'totals' => ['added' => 0, 'updated' => 0, 'skipped' => 0, 'failed' => 0]];

            foreach ($routers as $router) {
                $sync = $this->syncSecrets($router, $activeOnly, false);
                $state['routers'][(string) $router->id] = array_merge(
                    $state['routers'][(string) $router->id] ?? [],
                    ['title' => $router->title, 'host' => $router->host, 'sync' => $sync]
                );
                $summary['routers'][(string) $router->id] = $sync;
                foreach (['added', 'updated', 'skipped', 'failed'] as $key) {
                    $summary['totals'][$key] += $sync[$key] ?? 0;
                }
            }

            $state['last_sync_at'] = now()->toIso8601String();
            $this->saveState($state);

            return array_merge($summary, ['status' => $this->dashboardStatus()]);
        } finally {
            $this->finishSyncProgress();
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    public function syncProgress(): ?array
    {
        $path = $this->syncProgressPath();
        if (!File::exists($path)) {
            return null;
        }

        $decoded = json_decode(File::get($path), true);

        return is_array($decoded) ? $decoded : null;
    }

    /**
     * @param list<Router> $routers
     */
    private function beginSyncProgress(string $operation, $routers, bool $activeOnly): void
    {
        $routerRows = [];
        $totalAll = 0;

        foreach ($routers as $router) {
            $total = $this->countServicesForRouter($router, $activeOnly);
            $totalAll += $total;
            $routerRows[(string) $router->id] = [
                'id' => $router->id,
                'title' => $router->title,
                'host' => $router->host,
                'total' => $total,
                'processed' => 0,
                'added' => 0,
                'updated' => 0,
                'skipped' => 0,
                'failed' => 0,
                'percent' => 0,
                'status' => 'pending',
            ];
        }

        $this->saveSyncProgress([
            'active' => true,
            'operation' => $operation,
            'active_only' => $activeOnly,
            'started_at' => now()->toIso8601String(),
            'finished_at' => null,
            'total' => $totalAll,
            'processed' => 0,
            'percent' => 0,
            'routers' => $routerRows,
        ]);
    }

    private function finishSyncProgress(): void
    {
        $progress = $this->syncProgress();
        if (!$progress) {
            return;
        }

        $progress['active'] = false;
        $progress['finished_at'] = now()->toIso8601String();
        $progress = $this->recalculateSyncProgress($progress);
        $this->saveSyncProgress($progress);
    }

    private function markRouterSyncRunning(Router $router): void
    {
        $progress = $this->syncProgress();
        if (!$progress || !($progress['active'] ?? false)) {
            return;
        }

        $key = (string) $router->id;
        if (!isset($progress['routers'][$key])) {
            return;
        }

        $progress['routers'][$key]['status'] = 'running';
        $this->saveSyncProgress($progress);
    }

    /**
     * @param array<string, int> $stats
     */
    private function markRouterSyncDone(int $routerId, int $processed, array $stats): void
    {
        $progress = $this->syncProgress();
        if (!$progress) {
            return;
        }

        $key = (string) $routerId;
        if (!isset($progress['routers'][$key])) {
            return;
        }

        $progress['routers'][$key]['processed'] = $processed;
        $progress['routers'][$key]['added'] = $stats['added'] ?? 0;
        $progress['routers'][$key]['updated'] = $stats['updated'] ?? 0;
        $progress['routers'][$key]['skipped'] = $stats['skipped'] ?? 0;
        $progress['routers'][$key]['failed'] = $stats['failed'] ?? 0;
        $progress['routers'][$key]['status'] = ($stats['failed'] ?? 0) > 0 ? 'done_with_errors' : 'done';
        $progress = $this->recalculateSyncProgress($progress);
        $this->saveSyncProgress($progress);
    }

    /**
     * @param array<string, int> $stats
     */
    private function touchRouterSyncProgress(int $routerId, int $processed, array $stats): void
    {
        static $lastWriteAt = 0.0;
        $now = microtime(true);
        if ($processed % 20 !== 0 && ($now - $lastWriteAt) < 0.4) {
            return;
        }
        $lastWriteAt = $now;

        $progress = $this->syncProgress();
        if (!$progress || !($progress['active'] ?? false)) {
            return;
        }

        $key = (string) $routerId;
        if (!isset($progress['routers'][$key])) {
            return;
        }

        $progress['routers'][$key]['processed'] = $processed;
        $progress['routers'][$key]['added'] = $stats['added'] ?? 0;
        $progress['routers'][$key]['updated'] = $stats['updated'] ?? 0;
        $progress['routers'][$key]['skipped'] = $stats['skipped'] ?? 0;
        $progress['routers'][$key]['failed'] = $stats['failed'] ?? 0;
        $progress['routers'][$key]['status'] = 'running';
        $progress = $this->recalculateSyncProgress($progress);
        $this->saveSyncProgress($progress);
    }

    /**
     * @param array<string, mixed> $progress
     * @return array<string, mixed>
     */
    private function recalculateSyncProgress(array $progress): array
    {
        $processedAll = 0;
        $totalAll = 0;

        foreach ($progress['routers'] ?? [] as $key => $row) {
            $total = max(0, (int) ($row['total'] ?? 0));
            $processed = max(0, (int) ($row['processed'] ?? 0));
            if ($total > 0) {
                $processed = min($processed, $total);
            }
            $percent = $total > 0
                ? (int) round(($processed / $total) * 100)
                : (($row['status'] ?? '') === 'done' || ($row['status'] ?? '') === 'done_with_errors' ? 100 : 0);

            $progress['routers'][$key]['processed'] = $processed;
            $progress['routers'][$key]['percent'] = $percent;
            $processedAll += $processed;
            $totalAll += $total;
        }

        $progress['processed'] = $processedAll;
        $progress['total'] = $totalAll;
        $progress['percent'] = $totalAll > 0
            ? (int) round(($processedAll / $totalAll) * 100)
            : 100;

        return $progress;
    }

    private function countServicesForRouter(Router $router, bool $activeOnly): int
    {
        $planIds = Plan::where('router_id', $router->id)->pluck('id');

        $query = Service::query()
            ->whereIn('plan_id', $planIds)
            ->whereNotNull('mikrotik_name')
            ->where('mikrotik_name', '!=', '');

        if ($activeOnly) {
            $query->where('status->value', 2);
        }

        return (int) $query->count();
    }

    /**
     * @param array<string, mixed> $progress
     */
    private function saveSyncProgress(array $progress): void
    {
        File::put(
            $this->syncProgressPath(),
            json_encode($progress, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
        );
    }

    public function syncProgressPath(): string
    {
        return storage_path('app/' . self::SYNC_PROGRESS_FILE);
    }

    private function pushServiceState(Service $service, bool $active, bool $expired = false): bool
    {
        $plan = Plan::find($service->plan_id);
        if (!$plan) {
            return false;
        }

        $router = Router::find($plan->router_id);
        if (!$router || (int) ($router->authorization['value'] ?? 0) !== self::RADIUS_AUTH_VALUE) {
            return false;
        }

        try {
            $client = $this->clientFor($router);
            $statusVal = (int) ($service->status['value'] ?? 0);
            $isActive = $active && $statusVal === 2 && !$expired;
            $profile = $isActive ? ($plan->rate_limit['label'] ?? 'EXPIRED') : 'EXPIRED';
            // Expired/Disabled must stay enabled so CPE can dial EXPIRED → 90.x captive portal.
            // Fully disabling the secret blocks login and prevents captive redirect.
            $disabled = 'no';

            $checkQuery = (new Query('/ppp/secret/print'))->where('name', $service->mikrotik_name);
            $exists = $client->query($checkQuery)->read();

            if (!empty($exists)) {
                $client->query(
                    (new Query('/ppp/secret/set'))
                        ->equal('.id', $exists[0]['.id'])
                        ->equal('password', $service->mikrotik_password)
                        ->equal('profile', $profile)
                        ->equal('disabled', $disabled)
                        ->equal('comment', 'Emergency bypass sync')
                )->read();
            } else {
                $client->query(
                    (new Query('/ppp/secret/add'))
                        ->equal('name', $service->mikrotik_name)
                        ->equal('password', $service->mikrotik_password)
                        ->equal('service', 'pppoe')
                        ->equal('profile', $profile)
                        ->equal('disabled', $disabled)
                        ->equal('comment', 'Emergency bypass sync')
                )->read();
            }

            $this->disconnectSession($client, $service->mikrotik_name);
            $this->touchServiceSync($service);

            return true;
        } catch (\Throwable $e) {
            Log::warning('Bypass pushServiceState failed', [
                'service_id' => $service->id,
                'error' => $e->getMessage(),
            ]);

            return false;
        }
    }

    private function disconnectSession(Client $client, string $username): void
    {
        try {
            $client->query(
                (new Query('/interface/pppoe-server/remove'))
                    ->equal('numbers', '<pppoe-' . $username . '>')
            )->read();
        } catch (\Throwable $e) {
            // Session may not exist.
        }
    }

    private function touchServiceSync(Service $service): void
    {
        $service->synced_at = now();
        $service->save();
    }

    private function normalizeBool(mixed $value): ?bool
    {
        if ($value === null) {
            return null;
        }

        return in_array(strtolower((string) $value), ['yes', 'true', '1'], true);
    }

    /**
     * @return array<string, mixed>
     */
    public function readAaaSettings(Router $router): array
    {
        $client = $this->clientFor($router);
        $rows = $client->query(new Query('/ppp/aaa/print'))->read();

        return $rows[0] ?? [];
    }

    /**
     * @return array<string, mixed>
     */
    public function setUseRadius(Router $router, bool $enabled, bool $dryRun = false): array
    {
        $current = $this->readAaaSettings($router);
        $target = $enabled ? 'yes' : 'no';

        if ($dryRun) {
            return [
                'previous' => $current,
                'target_use_radius' => $target,
                'changed' => ($current['use-radius'] ?? 'yes') !== $target,
            ];
        }

        $client = $this->clientFor($router);
        $query = (new Query('/ppp/aaa/set'))->equal('use-radius', $target);
        $client->query($query)->read();

        return [
            'previous' => $current,
            'target_use_radius' => $target,
            'changed' => ($current['use-radius'] ?? 'yes') !== $target,
        ];
    }

    /**
     * @return array<int, Router>
     */
    public function radiusRouters(?array $routerIds = null)
    {
        $query = Router::query()
            ->where('authorization->value', self::RADIUS_AUTH_VALUE);

        if (!empty($routerIds)) {
            $query->whereIn('id', $routerIds);
        }

        return $query->orderBy('id')->get();
    }

    /**
     * @return array<string, mixed>|null
     */
    public function loadState(): ?array
    {
        $path = $this->statePath();
        if (!File::exists($path)) {
            return null;
        }

        $decoded = json_decode(File::get($path), true);

        return is_array($decoded) ? $decoded : null;
    }

    /**
     * @param array<string, mixed> $state
     */
    public function saveState(array $state): void
    {
        File::put($this->statePath(), json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    }

    public function clearState(): void
    {
        $path = $this->statePath();
        if (File::exists($path)) {
            File::delete($path);
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function probeApi(Router $router): array
    {
        try {
            $client = $this->clientFor($router);
            $identity = $client->query(new Query('/system/identity/print'))->read();

            return [
                'ok' => true,
                'identity' => $identity[0]['name'] ?? null,
            ];
        } catch (\Throwable $e) {
            return [
                'ok' => false,
                'error' => $e->getMessage(),
            ];
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function readApiService(Router $router): array
    {
        $client = $this->clientFor($router);
        foreach ($client->query(new Query('/ip/service/print'))->read() as $row) {
            if (($row['name'] ?? '') === 'api' && !isset($row['connection'])) {
                return $row;
            }
        }

        throw new \RuntimeException('API service not found on router.');
    }

    /**
     * Allow standby hub (and keep production) to use RouterOS API — run from production before an outage.
     *
     * @return array<string, mixed>
     */
    public function prepareApiAccess(Router $router, bool $dryRun = false): array
    {
        $service = $this->readApiService($router);
        $previous = (string) ($service['address'] ?? '');
        $targets = $this->mergeApiSources($previous, [
            self::PRODUCTION_API_SOURCE,
            self::STANDBY_API_SOURCE,
        ]);

        if ($previous === $targets) {
            return [
                'previous' => $previous,
                'target' => $targets,
                'changed' => false,
            ];
        }

        if ($dryRun) {
            return [
                'previous' => $previous,
                'target' => $targets,
                'changed' => true,
            ];
        }

        $client = $this->clientFor($router);
        $client->query(
            (new Query('/ip/service/set'))
                ->equal('.id', $service['.id'])
                ->equal('address', $targets)
        )->read();

        return [
            'previous' => $previous,
            'target' => $targets,
            'changed' => true,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function restoreApiAccess(Router $router, ?string $previousAddress, bool $dryRun = false): array
    {
        $service = $this->readApiService($router);
        $previous = $previousAddress ?? (string) ($service['address'] ?? self::PRODUCTION_API_SOURCE);
        $target = $previous !== '' ? $previous : self::PRODUCTION_API_SOURCE;

        if ($dryRun) {
            return [
                'previous' => $service['address'] ?? '',
                'target' => $target,
                'changed' => ($service['address'] ?? '') !== $target,
            ];
        }

        $client = $this->clientFor($router);
        $client->query(
            (new Query('/ip/service/set'))
                ->equal('.id', $service['.id'])
                ->equal('address', $target)
        )->read();

        return [
            'previous' => $service['address'] ?? '',
            'target' => $target,
            'changed' => ($service['address'] ?? '') !== $target,
        ];
    }

    /**
     * @param list<string> $extra
     */
    private function mergeApiSources(string $current, array $extra): string
    {
        $parts = array_filter(array_map('trim', explode(',', $current)));
        foreach ($extra as $item) {
            if ($item !== '' && !in_array($item, $parts, true)) {
                $parts[] = $item;
            }
        }

        return implode(',', $parts);
    }

    public function statePath(): string
    {
        return storage_path('app/' . self::STATE_FILE);
    }

    private function clientFor(Router $router): Client
    {
        if (empty($router->host) || empty($router->api_login)) {
            throw new \RuntimeException("Router {$router->id} ({$router->title}) is missing API credentials.");
        }

        return new Client(new Config([
            'host' => $router->host,
            'user' => $router->api_login,
            'pass' => $router->api_password,
            'port' => (int) ($router->api_port ?: 8728),
            'timeout' => 12,
        ]));
    }

    /**
     * @return array{action: string}
     */
    private function upsertSecret(Client $client, Service $service, Plan $plan, bool $dryRun): array
    {
        $statusVal = (int) ($service->status['value'] ?? 0);
        $isActive = $statusVal === 2;
        $profile = $isActive ? ($plan->rate_limit['label'] ?? 'EXPIRED') : 'EXPIRED';
        // Keep secrets enabled so all customers can authenticate (EXPIRED profile when not active).
        $disabled = 'no';

        $checkQuery = (new Query('/ppp/secret/print'))->where('name', $service->mikrotik_name);
        $exists = $client->query($checkQuery)->read();

        if ($dryRun) {
            return ['action' => empty($exists) ? 'added' : 'updated'];
        }

        if (!empty($exists)) {
            $query = (new Query('/ppp/secret/set'))
                ->equal('.id', $exists[0]['.id'])
                ->equal('password', $service->mikrotik_password)
                ->equal('profile', $profile)
                ->equal('disabled', $disabled)
                ->equal('comment', 'Emergency bypass sync');
            $client->query($query)->read();

            return ['action' => 'updated'];
        }

        $query = (new Query('/ppp/secret/add'))
            ->equal('name', $service->mikrotik_name)
            ->equal('password', $service->mikrotik_password)
            ->equal('service', 'pppoe')
            ->equal('profile', $profile)
            ->equal('disabled', $disabled)
            ->equal('comment', 'Emergency bypass sync');
        $client->query($query)->read();

        return ['action' => 'added'];
    }
}
