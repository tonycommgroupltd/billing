<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\File;

class HubSyncController extends Controller
{
    private const LOG_DIR = '/var/log/tcom-sync';

    /** Pipeline steps shown in the Hub Sync UI */
    private const STEPS = [
        ['key' => 'start', 'label' => 'Start sync', 'phase' => 'start'],
        ['key' => 'dump', 'label' => 'Dump Contabo databases', 'phase' => 'dump'],
        ['key' => 'transfer', 'label' => 'Upload dumps to hub', 'phase' => 'transfer'],
        ['key' => 'restore', 'label' => 'Restore & wire hub services', 'phase' => 'restore'],
        ['key' => 'uploads', 'label' => 'Sync ticket uploads', 'phase' => 'uploads'],
        ['key' => 'done', 'label' => 'Complete', 'phase' => 'done'],
    ];

    private const PHASE_PCT = [
        'start' => 2,
        'dump' => 25,
        'transfer' => 48,
        'restore' => 70,
        'uploads' => 94,
        'done' => 100,
    ];

    public function __construct()
    {
        $this->middleware('auth:api');
        $this->middleware('role:super-administrator|ict|administrator|manager');
    }

    public function status(): JsonResponse
    {
        $latest = $this->readJson(self::LOG_DIR . '/latest.json') ?: [];
        $apply = $this->readJson(self::LOG_DIR . '/last_apply.json');
        $history = $this->readJsonl(self::LOG_DIR . '/progress.jsonl', 120);
        $activity = $this->buildActivity($latest, $history);
        $progress = $this->buildProgress($latest, $history, $activity);

        // Avoid COUNT(*) on huge tables (radacct) — that alone can exceed the portal 30s timeout.
        // Skip live counts entirely while restore is locking MySQL.
        $phase = (string) ($latest['phase'] ?? '');
        $status = (string) ($latest['status'] ?? '');
        $restoreBusy = $status === 'running' && in_array($phase, ['restore', 'dump', 'transfer'], true);

        $live = [
            'main_db' => [
                'customers' => $restoreBusy ? null : $this->fastCount('tonycomm', 'customers'),
                'users' => $restoreBusy ? null : $this->fastCount('tonycomm', 'users'),
                'radacct' => $restoreBusy ? null : $this->approxTableRows('tonycomm', 'radacct'),
            ],
            'tickets_db' => [
                'tickets' => $restoreBusy ? null : $this->fastCount('tonycommgroupltd_db', 'tickets'),
            ],
            'counts_skipped' => $restoreBusy,
            'counts_note' => $restoreBusy
                ? 'Live counts paused while sync/restore is using MySQL'
                : 'radacct is approximate (information_schema)',
        ];

        return response()->json([
            'ok' => true,
            'latest' => $latest ?: null,
            'last_apply' => $apply,
            'live' => $live,
            'history' => $history,
            'progress' => $progress,
            'activity' => $activity,
            'log_files' => [
                'progress' => self::LOG_DIR . '/progress.jsonl',
                'hourly' => self::LOG_DIR . '/hourly.log',
                'apply' => self::LOG_DIR . '/apply.log',
            ],
            'server_time' => now()->toIso8601String(),
        ]);
    }

    public function logTail(): JsonResponse
    {
        $file = request('file', 'hourly');
        $map = [
            'hourly' => self::LOG_DIR . '/hourly.log',
            'apply' => self::LOG_DIR . '/apply.log',
            'progress' => self::LOG_DIR . '/progress.jsonl',
        ];
        $path = $map[$file] ?? $map['hourly'];
        $lines = min(200, max(40, (int) request('lines', 120)));
        if (!is_readable($path)) {
            return response()->json(['ok' => false, 'error' => 'Log not readable', 'path' => $path, 'lines' => []]);
        }
        $content = @file($path, FILE_IGNORE_NEW_LINES);
        $tail = array_slice($content ?: [], -$lines);

        return response()->json(['ok' => true, 'file' => $file, 'path' => $path, 'lines' => array_values($tail)]);
    }

    private function buildProgress(array $latest, array $history, array $activity): array
    {
        $phase = (string) ($latest['phase'] ?? 'idle');
        $status = (string) ($latest['status'] ?? 'idle');
        $running = $status === 'running' || (in_array($phase, ['start', 'dump', 'transfer', 'restore', 'uploads'], true) && $status !== 'ok' && $phase !== 'done');

        if (($latest['status'] ?? '') === 'ok' && ($latest['phase'] ?? '') === 'done') {
            $running = false;
        }

        $percent = isset($latest['percent']) ? (int) $latest['percent'] : null;
        if ($percent === null) {
            $percent = self::PHASE_PCT[$phase] ?? ($running ? 5 : 0);
        }
        $percent = max(0, min(100, $percent));

        if (!$running && $phase === 'done') {
            $percent = 100;
        }

        $stepLabel = (string) ($latest['step'] ?? '');
        if ($stepLabel === '') {
            foreach (self::STEPS as $s) {
                if ($s['phase'] === $phase) {
                    $stepLabel = $s['label'];
                    break;
                }
            }
        }

        $startedAt = $latest['started_at'] ?? null;
        $elapsedSec = $this->secondsSince($startedAt);
        $etaSec = null;
        $etaLabel = null;
        $etaAt = null;

        if ($running && $elapsedSec !== null && $percent > 5 && $percent < 100) {
            $etaSec = (int) round($elapsedSec * (100 - $percent) / $percent);
            // Clamp wild estimates during early dump/restore
            $etaSec = max(30, min($etaSec, 3 * 3600));
            $etaAt = now()->addSeconds($etaSec)->toIso8601String();
            $etaLabel = $this->humanDuration($etaSec) . ' remaining (estimate)';
        } elseif ($running) {
            $etaLabel = 'Estimating…';
        } elseif ($phase === 'done' || $status === 'ok') {
            $etaLabel = 'Finished';
        }

        $steps = [];
        $phaseOrder = array_column(self::STEPS, 'phase');
        $phaseIdx = array_search($phase, $phaseOrder, true);
        if ($phaseIdx === false) {
            $phaseIdx = $running ? 0 : -1;
        }
        foreach (self::STEPS as $i => $s) {
            $state = 'pending';
            if ($phase === 'done' || $status === 'ok' && $phase === 'done') {
                $state = 'done';
            } elseif ($i < $phaseIdx) {
                $state = 'done';
            } elseif ($i === $phaseIdx) {
                $state = $running ? 'current' : ($status === 'ok' ? 'done' : 'current');
            }
            if ($phase === 'done') {
                $state = 'done';
            }
            $steps[] = [
                'key' => $s['key'],
                'label' => $s['label'],
                'phase' => $s['phase'],
                'state' => $state,
            ];
        }

        return [
            'running' => $running,
            'percent' => $percent,
            'phase' => $phase ?: 'idle',
            'status' => $status ?: 'idle',
            'step' => $stepLabel ?: ($running ? 'Working…' : 'Idle'),
            'message' => (string) ($latest['message'] ?? ($running ? 'Sync in progress' : 'Waiting for the next Contabo hourly push.')),
            'started_at' => $startedAt,
            'updated_at' => $latest['updated_at'] ?? null,
            'elapsed_seconds' => $elapsedSec,
            'elapsed_label' => $elapsedSec !== null ? $this->humanDuration($elapsedSec) : null,
            'eta_seconds' => $etaSec,
            'eta_at' => $etaAt,
            'eta_label' => $etaLabel,
            'steps' => $steps,
            'bytes_total' => isset($latest['bytes_total']) ? (int) $latest['bytes_total'] : null,
            'bytes_done' => isset($latest['bytes_done']) ? (int) $latest['bytes_done'] : null,
            'activity_count' => count($activity),
        ];
    }

    private function buildActivity(array $latest, array $history): array
    {
        $rows = [];
        $tail = $latest['history_tail'] ?? null;
        if (is_array($tail) && count($tail) > 0) {
            $rows = $tail;
        } else {
            $rows = $history;
        }

        $out = [];
        foreach (array_slice($rows, -40) as $row) {
            if (!is_array($row)) {
                continue;
            }
            $out[] = [
                'ts' => $row['ts'] ?? null,
                'phase' => $row['phase'] ?? null,
                'status' => $row['status'] ?? null,
                'percent' => isset($row['percent']) ? (int) $row['percent'] : null,
                'step' => $row['step'] ?? null,
                'message' => $row['message'] ?? null,
                'source' => $row['source'] ?? null,
            ];
        }

        return array_reverse($out); // newest first
    }

    private function secondsSince(?string $iso): ?int
    {
        if (!$iso) {
            return null;
        }
        try {
            $t = strtotime($iso);
            if ($t === false) {
                return null;
            }

            return max(0, time() - $t);
        } catch (\Throwable $e) {
            return null;
        }
    }

    private function humanDuration(int $seconds): string
    {
        if ($seconds < 60) {
            return $seconds . 's';
        }
        $m = intdiv($seconds, 60);
        $s = $seconds % 60;
        if ($m < 60) {
            return $s > 0 ? "{$m}m {$s}s" : "{$m}m";
        }
        $h = intdiv($m, 60);
        $m = $m % 60;

        return $m > 0 ? "{$h}h {$m}m" : "{$h}h";
    }

    private function readJson(string $path): ?array
    {
        if (!is_readable($path)) {
            return null;
        }
        try {
            $data = json_decode(File::get($path), true);

            return is_array($data) ? $data : null;
        } catch (\Throwable $e) {
            return null;
        }
    }

    private function readJsonl(string $path, int $limit = 80): array
    {
        if (!is_readable($path)) {
            return [];
        }
        $lines = @file($path, FILE_IGNORE_NEW_LINES) ?: [];
        $rows = [];
        foreach (array_slice($lines, -$limit) as $line) {
            $row = json_decode($line, true);
            if (is_array($row)) {
                $rows[] = $row;
            }
        }

        return $rows;
    }

    /** Exact COUNT with a short statement timeout (small tables only). */
    private function fastCount(string $database, string $table): ?int
    {
        $database = str_replace('`', '', $database);
        $table = str_replace('`', '', $table);
        try {
            \DB::statement('SET SESSION MAX_EXECUTION_TIME=3000');
            $row = \DB::selectOne("SELECT COUNT(*) AS c FROM `{$database}`.`{$table}`");

            return isset($row->c) ? (int) $row->c : null;
        } catch (\Throwable $e) {
            return $this->approxTableRows($database, $table);
        } finally {
            try {
                \DB::statement('SET SESSION MAX_EXECUTION_TIME=0');
            } catch (\Throwable $e) {
                // ignore
            }
        }
    }

    /** Fast approximate row count — safe for radacct-sized tables. */
    private function approxTableRows(string $database, string $table): ?int
    {
        try {
            $row = \DB::selectOne(
                'SELECT TABLE_ROWS AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? LIMIT 1',
                [$database, $table]
            );

            return isset($row->c) ? (int) $row->c : null;
        } catch (\Throwable $e) {
            return null;
        }
    }
}
