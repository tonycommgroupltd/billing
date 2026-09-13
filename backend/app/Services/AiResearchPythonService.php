<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;
use Throwable;

/**
 * Runs short LLM-authored Python research scripts in a read-only sandbox.
 */
class AiResearchPythonService
{
    private const MAX_CODE_CHARS = 12000;
    private const TIMEOUT_SECONDS = 25;

    public function glossary(): array
    {
        return [
            'mode' => 'read_only_python',
            'how_to_use' => [
                'Write a short Python script that sets RESULT = ...',
                'Use db.query(sql) for SELECT/SHOW/DESCRIBE/EXPLAIN/WITH only',
                'Use connection="tickets" for the tickets database',
                'Use db.tables() / db.schema("table") to discover columns',
                'No imports, no file/network/shell, no INSERT/UPDATE/DELETE',
            ],
            'definitions' => [
                'active_customer' => 'Customer with deleted_at NULL and at least one service where JSON status.value = 2',
                'active_service' => "services.status JSON value = 2 (label Active), deleted_at NULL",
                'blocked_or_disabled_service' => 'services.status JSON value in (1, 3)',
                'prepaid_customer' => 'billing_type.value = 2 on the customer OR on any of their services (same rule as customer list filter)',
                'recurring_customer' => 'billing_type.value = 1 (or null legacy) — non-prepaid',
                'bill_date' => 'services.bill_to (date the service is billed to). Behind today means bill_to < CURDATE()',
                'online_customer' => 'Open radacct session (acctstoptime IS NULL) with recent acctupdatetime, joined on services.mikrotik_name = radacct.username',
                'unpaid_invoice' => 'invoices.status JSON value = 1',
                'paid_invoice' => 'invoices.status JSON value = 2',
            ],
            'example_script' => <<<'PY'
prepaid = db.query("""
SELECT COUNT(DISTINCT c.id) AS n
FROM customers c
WHERE c.deleted_at IS NULL
  AND (
    JSON_UNQUOTE(JSON_EXTRACT(c.billing_type, '$.value')) = '2'
    OR EXISTS (
      SELECT 1 FROM services s
      WHERE s.customer_id = c.id AND s.deleted_at IS NULL
        AND JSON_UNQUOTE(JSON_EXTRACT(s.billing_type, '$.value')) = '2'
    )
  )
""")
active = db.query("""
SELECT COUNT(DISTINCT c.id) AS n
FROM customers c
INNER JOIN services s ON s.customer_id = c.id AND s.deleted_at IS NULL
WHERE c.deleted_at IS NULL
  AND JSON_UNQUOTE(JSON_EXTRACT(s.status, '$.value')) = '2'
  AND (
    JSON_UNQUOTE(JSON_EXTRACT(s.billing_type, '$.value')) = '2'
    OR JSON_UNQUOTE(JSON_EXTRACT(c.billing_type, '$.value')) = '2'
  )
""")
RESULT = {
  "prepaid_customers": prepaid["rows"][0]["n"] if prepaid["rows"] else 0,
  "prepaid_active": active["rows"][0]["n"] if active["rows"] else 0,
}
PY,
            'connections' => ['default' => 'Main TonyComm DB', 'tickets' => 'Tickets DB'],
        ];
    }

    public function run(string $code, string $purpose = ''): array
    {
        $code = trim($code);
        if ($code === '') {
            return ['ok' => false, 'error' => 'Empty Python script'];
        }
        if (mb_strlen($code) > self::MAX_CODE_CHARS) {
            return ['ok' => false, 'error' => 'Script too long'];
        }

        // Soft pre-check so obvious write attempts never spawn Python.
        if (preg_match('/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE)\b/i', $code)) {
            return ['ok' => false, 'error' => 'Write/DDL statements are blocked. Read-only research only.'];
        }

        $runner = base_path('scripts/ai_research_runner.py');
        if (!is_file($runner)) {
            return ['ok' => false, 'error' => 'Research runner missing on server'];
        }

        $python = $this->pythonBinary();
        if ($python === null) {
            return ['ok' => false, 'error' => 'python3 is not available on the server'];
        }

        $scriptPath = tempnam(sys_get_temp_dir(), 'ai_research_');
        if ($scriptPath === false) {
            return ['ok' => false, 'error' => 'Could not create temp script'];
        }
        $scriptFile = $scriptPath . '.py';
        @rename($scriptPath, $scriptFile);
        if (!is_file($scriptFile)) {
            $scriptFile = $scriptPath;
        }

        try {
            if (file_put_contents($scriptFile, $code) === false) {
                return ['ok' => false, 'error' => 'Could not write temp script'];
            }

            Log::info('AI research python start', [
                'user_id' => auth()->id(),
                'purpose' => mb_substr($purpose, 0, 200),
                'code_chars' => mb_strlen($code),
            ]);

            $result = Process::timeout(self::TIMEOUT_SECONDS)
                ->env($this->mergedEnv($this->dbEnv()))
                ->run([$python, $runner, $scriptFile]);

            $stdout = trim($result->output());
            $stderr = trim($result->errorOutput());
            $decoded = json_decode($stdout, true);

            if (!is_array($decoded)) {
                return [
                    'ok' => false,
                    'error' => 'Runner returned non-JSON output',
                    'stdout' => mb_substr($stdout, 0, 800),
                    'stderr' => mb_substr($stderr, 0, 400),
                    'exit_code' => $result->exitCode(),
                ];
            }

            $decoded['purpose'] = $purpose !== '' ? mb_substr($purpose, 0, 200) : null;
            $decoded['exit_code'] = $result->exitCode();
            if ($stderr !== '') {
                $decoded['stderr'] = mb_substr($stderr, 0, 400);
            }

            return $decoded;
        } catch (Throwable $e) {
            report($e);
            return ['ok' => false, 'error' => $e->getMessage()];
        } finally {
            @unlink($scriptFile);
            if (is_file($scriptPath)) {
                @unlink($scriptPath);
            }
        }
    }

    private function pythonBinary(): ?string
    {
        foreach (['python3', 'python'] as $bin) {
            try {
                $check = Process::timeout(5)->run([$bin, '--version']);
                if ($check->successful()) {
                    return $bin;
                }
            } catch (Throwable $e) {
                continue;
            }
        }

        return null;
    }

    /**
     * Symfony Process replaces the full environment when env() is set — keep PATH etc.
     *
     * @param  array<string, string>  $extra
     * @return array<string, string>
     */
    private function mergedEnv(array $extra): array
    {
        $env = [];
        foreach (array_merge($_SERVER, $_ENV) as $key => $value) {
            if (is_string($key) && is_scalar($value)) {
                $env[$key] = (string) $value;
            }
        }

        return array_merge($env, $extra);
    }

    /**
     * @return array<string, string>
     */
    private function dbEnv(): array
    {
        $default = config('database.connections.' . config('database.default'));
        $tickets = config('database.connections.tickets', []);

        return [
            'AI_RESEARCH_DB_HOST' => (string) ($default['host'] ?? '127.0.0.1'),
            'AI_RESEARCH_DB_PORT' => (string) ($default['port'] ?? '3306'),
            'AI_RESEARCH_DB_NAME' => (string) ($default['database'] ?? ''),
            'AI_RESEARCH_DB_USER' => (string) ($default['username'] ?? ''),
            'AI_RESEARCH_DB_PASS' => (string) ($default['password'] ?? ''),
            'AI_RESEARCH_TICKETS_HOST' => (string) ($tickets['host'] ?? ($default['host'] ?? '127.0.0.1')),
            'AI_RESEARCH_TICKETS_PORT' => (string) ($tickets['port'] ?? ($default['port'] ?? '3306')),
            'AI_RESEARCH_TICKETS_NAME' => (string) ($tickets['database'] ?? ''),
            'AI_RESEARCH_TICKETS_USER' => (string) ($tickets['username'] ?? ($default['username'] ?? '')),
            'AI_RESEARCH_TICKETS_PASS' => (string) ($tickets['password'] ?? ($default['password'] ?? '')),
            'AI_RESEARCH_MAX_ROWS' => '200',
        ];
    }
}
