<?php

namespace App\Http\Controllers;

use App\Services\StandbyStatusService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class StandbyStatusController extends Controller
{
    public function __construct(private StandbyStatusService $status)
    {
        $this->middleware('internal.server.logs');
    }

    public function show()
    {
        return response()->json($this->status->snapshot());
    }

    public static function fetchFromPeer(): ?array
    {
        if (config('ha.server_role') === 'standby') {
            return null;
        }

        $base = rtrim(config('ha.standby_api_url', 'http://102.0.15.254/api/v1'), '/');
        $key = config('ha.server_logs_peer_key');
        if (!$key) {
            return null;
        }

        try {
            // Keep short — dashboard-stats waits on this; long timeouts freeze the cards.
            $response = Http::timeout(3)
                ->connectTimeout(2)
                ->withHeaders(['X-Server-Logs-Key' => $key, 'Accept' => 'application/json'])
                ->get($base . '/standby-status');

            if (!$response->successful()) {
                return null;
            }

            return $response->json();
        } catch (\Throwable $e) {
            return null;
        }
    }
}
