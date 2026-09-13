<?php

namespace App\Services;

use Illuminate\Support\Facades\File;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ServerLogService
{
    private const MAX_LINES = 2000;
    private const MAX_BYTES = 512000;

    public function serverMeta(): array
    {
        return [
            'hostname' => gethostname() ?: 'unknown',
            'role' => config('ha.server_role', $this->detectRole()),
            'ip' => request()->server('SERVER_ADDR') ?: env('APP_SERVER_IP'),
        ];
    }

    private function detectRole(): string
    {
        $host = gethostname() ?: '';
        if (str_contains($host, 'contabo') || config('app.url', '') !== '' && str_contains(config('app.url'), 'isp.tonycommgroupltd.com')) {
            return 'production';
        }
        if (config('app.url', '') !== '' && str_contains(config('app.url'), '102.0.15.254')) {
            return 'standby';
        }
        return 'production';
    }

    public function catalog(): array
    {
        $sources = [];
        foreach ($this->sourceDefinitions() as $id => $def) {
            $path = $this->resolvePath($def);
            $sources[] = [
                'id' => $id,
                'label' => $def['label'],
                'group' => $def['group'],
                'path' => $path,
                'available' => $path && is_readable($path),
                'size' => ($path && is_readable($path)) ? filesize($path) : 0,
                'modified' => ($path && is_readable($path)) ? date('c', filemtime($path)) : null,
            ];
        }

        $reportFiles = $this->listAppReportLogs();

        return [
            'server' => $this->serverMeta(),
            'sources' => $sources,
            'report_files' => $reportFiles,
        ];
    }

    private function sourceDefinitions(): array
    {
        $defs = [
            'laravel' => [
                'label' => 'Laravel application',
                'group' => 'application',
                'candidates' => [
                    storage_path('logs/laravel.log'),
                ],
            ],
            'apache_access' => [
                'label' => 'Apache access',
                'group' => 'web',
                'candidates' => [
                    '/var/log/apache2/tonycomm-access.log',
                    '/var/log/apache2/access.log',
                ],
            ],
            'apache_error' => [
                'label' => 'Apache error',
                'group' => 'web',
                'candidates' => [
                    '/var/log/apache2/tonycomm-error.log',
                    '/var/log/apache2/error.log',
                ],
            ],
            'system_syslog' => [
                'label' => 'System syslog',
                'group' => 'system',
                'candidates' => ['/var/log/syslog'],
            ],
            'system_auth' => [
                'label' => 'System auth',
                'group' => 'system',
                'candidates' => ['/var/log/auth.log'],
            ],
            'radius' => [
                'label' => 'FreeRADIUS',
                'group' => 'radius',
                'candidates' => [
                    '/var/log/freeradius/radius.log',
                    '/var/log/radius/radius.log',
                ],
            ],
        ];

        return $defs;
    }

    private function resolvePath(array $def): ?string
    {
        foreach ($def['candidates'] as $path) {
            if (is_readable($path)) {
                return $path;
            }
        }
        return $def['candidates'][0] ?? null;
    }

    public function tail(string $source, int $lines = 200): array
    {
        $lines = max(1, min(self::MAX_LINES, $lines));
        $defs = $this->sourceDefinitions();
        if (!isset($defs[$source])) {
            abort(404, 'Unknown log source');
        }

        $path = $this->resolvePath($defs[$source]);
        if (!$path || !is_readable($path)) {
            return [
                'source' => $source,
                'label' => $defs[$source]['label'],
                'path' => $path,
                'lines' => $lines,
                'content' => '',
                'available' => false,
                'message' => 'Log file not available on this server',
                'size' => 0,
                'modified' => null,
            ];
        }

        return [
            'source' => $source,
            'label' => $defs[$source]['label'],
            'path' => $path,
            'lines' => $lines,
            'content' => $this->readTail($path, $lines),
            'available' => true,
            'size' => filesize($path),
            'modified' => date('c', filemtime($path)),
        ];
    }

    public function listAppReportLogs(): array
    {
        $dir = storage_path('logs');
        if (!is_dir($dir)) {
            return [];
        }

        $files = [];
        foreach (File::files($dir) as $file) {
            $name = $file->getFilename();
            if ($name === 'laravel.log' || $name === '.gitignore') {
                continue;
            }
            if (!preg_match('/\.(log|json)$/i', $name)) {
                continue;
            }
            $files[] = [
                'name' => $name,
                'size' => $file->getSize(),
                'modified' => date('c', $file->getMTime()),
            ];
        }

        usort($files, fn ($a, $b) => strcmp($b['modified'], $a['modified']));
        return array_slice($files, 0, 100);
    }

    public function readReportFile(string $name, int $lines = 200): array
    {
        if (!preg_match('/^[a-zA-Z0-9._-]+\\.(log|json)$/', $name)) {
            abort(422, 'Invalid file name');
        }

        $path = storage_path('logs/' . $name);
        if (!is_readable($path)) {
            abort(404, 'File not found');
        }

        $lines = max(1, min(self::MAX_LINES, $lines));
        return [
            'name' => $name,
            'path' => $path,
            'lines' => $lines,
            'content' => $this->readTail($path, $lines),
            'size' => filesize($path),
            'modified' => date('c', filemtime($path)),
        ];
    }

    private function readTail(string $path, int $lines): string
    {
        if (!is_readable($path)) {
            return '';
        }

        $size = filesize($path);
        if ($size === 0) {
            return '';
        }

        if ($size > self::MAX_BYTES) {
            $fh = fopen($path, 'rb');
            fseek($fh, -min(self::MAX_BYTES, $size), SEEK_END);
            $chunk = fread($fh, self::MAX_BYTES);
            fclose($fh);
            $allLines = preg_split("/\r\n|\n|\r/", $chunk) ?: [];
            return implode("\n", array_slice($allLines, -$lines));
        }

        $output = [];
        $cmd = sprintf('tail -n %d %s 2>/dev/null', $lines, escapeshellarg($path));
        @exec($cmd, $output);
        if (!empty($output)) {
            return implode("\n", $output);
        }

        $content = file_get_contents($path);
        $allLines = preg_split("/\r\n|\n|\r/", $content ?: '') ?: [];
        return implode("\n", array_slice($allLines, -$lines));
    }
}
