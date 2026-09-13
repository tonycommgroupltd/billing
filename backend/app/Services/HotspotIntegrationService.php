<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use RuntimeException;

class HotspotIntegrationService
{
    public function dashboard($actor): array
    {
        $parts = $this->collect('dashboard', [], [], $actor);
        $merged = [
            'revenue_today' => 0.0,
            'revenue_week' => 0.0,
            'revenue_month' => 0.0,
            'transactions_today' => 0,
            'active_users' => 0,
            'total_users' => 0,
            'total_packages' => 0,
            'router_count' => 0,
            'recent_transactions' => [],
            'platforms' => [],
        ];

        foreach ($parts as $source => $json) {
            $data = is_array($json['data'] ?? null) ? $json['data'] : [];
            foreach ([
                'revenue_today', 'revenue_week', 'revenue_month',
            ] as $moneyKey) {
                $merged[$moneyKey] += (float) ($data[$moneyKey] ?? 0);
            }
            foreach ([
                'transactions_today', 'active_users', 'total_users',
                'total_packages', 'router_count',
            ] as $countKey) {
                $merged[$countKey] += (int) ($data[$countKey] ?? 0);
            }
            foreach (($data['recent_transactions'] ?? []) as $tx) {
                if (!is_array($tx)) {
                    continue;
                }
                $tx['platform'] = $source;
                $tx['platform_label'] = $this->sourceLabel($source);
                $merged['recent_transactions'][] = $tx;
            }
            $merged['platforms'][] = [
                'key' => $source,
                'label' => $this->sourceLabel($source),
                'advanced_url' => $this->sourceConfig($source)['advanced_url'] ?? null,
                'ok' => true,
            ];
        }

        usort(
            $merged['recent_transactions'],
            static fn ($a, $b) => strcmp((string) ($b['created_at'] ?? ''), (string) ($a['created_at'] ?? ''))
        );
        $merged['recent_transactions'] = array_slice($merged['recent_transactions'], 0, 20);
        $merged['advanced_url'] = config('hotspot.advanced_url');
        $merged['advanced_urls'] = array_values(array_filter(array_map(
            static fn ($p) => $p['advanced_url'] ?? null,
            $merged['platforms']
        )));

        return ['success' => true, 'data' => $merged];
    }

    public function routers($actor): array
    {
        $rows = [];
        foreach ($this->collect('routers', [], [], $actor) as $source => $json) {
            foreach (($json['data'] ?? []) as $router) {
                if (!is_array($router)) {
                    continue;
                }
                $nativeId = (int) ($router['id'] ?? 0);
                if ($nativeId < 1) {
                    continue;
                }
                $router['native_id'] = $nativeId;
                $router['id'] = $this->encodeRouterId($source, $nativeId);
                $router['platform'] = $source;
                $router['platform_label'] = $this->sourceLabel($source);
                $router['display_name'] = trim(
                    ($router['name'] ?? ('Router #' . $nativeId))
                    . ' · '
                    . $this->sourceLabel($source)
                );
                $rows[] = $router;
            }
        }

        usort($rows, static fn ($a, $b) => strcasecmp(
            (string) ($a['display_name'] ?? $a['name'] ?? ''),
            (string) ($b['display_name'] ?? $b['name'] ?? '')
        ));

        return ['success' => true, 'data' => $rows];
    }

    public function users(array $filters, $actor): array
    {
        $page = max(1, (int) ($filters['page'] ?? 1));
        $perPage = max(10, min(100, (int) ($filters['per_page'] ?? 25)));
        // Pull a wider window from each platform, then merge/sort/paginate locally.
        $fetch = [
            'page' => 1,
            'per_page' => min(100, max($perPage * 2, 50)),
            'search' => $filters['search'] ?? null,
            'status' => $filters['status'] ?? null,
        ];

        $all = [];
        $approxTotal = 0;
        foreach ($this->collect('users', $fetch, [], $actor) as $source => $json) {
            $approxTotal += (int) ($json['meta']['total'] ?? 0);
            foreach (($json['data'] ?? []) as $user) {
                if (!is_array($user)) {
                    continue;
                }
                $user['platform'] = $source;
                $user['platform_label'] = $this->sourceLabel($source);
                $user['id'] = $source . ':' . ($user['id'] ?? uniqid('u', true));
                $all[] = $user;
            }
        }

        usort($all, static fn ($a, $b) => strcmp(
            (string) ($b['created_at'] ?? ''),
            (string) ($a['created_at'] ?? '')
        ));

        $total = max($approxTotal, count($all));
        $slice = array_slice($all, ($page - 1) * $perPage, $perPage);

        return [
            'success' => true,
            'data' => array_values($slice),
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => max(1, (int) ceil($total / $perPage)),
            ],
        ];
    }

    public function sessions(?string $routerId, $actor): array
    {
        $routerId = trim((string) $routerId);
        if ($routerId !== '' && strtolower($routerId) !== 'all') {
            return $this->sessionsForRouter($routerId, $actor);
        }

        $routersResponse = $this->routers($actor);
        $routers = is_array($routersResponse['data'] ?? null) ? $routersResponse['data'] : [];
        $sessions = [];
        $routerSummaries = [];
        $errors = [];

        foreach ($routers as $router) {
            if (!is_array($router)) {
                continue;
            }
            $encodedId = (string) ($router['id'] ?? '');
            if ($encodedId === '') {
                continue;
            }
            $status = strtolower((string) ($router['status'] ?? ''));
            // Still try offline routers — WG may be up even if status is stale.
            try {
                $part = $this->sessionsForRouter($encodedId, $actor);
                $data = is_array($part['data'] ?? null) ? $part['data'] : [];
                $routerInfo = is_array($data['router'] ?? null) ? $data['router'] : $router;
                $routerSummaries[] = [
                    'id' => $encodedId,
                    'name' => $routerInfo['name'] ?? ($router['name'] ?? null),
                    'display_name' => $router['display_name'] ?? ($routerInfo['name'] ?? null),
                    'platform' => $router['platform'] ?? null,
                    'platform_label' => $router['platform_label'] ?? null,
                    'status' => $routerInfo['status'] ?? ($router['status'] ?? $status),
                    'identity' => $routerInfo['identity'] ?? null,
                    'uptime' => $routerInfo['uptime'] ?? null,
                    'cpu_load' => $routerInfo['cpu_load'] ?? null,
                    'session_count' => count($data['sessions'] ?? []),
                ];
                foreach (($data['sessions'] ?? []) as $session) {
                    if (!is_array($session)) {
                        continue;
                    }
                    $session['router_id'] = $encodedId;
                    $session['router_name'] = $router['display_name']
                        ?? ($router['name'] ?? ($routerInfo['name'] ?? null));
                    $session['platform'] = $router['platform'] ?? null;
                    $session['platform_label'] = $router['platform_label'] ?? null;
                    $sessions[] = $session;
                }
            } catch (\Throwable $e) {
                $errors[] = [
                    'router_id' => $encodedId,
                    'router_name' => $router['display_name'] ?? ($router['name'] ?? $encodedId),
                    'error' => $e->getMessage(),
                ];
                Log::warning('Hotspot sessions fetch failed for router', [
                    'router_id' => $encodedId,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        usort($sessions, static function ($a, $b) {
            return strcasecmp((string) ($a['user'] ?? ''), (string) ($b['user'] ?? ''));
        });

        return [
            'success' => true,
            'data' => [
                'sessions' => $sessions,
                'routers' => $routerSummaries,
                'errors' => $errors,
                'router' => [
                    'id' => 'all',
                    'name' => 'All routers',
                    'identity' => 'All routers',
                    'session_count' => count($sessions),
                ],
            ],
        ];
    }

    private function sessionsForRouter(string $routerId, $actor): array
    {
        [$source, $nativeId] = $this->decodeRouterId($routerId);
        $json = $this->requestSource($source, 'GET', 'sessions', ['router_id' => $nativeId], [], $actor);
        $data = is_array($json['data'] ?? null) ? $json['data'] : [];
        if (isset($data['router']) && is_array($data['router'])) {
            $data['router']['id'] = $this->encodeRouterId($source, (int) ($data['router']['id'] ?? $nativeId));
            $data['router']['platform'] = $source;
            $data['router']['platform_label'] = $this->sourceLabel($source);
        }
        foreach (($data['sessions'] ?? []) as $i => $session) {
            if (!is_array($session)) {
                continue;
            }
            $data['sessions'][$i]['router_id'] = $this->encodeRouterId($source, $nativeId);
            $data['sessions'][$i]['platform'] = $source;
            $data['sessions'][$i]['platform_label'] = $this->sourceLabel($source);
        }

        return ['success' => true, 'data' => $data];
    }

    public function siteEarnings(array $filters, $actor): array
    {
        $parts = $this->collect('site_earnings', $filters, [], $actor);
        $merged = [
            'days' => (int) ($filters['days'] ?? 7),
            'revenue_today_total' => 0.0,
            'today_by_site' => [],
            'daily_by_site' => [],
        ];
        $todayMap = [];

        foreach ($parts as $source => $json) {
            $data = is_array($json['data'] ?? null) ? $json['data'] : [];
            $label = $this->sourceLabel($source);
            $merged['revenue_today_total'] += (float) ($data['revenue_today_total'] ?? 0);
            foreach (($data['today_by_site'] ?? []) as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $site = trim((string) ($row['site'] ?? '(not captured)'));
                $key = $label . ' · ' . $site;
                $todayMap[$key] = ($todayMap[$key] ?? ['site' => $key, 'transactions' => 0, 'revenue' => 0.0]);
                $todayMap[$key]['transactions'] += (int) ($row['transactions'] ?? 0);
                $todayMap[$key]['revenue'] += (float) ($row['revenue'] ?? 0);
            }
            foreach (($data['daily_by_site'] ?? []) as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $row['site'] = $label . ' · ' . trim((string) ($row['site'] ?? '(not captured)'));
                $merged['daily_by_site'][] = $row;
            }
        }

        $merged['today_by_site'] = array_values($todayMap);
        usort($merged['today_by_site'], static fn ($a, $b) => ($b['revenue'] <=> $a['revenue']));

        return ['success' => true, 'data' => $merged];
    }

    public function authLocations(array $filters, $actor): array
    {
        $payments = [];
        $activations = [];
        foreach ($this->collect('auth_locations', $filters, [], $actor) as $source => $json) {
            $data = is_array($json['data'] ?? null) ? $json['data'] : [];
            $label = $this->sourceLabel($source);
            foreach (($data['payments'] ?? []) as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $row['platform'] = $source;
                $row['platform_label'] = $label;
                $payments[] = $row;
            }
            foreach (($data['activations'] ?? []) as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $row['platform'] = $source;
                $row['platform_label'] = $label;
                $activations[] = $row;
            }
        }
        usort($payments, static fn ($a, $b) => strcmp((string) ($b['created_at'] ?? ''), (string) ($a['created_at'] ?? '')));
        usort($activations, static fn ($a, $b) => strcmp((string) ($b['created_at'] ?? ''), (string) ($a['created_at'] ?? '')));
        return [
            'success' => true,
            'data' => [
                'payments' => array_values($payments),
                'activations' => array_values($activations),
            ],
        ];
    }

    public function liveAuth(array $filters, $actor): array
    {
        $online = [];
        $routerErrors = [];
        $polled = 0;
        $skipped = 0;
        $elapsed = 0;
        foreach ($this->collect('live_auth', $filters, [], $actor) as $source => $json) {
            $data = is_array($json['data'] ?? null) ? $json['data'] : [];
            $label = $this->sourceLabel($source);
            $polled += (int) ($data['polled'] ?? 0);
            $skipped += (int) ($data['skipped'] ?? 0);
            $elapsed = max($elapsed, (int) ($data['elapsed_ms'] ?? 0));
            foreach (($data['online'] ?? []) as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $row['platform'] = $source;
                $row['platform_label'] = $label;
                if (isset($row['router_id'])) {
                    $row['router_id'] = $this->encodeRouterId($source, (int) $row['router_id']);
                }
                if (!empty($row['router'])) {
                    $row['router'] = $label . ' · ' . $row['router'];
                }
                $online[] = $row;
            }
            foreach (($data['router_errors'] ?? []) as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $row['platform'] = $source;
                $row['router'] = $label . ' · ' . ($row['router'] ?? 'router');
                $routerErrors[] = $row;
            }
        }
        usort($online, static fn ($a, $b) => strcasecmp((string) ($a['router'] ?? ''), (string) ($b['router'] ?? '')));
        return [
            'success' => true,
            'data' => [
                'online' => array_values($online),
                'router_errors' => array_values($routerErrors),
                'polled' => $polled,
                'skipped' => $skipped,
                'elapsed_ms' => $elapsed,
            ],
        ];
    }

    public function logs($actor): array
    {
        // Prefer primary platform logs; append secondary file lists if present.
        $parts = $this->collect('logs', [], [], $actor);
        $files = [];
        foreach ($parts as $source => $json) {
            foreach (($json['data'] ?? []) as $file) {
                if (is_array($file)) {
                    $file['platform'] = $source;
                    $file['platform_label'] = $this->sourceLabel($source);
                    $files[] = $file;
                } elseif (is_string($file)) {
                    $files[] = [
                        'name' => $file,
                        'platform' => $source,
                        'platform_label' => $this->sourceLabel($source),
                    ];
                }
            }
        }
        return ['success' => true, 'data' => $files];
    }

    public function logTail(string $file, int $lines, $actor): array
    {
        // Optional "source:filename.log" — default primary.
        $source = 'mwananchi';
        $name = $file;
        if (str_contains($file, ':')) {
            [$source, $name] = explode(':', $file, 2);
        }
        return $this->requestSource($source, 'GET', 'log_tail', [
            'file' => $name,
            'lines' => $lines,
        ], [], $actor);
    }

    public function setUserStatus(array $payload, $actor): array
    {
        $userId = (string) ($payload['user_id'] ?? '');
        [$source, $nativeUserId] = $this->decodeEntityId($userId, 'mwananchi');
        $body = [
            'user_id' => $nativeUserId,
            'disabled' => (bool) ($payload['disabled'] ?? false),
        ];
        if (!empty($payload['router_id'])) {
            [$routerSource, $nativeRouterId] = $this->decodeRouterId((string) $payload['router_id']);
            $source = $routerSource;
            $body['router_id'] = $nativeRouterId;
        }
        return $this->requestSource($source, 'POST', 'user_status', [], $body, $actor);
    }

    public function disconnectSession(array $payload, $actor): array
    {
        [$source, $nativeRouterId] = $this->decodeRouterId((string) ($payload['router_id'] ?? ''));
        return $this->requestSource($source, 'POST', 'disconnect_session', [], [
            'router_id' => $nativeRouterId,
            'session_id' => (string) ($payload['session_id'] ?? ''),
        ], $actor);
    }

    /**
     * @return array<string, array>
     */
    private function collect(string $action, array $query, array $payload, $actor): array
    {
        $out = [];
        $errors = [];
        foreach ($this->sources() as $source) {
            try {
                $out[$source['key']] = $this->requestSource(
                    $source['key'],
                    empty($payload) ? 'GET' : 'POST',
                    $action,
                    $query,
                    $payload,
                    $actor
                );
            } catch (\Throwable $e) {
                $errors[$source['key']] = $e->getMessage();
                Log::warning('Hotspot source failed', [
                    'source' => $source['key'],
                    'action' => $action,
                    'error' => $e->getMessage(),
                ]);
            }
        }
        if ($out === []) {
            $msg = $errors ? ('Hotspot unavailable: ' . implode('; ', $errors)) : 'Hotspot integration is not configured';
            throw new RuntimeException($msg, 503);
        }
        return $out;
    }

    /**
     * @return list<array{key:string,label:string,api_url:string,secret:string,client_id:string,advanced_url:?string}>
     */
    private function sources(): array
    {
        $list = [];
        $primaryUrl = (string) config('hotspot.api_url');
        $primarySecret = (string) config('hotspot.secret');
        if ($primaryUrl !== '' && $primarySecret !== '') {
            $list[] = [
                'key' => 'mwananchi',
                'label' => 'Mwananchi',
                'api_url' => $primaryUrl,
                'secret' => $primarySecret,
                'client_id' => (string) config('hotspot.client_id', 'app-tcom'),
                'advanced_url' => (string) config('hotspot.advanced_url'),
            ];
        }

        if (config('hotspot.tpay_enabled')) {
            $tpayUrl = (string) config('hotspot.tpay_api_url');
            $tpaySecret = (string) config('hotspot.tpay_api_secret');
            if ($tpayUrl !== '' && $tpaySecret !== '') {
                $list[] = [
                    'key' => 'tpay',
                    'label' => 'TPay Hotspot',
                    'api_url' => $tpayUrl,
                    'secret' => $tpaySecret,
                    'client_id' => (string) config('hotspot.client_id', 'app-tcom'),
                    'advanced_url' => (string) config('hotspot.tpay_advanced_url'),
                ];
            }
        }

        return $list;
    }

    private function sourceConfig(string $key): array
    {
        foreach ($this->sources() as $source) {
            if ($source['key'] === $key) {
                return $source;
            }
        }
        throw new RuntimeException("Unknown hotspot platform: {$key}", 404);
    }

    private function sourceLabel(string $key): string
    {
        try {
            return (string) ($this->sourceConfig($key)['label'] ?? $key);
        } catch (\Throwable $e) {
            return $key;
        }
    }

    public function encodeRouterId(string $source, int $nativeId): string
    {
        return $source . ':' . $nativeId;
    }

    /**
     * @return array{0:string,1:int}
     */
    public function decodeRouterId(string $routerId): array
    {
        $routerId = trim($routerId);
        if ($routerId === '') {
            throw new RuntimeException('router_id is required', 422);
        }
        if (ctype_digit($routerId)) {
            return ['mwananchi', (int) $routerId];
        }
        if (!preg_match('/^(mwananchi|tpay):(\d+)$/', $routerId, $m)) {
            throw new RuntimeException('Invalid router_id', 422);
        }
        return [$m[1], (int) $m[2]];
    }

    /**
     * @return array{0:string,1:int|string}
     */
    private function decodeEntityId(string $id, string $defaultSource): array
    {
        $id = trim($id);
        if ($id === '') {
            throw new RuntimeException('user_id is required', 422);
        }
        if (ctype_digit($id)) {
            return [$defaultSource, (int) $id];
        }
        if (preg_match('/^(mwananchi|tpay):(.+)$/', $id, $m)) {
            $native = ctype_digit($m[2]) ? (int) $m[2] : $m[2];
            return [$m[1], $native];
        }
        throw new RuntimeException('Invalid user_id', 422);
    }

    private function requestSource(
        string $sourceKey,
        string $method,
        string $action,
        array $query,
        array $payload,
        $actor
    ): array {
        if (!config('hotspot.enabled')) {
            throw new RuntimeException('Hotspot integration is disabled', 503);
        }

        $source = $this->sourceConfig($sourceKey);
        $url = (string) $source['api_url'];
        $secret = (string) $source['secret'];
        $clientId = (string) ($source['client_id'] ?? 'app-tcom');
        if ($url === '' || $secret === '') {
            throw new RuntimeException("Hotspot platform {$sourceKey} is not configured", 503);
        }

        $query = array_filter(
            array_merge(['action' => $action], $query),
            static fn ($value) => $value !== null && $value !== ''
        );
        ksort($query);
        $queryString = http_build_query($query, '', '&', PHP_QUERY_RFC3986);
        $requestUrl = $url . (str_contains($url, '?') ? '&' : '?') . $queryString;
        $path = (string) (parse_url($url, PHP_URL_PATH) ?: '');
        $body = strtoupper($method) === 'GET'
            ? ''
            : json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        $timestamp = (string) time();
        $nonce = Str::random(40);
        $canonical = implode("\n", [
            $timestamp,
            $nonce,
            strtoupper($method),
            $path,
            $queryString,
            hash('sha256', $body),
        ]);

        $headers = [
            'Accept' => 'application/json',
            'X-TCom-Client' => $clientId,
            'X-TCom-Timestamp' => $timestamp,
            'X-TCom-Nonce' => $nonce,
            'X-TCom-Signature' => hash_hmac('sha256', $canonical, $secret),
            'X-TCom-Actor-Id' => (string) ($actor?->id ?? ''),
            'X-TCom-Actor-Name' => substr(
                Str::ascii((string) ($actor?->name ?? $actor?->username ?? 'APP.TCOM user')),
                0,
                200
            ),
        ];

        try {
            $timeout = $action === 'live_auth'
                ? max(8, min(20, (int) ($query['budget'] ?? 12) + 5))
                : max(5, (int) config('hotspot.timeout', 45));

            $request = Http::acceptJson()
                ->withHeaders($headers)
                ->connectTimeout(max(1, (int) config('hotspot.connect_timeout', 10)))
                ->timeout($timeout);

            if ($body !== '') {
                $request = $request->withBody($body, 'application/json');
            }
            $response = $request->send(strtoupper($method), $requestUrl);
        } catch (ConnectionException $e) {
            throw new RuntimeException("Hotspot platform {$sourceKey} is unreachable", 503, $e);
        }

        return $this->decodeResponse($response);
    }

    private function decodeResponse(Response $response): array
    {
        $json = $response->json();
        if (!is_array($json)) {
            throw new RuntimeException('Hotspot service returned an invalid response', 502);
        }
        if (!$response->successful() || empty($json['success'])) {
            $message = $json['error'] ?? 'Hotspot request failed';
            $status = in_array($response->status(), [400, 401, 403, 404, 409, 422, 429, 502, 503], true)
                ? $response->status()
                : 502;
            throw new RuntimeException((string) $message, $status);
        }
        return $json;
    }
}
