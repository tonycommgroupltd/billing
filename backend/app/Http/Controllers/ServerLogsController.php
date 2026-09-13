<?php

namespace App\Http\Controllers;

use App\Services\ServerLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class ServerLogsController extends Controller
{
    public function __construct(private ServerLogService $logs)
    {
        $this->middleware('internal.server.logs');
    }

    public function catalog(Request $request)
    {
        if ($request->input('target') === 'standby') {
            return response()->json($this->peerJson('catalog', $request));
        }

        return response()->json($this->logs->catalog());
    }

    public function tail(Request $request)
    {
        $request->validate([
            'source' => 'required|string|max:64',
            'lines' => 'nullable|integer|min:1|max:2000',
        ]);

        if ($request->input('target') === 'standby') {
            return response()->json($this->peerJson('tail', $request));
        }

        return response()->json(
            $this->logs->tail($request->input('source'), (int) $request->input('lines', 200))
        );
    }

    public function reportFile(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'lines' => 'nullable|integer|min:1|max:2000',
        ]);

        if ($request->input('target') === 'standby') {
            return response()->json($this->peerJson('report', $request));
        }

        return response()->json(
            $this->logs->readReportFile($request->input('name'), (int) $request->input('lines', 200))
        );
    }

    private function peerJson(string $endpoint, Request $request): array
    {
        if (config('ha.server_role') === 'standby') {
            abort(400, 'Peer fetch is only available on production');
        }

        $base = rtrim(config('ha.standby_api_url', 'http://102.0.15.254/api/v1'), '/');
        $key = config('ha.server_logs_peer_key');
        if (!$key) {
            abort(503, 'Standby log peer key not configured');
        }

        $path = match ($endpoint) {
            'catalog' => '/server-logs/catalog',
            'tail' => '/server-logs/tail',
            'report' => '/server-logs/report',
            default => abort(400, 'Invalid peer endpoint'),
        };

        $params = $request->except('target');
        $response = Http::timeout(60)
            ->withHeaders(['X-Server-Logs-Key' => $key, 'Accept' => 'application/json'])
            ->get($base . $path, $params);

        if (!$response->successful()) {
            abort($response->status(), $response->json('message') ?? 'Standby log fetch failed');
        }

        return $response->json();
    }
}
