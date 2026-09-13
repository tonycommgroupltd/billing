<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\Service;
use App\Services\SmartOltService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use RuntimeException;

/**
 * Drives the Customers → SmartOLT page: list the ONUs waiting on the OLT, pick
 * the customer they belong to, and authorize using the conventions already used
 * by the rest of the base.
 */
class SmartOltController extends Controller
{
    public function __construct(private SmartOltService $smartOlt)
    {
    }

    /** ONUs powered up and seen by the OLT but not yet authorized. */
    public function unconfigured(Request $request)
    {
        try {
            $onus = $this->smartOlt->unconfiguredOnus();
        } catch (RuntimeException $e) {
            return $this->fail($e);
        }

        $defaultType = (string) config('smartolt.defaults.onu_type');
        $knownTypes = [];
        try {
            foreach ($this->smartOlt->onuTypes() as $type) {
                $knownTypes[strtolower($type['name'])] = $type;
            }
        } catch (RuntimeException $e) {
            // Type list is only used to pre-validate; carry on without it.
        }

        foreach ($onus as &$onu) {
            $detected = $onu['detected_onu_type'];
            $match = $detected ? ($knownTypes[strtolower($detected)] ?? null) : null;

            // Fall back to the model 95% of the base uses when autofind is vague
            // or reports a type that isn't defined in SmartOLT.
            $onu['suggested_onu_type'] = $match ? $match['name'] : $defaultType;
            $onu['onu_type_recognised'] = (bool) $match;
        }
        unset($onu);

        return response()->json([
            'success' => true,
            'data' => $onus,
            'count' => count($onus),
            'fetched_at' => now()->toDateTimeString(),
        ]);
    }

    /** Zones, ONU types and the fixed defaults, for the authorize modal. */
    public function options(Request $request)
    {
        $fresh = $request->boolean('fresh');

        try {
            $zones = $this->smartOlt->zones($fresh);
            $onuTypes = $this->smartOlt->onuTypes($fresh);
        } catch (RuntimeException $e) {
            return $this->fail($e);
        }

        $defaults = (array) config('smartolt.defaults', []);

        return response()->json([
            'success' => true,
            'zones' => $zones,
            'onu_types' => $onuTypes,
            'defaults' => [
                'olt_id' => (string) $defaults['olt_id'],
                'vlan' => (string) $defaults['vlan'],
                'onu_mode' => (string) $defaults['onu_mode'],
                'onu_type' => (string) $defaults['onu_type'],
                'upload_speed_profile' => (string) $defaults['upload_speed_profile'],
                'download_speed_profile' => (string) $defaults['download_speed_profile'],
                'mgmt_ip_vlan' => (string) $defaults['mgmt_ip_vlan'],
            ],
        ]);
    }

    /**
     * Find candidate services for the ONU. Searching is by customer name, phone
     * or PPPoE username; the result is a service (not just a customer) because
     * the PPPoE credentials live on the service.
     */
    public function searchServices(Request $request)
    {
        $query = trim((string) $request->input('q', ''));
        if (mb_strlen($query) < 2) {
            return response()->json(['success' => true, 'data' => []]);
        }

        $like = '%' . $query . '%';

        // Use the query builder (not Eloquent) so SoftDeletes does not inject
        // `services.deleted_at` — that breaks once the table is aliased as `s`.
        $builder = DB::table('services as s')
            ->join('customers as c', 'c.id', '=', 's.customer_id')
            ->leftJoin('plans as p', 'p.id', '=', 's.plan_id')
            ->where(function ($q) use ($like) {
                $q->where('c.name', 'like', $like)
                    ->orWhere('c.phone_number', 'like', $like)
                    ->orWhere('s.mikrotik_name', 'like', $like);
            })
            ->orderBy('c.name')
            ->limit(20);

        if (Schema::hasColumn('services', 'deleted_at')) {
            $builder->whereNull('s.deleted_at');
        }

        $rows = $builder->get([
            's.id',
            's.mikrotik_name',
            's.mikrotik_password',
            's.status',
            's.onu_sn',
            's.olt_board',
            's.olt_port',
            's.onu_authorized_at',
            'c.id as customer_id',
            'c.name as customer_name',
            'c.phone_number',
            'c.address',
            'c.city',
            'p.title as plan_title',
        ]);

        $zones = [];
        try {
            $zones = $this->smartOlt->zones();
        } catch (RuntimeException $e) {
            // Zone suggestion is a convenience; the modal still lets you pick.
        }

        $data = $rows->map(function ($row) use ($zones) {
            $status = json_decode((string) $row->status, true);

            return [
                'service_id' => (int) $row->id,
                'customer_id' => (int) $row->customer_id,
                'customer_name' => $row->customer_name,
                'phone_number' => $row->phone_number,
                'address' => $row->address,
                'city' => $row->city,
                'plan_title' => $row->plan_title,
                'status_label' => is_array($status) ? ($status['label'] ?? null) : null,
                'pppoe_username' => $row->mikrotik_name,
                'has_credentials' => trim((string) $row->mikrotik_name) !== ''
                    && trim((string) $row->mikrotik_password) !== '',
                // Hint only — authorize() re-checks against SmartOLT itself.
                'existing_onu_sn' => $row->onu_sn,
                'existing_onu_pon' => ($row->olt_board !== null && $row->olt_port !== null)
                    ? $row->olt_board . '/' . $row->olt_port
                    : null,
                'onu_authorized_at' => $row->onu_authorized_at,
                'suggested_zone' => $this->suggestZone($zones, [$row->address, $row->city]),
            ];
        });

        return response()->json(['success' => true, 'data' => $data->values()]);
    }

    /**
     * Authorize an ONU for a service. Two SmartOLT calls are involved, so the
     * response reports each step: if PPPoE fails after the ONU is created, the
     * caller can retry just that half.
     */
    public function authorizeOnu(Request $request)
    {
        $validated = $request->validate([
            'sn' => ['required', 'string', 'max:64', 'regex:/^[A-Za-z0-9:.\-]+$/'],
            'service_id' => ['required', 'integer'],
            // Multi-call progress: authorize → pppoe → config → resync.
            // "all" keeps the original single-request behaviour.
            'stage' => ['nullable', 'string', 'in:all,authorize,pppoe,config,resync'],
            'zone' => ['nullable', 'string', 'max:120'],
            'onu_type' => ['nullable', 'string', 'max:64'],
            'board' => ['nullable', 'integer', 'min:0', 'max:64'],
            'port' => ['nullable', 'integer', 'min:0', 'max:128'],
            'name' => ['nullable', 'string', 'max:120'],
            'address_or_comment' => ['nullable', 'string', 'max:180'],
            'replace_existing' => ['nullable', 'boolean'],
            'create_zone' => ['nullable', 'boolean'],
        ]);

        $stage = strtolower(trim((string) ($validated['stage'] ?? 'all')));
        if ($stage === '') {
            $stage = 'all';
        }

        $service = Service::find($validated['service_id']);
        if (!$service) {
            return response()->json(['success' => false, 'message' => 'Service not found'], 404);
        }

        $pppoeUser = trim((string) $service->mikrotik_name);
        $pppoePass = (string) $service->mikrotik_password;
        if ($pppoeUser === '' || $pppoePass === '') {
            return response()->json([
                'success' => false,
                'message' => 'This service has no PPPoE username/password yet. '
                    . 'Add the service credentials before authorizing an ONU.',
            ], 422);
        }

        $customer = Customer::find($service->customer_id);
        $sn = strtoupper(trim($validated['sn']));

        // Later stages only need the SN + service credentials.
        if (in_array($stage, ['pppoe', 'config', 'resync'], true)) {
            return $this->authorizeFollowUpStage(
                $request,
                $stage,
                $service,
                $customer,
                $sn,
                $pppoeUser,
                $pppoePass
            );
        }

        if (trim((string) ($validated['zone'] ?? '')) === '' || trim((string) ($validated['onu_type'] ?? '')) === '') {
            return response()->json([
                'success' => false,
                'message' => 'Zone and ONU model are required to authorize.',
            ], 422);
        }

        $onuName = $this->sanitizeName(
            $validated['name'] ?? ($customer->name ?? $pppoeUser)
        );
        if ($onuName === '') {
            $onuName = $pppoeUser;
        }

        $zone = $this->sanitizeZone($validated['zone']);
        if ($zone === '') {
            return response()->json([
                'success' => false,
                'message' => 'Zone may only contain letters, numbers, spaces, underscore and dash.',
            ], 422);
        }

        // Replacement guard — LOCAL DB first, then one per-ONU get_onu_details.
        // Never call get_all_onus_details here (15/hour SmartOLT hard cap).
        try {
            $existing = null;
            $linkedSn = strtoupper(trim((string) ($service->onu_sn ?? '')));
            if ($linkedSn !== '' && $linkedSn !== $sn) {
                $existing = $this->smartOlt->onuDetails($linkedSn);
                if ($existing) {
                    $existing['sn'] = $existing['sn'] ?? $linkedSn;
                    $existing['unique_external_id'] = $existing['unique_external_id'] ?? $linkedSn;
                } else {
                    // Stale local link — clear it so we don't keep warning on a ghost SN.
                    DB::table('services')->where('id', $service->id)->update([
                        'onu_sn' => null,
                        'olt_board' => null,
                        'olt_port' => null,
                        'onu_authorized_at' => null,
                    ]);
                }
            }
        } catch (RuntimeException $e) {
            return $this->fail($e);
        }

        if ($existing && strtoupper((string) ($existing['sn'] ?? '')) !== $sn) {
            if (!$request->boolean('replace_existing')) {
                return response()->json([
                    'success' => false,
                    'requires_confirmation' => 'replace_existing',
                    'message' => sprintf(
                        '%s already has ONU %s authorized on PON %s/%s (%s). '
                            . 'Replace it with the new ONU, or cancel.',
                        $pppoeUser,
                        $existing['sn'] ?? '?',
                        $existing['board'] ?? '?',
                        $existing['port'] ?? '?',
                        $existing['status'] ?? 'unknown status'
                    ),
                    'existing_onu' => [
                        'sn' => $existing['sn'] ?? null,
                        'external_id' => $existing['unique_external_id'] ?? null,
                        'board' => $existing['board'] ?? null,
                        'port' => $existing['port'] ?? null,
                        'zone' => $existing['zone_name'] ?? null,
                        'status' => $existing['status'] ?? null,
                        'name' => $existing['name'] ?? null,
                        'authorization_date' => $existing['authorization_date'] ?? null,
                    ],
                ], 409);
            }

            try {
                $this->smartOlt->deleteOnu((string) ($existing['unique_external_id'] ?? $existing['sn']));
            } catch (RuntimeException $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Could not remove the old ONU: ' . $e->getMessage(),
                ], $this->statusFor($e));
            }
        }

        if ($request->boolean('create_zone')) {
            try {
                $this->smartOlt->addZone($zone);
            } catch (RuntimeException $e) {
                // A duplicate zone is fine — only a hard failure matters, and
                // authorize_onu will reject an unusable zone anyway.
                Log::info('[smartolt] add_zone skipped: ' . $e->getMessage());
            }
        }

        $steps = ['authorized' => false, 'pppoe' => false, 'extras' => [], 'already_existed' => false];

        // Idempotent: if this SN is already on the OLT (e.g. a previous attempt
        // succeeded but the UI timed out), skip authorize_onu and just attach
        // PPPoE / finish config. Otherwise SmartOLT returns
        // "Invalid parameters: ONU external ID should be unique".
        $alreadyOnOlt = null;
        try {
            $alreadyOnOlt = $this->smartOlt->onuDetails($sn);
        } catch (RuntimeException $e) {
            // ignore — treat as not present
        }

        if ($alreadyOnOlt) {
            $steps['authorized'] = true;
            $steps['already_existed'] = true;
            $board = $validated['board'] ?? ($alreadyOnOlt['board'] ?? null);
            $port = $validated['port'] ?? ($alreadyOnOlt['port'] ?? null);
        } else {
            try {
                $this->smartOlt->authorizeOnu([
                    'sn' => $sn,
                    'onu_type' => $validated['onu_type'],
                    'zone' => $zone,
                    'name' => $onuName,
                    'board' => $validated['board'] ?? null,
                    'port' => $validated['port'] ?? null,
                    'address_or_comment' => $this->sanitizeName(
                        $validated['address_or_comment'] ?? (string) ($customer->address ?? '')
                    ),
                ]);
                $steps['authorized'] = true;
            } catch (RuntimeException $e) {
                $msg = $e->getMessage();
                // Race / retry after a successful authorize that the client never saw.
                if (stripos($msg, 'external ID should be unique') !== false
                    || stripos($msg, 'already existing') !== false) {
                    $steps['authorized'] = true;
                    $steps['already_existed'] = true;
                    Log::info("[smartolt] authorize skipped, SN {$sn} already on OLT: {$msg}");
                } else {
                    Log::warning("[smartolt] authorize_onu failed for {$sn}: {$msg}");

                    return response()->json([
                        'success' => false,
                        'message' => $msg,
                        'stage' => 'authorize',
                        'steps' => $steps,
                    ], $this->statusFor($e));
                }
            }
            $board = $validated['board'] ?? null;
            $port = $validated['port'] ?? null;
        }

        // The ONU exists on the OLT from here on, so record it even if the
        // PPPoE step fails — otherwise the SN is lost and looks unassigned.
        $this->persistOnuOnService($service, $sn, $board ?? null, $port ?? null, $request);

        $onuPayload = [
            'sn' => $sn,
            'external_id' => $sn,
            'board' => $board ?? null,
            'port' => $port ?? null,
            'onu_type' => $validated['onu_type'],
            'zone' => $zone,
            'name' => $onuName,
        ];
        $servicePayload = [
            'id' => $service->id,
            'pppoe_username' => $pppoeUser,
            'customer_name' => $customer->name ?? null,
        ];

        if ($stage === 'authorize') {
            $verb = !empty($steps['already_existed'])
                ? 'was already on the OLT for'
                : 'authorized on the OLT for';

            return response()->json([
                'success' => true,
                'done' => false,
                'stage' => 'authorize',
                'next_stage' => 'pppoe',
                'message' => sprintf(
                    'ONU %s %s %s (%s). Wiring PPPoE next…',
                    $sn,
                    $verb,
                    $customer->name ?? $pppoeUser,
                    $pppoeUser
                ),
                'steps' => $steps,
                'onu' => $onuPayload,
                'service' => $servicePayload,
            ]);
        }

        try {
            $this->smartOlt->setWanPppoe($sn, $pppoeUser, $pppoePass);
            $steps['pppoe'] = true;
        } catch (RuntimeException $e) {
            Log::warning("[smartolt] PPPoE step failed for {$sn}: " . $e->getMessage());

            return response()->json([
                'success' => false,
                'partial' => true,
                'needs_pppoe_retry' => true,
                'external_id' => $sn,
                'service_id' => $service->id,
                'stage' => 'pppoe',
                'steps' => $steps,
                'message' => 'ONU ' . $sn . ' was authorized but the PPPoE credentials '
                    . 'were not applied: ' . $e->getMessage()
                    . ' The customer will have no internet until this is retried.',
            ], 207);
        }

        $steps['extras'] = $this->smartOlt->applyStandardOnuConfig($sn, true);

        $verb = !empty($steps['already_existed'])
            ? 'was already on the OLT — credentials refreshed for'
            : 'authorized for';

        $resyncOk = in_array('resync_config', $steps['extras']['applied'] ?? [], true);
        $message = sprintf(
            'ONU %s %s %s (%s) in zone %s.',
            $sn,
            $verb,
            $customer->name ?? $pppoeUser,
            $pppoeUser,
            $zone
        );
        if ($resyncOk) {
            $message .= ' Config resynced to the ONU.';
        } elseif (!empty($steps['extras']['failed']['resync_config'])) {
            $message .= ' Warning: config resync failed — use Resync on SmartOLT if the ONU does not come online.';
        }

        return response()->json([
            'success' => true,
            'done' => true,
            'stage' => 'all',
            'next_stage' => null,
            'message' => $message,
            'steps' => $steps,
            'onu' => $onuPayload,
            'service' => $servicePayload,
        ]);
    }

    /**
     * Stages after the ONU is on the OLT — called separately so the UI can show
     * live progress (wiring PPPoE → management/TR-069 → resync).
     */
    private function authorizeFollowUpStage(
        Request $request,
        string $stage,
        Service $service,
        $customer,
        string $sn,
        string $pppoeUser,
        string $pppoePass
    ) {
        if ($stage === 'pppoe') {
            try {
                $this->smartOlt->setWanPppoe($sn, $pppoeUser, $pppoePass);
            } catch (RuntimeException $e) {
                Log::warning("[smartolt] PPPoE stage failed for {$sn}: " . $e->getMessage());

                return response()->json([
                    'success' => false,
                    'partial' => true,
                    'needs_pppoe_retry' => true,
                    'external_id' => $sn,
                    'service_id' => $service->id,
                    'stage' => 'pppoe',
                    'done' => false,
                    'message' => 'ONU ' . $sn . ' was authorized but the PPPoE credentials '
                        . 'were not applied: ' . $e->getMessage()
                        . ' The customer will have no internet until this is retried.',
                ], 207);
            }

            return response()->json([
                'success' => true,
                'done' => false,
                'stage' => 'pppoe',
                'next_stage' => 'config',
                'message' => 'PPPoE credentials applied. Applying management config next…',
                'steps' => ['authorized' => true, 'pppoe' => true],
            ]);
        }

        if ($stage === 'config') {
            $extras = $this->smartOlt->applyStandardOnuConfig($sn, false);

            return response()->json([
                'success' => true,
                'done' => false,
                'stage' => 'config',
                'next_stage' => 'resync',
                'message' => 'Management / TR-069 applied. Resyncing ONU next…',
                'steps' => ['authorized' => true, 'pppoe' => true, 'extras' => $extras],
            ]);
        }

        // resync
        $resyncFailed = null;
        try {
            $this->smartOlt->resyncOnuConfig($sn);
        } catch (RuntimeException $e) {
            $resyncFailed = $e->getMessage();
            Log::warning("[smartolt] resync stage failed for {$sn}: " . $resyncFailed);
        }

        $message = sprintf(
            'ONU %s authorized for %s (%s).',
            $sn,
            $customer->name ?? $pppoeUser,
            $pppoeUser
        );
        if ($resyncFailed === null) {
            $message .= ' Config resynced to the ONU.';
        } else {
            $message .= ' Warning: config resync failed — use Resync on SmartOLT if the ONU does not come online.';
        }

        return response()->json([
            'success' => $resyncFailed === null,
            'done' => true,
            'stage' => 'resync',
            'next_stage' => null,
            'message' => $message,
            'steps' => [
                'authorized' => true,
                'pppoe' => true,
                'extras' => [
                    'applied' => $resyncFailed === null ? ['resync_config'] : [],
                    'failed' => $resyncFailed === null ? [] : ['resync_config' => $resyncFailed],
                ],
            ],
        ], $resyncFailed === null ? 200 : 207);
    }

    /** Recover the second half of a partially completed authorization. */
    public function retryPppoe(Request $request)
    {
        $validated = $request->validate([
            'external_id' => ['required', 'string', 'max:64'],
            'service_id' => ['required', 'integer'],
        ]);

        $service = Service::find($validated['service_id']);
        if (!$service) {
            return response()->json(['success' => false, 'message' => 'Service not found'], 404);
        }

        $pppoeUser = trim((string) $service->mikrotik_name);
        $pppoePass = (string) $service->mikrotik_password;
        if ($pppoeUser === '' || $pppoePass === '') {
            return response()->json([
                'success' => false,
                'message' => 'This service has no PPPoE credentials to apply.',
            ], 422);
        }

        try {
            $this->smartOlt->setWanPppoe($validated['external_id'], $pppoeUser, $pppoePass);
            $extras = $this->smartOlt->applyStandardOnuConfig($validated['external_id']);
        } catch (RuntimeException $e) {
            return $this->fail($e);
        }

        $message = 'PPPoE credentials applied to ' . $validated['external_id'] . '.';
        if (in_array('resync_config', $extras['applied'] ?? [], true)) {
            $message .= ' Config resynced to the ONU.';
        } elseif (!empty($extras['failed']['resync_config'])) {
            $message .= ' Warning: config resync failed.';
        }

        return response()->json([
            'success' => true,
            'message' => $message,
            'steps' => ['authorized' => true, 'pppoe' => true, 'extras' => $extras],
        ]);
    }

    /**
     * Staff change of PPPoE password on SmartOLT (write key) + local services table.
     * Online status remains a separate read-only path (tr069-api / SMARTOLT_READ_API_KEY).
     */
    public function changePppoePassword(Request $request)
    {
        $validated = $request->validate([
            'service_id' => ['required', 'integer'],
            'password' => ['required', 'string', 'min:6', 'max:64'],
            'external_id' => ['nullable', 'string', 'max:64'],
        ]);

        if (!$this->smartOlt->configured()) {
            return response()->json([
                'success' => false,
                'message' => 'SmartOLT write API is not configured.',
            ], 503);
        }

        $service = Service::query()
            ->whereNull('deleted_at')
            ->find($validated['service_id']);

        if (!$service) {
            return response()->json(['success' => false, 'message' => 'Service not found'], 404);
        }

        $pppoeUser = trim((string) $service->mikrotik_name);
        if ($pppoeUser === '') {
            return response()->json([
                'success' => false,
                'message' => 'This service has no PPPoE username (mikrotik_name).',
            ], 422);
        }

        $externalId = trim((string) ($validated['external_id'] ?? ''));
        if ($externalId === '') {
            $externalId = trim((string) ($service->onu_sn ?? ''));
        }
        if ($externalId === '') {
            $onu = $this->smartOlt->findOnuByPppoe($pppoeUser);
            $externalId = trim((string) ($onu['unique_external_id'] ?? $onu['sn'] ?? ''));
        }
        if ($externalId === '') {
            return response()->json([
                'success' => false,
                'message' => 'ONU not found on SmartOLT for this PPPoE username. Authorize the ONU first.',
            ], 404);
        }

        $newPassword = (string) $validated['password'];

        try {
            $this->smartOlt->setWanPppoe($externalId, $pppoeUser, $newPassword);
        } catch (RuntimeException $e) {
            return $this->fail($e);
        }

        $service->mikrotik_password = $newPassword;
        $service->save();

        if (Schema::hasColumn('services', 'onu_sn') && empty($service->onu_sn)) {
            try {
                DB::table('services')->where('id', $service->id)->update(['onu_sn' => $externalId]);
            } catch (\Throwable $e) {
                Log::warning('[smartolt] could not persist onu_sn after password change: ' . $e->getMessage());
            }
        }

        Log::info('[smartolt] PPPoE password changed', [
            'service_id' => $service->id,
            'customer_id' => $service->customer_id,
            'external_id' => $externalId,
            'by' => $request->user()?->id,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'PPPoE password updated on SmartOLT. The ONU should reconnect within a few minutes.',
            'service_id' => $service->id,
            'pppoe_username' => $pppoeUser,
            'external_id' => $externalId,
        ]);
    }

    /**
     * Staff Wi‑Fi overview for customer view: SSID + online Wi‑Fi/LAN device count.
     * Uses SmartOLT read/write key already configured on Contabo.
     */
    public function wifiOverview(Request $request)
    {
        $validated = $request->validate([
            'service_id' => ['required', 'integer'],
        ]);

        $resolved = $this->resolveServiceOnu((int) $validated['service_id']);
        if ($resolved['error']) {
            return response()->json($resolved['error'], $resolved['status']);
        }

        /** @var Service $service */
        $service = $resolved['service'];
        $externalId = $resolved['external_id'];
        $pppoeUser = $resolved['pppoe_username'];

        $details = null;
        $fullStatus = null;
        try {
            $details = $this->smartOlt->onuDetails($externalId);
            $fullStatus = $this->smartOlt->onuFullStatus($externalId);
        } catch (RuntimeException $e) {
            return $this->fail($e);
        }

        $devices = $this->smartOlt->parseConnectedDevices($fullStatus);
        $ssid = $this->smartOlt->extractWifiSsid($details);
        $status = strtolower((string) ($details['status'] ?? $details['onu_status'] ?? ''));
        $online = str_contains($status, 'online')
            || str_contains($status, 'active')
            || str_contains($status, 'working');

        return response()->json([
            'success' => true,
            'service_id' => $service->id,
            'pppoe_username' => $pppoeUser,
            'external_id' => $externalId,
            'wifi_ssid' => $ssid,
            'onu_online' => $online,
            'onu_status' => $details['status'] ?? null,
            'device_count' => count($devices),
            'connected_devices' => $devices,
            'fetched_at' => now()->toIso8601String(),
        ]);
    }

    /** Staff list of devices currently seen on the ONU (Wi‑Fi / LAN MACs). */
    public function connectedDevices(Request $request)
    {
        $validated = $request->validate([
            'service_id' => ['required', 'integer'],
        ]);

        $resolved = $this->resolveServiceOnu((int) $validated['service_id']);
        if ($resolved['error']) {
            return response()->json($resolved['error'], $resolved['status']);
        }

        $externalId = $resolved['external_id'];
        try {
            $fullStatus = $this->smartOlt->onuFullStatus($externalId);
            $details = $this->smartOlt->onuDetails($externalId);
        } catch (RuntimeException $e) {
            return $this->fail($e);
        }

        if ($fullStatus === null) {
            return response()->json([
                'success' => false,
                'message' => 'Could not load connected devices from SmartOLT.',
            ], 502);
        }

        $devices = $this->smartOlt->parseConnectedDevices($fullStatus);

        return response()->json([
            'success' => true,
            'service_id' => $resolved['service']->id,
            'external_id' => $externalId,
            'wifi_ssid' => $this->smartOlt->extractWifiSsid($details),
            'connected_devices' => $devices,
            'device_count' => count($devices),
            'fetched_at' => now()->toIso8601String(),
        ]);
    }

    /** Staff change of Wi‑Fi SSID/password on SmartOLT (write API). */
    public function changeWifiPassword(Request $request)
    {
        $validated = $request->validate([
            'service_id' => ['required', 'integer'],
            'ssid' => ['required', 'string', 'min:1', 'max:32'],
            'password' => ['required', 'string', 'min:8', 'max:64'],
            'external_id' => ['nullable', 'string', 'max:64'],
        ]);

        if (!$this->smartOlt->configured()) {
            return response()->json([
                'success' => false,
                'message' => 'SmartOLT write API is not configured.',
            ], 503);
        }

        $resolved = $this->resolveServiceOnu(
            (int) $validated['service_id'],
            isset($validated['external_id']) ? (string) $validated['external_id'] : null
        );
        if ($resolved['error']) {
            return response()->json($resolved['error'], $resolved['status']);
        }

        $externalId = $resolved['external_id'];
        $ssid = trim((string) $validated['ssid']);
        $password = (string) $validated['password'];

        try {
            $this->smartOlt->setWifi($externalId, $ssid, $password);
        } catch (RuntimeException $e) {
            return $this->fail($e);
        }

        Log::info('[smartolt] WiFi password changed', [
            'service_id' => $resolved['service']->id,
            'customer_id' => $resolved['service']->customer_id,
            'external_id' => $externalId,
            'ssid' => $ssid,
            'by' => $request->user()?->id,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Wi‑Fi updated on SmartOLT. Connected devices must reconnect with the new password.',
            'service_id' => $resolved['service']->id,
            'external_id' => $externalId,
            'wifi_ssid' => $ssid,
        ]);
    }

    /**
     * Backfill services.onu_sn from the cached SmartOLT dump.
     * Defaults to cache (no live dump). Pass fresh=1 only when necessary —
     * get_all_onus_details is limited to 15/hour by SmartOLT.
     */
    public function sync(Request $request)
    {
        $fresh = $request->boolean('fresh', false);

        try {
            $onus = $this->smartOlt->authorizedOnus($fresh);
        } catch (RuntimeException $e) {
            return $this->fail($e);
        }

        $byUsername = [];
        foreach ($onus as $onu) {
            $username = strtolower(trim((string) ($onu['username'] ?? '')));
            if ($username !== '' && !isset($byUsername[$username])) {
                $byUsername[$username] = $onu;
            }
        }

        $updated = 0;
        $unmatched = 0;

        Service::query()
            ->whereNull('deleted_at')
            ->select(['id', 'mikrotik_name', 'onu_sn', 'olt_board', 'olt_port'])
            ->chunkById(500, function ($services) use ($byUsername, &$updated) {
                foreach ($services as $service) {
                    $key = strtolower(trim((string) $service->mikrotik_name));
                    $onu = $byUsername[$key] ?? null;
                    if (!$onu) {
                        continue;
                    }

                    $sn = (string) ($onu['sn'] ?? '');
                    $board = $onu['board'] ?? null;
                    $port = $onu['port'] ?? null;
                    if ($sn === '') {
                        continue;
                    }

                    $changed = (string) $service->onu_sn !== $sn
                        || (string) $service->olt_board !== (string) $board
                        || (string) $service->olt_port !== (string) $port;
                    if (!$changed) {
                        continue;
                    }

                    DB::table('services')->where('id', $service->id)->update([
                        'onu_sn' => $sn,
                        'olt_board' => is_numeric($board) ? (int) $board : null,
                        'olt_port' => is_numeric($port) ? (int) $port : null,
                    ]);
                    $updated++;
                }
            });

        $knownUsernames = DB::table('services')
            ->whereNull('deleted_at')
            ->pluck('mikrotik_name')
            ->map(fn ($name) => strtolower(trim((string) $name)))
            ->all();
        $knownUsernames = array_flip($knownUsernames);
        foreach (array_keys($byUsername) as $username) {
            if (!isset($knownUsernames[$username])) {
                $unmatched++;
            }
        }

        return response()->json([
            'success' => true,
            'message' => "Linked {$updated} service(s) to their SmartOLT ONU"
                . ($fresh ? ' (live dump).' : ' (from cache).'),
            'smartolt_onus' => count($onus),
            'services_updated' => $updated,
            'onus_without_service' => $unmatched,
            'used_live_dump' => $fresh,
            'all_onus_budget_remaining' => $this->smartOlt->allOnusBudgetRemaining(),
        ]);
    }

    /**
     * @return array{service?:Service,external_id?:string,pppoe_username?:string,error?:array,status?:int}
     */
    private function resolveServiceOnu(int $serviceId, ?string $preferredExternalId = null): array
    {
        if (!$this->smartOlt->configured()) {
            return [
                'error' => ['success' => false, 'message' => 'SmartOLT is not configured.'],
                'status' => 503,
            ];
        }

        $service = Service::query()->whereNull('deleted_at')->find($serviceId);
        if (!$service) {
            return [
                'error' => ['success' => false, 'message' => 'Service not found'],
                'status' => 404,
            ];
        }

        $pppoeUser = trim((string) $service->mikrotik_name);
        if ($pppoeUser === '') {
            return [
                'error' => [
                    'success' => false,
                    'message' => 'This service has no PPPoE username to match on SmartOLT.',
                ],
                'status' => 422,
            ];
        }

        $externalId = trim((string) ($preferredExternalId ?? ''));
        if ($externalId === '') {
            $externalId = trim((string) ($service->onu_sn ?? ''));
        }
        if ($externalId === '') {
            $onu = $this->smartOlt->findOnuByPppoe($pppoeUser);
            $externalId = trim((string) ($onu['unique_external_id'] ?? $onu['sn'] ?? ''));
        }
        if ($externalId === '') {
            return [
                'error' => [
                    'success' => false,
                    'message' => 'ONU not found on SmartOLT for this service. Authorize the ONU first.',
                ],
                'status' => 404,
            ];
        }

        return [
            'service' => $service,
            'external_id' => $externalId,
            'pppoe_username' => $pppoeUser,
            'error' => null,
            'status' => 200,
        ];
    }

    /** Best-effort match of a customer address/city to an existing zone name. */
    private function suggestZone(array $zones, array $candidates): ?string
    {
        if (empty($zones)) {
            return null;
        }

        $byExact = [];
        $byNormalized = [];
        foreach ($zones as $zone) {
            $name = $zone['name'];
            $byExact[mb_strtolower(trim($name))] = $name;
            $byNormalized[preg_replace('/[^a-z0-9]/', '', mb_strtolower($name))] = $name;
        }

        foreach ($candidates as $candidate) {
            $value = mb_strtolower(trim((string) $candidate));
            if ($value === '') {
                continue;
            }
            if (isset($byExact[$value])) {
                return $byExact[$value];
            }
            $normalized = preg_replace('/[^a-z0-9]/', '', $value);
            if ($normalized !== '' && isset($byNormalized[$normalized])) {
                return $byNormalized[$normalized];
            }
        }

        return null;
    }

    /** SmartOLT allows alphanumerics, spaces and @#$&()-`.+,/_ in names. */
    private function sanitizeName(?string $value): string
    {
        $clean = preg_replace('/[^A-Za-z0-9 @#$&()\-`.+,\/_]/u', ' ', (string) $value);

        return trim(preg_replace('/\s+/', ' ', (string) $clean));
    }

    /** Zones allow alphanumerics, spaces, underscore and dash only. */
    private function sanitizeZone(?string $value): string
    {
        $clean = preg_replace('/[^A-Za-z0-9 _\-]/u', '', (string) $value);

        return trim(preg_replace('/\s+/', ' ', (string) $clean));
    }

    private function persistOnuOnService(
        Service $service,
        string $sn,
        $board,
        $port,
        Request $request
    ): void {
        try {
            DB::table('services')->where('id', $service->id)->update([
                'onu_sn' => $sn,
                'olt_board' => is_numeric($board) ? (int) $board : null,
                'olt_port' => is_numeric($port) ? (int) $port : null,
                'onu_authorized_at' => now(),
                'onu_authorized_by' => $request->user()?->id,
            ]);
        } catch (\Throwable $e) {
            // Never let bookkeeping undo a successful authorization.
            Log::error('[smartolt] failed to store ONU on service ' . $service->id . ': ' . $e->getMessage());
        }
    }

    private function statusFor(RuntimeException $e): int
    {
        $code = $e->getCode();

        return in_array($code, [400, 403, 404, 409, 422, 429, 502, 503], true) ? (int) $code : 502;
    }

    private function fail(RuntimeException $e)
    {
        return response()->json([
            'success' => false,
            'message' => $e->getMessage(),
        ], $this->statusFor($e));
    }
}
