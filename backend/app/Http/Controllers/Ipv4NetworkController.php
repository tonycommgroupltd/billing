<?php

namespace App\Http\Controllers;

use App\Models\Ipv4Network;
use App\Models\Router;
use App\Services\Ipv4ScanService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class Ipv4NetworkController extends Controller
{
    public function __construct(private Ipv4ScanService $scanService)
    {
        $this->middleware('auth:api');
        $this->middleware('role:super-administrator|administrator');
    }

    public function index()
    {
        $networks = Ipv4Network::query()
            ->where('type', 'wan_block')
            ->where('cidr', 'like', '102.0.%')
            ->with('router:id,title,host,nas_ip')
            ->orderBy('router_id')
            ->orderBy('title')
            ->get();

        return response()->json(['networks' => $networks]);
    }

    public function scan(Request $request)
    {
        $refresh = filter_var($request->query('refresh', false), FILTER_VALIDATE_BOOLEAN);
        $payload = $this->scanService->scanAll($refresh);

        return response()->json($payload);
    }

    public function showScan(int $id, Request $request)
    {
        $network = Ipv4Network::with('router')->findOrFail($id);
        $refresh = filter_var($request->query('refresh', false), FILTER_VALIDATE_BOOLEAN);

        if ($refresh) {
            $host = $network->api_host ?: $network->router?->host;
            if ($host) {
                cache()->forget('ipv4_router_snapshot_' . md5($host));
            }
        }

        return response()->json($this->scanService->scanNetworkModel($network, $refresh));
    }

    public function summary()
    {
        return response()->json($this->scanService->dashboardStats());
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'router_id' => 'nullable|exists:routers,id',
            'title' => 'required|string|max:255',
            'cidr' => ['required', 'string', 'max:64', 'regex:/^102\.0\./'],
            'gateway' => 'nullable|ip',
            'purpose' => 'nullable|string|max:255',
            'location' => 'nullable|string|max:255',
            'type' => 'nullable|in:wan_block',
            'api_host' => 'nullable|ip',
            'reserved_ips' => 'nullable|array',
            'ip_assignments' => 'nullable|array',
            'scan_mode' => 'nullable|in:enumerate',
            'enabled' => 'nullable|boolean',
            'notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
        }

        $network = Ipv4Network::create(array_merge(
            ['type' => 'wan_block', 'scan_mode' => 'enumerate'],
            $validator->validated()
        ));
        cache()->forget('ipv4_scan_v4');

        return response()->json(['message' => 'Network added', 'network' => $network], 201);
    }

    public function update(Request $request, int $id)
    {
        $network = Ipv4Network::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'router_id' => 'nullable|exists:routers,id',
            'title' => 'sometimes|string|max:255',
            'cidr' => ['sometimes', 'string', 'max:64', 'regex:/^102\.0\./'],
            'gateway' => 'nullable|ip',
            'purpose' => 'nullable|string|max:255',
            'location' => 'nullable|string|max:255',
            'type' => 'nullable|in:wan_block',
            'api_host' => 'nullable|ip',
            'reserved_ips' => 'nullable|array',
            'ip_assignments' => 'nullable|array',
            'scan_mode' => 'nullable|in:enumerate',
            'enabled' => 'nullable|boolean',
            'notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
        }

        $network->update($validator->validated());
        cache()->forget('ipv4_scan_v4');

        return response()->json(['message' => 'Network updated', 'network' => $network]);
    }

    public function destroy(int $id)
    {
        Ipv4Network::findOrFail($id)->delete();
        cache()->forget('ipv4_scan_v4');

        return response()->json(['message' => 'Network deleted']);
    }

    public function routerOptions()
    {
        $routers = Router::query()
            ->select('id', 'title', 'host', 'nas_ip', 'api')
            ->orderBy('title')
            ->get();

        return response()->json(['routers' => $routers]);
    }
}
