<?php

namespace App\Http\Controllers;

use App\Services\MikrotikEmergencyBypassService;
use App\Services\NotificationService;
use Illuminate\Http\Request;

class EmergencyBypassController extends Controller
{
    public function __construct(private MikrotikEmergencyBypassService $bypass)
    {
        $this->middleware(['auth:api', 'role:super-administrator|administrator']);
    }

    public function status()
    {
        return response()->json(array_merge(
            $this->bypass->dashboardStatus(),
            ['sync_progress' => $this->bypass->syncProgress()]
        ));
    }

    public function syncProgress()
    {
        return response()->json($this->bypass->syncProgress() ?? ['active' => false]);
    }

    public function setMode(Request $request)
    {
        $request->validate([
            'mode' => 'required|in:radius,api',
            'active_only' => 'sometimes|boolean',
        ]);

        set_time_limit(600);

        try {
            if ($request->input('mode') === 'api') {
                $data = $this->bypass->switchToApiMode((bool) $request->boolean('active_only'));
            } else {
                $data = $this->bypass->switchToRadiusMode();
            }

            $actor = auth()->user()?->name ?? 'Admin';
            $modeLabel = $request->input('mode') === 'api' ? 'Mikrotik API bypass' : 'RADIUS';
            try {
                NotificationService::notifyRoles(
                    ['super-administrator', 'administrator'],
                    'ha',
                    'PPP auth mode changed',
                    "{$actor} switched PPP auth to {$modeLabel}.",
                    'alert-circle',
                    '/admin/administration/high-availability'
                );
            } catch (\Throwable $e) {
                report($e);
            }

            return response()->json([
                'message' => $request->input('mode') === 'api'
                    ? 'PPP auth switched to Mikrotik API (local secrets).'
                    : 'PPP auth restored to RADIUS.',
                'data' => $data,
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'error' => true,
            ], 500);
        }
    }

    public function sync(Request $request)
    {
        $request->validate([
            'active_only' => 'sometimes|boolean',
        ]);

        set_time_limit(600);

        try {
            $result = $this->bypass->syncAll((bool) $request->boolean('active_only'));

            return response()->json([
                'message' => 'PPP secrets synced to Mikrotik.',
                'data' => $result,
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'error' => true,
            ], 500);
        }
    }
}
