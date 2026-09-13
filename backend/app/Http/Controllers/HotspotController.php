<?php

namespace App\Http\Controllers;

use App\Services\HotspotIntegrationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

class HotspotController extends Controller
{
    public function __construct(private HotspotIntegrationService $hotspot)
    {
    }

    public function dashboard(Request $request): JsonResponse
    {
        return $this->respond(fn () => $this->hotspot->dashboard($request->user()));
    }

    public function routers(Request $request): JsonResponse
    {
        return $this->respond(fn () => $this->hotspot->routers($request->user()));
    }

    public function users(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'page' => 'nullable|integer|min:1',
            'per_page' => 'nullable|integer|min:10|max:100',
            'search' => 'nullable|string|max:100',
            'status' => 'nullable|in:active,expired,disabled',
        ]);
        return $this->respond(fn () => $this->hotspot->users($validated, $request->user()));
    }

    public function sessions(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'router_id' => ['nullable', 'string', 'max:40', 'regex:/^(all)$|^(mwananchi|tpay):\\d+$|^\\d+$/i'],
        ]);
        $routerId = (string) ($validated['router_id'] ?? 'all');
        return $this->respond(
            fn () => $this->hotspot->sessions($routerId, $request->user())
        );
    }

    public function siteEarnings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'days' => 'nullable|integer|min:1|max:90',
        ]);
        return $this->respond(fn () => $this->hotspot->siteEarnings($validated, $request->user()));
    }

    public function authLocations(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'search' => 'nullable|string|max:100',
            'limit' => 'nullable|integer|min:10|max:200',
        ]);
        return $this->respond(fn () => $this->hotspot->authLocations($validated, $request->user()));
    }

    public function liveAuth(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'search' => 'nullable|string|max:100',
        ]);
        return $this->respond(fn () => $this->hotspot->liveAuth($validated, $request->user()));
    }

    public function logs(Request $request): JsonResponse
    {
        return $this->respond(fn () => $this->hotspot->logs($request->user()));
    }

    public function logTail(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'file' => ['required', 'string', 'max:150', 'regex:/^[A-Za-z0-9._-]+\.log$/'],
            'lines' => 'nullable|integer|min:10|max:1000',
        ]);
        return $this->respond(fn () => $this->hotspot->logTail(
            $validated['file'],
            (int) ($validated['lines'] ?? 200),
            $request->user()
        ));
    }

    public function setUserStatus(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'string', 'max:60'],
            'disabled' => 'required|boolean',
            'router_id' => ['nullable', 'string', 'max:40', 'regex:/^(mwananchi|tpay):\\d+$|^\\d+$/'],
        ]);
        return $this->respond(
            fn () => $this->hotspot->setUserStatus($validated, $request->user())
        );
    }

    public function disconnectSession(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'router_id' => ['required', 'string', 'max:40', 'regex:/^(mwananchi|tpay):\\d+$|^\\d+$/'],
            'session_id' => 'required|string|max:100',
        ]);
        return $this->respond(
            fn () => $this->hotspot->disconnectSession($validated, $request->user())
        );
    }

    private function respond(callable $callback): JsonResponse
    {
        try {
            return response()->json($callback());
        } catch (RuntimeException $e) {
            $status = $e->getCode();
            if ($status < 400 || $status > 599) $status = 502;
            return response()->json([
                'success' => false,
                'error' => $e->getMessage(),
            ], $status);
        }
    }
}
