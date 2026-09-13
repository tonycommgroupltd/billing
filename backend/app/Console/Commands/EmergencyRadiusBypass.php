<?php

namespace App\Console\Commands;

use App\Services\MikrotikEmergencyBypassService;
use Illuminate\Console\Command;

class EmergencyRadiusBypass extends Command
{
    protected $signature = 'mikrotik:emergency-bypass
        {action=status : apply|restore|sync|status|preflight|prepare-api|restore-api}
        {--router=* : Limit to router ID(s)}
        {--active-only : Sync only active services (status=Active)}
        {--dry-run : Preview without changing Mikrotik}
        {--force : Skip confirmation on apply/restore}';

    protected $description = 'Emergency fallback: push PPP secrets to RADIUS routers and disable use-radius when RADIUS is down';

    public function handle(MikrotikEmergencyBypassService $service): int
    {
        $action = strtolower((string) $this->argument('action'));
        $routerIds = array_filter(array_map('intval', (array) $this->option('router')));
        $dryRun = (bool) $this->option('dry-run');
        $activeOnly = (bool) $this->option('active-only');

        return match ($action) {
            'status' => $this->showStatus($service, $routerIds),
            'preflight' => $this->runPreflight($service, $routerIds),
            'prepare-api' => $this->runPrepareApi($service, $routerIds, $dryRun),
            'restore-api' => $this->runRestoreApi($service, $dryRun),
            'sync' => $this->runSync($service, $routerIds, $activeOnly, $dryRun),
            'apply' => $this->runApply($service, $routerIds, $activeOnly, $dryRun),
            'restore' => $this->runRestore($service, $dryRun),
            default => $this->invalidAction($action),
        };
    }

    private function invalidAction(string $action): int
    {
        $this->error("Unknown action '{$action}'. Use: status, preflight, prepare-api, restore-api, sync, apply, restore");

        return 1;
    }

    private function runPreflight(MikrotikEmergencyBypassService $service, array $routerIds): int
    {
        $routers = $service->radiusRouters($routerIds ?: null);
        if ($routers->isEmpty()) {
            $this->warn('No RADIUS routers found.');

            return 1;
        }

        $this->info('API preflight from ' . (gethostname() ?: php_uname('n')));
        $failures = 0;
        foreach ($routers as $router) {
            $probe = $service->probeApi($router);
            if ($probe['ok']) {
                $this->line(sprintf(
                    '  OK  Router %d (%s) identity=%s',
                    $router->id,
                    $router->title,
                    $probe['identity'] ?? '?'
                ));
            } else {
                $failures++;
                $this->error(sprintf(
                    '  FAIL Router %d (%s): %s',
                    $router->id,
                    $router->title,
                    $probe['error'] ?? 'unknown'
                ));
            }
        }

        if ($failures > 0) {
            $this->newLine();
            $this->warn('If standby fails: run prepare-api on production to allow 102.0.15.254 on Mikrotik API.');

            return 1;
        }

        return 0;
    }

    private function runPrepareApi(MikrotikEmergencyBypassService $service, array $routerIds, bool $dryRun): int
    {
        if (!$dryRun && !$this->option('force')) {
            if (!$this->confirm('Add standby IP to Mikrotik API allow-list on RADIUS routers?')) {
                $this->warn('Aborted.');

                return 1;
            }
        }

        $routers = $service->radiusRouters($routerIds ?: null);
        $state = $service->loadState() ?? [];
        $state['api_acl'] = $state['api_acl'] ?? [];
        $state['api_prepared_at'] = now()->toIso8601String();

        $exit = 0;
        foreach ($routers as $router) {
            $this->info("Router {$router->id}: {$router->title}");
            try {
                $result = $service->prepareApiAccess($router, $dryRun);
                $state['api_acl'][(string) $router->id] = [
                    'title' => $router->title,
                    'previous' => $result['previous'],
                    'target' => $result['target'],
                ];
                $this->line(sprintf(
                    '  API address: %s -> %s%s',
                    $result['previous'] ?: '(empty)',
                    $result['target'],
                    $result['changed'] ? '' : ' (unchanged)'
                ));
            } catch (\Throwable $e) {
                $exit = 1;
                $this->error("  Failed: {$e->getMessage()}");
            }
        }

        if (!$dryRun && $exit === 0) {
            $service->saveState($state);
            $this->info('Saved API ACL state. Run preflight from standby to verify.');
        }

        return $exit;
    }

    private function runRestoreApi(MikrotikEmergencyBypassService $service, bool $dryRun): int
    {
        $state = $service->loadState();
        $apiAcl = $state['api_acl'] ?? [];

        if (empty($apiAcl)) {
            $this->warn('No saved API ACL state. Restoring production-only on all RADIUS routers.');
            $apiAcl = [];
            foreach ($service->radiusRouters() as $router) {
                $apiAcl[(string) $router->id] = [
                    'previous' => MikrotikEmergencyBypassService::PRODUCTION_API_SOURCE,
                ];
            }
        }

        $exit = 0;
        foreach ($apiAcl as $routerId => $meta) {
            $router = $service->radiusRouters([(int) $routerId])->first();
            if (!$router) {
                continue;
            }

            $this->info("Router {$router->id}: {$router->title}");
            try {
                $result = $service->restoreApiAccess($router, $meta['previous'] ?? null, $dryRun);
                $this->line(sprintf(
                    '  API address: %s -> %s',
                    $result['previous'] ?: '(empty)',
                    $result['target']
                ));
            } catch (\Throwable $e) {
                $exit = 1;
                $this->error("  Failed: {$e->getMessage()}");
            }
        }

        if (!$dryRun && $exit === 0 && $state) {
            unset($state['api_acl'], $state['api_prepared_at']);
            if (empty($state['routers'])) {
                $service->clearState();
            } else {
                $service->saveState($state);
            }
        }

        return $exit;
    }

    private function showStatus(MikrotikEmergencyBypassService $service, array $routerIds): int
    {
        $state = $service->loadState();
        if ($state) {
            $this->info('Saved bypass state: ' . $service->statePath());
            $this->line(json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        } else {
            $this->warn('No saved bypass state file.');
        }

        $routers = $service->radiusRouters($routerIds ?: null);
        if ($routers->isEmpty()) {
            $this->warn('No RADIUS routers found.');

            return 0;
        }

        $this->newLine();
        $this->info('Current PPP AAA settings:');
        foreach ($routers as $router) {
            try {
                $aaa = $service->readAaaSettings($router);
                $useRadius = $aaa['use-radius'] ?? 'unknown';
                $this->line(sprintf(
                    '  Router %d (%s): use-radius=%s, accounting=%s',
                    $router->id,
                    $router->title,
                    $useRadius,
                    $aaa['accounting'] ?? 'unknown'
                ));
            } catch (\Throwable $e) {
                $this->error("  Router {$router->id} ({$router->title}): {$e->getMessage()}");
            }
        }

        return 0;
    }

    private function runSync(
        MikrotikEmergencyBypassService $service,
        array $routerIds,
        bool $activeOnly,
        bool $dryRun
    ): int {
        $routers = $service->radiusRouters($routerIds ?: null);
        if ($routers->isEmpty()) {
            $this->warn('No RADIUS routers matched.');

            return 1;
        }

        $this->info(($dryRun ? '[DRY RUN] ' : '') . 'Syncing PPP secrets (RADIUS stays enabled)...');

        return $this->syncRouters($service, $routers, $activeOnly, $dryRun);
    }

    private function runApply(
        MikrotikEmergencyBypassService $service,
        array $routerIds,
        bool $activeOnly,
        bool $dryRun
    ): int {
        if (!$dryRun && !$this->option('force')) {
            if (!$this->confirm('This will push PPP secrets and set use-radius=no on RADIUS routers. Continue?')) {
                $this->warn('Aborted.');

                return 1;
            }
        }

        $routers = $service->radiusRouters($routerIds ?: null);
        if ($routers->isEmpty()) {
            $this->warn('No RADIUS routers matched.');

            return 1;
        }

        $this->warn(($dryRun ? '[DRY RUN] ' : '') . 'EMERGENCY BYPASS — local PPP auth on Mikrotik');

        $state = [
            'applied_at' => now()->toIso8601String(),
            'host' => gethostname() ?: php_uname('n'),
            'active_only' => $activeOnly,
            'dry_run' => $dryRun,
            'routers' => [],
        ];

        $exit = 0;
        foreach ($routers as $router) {
            $this->newLine();
            $this->info("Router {$router->id}: {$router->title} ({$router->host})");

            try {
                $sync = $this->syncRouter($service, $router, $activeOnly, $dryRun);
                $aaa = $service->setUseRadius($router, false, $dryRun);

                $state['routers'][(string) $router->id] = [
                    'title' => $router->title,
                    'host' => $router->host,
                    'sync' => $sync,
                    'aaa' => $aaa,
                ];

                $this->printSyncStats($sync);
                $this->line(sprintf(
                    '  use-radius: %s -> %s',
                    $aaa['previous']['use-radius'] ?? '?',
                    $aaa['target_use_radius']
                ));
            } catch (\Throwable $e) {
                $exit = 1;
                $this->error("  Failed: {$e->getMessage()}");
            }
        }

        if (!$dryRun && $exit === 0) {
            $service->saveState($state);
            $this->newLine();
            $this->info('State saved. Run mikrotik:emergency-bypass restore when RADIUS is back.');
        }

        return $exit;
    }

    private function runRestore(MikrotikEmergencyBypassService $service, bool $dryRun): int
    {
        $state = $service->loadState();
        if (!$state || empty($state['routers'])) {
            $this->warn('No saved bypass state. Re-enabling use-radius=yes on all RADIUS routers.');

            return $this->restoreAllRadius($service, $dryRun);
        }

        if (!$dryRun && !$this->option('force')) {
            if (!$this->confirm('Restore use-radius=yes from saved state?')) {
                $this->warn('Aborted.');

                return 1;
            }
        }

        $exit = 0;
        foreach ($state['routers'] as $routerId => $meta) {
            $router = $service->radiusRouters([(int) $routerId])->first();
            if (!$router) {
                $this->warn("Router {$routerId} not found, skipping.");
                continue;
            }

            $this->info("Restoring router {$router->id}: {$router->title}");

            try {
                $aaa = $service->setUseRadius($router, true, $dryRun);
                $this->line(sprintf(
                    '  use-radius: %s -> %s',
                    $aaa['previous']['use-radius'] ?? '?',
                    $aaa['target_use_radius']
                ));
            } catch (\Throwable $e) {
                $exit = 1;
                $this->error("  Failed: {$e->getMessage()}");
            }
        }

        if (!$dryRun && $exit === 0) {
            $service->clearState();
            $this->info('Bypass state cleared.');
        }

        return $exit;
    }

    private function restoreAllRadius(MikrotikEmergencyBypassService $service, bool $dryRun): int
    {
        $exit = 0;
        foreach ($service->radiusRouters() as $router) {
            try {
                $aaa = $service->setUseRadius($router, true, $dryRun);
                $this->line(sprintf(
                    'Router %d (%s): use-radius -> %s',
                    $router->id,
                    $router->title,
                    $aaa['target_use_radius']
                ));
            } catch (\Throwable $e) {
                $exit = 1;
                $this->error("Router {$router->id}: {$e->getMessage()}");
            }
        }

        if (!$dryRun && $exit === 0) {
            $service->clearState();
        }

        return $exit;
    }

    private function syncRouters(
        MikrotikEmergencyBypassService $service,
        $routers,
        bool $activeOnly,
        bool $dryRun
    ): int {
        $exit = 0;
        foreach ($routers as $router) {
            $this->newLine();
            $this->info("Router {$router->id}: {$router->title} ({$router->host})");
            try {
                $stats = $this->syncRouter($service, $router, $activeOnly, $dryRun);
                $this->printSyncStats($stats);
            } catch (\Throwable $e) {
                $exit = 1;
                $this->error("  Failed: {$e->getMessage()}");
            }
        }

        return $exit;
    }

    /**
     * @return array<string, mixed>
     */
    private function syncRouter(
        MikrotikEmergencyBypassService $service,
        $router,
        bool $activeOnly,
        bool $dryRun
    ): array {
        return $service->syncSecrets($router, $activeOnly, $dryRun);
    }

    /**
     * @param array<string, mixed> $stats
     */
    private function printSyncStats(array $stats): void
    {
        $this->line(sprintf(
            '  Secrets: +%d added, %d updated, %d skipped, %d failed',
            $stats['added'] ?? 0,
            $stats['updated'] ?? 0,
            $stats['skipped'] ?? 0,
            $stats['failed'] ?? 0
        ));

        foreach ($stats['errors'] ?? [] as $err) {
            $this->warn("    {$err['username']}: {$err['message']}");
        }
    }
}
