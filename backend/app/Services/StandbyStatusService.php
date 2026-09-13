<?php

namespace App\Services;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

class StandbyStatusService
{
    private const BACKUP_DIRS = [
        '/home/joram/backups',
        '/home/joram/backups/tonycomm',
    ];

    public function snapshot(): array
    {
        return [
            'role' => config('ha.server_role', 'standby'),
            'hostname' => gethostname() ?: 'unknown',
            'backup' => $this->latestBackup(),
            'replication' => $this->replicationStatus(),
        ];
    }

    private function latestBackup(): array
    {
        $candidates = [];

        foreach (self::BACKUP_DIRS as $dir) {
            if (!is_dir($dir)) {
                continue;
            }
            foreach (glob($dir . '/*') ?: [] as $path) {
                if (is_file($path) && is_readable($path) && preg_match('/\.(sql|gz|zip)$/i', $path)) {
                    $candidates[] = $path;
                }
            }
        }

        if (empty($candidates)) {
            return [
                'time' => null,
                'time_ago' => null,
                'size' => null,
                'file' => null,
            ];
        }

        usort($candidates, fn ($a, $b) => filemtime($b) <=> filemtime($a));
        $path = $candidates[0];
        $mtime = filemtime($path);

        return [
            'time' => Carbon::createFromTimestamp($mtime)->format('Y-m-d H:i:s'),
            'time_ago' => Carbon::createFromTimestamp($mtime)->diffForHumans(),
            'size' => $this->humanFilesize(filesize($path)),
            'file' => basename($path),
        ];
    }

    private function replicationStatus(): array
    {
        try {
            $rows = DB::select('SHOW REPLICA STATUS');
            if (empty($rows)) {
                // Older MySQL / MariaDB
                try {
                    $rows = DB::select('SHOW SLAVE STATUS');
                } catch (\Throwable $ignored) {
                    $rows = [];
                }
            }
            if (empty($rows)) {
                return [
                    'configured' => false,
                    'io_running' => null,
                    'sql_running' => null,
                    'seconds_behind' => null,
                    'source_host' => null,
                    'last_error' => null,
                ];
            }

            $row = (array) $rows[0];
            $io = $row['Replica_IO_Running'] ?? $row['Slave_IO_Running'] ?? null;
            $sql = $row['Replica_SQL_Running'] ?? $row['Slave_SQL_Running'] ?? null;
            $lag = $row['Seconds_Behind_Source'] ?? $row['Seconds_Behind_Master'] ?? null;
            $host = $row['Source_Host'] ?? $row['Master_Host'] ?? null;
            $err = $row['Last_Error'] ?? $row['Last_SQL_Error'] ?? $row['Last_IO_Error'] ?? null;
            $lagInt = $lag !== null && $lag !== '' ? (int) $lag : null;

            $ioErr = (string) ($row['Last_IO_Error'] ?? '');
            $masterUnreachable = $sql === 'Yes' && (
                $io === 'Connecting'
                || stripos($ioErr, "Can't connect") !== false
                || stripos($ioErr, 'timed out') !== false
            );

            // Alert when SQL apply is down or lag exceeds 30s (on-time sync target).
            $alert = null;
            if ($sql !== 'Yes') {
                $alert = 'Replica SQL thread is not running'
                    . ($err ? (': ' . mb_substr((string) $err, 0, 160)) : '');
            } elseif (!$masterUnreachable && $io !== 'Yes') {
                $alert = 'Replica IO thread is not running'
                    . ($ioErr !== '' ? (': ' . mb_substr($ioErr, 0, 160)) : '');
            } elseif ($lagInt !== null && $lagInt > 30) {
                $alert = "Replica lag is {$lagInt}s (threshold 30s)";
            }

            return [
                'configured' => true,
                'io_running' => $io,
                'sql_running' => $sql,
                'seconds_behind' => $lagInt,
                'source_host' => $host,
                'last_error' => $err ?: null,
                'master_unreachable' => $masterUnreachable,
                'healthy' => $alert === null && ($io === 'Yes' || $masterUnreachable) && $sql === 'Yes',
                'alert' => $masterUnreachable
                    ? 'Contabo master offline — standby is live; IO will reconnect when production is back'
                    : $alert,
                'lag_threshold_seconds' => 30,
            ];
        } catch (\Throwable $e) {
            return [
                'configured' => false,
                'io_running' => null,
                'sql_running' => null,
                'seconds_behind' => null,
                'source_host' => null,
                'last_error' => $e->getMessage(),
                'error' => $e->getMessage(),
                'healthy' => false,
                'alert' => $e->getMessage(),
                'lag_threshold_seconds' => 30,
            ];
        }
    }

    private function humanFilesize(int $bytes, int $dec = 2): string
    {
        $size = ['B', 'KB', 'MB', 'GB', 'TB'];
        $factor = floor((strlen((string) max($bytes, 1)) - 1) / 3);
        if ($factor === 0) {
            $dec = 0;
        }
        return sprintf("%.{$dec}f %s", $bytes / (1024 ** $factor), $size[$factor]);
    }
}
