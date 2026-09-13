<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * SmartOLT cloud API client.
 *
 * Authorize path uses ONLY per-ONU endpoints. get_all_onus_details is capped at
 * 15/hour by SmartOLT — we hard-budget below that and cache for hours.
 */
class SmartOltService
{
    private const CACHE_ONUS = 'smartolt:onus:all';
    private const CACHE_ZONES = 'smartolt:zones';
    private const CACHE_ONU_TYPES = 'smartolt:onu_types';
    private const CACHE_SPEED_PROFILES = 'smartolt:speed_profiles';
    private const CACHE_ALL_ONUS_BUDGET = 'smartolt:budget:get_all_onus_details';
    private const CACHE_LAST_REQUEST_AT = 'smartolt:last_request_at_ms';

    /** ONUs plugged in and visible to the OLT but not yet authorized. */
    public function unconfiguredOnus(): array
    {
        $data = $this->get('/onu/unconfigured_onus');
        $rows = $data['response'] ?? [];

        return array_values(array_filter(
            array_map([$this, 'normalizeUnconfigured'], is_array($rows) ? $rows : []),
            static fn ($row) => $row !== null
        ));
    }

    public function zones(bool $fresh = false): array
    {
        if ($fresh) {
            Cache::forget(self::CACHE_ZONES);
        }

        return Cache::remember(
            self::CACHE_ZONES,
            (int) config('smartolt.lookup_cache_ttl', 21600),
            function () {
                $rows = $this->get('/system/get_zones')['response'] ?? [];
                $zones = [];
                foreach (is_array($rows) ? $rows : [] as $row) {
                    $name = trim((string) ($row['name'] ?? ''));
                    if ($name === '') {
                        continue;
                    }
                    $zones[] = ['id' => (string) ($row['id'] ?? ''), 'name' => $name];
                }
                usort($zones, static fn ($a, $b) => strcasecmp($a['name'], $b['name']));

                return $zones;
            }
        );
    }

    public function onuTypes(bool $fresh = false): array
    {
        if ($fresh) {
            Cache::forget(self::CACHE_ONU_TYPES);
        }

        return Cache::remember(
            self::CACHE_ONU_TYPES,
            (int) config('smartolt.lookup_cache_ttl', 21600),
            function () {
                $rows = $this->get('/system/get_onu_types')['response'] ?? [];
                $ponType = strtolower((string) config('smartolt.defaults.pon_type', 'gpon'));
                $types = [];
                foreach (is_array($rows) ? $rows : [] as $row) {
                    $name = trim((string) ($row['name'] ?? ''));
                    if ($name === '' || strtolower((string) ($row['pon_type'] ?? '')) !== $ponType) {
                        continue;
                    }
                    $capability = (string) ($row['capability'] ?? '');
                    $types[] = [
                        'id' => (string) ($row['id'] ?? ''),
                        'name' => $name,
                        'capability' => $capability,
                        // HG8010H and friends cannot be authorized in Routing mode.
                        'supports_routing' => stripos($capability, 'routing') !== false,
                    ];
                }
                usort($types, static fn ($a, $b) => strcasecmp($a['name'], $b['name']));

                return $types;
            }
        );
    }

    public function speedProfiles(bool $fresh = false): array
    {
        if ($fresh) {
            Cache::forget(self::CACHE_SPEED_PROFILES);
        }

        return Cache::remember(
            self::CACHE_SPEED_PROFILES,
            (int) config('smartolt.lookup_cache_ttl', 21600),
            function () {
                $rows = $this->get('/system/get_speed_profiles')['response'] ?? [];
                $names = [];
                foreach (is_array($rows) ? $rows : [] as $row) {
                    $name = trim((string) ($row['name'] ?? ''));
                    if ($name !== '') {
                        $names[] = $name;
                    }
                }

                return array_values(array_unique($names));
            }
        );
    }

    /**
     * Full authorized-ONU dump. HEAVY — SmartOLT allows only 15/hour.
     * Prefer get_onu_details/{external_id} for day-to-day work.
     *
     * @param bool $fresh Force a live pull (still subject to our hourly budget).
     */
    public function authorizedOnus(bool $fresh = false): array
    {
        if (!$fresh && Cache::has(self::CACHE_ONUS)) {
            return Cache::get(self::CACHE_ONUS, []);
        }

        $this->assertAllOnusBudget();

        $data = $this->get('/onu/get_all_onus_details', [], true);
        $onus = $data['onus'] ?? [];
        $onus = is_array($onus) ? $onus : [];

        Cache::put(self::CACHE_ONUS, $onus, (int) config('smartolt.onu_cache_ttl', 14400));
        $this->consumeAllOnusBudget();

        return $onus;
    }

    /**
     * Authorized ONUs keyed by lowercased PPPoE username.
     * Uses the cached dump only — never force-refresh from here.
     */
    public function onusByPppoe(bool $fresh = false): array
    {
        $index = [];
        foreach ($this->authorizedOnus($fresh) as $onu) {
            $username = strtolower(trim((string) ($onu['username'] ?? '')));
            if ($username !== '' && !isset($index[$username])) {
                $index[$username] = $onu;
            }
        }

        return $index;
    }

    public function findOnuByPppoe(?string $username): ?array
    {
        $key = strtolower(trim((string) $username));
        if ($key === '') {
            return null;
        }

        // Never force a fresh dump for a single lookup — use cache or miss.
        return $this->onusByPppoe(false)[$key] ?? null;
    }

    /** Per-ONU lookup. Preferred over get_all_onus_details. */
    public function onuDetails(string $externalId): ?array
    {
        $externalId = trim($externalId);
        if ($externalId === '') {
            return null;
        }

        try {
            $data = $this->get('/onu/get_onu_details/' . rawurlencode($externalId));
        } catch (RuntimeException $e) {
            return null;
        }

        $details = $data['onu_details'] ?? null;

        return is_array($details) ? $details : null;
    }

    /** Full live status — includes Online MACs on this ONU (Wi‑Fi / LAN clients). */
    public function onuFullStatus(string $externalId): ?array
    {
        $externalId = trim($externalId);
        if ($externalId === '') {
            return null;
        }

        try {
            $data = $this->get('/onu/get_onu_full_status_info/' . rawurlencode($externalId), [], true);
        } catch (RuntimeException $e) {
            return null;
        }

        return is_array($data) ? $data : null;
    }

    /**
     * @return list<array{mac:string,port:string,vlan:string}>
     */
    public function parseConnectedDevices(?array $fullStatus): array
    {
        if (!$fullStatus) {
            return [];
        }

        $raw = $fullStatus['full_status_json'] ?? null;
        if (is_string($raw)) {
            $parsed = json_decode($raw, true);
        } else {
            $parsed = is_array($raw) ? $raw : null;
        }
        if (!is_array($parsed)) {
            return [];
        }

        $macSection = $parsed['Online MACs on this ONU'] ?? null;
        if ($macSection === null) {
            return [];
        }

        $list = [];
        if (is_array($macSection)) {
            $list = array_values($macSection);
        }
        $devices = [];
        foreach ($list as $dev) {
            if (!is_array($dev)) {
                continue;
            }
            $devices[] = [
                'mac' => (string) ($dev['MAC address'] ?? $dev['mac_address'] ?? $dev['mac'] ?? '—'),
                'port' => (string) ($dev['Port'] ?? $dev['port'] ?? '—'),
                'vlan' => (string) ($dev['VLAN'] ?? $dev['vlan'] ?? '—'),
            ];
        }

        return $devices;
    }

    public function extractWifiSsid(?array $onuDetails): ?string
    {
        if (!$onuDetails) {
            return null;
        }

        $ports = $onuDetails['wifi_ports'] ?? null;
        if (is_array($ports)) {
            foreach ($ports as $port) {
                if (!is_array($port)) {
                    continue;
                }
                $ssid = trim((string) ($port['ssid'] ?? ''));
                if ($ssid !== '') {
                    return $ssid;
                }
            }
        }

        $ssid = trim((string) ($onuDetails['wifi_ssid'] ?? $onuDetails['ssid'] ?? ''));

        return $ssid !== '' ? $ssid : null;
    }

    /** Write Wi‑Fi SSID + password to the ONU (SmartOLT write API). */
    public function setWifi(string $externalId, string $ssid, string $password): array
    {
        return $this->post('/onu/set_wifi_port_lan/' . rawurlencode($externalId), [
            'wifi_port' => 'wifi_0/1',
            'ssid' => $ssid,
            'password' => $password,
            'authentication_mode' => 'WPA2',
            'dhcp' => 'No control',
        ]);
    }

    /** How many get_all_onus_details calls remain in this hour. */
    public function allOnusBudgetRemaining(): int
    {
        $budget = max(1, (int) config('smartolt.get_all_onus_details_hourly_budget', 10));
        $used = (int) Cache::get(self::CACHE_ALL_ONUS_BUDGET, 0);

        return max(0, $budget - $used);
    }

    /**
     * Step 1 of authorization. Returns SmartOLT's raw response message.
     *
     * @param array{sn:string,onu_type:string,zone:string,name:string,board?:int|string,port?:int|string,address_or_comment?:string} $input
     */
    public function authorizeOnu(array $input): array
    {
        $defaults = (array) config('smartolt.defaults', []);

        $form = [
            'olt_id' => (string) $defaults['olt_id'],
            'pon_type' => (string) $defaults['pon_type'],
            'gpon_channel' => (string) $defaults['gpon_channel'],
            'sn' => $input['sn'],
            'onu_type' => $input['onu_type'],
            'onu_mode' => (string) $defaults['onu_mode'],
            'vlan' => (string) $defaults['vlan'],
            'tag_transform_mode' => (string) $defaults['tag_transform_mode'],
            'zone' => $input['zone'],
            'name' => $input['name'],
            'onu_external_id' => $input['sn'],
            'upload_speed_profile_name' => (string) $defaults['upload_speed_profile'],
            'download_speed_profile_name' => (string) $defaults['download_speed_profile'],
        ];

        // Leaving board/port empty makes SmartOLT save the ONU for later instead
        // of authorizing it, so only send them when autofind reported them.
        foreach (['board', 'port'] as $key) {
            if (isset($input[$key]) && $input[$key] !== '' && $input[$key] !== null) {
                $form[$key] = (string) $input[$key];
            }
        }
        if (!empty($input['address_or_comment'])) {
            $form['address_or_comment'] = $input['address_or_comment'];
        }

        return $this->post('/onu/authorize_onu', $form);
    }

    /** Step 2 of authorization — attach the customer's PPPoE credentials. */
    public function setWanPppoe(string $externalId, string $username, string $password): array
    {
        return $this->post('/onu/set_onu_wan_mode_pppoe/' . rawurlencode($externalId), [
            'username' => $username,
            'password' => $password,
        ]);
    }

    /** Push stored SmartOLT config down to the ONU (WAN, MGMT, TR-069, etc.). */
    public function resyncOnuConfig(string $externalId): array
    {
        return $this->post('/onu/resync_onu_config/' . rawurlencode($externalId));
    }

    /** Post-authorization touches that match the rest of the base. Best effort. */
    public function applyStandardOnuConfig(string $externalId, bool $includeResync = true): array
    {
        $defaults = (array) config('smartolt.defaults', []);
        $applied = [];
        $failed = [];

        if (strtoupper((string) $defaults['mgmt_ip_mode']) === 'DHCP') {
            try {
                $this->post('/onu/set_onu_mgmt_ip_dhcp/' . rawurlencode($externalId), [
                    'vlan' => (string) $defaults['mgmt_ip_vlan'],
                ]);
                $applied[] = 'mgmt_ip_dhcp';
            } catch (RuntimeException $e) {
                $failed['mgmt_ip_dhcp'] = $e->getMessage();
            }
        }

        if (!empty($defaults['enable_tr069'])) {
            try {
                $this->post('/onu/enable_tr069/' . rawurlencode($externalId), [
                    'tr069_profile' => (string) ($defaults['tr069_profile'] ?? 'SmartOLT'),
                ]);
                $applied[] = 'tr069';
            } catch (RuntimeException $e) {
                $failed['tr069'] = $e->getMessage();
            }
        }

        if ($includeResync) {
            try {
                $this->resyncOnuConfig($externalId);
                $applied[] = 'resync_config';
            } catch (RuntimeException $e) {
                $failed['resync_config'] = $e->getMessage();
            }
        }

        return ['applied' => $applied, 'failed' => $failed];
    }

    public function deleteOnu(string $externalId): array
    {
        // Do NOT wipe the full-ONU cache here — that would force another
        // get_all_onus_details (15/hour). Local services.onu_sn is updated by the caller.
        return $this->post('/onu/delete/' . rawurlencode($externalId));
    }

    public function addZone(string $name): array
    {
        $result = $this->post('/system/add_zone', ['zone' => $name]);
        Cache::forget(self::CACHE_ZONES);

        return $result;
    }

    public function forgetOnuCache(): void
    {
        Cache::forget(self::CACHE_ONUS);
    }

    public function configured(): bool
    {
        return (bool) config('smartolt.enabled')
            && trim((string) config('smartolt.api_key')) !== '';
    }

    /**
     * Autofind rows come back with slightly different key names depending on
     * OLT vendor, so normalize to one shape.
     */
    private function normalizeUnconfigured($row): ?array
    {
        if (!is_array($row)) {
            return null;
        }

        $sn = trim((string) ($row['sn'] ?? $row['serial_number'] ?? $row['mac'] ?? ''));
        if ($sn === '') {
            return null;
        }

        $board = $row['board'] ?? null;
        $port = $row['port'] ?? $row['pon_port'] ?? null;
        $detected = trim((string) (
            $row['onu_type'] ?? $row['dn_onu_type'] ?? $row['onu_type_name'] ?? ''
        ));

        return [
            'sn' => $sn,
            'olt_id' => (string) ($row['olt_id'] ?? config('smartolt.defaults.olt_id')),
            'olt_name' => $row['olt_name'] ?? null,
            'board' => ($board === null || $board === '') ? null : (string) $board,
            'port' => ($port === null || $port === '') ? null : (string) $port,
            'detected_onu_type' => $detected !== '' ? $detected : null,
            'pon' => ($board !== null && $port !== null) ? "{$board}/{$port}" : null,
        ];
    }

    private function assertAllOnusBudget(): void
    {
        if ($this->allOnusBudgetRemaining() <= 0) {
            throw new RuntimeException(
                'SmartOLT get_all_onus_details hourly budget exhausted '
                . '(limit ' . (int) config('smartolt.get_all_onus_details_hourly_budget', 10)
                . '/hour, SmartOLT hard-cap is 15/hour). Use per-ONU lookups or wait.',
                429
            );
        }
    }

    private function consumeAllOnusBudget(): void
    {
        $key = self::CACHE_ALL_ONUS_BUDGET;
        if (!Cache::has($key)) {
            Cache::put($key, 1, 3600);
            return;
        }
        Cache::increment($key);
    }

    private function throttle(): void
    {
        $gapMs = max(0, (int) config('smartolt.min_request_gap_ms', 150));
        if ($gapMs <= 0) {
            return;
        }

        $last = (int) Cache::get(self::CACHE_LAST_REQUEST_AT, 0);
        $now = (int) floor(microtime(true) * 1000);
        $wait = $gapMs - ($now - $last);
        if ($wait > 0) {
            usleep($wait * 1000);
        }
        Cache::put(self::CACHE_LAST_REQUEST_AT, (int) floor(microtime(true) * 1000), 60);
    }

    private function get(string $path, array $query = [], bool $heavy = false): array
    {
        return $this->request('GET', $path, $query, [], $heavy);
    }

    private function post(string $path, array $form = []): array
    {
        return $this->request('POST', $path, [], $form, false);
    }

    private function request(
        string $method,
        string $path,
        array $query,
        array $form,
        bool $heavy
    ): array {
        if (!config('smartolt.enabled')) {
            throw new RuntimeException('SmartOLT integration is disabled', 503);
        }

        $baseUrl = rtrim((string) config('smartolt.base_url'), '/');
        $apiKey = trim((string) config('smartolt.api_key'));
        if ($baseUrl === '' || $apiKey === '') {
            throw new RuntimeException(
                'SmartOLT is not configured. Set SMARTOLT_API_KEY on the server.',
                503
            );
        }

        $this->throttle();

        $timeout = $heavy
            ? (int) config('smartolt.heavy_timeout', 150)
            : (int) config('smartolt.timeout', 60);

        $request = Http::acceptJson()
            ->withHeaders(['X-Token' => $apiKey])
            ->connectTimeout(max(1, (int) config('smartolt.connect_timeout', 10)))
            ->timeout(max(5, $timeout));

        $url = $baseUrl . '/api' . $path;

        try {
            $response = strtoupper($method) === 'GET'
                ? $request->get($url, $query)
                : $request->asForm()->post($url, $form);
        } catch (ConnectionException $e) {
            throw new RuntimeException('SmartOLT is unreachable', 503, $e);
        }

        return $this->decode($response);
    }

    private function decode(Response $response): array
    {
        $json = $response->json();
        if (!is_array($json)) {
            throw new RuntimeException('SmartOLT returned an invalid response', 502);
        }

        if (!$response->successful() || ($json['status'] ?? false) !== true) {
            $message = (string) ($json['error'] ?? $json['message'] ?? 'SmartOLT request failed');
            $status = in_array($response->status(), [400, 401, 403, 404, 405, 409, 422, 429], true)
                ? ($response->status() === 429 ? 429 : 422)
                : 502;
            throw new RuntimeException($message, $status);
        }

        return $json;
    }
}
