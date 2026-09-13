<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Throwable;

/**
 * Cross-system ops snapshots for AI Buddy.
 * Always returns whatever is available + manual_next_steps for gaps.
 */
class OpsCoverageService
{
    public function __construct(
        private HotspotIntegrationService $hotspot,
        private ServerLogService $serverLogs,
        private MikrotikEmergencyBypassService $bypass,
    ) {
    }

    public function status(string $focus = 'overview'): array
    {
        $focus = strtolower(trim($focus));
        if ($focus === '' || $focus === 'all') {
            $focus = 'overview';
        }

        $map = $this->coverageMap();
        if ($focus === 'overview' || $focus === 'coverage') {
            return [
                'focus' => 'overview',
                'rule' => 'Answer with available facts. If something is missing, say what you have and where staff can check the rest manually.',
                'systems' => $map,
            ];
        }

        return match ($focus) {
            'radius' => $this->radiusStatus(),
            'sms' => $this->smsStatus(),
            'hotspot' => $this->hotspotStatus(),
            'server', 'health' => $this->serverStatus(),
            'whatsapp', 'wa' => $this->whatsappStatus(),
            'olt', 'fiber', 'onu' => $this->oltStatus(),
            'tr069', 'acs', 'cpe' => $this->tr069Status(),
            'inventory' => $this->inventoryStatus(),
            'vpn' => $this->vpnStatus(),
            'routers' => $this->routersStatus(),
            default => [
                'focus' => $focus,
                'available' => false,
                'message' => "No dedicated collector for '{$focus}'.",
                'manual_next_steps' => [
                    'Use run_research_python for DB questions',
                    'Or ask with a clearer system name: radius, sms, hotspot, server, whatsapp, olt, tr069, inventory, vpn',
                ],
                'systems' => $map,
            ],
        };
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    private function coverageMap(): array
    {
        return [
            'radius' => [
                'ai_can' => 'Open sessions, recent auth accepts/rejects, PPP auth mode, RADIUS log tail',
                'manual_if_missing' => 'Admin → Emergency Bypass; SSH: systemctl status freeradius; /var/log radius',
            ],
            'sms' => [
                'ai_can' => 'Advanta credit balance (when API works) + recent outbound SMS success/fail',
                'manual_if_missing' => 'Advanta portal https://quicksms.advantasms.com — or Admin → Messages',
            ],
            'hotspot' => [
                'ai_can' => 'Mwananchi dashboard revenue/users via hotspot integration',
                'manual_if_missing' => 'Admin → Hotspot dashboard, or https://mwananchi.tcom.co.ke',
            ],
            'server' => [
                'ai_can' => 'CPU load, memory, disk, backup age from dashboard metrics',
                'manual_if_missing' => 'Admin dashboard server cards; SSH top/df',
            ],
            'whatsapp' => [
                'ai_can' => 'Recent WhatsApp outbox/inbox from DB',
                'manual_if_missing' => 'Admin → WhatsApp messages; Meta Business Suite for account health',
            ],
            'olt' => [
                'ai_can' => 'OLT list/summary from olt-api when reachable',
                'manual_if_missing' => 'Admin → OLT Monitoring (production API mode)',
            ],
            'tr069' => [
                'ai_can' => 'TR-069/GenieACS stats when tr069-api reachable',
                'manual_if_missing' => 'Admin → TR-069 devices page',
            ],
            'inventory' => [
                'ai_can' => 'Inventory stats when tickets-api reachable',
                'manual_if_missing' => 'Admin → Inventory (tickets API)',
            ],
            'vpn' => [
                'ai_can' => 'VPN hub health when vpn-api reachable',
                'manual_if_missing' => 'Admin → VPN / vpn-api health',
            ],
            'customers_billing' => [
                'ai_can' => 'platform_stats + run_research_python',
                'manual_if_missing' => 'Customers / Finance dashboards',
            ],
        ];
    }

    private function radiusStatus(): array
    {
        $out = [
            'focus' => 'radius',
            'available' => true,
            'partial' => false,
            'facts' => [],
            'manual_next_steps' => [],
        ];

        try {
            if (Schema::hasTable('radacct')) {
                $ago = now()->subMinutes(7)->toDateTimeString();
                $out['facts']['open_sessions_fresh'] = (int) DB::table('radacct')
                    ->whereNull('acctstoptime')
                    ->where('acctupdatetime', '>=', $ago)
                    ->count();
                $out['facts']['open_sessions_any'] = (int) DB::table('radacct')
                    ->whereNull('acctstoptime')
                    ->count();
            }
            if (Schema::hasTable('radpostauth')) {
                $out['facts']['auth_last_15m'] = [
                    'accept' => (int) DB::table('radpostauth')
                        ->where('authdate', '>=', now()->subMinutes(15))
                        ->where('reply', 'Access-Accept')
                        ->count(),
                    'reject' => (int) DB::table('radpostauth')
                        ->where('authdate', '>=', now()->subMinutes(15))
                        ->where('reply', 'Access-Reject')
                        ->count(),
                ];
            }
        } catch (Throwable $e) {
            $out['partial'] = true;
            $out['facts']['db_error'] = $e->getMessage();
        }

        try {
            $state = $this->bypass->loadState() ?? [];
            $out['facts']['ppp_auth_mode'] = $this->bypass->getPppAuthMode();
            $out['facts']['bypass_applied_at'] = $state['applied_at'] ?? null;
            $out['facts']['bypass_host'] = $state['host'] ?? null;
            $out['manual_next_steps'][] = 'Live per-router RADIUS AAA check: Admin → Emergency Bypass';
        } catch (Throwable $e) {
            $out['partial'] = true;
            $out['facts']['mikrotik_aaa'] = 'unavailable: ' . $e->getMessage();
            $out['manual_next_steps'][] = 'Check Admin → Emergency Bypass for PPP RADIUS vs local API mode';
        }

        try {
            $tail = $this->serverLogs->tail('radius', 25);
            $content = (string) ($tail['content'] ?? '');
            $lines = $content !== '' ? array_slice(preg_split("/\r\n|\n|\r/", $content) ?: [], -15) : [];
            $out['facts']['radius_log_available'] = (bool) ($tail['available'] ?? false);
            $out['facts']['radius_log_tail'] = $lines;
            if (!($tail['available'] ?? false)) {
                $out['partial'] = true;
                $out['manual_next_steps'][] = (string) ($tail['message'] ?? 'RADIUS log file not available on this host');
            }
        } catch (Throwable $e) {
            $out['partial'] = true;
            $out['manual_next_steps'][] = 'RADIUS process logs: Admin → Server logs (source=radius) or SSH journalctl -u freeradius';
        }

        $out['manual_next_steps'][] = 'FreeRADIUS daemon status is not a DB field — on server: systemctl status freeradius';
        $out['summary'] = $this->radiusSummary($out['facts']);

        return $out;
    }

    /**
     * @param  array<string, mixed>  $facts
     */
    private function radiusSummary(array $facts): string
    {
        $open = $facts['open_sessions_fresh'] ?? null;
        $auth = $facts['auth_last_15m'] ?? null;
        $mode = $facts['ppp_auth_mode'] ?? 'unknown';
        $parts = ["PPP auth mode: {$mode}"];
        if ($open !== null) {
            $parts[] = "fresh open sessions (~7m): {$open}";
        }
        if (is_array($auth)) {
            $parts[] = 'auth last 15m: ' . ($auth['accept'] ?? 0) . ' accept / ' . ($auth['reject'] ?? 0) . ' reject';
        }

        return implode('; ', $parts);
    }

    private function smsStatus(): array
    {
        $out = [
            'focus' => 'sms',
            'available' => true,
            'partial' => false,
            'facts' => [],
            'manual_next_steps' => [],
        ];

        $balance = $this->fetchAdvantaBalance();
        if (($balance['ok'] ?? false) === true) {
            $out['facts']['advanta_balance'] = $balance;
        } else {
            $out['partial'] = true;
            $out['facts']['advanta_balance'] = [
                'ok' => false,
                'error' => $balance['error'] ?? 'unavailable',
            ];
            $out['manual_next_steps'][] = 'Check SMS credit in Advanta portal (quicksms.advantasms.com) using partner login';
        }

        try {
            if (Schema::hasTable('message_details')) {
                $since = now()->subDay();
                $out['facts']['outbound_last_24h'] = [
                    'total' => (int) DB::table('message_details')->where('created_at', '>=', $since)->count(),
                    'recent' => DB::table('message_details')
                        ->orderByDesc('id')
                        ->limit(8)
                        ->get(['id', 'recipient', 'status', 'created_at'])
                        ->map(fn ($r) => (array) $r)
                        ->all(),
                ];
            }
        } catch (Throwable $e) {
            $out['partial'] = true;
            $out['facts']['message_details_error'] = $e->getMessage();
            $out['manual_next_steps'][] = 'Admin → Messages / SMS outbox';
        }

        $credit = $balance['credit'] ?? $balance['balance'] ?? null;
        $out['summary'] = $credit !== null
            ? "SMS gateway balance: {$credit}"
            : 'SMS balance not available from API right now; recent outbox listed if present';

        return $out;
    }

    /**
     * @return array<string, mixed>
     */
    private function fetchAdvantaBalance(): array
    {
        $apiKey = (string) config('sms.apikey');
        $partnerId = (string) config('sms.partnerID');
        if ($apiKey === '' || $partnerId === '') {
            return ['ok' => false, 'error' => 'SMS_API_KEY / SMS_PARTNER_ID not configured'];
        }

        try {
            $response = Http::asJson()
                ->acceptJson()
                ->timeout(12)
                ->post('https://quicksms.advantasms.com/api/services/getbalance/', [
                    'apikey' => $apiKey,
                    'partnerID' => $partnerId,
                ]);

            $json = $response->json();
            if (!is_array($json)) {
                return ['ok' => false, 'error' => 'Non-JSON balance response', 'status' => $response->status()];
            }

            $code = $json['response-code'] ?? $json['response_code'] ?? $response->status();
            $credit = $json['credit'] ?? $json['balance'] ?? $json['credits'] ?? null;
            if ((int) $code === 200 || $credit !== null) {
                return [
                    'ok' => true,
                    'credit' => $credit,
                    'partner_id' => $json['partner-id'] ?? $json['partnerID'] ?? $partnerId,
                    'raw_code' => $code,
                ];
            }

            return [
                'ok' => false,
                'error' => 'Advanta balance rejected',
                'raw_code' => $code,
                'message' => $json['message'] ?? $json['response-description'] ?? null,
            ];
        } catch (Throwable $e) {
            return ['ok' => false, 'error' => $e->getMessage()];
        }
    }

    private function hotspotStatus(): array
    {
        $out = [
            'focus' => 'hotspot',
            'available' => true,
            'partial' => false,
            'facts' => [],
            'manual_next_steps' => ['Admin → Hotspot, or https://mwananchi.tcom.co.ke'],
        ];

        try {
            $dash = $this->hotspot->dashboard(auth()->user());
            $out['facts']['dashboard'] = $this->trimArray($dash, 40);
            $out['summary'] = 'Hotspot dashboard loaded from Mwananchi integration';
        } catch (Throwable $e) {
            $out['available'] = false;
            $out['partial'] = true;
            $out['facts']['error'] = $e->getMessage();
            $out['summary'] = 'Hotspot API unavailable right now';
        }

        return $out;
    }

    private function serverStatus(): array
    {
        $out = [
            'focus' => 'server',
            'available' => true,
            'partial' => false,
            'facts' => [],
            'manual_next_steps' => ['Admin dashboard server widgets; SSH: uptime, free -h, df -h'],
        ];

        try {
            $load = function_exists('sys_getloadavg') ? sys_getloadavg() : null;
            $out['facts']['load_average'] = $load;
            $out['facts']['hostname'] = gethostname() ?: php_uname('n');

            if (is_readable('/proc/meminfo')) {
                $mem = @file_get_contents('/proc/meminfo') ?: '';
                if (preg_match('/MemTotal:\s+(\d+)/', $mem, $m) && preg_match('/MemAvailable:\s+(\d+)/', $mem, $a)) {
                    $total = (int) $m[1] * 1024;
                    $avail = (int) $a[1] * 1024;
                    $out['facts']['memory'] = [
                        'total_bytes' => $total,
                        'available_bytes' => $avail,
                        'used_percent' => $total > 0 ? round((($total - $avail) / $total) * 100, 1) : null,
                    ];
                }
            }

            $path = base_path();
            $out['facts']['disk'] = [
                'total_bytes' => @disk_total_space($path) ?: null,
                'free_bytes' => @disk_free_space($path) ?: null,
            ];
            $out['summary'] = 'Server load/memory/disk snapshot from app host';
        } catch (Throwable $e) {
            $out['partial'] = true;
            $out['facts']['error'] = $e->getMessage();
        }

        return $out;
    }

    private function whatsappStatus(): array
    {
        $out = [
            'focus' => 'whatsapp',
            'available' => false,
            'partial' => true,
            'facts' => [],
            'manual_next_steps' => ['Admin → WhatsApp outbox/inbox', 'Meta Business Suite for account quality'],
        ];

        try {
            if (!Schema::hasTable('whatsapp_details')) {
                $out['facts']['error'] = 'whatsapp_details table missing';
                $out['summary'] = 'WhatsApp table not found on this DB';

                return $out;
            }

            $out['available'] = true;
            $out['partial'] = false;
            $out['facts']['recent'] = DB::table('whatsapp_details')
                ->orderByDesc('id')
                ->limit(10)
                ->get()
                ->map(fn ($r) => (array) $r)
                ->all();
            $out['facts']['count_24h'] = (int) DB::table('whatsapp_details')
                ->where('created_at', '>=', now()->subDay())
                ->count();
            $out['summary'] = 'Recent WhatsApp messages from DB (not Meta account balance)';
        } catch (Throwable $e) {
            $out['facts']['error'] = $e->getMessage();
            $out['summary'] = 'WhatsApp DB read failed';
        }

        return $out;
    }

    private function oltStatus(): array
    {
        return $this->httpSnapshot(
            'olt',
            rtrim((string) config('ops.olt_base_url'), '/'),
            '/olts',
            (string) config('ops.olt_api_key'),
            'Admin → OLT Monitoring (use Production API). Check olt-api service if empty.'
        );
    }

    private function tr069Status(): array
    {
        return $this->httpSnapshot(
            'tr069',
            rtrim((string) config('ops.tr069_base_url'), '/'),
            '/stats',
            (string) config('ops.tr069_api_key'),
            'Admin → TR-069. Confirm GenieACS/tr069-api is up on production.'
        );
    }

    private function inventoryStatus(): array
    {
        return $this->httpSnapshot(
            'inventory',
            rtrim((string) config('ops.tickets_api_url'), '/'),
            '/inventory/stats',
            '',
            'Admin → Inventory (tickets API login required for full stats).',
            true
        );
    }

    private function vpnStatus(): array
    {
        return $this->httpSnapshot(
            'vpn',
            rtrim((string) config('ops.vpn_base_url'), '/'),
            '/health',
            (string) config('ops.vpn_api_key'),
            'Admin → VPN / check vpn-api service.'
        );
    }

    private function routersStatus(): array
    {
        $out = [
            'focus' => 'routers',
            'available' => true,
            'partial' => false,
            'facts' => [],
            'manual_next_steps' => ['Admin → Routers for live MikroTik traffic/API status'],
        ];

        try {
            if (!Schema::hasTable('routers')) {
                $out['available'] = false;
                $out['summary'] = 'routers table missing';

                return $out;
            }
            $out['facts']['count'] = (int) DB::table('routers')->whereNull('deleted_at')->count();
            $out['facts']['sample'] = DB::table('routers')
                ->whereNull('deleted_at')
                ->orderBy('title')
                ->limit(20)
                ->get(['id', 'title', 'host', 'nas_ip'])
                ->map(fn ($r) => (array) $r)
                ->all();
            $out['summary'] = 'Router inventory from DB (not live CPU/traffic)';
            $out['partial'] = true;
            $out['manual_next_steps'][] = 'Live API/traffic: open a router in Admin → Routers monitor';
        } catch (Throwable $e) {
            $out['available'] = false;
            $out['facts']['error'] = $e->getMessage();
        }

        return $out;
    }

    /**
     * @return array<string, mixed>
     */
    private function httpSnapshot(
        string $focus,
        string $baseUrl,
        string $path,
        string $apiKey,
        string $manual,
        bool $mayNeedAuth = false
    ): array {
        $out = [
            'focus' => $focus,
            'available' => false,
            'partial' => true,
            'facts' => [],
            'manual_next_steps' => [$manual],
        ];

        if ($baseUrl === '') {
            $out['facts']['error'] = 'Base URL not configured';
            $out['summary'] = "{$focus} integration URL missing — check manually";

            return $out;
        }

        try {
            $request = Http::acceptJson()->timeout(12);
            if ($apiKey !== '') {
                $request = $request->withHeaders(['x-api-key' => $apiKey]);
            }
            // Forward staff bearer if present (inventory/tickets).
            $auth = request()?->bearerToken();
            if ($auth) {
                $request = $request->withToken($auth);
            }

            $response = $request->get($baseUrl . $path);
            if ($response->successful()) {
                $out['available'] = true;
                $out['partial'] = false;
                $out['facts']['data'] = $this->trimArray($response->json() ?? [], 50);
                $out['summary'] = "{$focus} data loaded from {$path}";
            } else {
                $out['facts']['http_status'] = $response->status();
                $out['facts']['body'] = mb_substr($response->body(), 0, 400);
                $out['summary'] = "{$focus} API returned HTTP " . $response->status();
                if ($mayNeedAuth && in_array($response->status(), [401, 403], true)) {
                    $out['manual_next_steps'][] = 'Re-login so AI can forward your tickets token, or open Inventory in the UI';
                }
            }
        } catch (Throwable $e) {
            $out['facts']['error'] = $e->getMessage();
            $out['summary'] = "{$focus} unreachable from API host — use UI/manual path";
        }

        return $out;
    }

    /**
     * @param  mixed  $data
     * @return mixed
     */
    private function trimArray(mixed $data, int $maxKeys): mixed
    {
        if (!is_array($data)) {
            return $data;
        }
        if (array_is_list($data)) {
            return array_slice($data, 0, min(30, $maxKeys));
        }
        $i = 0;
        $out = [];
        foreach ($data as $key => $value) {
            if ($i++ >= $maxKeys) {
                $out['_truncated'] = true;
                break;
            }
            $out[$key] = is_array($value) ? $this->trimArray($value, max(5, (int) ($maxKeys / 2))) : $value;
        }

        return $out;
    }
}
