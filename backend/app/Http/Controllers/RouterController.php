<?php

namespace App\Http\Controllers;

use App\Models\Router;
use App\Services\RouterBandwidthService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use App\Http\Resources\RouterCollection;
use App\Models\Service;
use RouterOS\Client;
use RouterOS\Config;
use RouterOS\Query;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class RouterController extends Controller
{
    /**
     * Create a new AuthController instance.
     *
     * @return void
     */
    public function __construct()
    {
        $this->middleware('auth:api', ['except' => ['reconSecrets']]);
    }
    /**
     * Display a listing of the resource.
     */
    public function index()
    {
        //
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create()
    {
        //
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        $messages = [
            'required' => 'The :attribute field is required.',
            'unique'    => 'The :attribute should be unique.',
        ];

        $validator = Validator::make($request->all(), [
            'title' => 'required|string|unique:routers',
            'host' => 'required|string|unique:routers',
        ], $messages);

        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
        }
        $router = Router::create($request->all());
        return response()->json([
            'message' => 'Router added',
            'router' => $router
        ], 201);
    }

    /**
     * Display the specified resource.
     */
    public function show($id)
    {
        $router = Router::find($id);
        $interfaces = array();
        if ($router->host !== NULL && $router->api_login !== NULL && $router->api_password !== NULL) {
            try {
                $config = new Config([
                    'host' => $router->host,
                    'user' => $router->api_login,
                    'pass' => $router->api_password,
                    'port' => (int)$router->api_port,
                ]);
                // Initiate client with config object
                $client = new Client($config);

                // Build interface query
                $query =
                    (new Query('/interface/ethernet/print'));

                // Ask for interface details
                $response = $client->query($query)->read();

                foreach ($response as $data) {
                    array_push($interfaces, array('value' => $data['name'], 'label' => $data['default-name']));
                    //print_r($data['name']);
                }
            } catch (\Exception $e) {
                // Log or handle error
                Log::warning('MikroTik API unreachable: ' . $e->getMessage());
            }
        }

        return response()->json([
            'router' => $router,
            'interfaces' => $interfaces
        ], 200);
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(Router $router)
    {
        //
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, $id)
    {
        $messages = [
            'required' => 'The :attribute field is required.',
            'unique'    => 'The :attribute should be unique.',
        ];

        $validator = Validator::make($request->all(), [
            'title' => 'required|string|unique:routers,title,' . $id,
            'host' => 'required|string|unique:routers,host,' . $id,
        ], $messages);

        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
        }

        $router = Router::find($id);
        $router->fill($request->all())->save();
        return response()->json([
            'message' => 'Router saved',
            'router' => $router
        ], 200);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy($id)
    {
        $router = Router::find($id);
        $router->delete();
        return response()->json([
            'message' => 'Router deleted'
        ], 200);
    }

    public function ajax()
    {
        $routers = (new Router)->newQuery();
        if (request()->has('q')) {
            $routers->where(function ($query) {
                $query->where('title', 'Like', '%' . request()->input('q') . '%');
            });
        }
        $per_page = request('per_page', 10);
        $sort = request('sort', 'asc');
        $sortCol = request('sort_col', 'id');
        $result = new RouterCollection($routers->orderBy($sortCol, $sort)->paginate($per_page));

        //return $result;
        return response()->json([
            'page' => $result->currentPage(),
            'per_page' => $result->perPage(),
            'total' => $result->total(),
            'total_pages' => ceil($result->total() / $result->perPage()),
            'data' => $result,
        ]);
    }

    public function routerMonitor($id)
    {
        $interface = request('interface', null);
        $router = Router::find($id);
        if (!$router) {
            return response()->json(['message' => 'Router not found'], 404);
        }

        try {
            $sample = app(RouterBandwidthService::class)->liveSample($router, $interface ?: null);
            // Chart.js realtime expects [{x,y} upload/tx, {x,y} download/rx] matching View.js labels historically;
            // View labels dataset0=Upload dataset1=Download — map tx→0 rx→1 for consistency with WAN upload/download.
            return response()->json([
                [
                    'x' => $sample['sampled_at'],
                    'y' => $sample['tx_bps'],
                ],
                [
                    'x' => $sample['sampled_at'],
                    'y' => $sample['rx_bps'],
                ],
                'meta' => [
                    'interface' => $sample['interface'],
                    'rx_bps' => $sample['rx_bps'],
                    'tx_bps' => $sample['tx_bps'],
                ],
            ]);
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 404);
        }
    }

    public function bandwidthOverview()
    {
        return response()->json([
            'routers' => app(RouterBandwidthService::class)->overview(),
        ]);
    }

    public function bandwidthHistory($id)
    {
        $router = Router::find($id);
        if (!$router) {
            return response()->json(['message' => 'Router not found'], 404);
        }

        $range = request('range', '7d');
        if (!in_array($range, ['1h', '24h', '7d'], true)) {
            $range = '7d';
        }

        $history = app(RouterBandwidthService::class)->history($router, $range);

        return response()->json([
            'router' => [
                'id' => $router->id,
                'title' => $router->title,
                'host' => $router->host,
                'monitor_interface' => $router->monitor_interface,
                'customer_interface' => $router->customer_interface,
            ],
            'range' => $range,
            'interface' => $history['wan_interface'] ?? $history['interface'] ?? null,
            'wan_interface' => $history['wan_interface'] ?? null,
            'customer_interface' => $history['customer_interface'] ?? null,
            'points' => $history['points'],
        ]);
    }

    public function viewUpdatePing()
    {
        $host = request('host', '');
        exec("ping -c 3 $host", $output, $result);
        print_r($output);
    }

    public function ping()
    {
        echo $this->GetPing('102.68.79.177');
    }

    private function GetPing($ip = NULL)
    {
        if (empty($ip)) {
            $ip = $_SERVER['REMOTE_ADDR'];
        }
        if (getenv("OS") == "Windows_NT") {
            //$ping=explode(",", $exec);
            return 0; //Maximum = 78ms
        } else {
            $exec = exec("ping -c 3 -s 64 -t 64 " . $ip);
            $tmp = explode('=', $exec);
            $tmp = end($tmp);
            $array = explode("/", $tmp);
            return ceil($array[1]) . 'ms';
        }
    }

    public function apiStatus($id)
    {
        $router = Router::find($id);
        $username = request('username', '');
        $password = request('password', '');
        $port = request('port', '');
        $config = new Config([
            'host' => $router->host,
            'user' => $username,
            'pass' => $password,
            'port' => (int)$port,
        ]);
        // Initiate client with config object
        try {
            return response()->json(['client' => new Client($config)]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()]);
        }
    }

    public function recon()
    {
        /*$recon = DB::table('recon')->where("status", 0)->where("amount", ">", 0)->get();
        foreach ($recon as $data){
            echo Carbon::parse($data->date.'-05-2024').'<br/>';
        DB::table('services')
        ->where('mikrotik_name', $data->name)
        ->limit(1)
        ->update(array('start_date' => Carbon::parse($data->date.'-05-2024'), 'price' => $data->amount));*/
        $duplicates = DB::table('customers')
            ->select('phone_number', DB::raw('COUNT(*) as `count`'))
            ->groupBy('phone_number')
            ->havingRaw('COUNT(*) > 1')
            ->get();
        echo 'Ja';
        foreach ($duplicates as $data) {
            print_r($data);
            echo '<br/>';
        }
    }

    public function reconStatus()
    {
        $secrets = DB::table('add_secret')->get();

        foreach ($secrets as $data) {
            $service = Service::where("mikrotik_name", $data->name)->first();
            if ($service && $service->id) {
                if ($data->disabled === 'false') {
                    $service->status = ['label' => 'Active', 'value' => 2];
                } else if ($data->disabled === 'true') {
                    $service->status = ['label' => 'Disabled', 'value' => 1];
                }
                $service->save();
            } else {
                echo $data->name;
                echo '<br/>';
            }
        }
    }

    public function reconService() {}

    public function allRouters(Request $request)
    {
        $has_more = false;
        $routers = (new Router)->newQuery();
        $per_page = request('per_page', 10);
        if (request()->has('q')) {
            $routers->where(function ($query) {
                $query->where('title', 'Like', '%' . request()->input('q') . '%');
            });
        }
        $results = new RouterCollection($routers->orderBy('title', 'ASC')->paginate($per_page));

        if (request('page') < $results->lastPage()) {
            $has_more = true;
        }

        return response()->json([
            'options' => $results,
            'has_more' => $has_more
        ]);
    }

    public function allProfiles(Request $request, $id)
    {
        $router = Router::find($id);
        $profiles = array();
        $config = new Config([
            'host' => $router->host,
            'user' => $router->api_login,
            'pass' => $router->api_password,
            'port' => (int)$router->api_port,
        ]);
        try {
            // Initiate client with config object
            $client = new Client($config);
            // Build resource query
            $query =
                (new Query('/ppp/profile/print'));
            $response = $client->query($query)->read();

            foreach ($response as $data) {
                array_push($profiles, array('value' => $data['.id'], 'label' => $data['name']));
            }
        } catch (\Exception $e) {
            $response = $e->getMessage();
        }


        return response()->json($profiles);
    }

    public function reconSecrets($router_id)
    {
        $router = Router::find($router_id);
        if ($router) {
            $config = new Config([
                'host' => $router->host,
                'user' => $router->api_login,
                'pass' => $router->api_password,
                'port' => (int)$router->api_port,
            ]);

            $client = new Client($config);
            // ✅ Fetch only enabled secrets
            $query = (new Query('/ppp/secret/print'))
                ->where('disabled', 'false');   // or '0' works too
            $secrets = $client->query($query)->read();

            foreach ($secrets as $secret) {
                $service = Service::where('mikrotik_name', $secret['name'])->first();

                if (!$service) {
                    echo "Username: {$secret['name']} | Service: Not found<br>";
                    continue; // skip to next secret
                }

                // Service exists, check status
                if (in_array($service->status['value'], [1, 3]) && $service->billing_type['value'] == 1) {
                    echo "Username: {$secret['name']} | Service status: {$service->status['label']}<br>";
                    // 🔒 Disable the secret in MikroTik
                    try {
                        $disableQuery = (new Query('/ppp/secret/set'))
                            ->equal('numbers', $secret['.id'])   // MikroTik internal ID
                            ->equal('disabled', 'true');

                        $client->query($disableQuery)->read();

                        echo "→ Secret {$secret['name']} has been DISABLED<br>";
                    } catch (\Exception $e) {
                        // Capture error message
                        echo "⚠️ Failed to disable secret {$secret['name']}: " . $e->getMessage() . "<br>";
                    }
                }
            }
        }
    }
}
