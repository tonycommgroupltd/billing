<?php

namespace App\Http\Controllers;

use App\Http\Resources\PppoeSessionCollection;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use App\Models\Service;
use App\Models\Plan;
use App\Models\Router;
use App\Http\Resources\ServiceCollection;
use App\Messages\AccountCreationMessage;
use App\Messages\InvoiceGenerateMessage;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\InvoiceDetail;
use App\Models\MessageTemplate;
use App\Models\Payment;
use App\Models\PppoeSession;
use App\Models\Radacct;
use App\Models\ServiceBillDateChange;
use App\Models\ServiceChangeLog;
use App\Models\Statistic;
use App\Services\MikrotikEmergencyBypassService;
use App\Services\OnuWebAccessService;
use Carbon\CarbonPeriod;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use RouterOS\Client;
use RouterOS\Config;
use RouterOS\Query;

class ServiceController extends Controller
{
    /**
     * Create a new AuthController instance.
     *
     * @return void
     */
    public function __construct()
    {
        $this->middleware('auth:api');
    }

    /**
     * Display the specified resource.
     */
    public function show($id)
    {
        $service = Service::leftJoin('plans', 'plans.id', '=', 'services.plan_id')->select('services.*', 'plans.title', 'plans.id AS plan_id')->find($id);
        if ($service) {
            $service->last_due_date = Invoice::where('services_id', $service->id)
                ->whereNull('deleted_at')
                ->orderByDesc('due_date')
                ->value('due_date');
        }

        return response()->json([
            'service' => $service
        ], 200);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function storeBkp(Request $request)
    {
        try {
            $plan = Plan::find($request->plan_id);
            if ($plan) {
                $messages = [
                    'required' => 'The :attribute field is required.',
                    'unique'    => 'The :attribute should be unique.',
                    'regex' => 'Invalid characters in field mikrotik name (allowed only A-Z, a-z, 0-9 and dash).'
                ];

                $validator = Validator::make($request->all(), [
                    'plan_id' => 'required',
                    'price' => 'required|numeric|min:1',
                    'start_date' => 'required',
                    'mikrotik_name' => [
                        'required',
                        'regex:/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/',
                        'unique:services'
                        /*Rule::unique('services')->where(function ($query) use ($plan) {
                        return $query->where('router_id', $plan->router_id);
                    }),*/
                    ],
                    'mikrotik_password' => 'required|min:4',
                    'billing_type' => 'required',
                    'billing_period' => 'required',
                    'status' => 'required',
                ], $messages);

                if ($validator->fails()) {
                    return response()->json($validator->errors(), 422);
                }

                DB::beginTransaction();

                $request['router_id'] = $plan->router_id;

                if ($request->status['value'] === 0) {
                    $service = Service::create($request->all());
                    if ($request->installation) $this->sendAccountCreateMessage($service);
                    if ($request->generate_invoice) $this->generateInvoice($service, $request);
                    DB::commit();
                    return response()->json([
                        'message' => 'Service added',
                        'service' => $service,
                        'error' => false
                    ], 201);
                }

                $router = Router::find($plan->router_id);
                if ($router) {

                    if ($router->authorization['value'] === 3) {
                        $service = Service::create($request->all());
                        if ($request->installation) $this->sendAccountCreateMessage($service);
                        if ($request->generate_invoice) $this->generateInvoice($service, $request);
                        DB::commit();
                        return response()->json([
                            'message' => 'Service added',
                            'service' => $service,
                            'error' => false
                        ], 201);
                    }

                    $config = new Config([
                        'host' => $router->host,
                        'user' => $router->api_login,
                        'pass' => $router->api_password,
                        'port' => (int)$router->api_port,
                    ]);
                    // Initiate client with config object
                    $client = new Client($config);
                    // Build resource query
                    $query =
                        (new Query('/ppp/secret/add'))
                        ->equal('name', $request->mikrotik_name)
                        ->equal('password', $request->mikrotik_password)
                        ->equal('profile', $plan->rate_limit['label'])
                        ->equal('disabled', $request->status['value'] === 1 ? 'yes' : 'no')
                        ->equal('service', 'pppoe');

                    $response = $client->query($query)->read();

                    if (isset($response['after']['message'])) {
                        return response()->json([
                            'message' => ucfirst($response['after']['message']),
                            'error' => true
                        ], 200);
                    } elseif (isset($response['after']['ret'])) {
                        $request['mikrotik_id'] = $response['after']['ret'];
                        $service = Service::create($request->all());
                        if ($request->installation) $this->sendAccountCreateMessage($service);
                        if ($request->generate_invoice) $this->generateInvoice($service, $request);
                        DB::commit();
                        return response()->json([
                            'message' => 'Service added',
                            'service' => $service,
                            'error' => false
                        ], 201);
                    } else {
                        return response()->json([
                            'message' => 'Internal server error',
                            'error' => true
                        ], 200);
                    }
                } else {
                    $customValidator = ValidationException::withMessages([
                        'router' => __('Router not found in record!'),
                    ]);

                    return response()->json($customValidator->errors(), 422);
                }
            } else {
                $customValidator = ValidationException::withMessages([
                    'plan' => __('Plan not found in record!'),
                ]);

                return response()->json($customValidator->errors(), 422);
            }
        } catch (\Exception $e) {
            DB::rollBack();
            $response = $e->getMessage();
            return response()->json([
                'message' => $response,
                'error' => true
            ], 200);
        }
    }

    public function store(Request $request)
    {
        DB::beginTransaction();

        try {

            // -------------------------
            // Validate Plan
            // -------------------------
            $plan = Plan::find($request->plan_id);

            if (!$plan) {
                throw ValidationException::withMessages([
                    'plan' => 'Plan not found in record!',
                ]);
            }

            // -------------------------
            // Validation rules
            // -------------------------
            $messages = [
                'required' => 'The :attribute field is required.',
                'unique'   => 'The :attribute should be unique.',
                'regex'    => 'Invalid mikrotik name (A-Z, a-z, 0-9 and dash only).'
            ];

            $validator = Validator::make($request->all(), [
                'plan_id' => 'required',
                'price' => 'required|numeric|min:1',
                'start_date' => 'required',

                'mikrotik_name' => [
                    'required',
                    'regex:/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/',
                    'unique:services,mikrotik_name'
                ],

                'mikrotik_password' => 'required|min:4',
                'billing_type' => 'required',
                'billing_period' => 'required',
                'status' => 'required',
            ], $messages);

            if ($validator->fails()) {
                return response()->json($validator->errors(), 422);
            }

            // -------------------------
            // Normalize status safely
            // -------------------------
            $status = is_array($request->status)
                ? $request->status['value']
                : $request->status;

            // -------------------------
            // Attach router id
            // -------------------------
            $request->merge([
                'router_id' => $plan->router_id
            ]);

            // -------------------------
            // SIMPLE MODE (no Mikrotik provisioning)
            // -------------------------
            if ((int)$status === 0) {

                $service = Service::create($request->all());
                $this->normalizeInstallationBillTo($service, $request);

                if ($request->installation) {
                    $this->sendAccountCreateMessage($service);
                }

                if ($request->generate_invoice) {
                    $this->generateInvoice($service, $request);
                }

                DB::commit();

                return response()->json([
                    'message' => 'Service added',
                    'service' => $service,
                    'error' => false
                ], 201);
            }

            // -------------------------
            // Router check
            // -------------------------
            $router = Router::find($plan->router_id);

            if (!$router) {
                throw ValidationException::withMessages([
                    'router' => 'Router not found in record!',
                ]);
            }

            // -------------------------
            // Bypass Mikrotik (radius auth)
            // -------------------------
            if ((int)$router->authorization['value'] === 3) {

                $service = Service::create($request->all());
                $this->normalizeInstallationBillTo($service, $request);

                if (mikrotik_api_bypass_active()) {
                    app(MikrotikEmergencyBypassService::class)->syncService($service);
                }

                if ($request->installation) {
                    $this->sendAccountCreateMessage($service);
                }

                if ($request->generate_invoice) {
                    $this->generateInvoice($service, $request);
                }

                DB::commit();

                return response()->json([
                    'message' => 'Service added',
                    'service' => $service,
                    'error' => false
                ], 201);
            }

            // -------------------------
            // Mikrotik provisioning
            // -------------------------
            $config = new Config([
                'host' => $router->host,
                'user' => $router->api_login,
                'pass' => $router->api_password,
                'port' => (int) $router->api_port,
            ]);

            $client = new Client($config);

            $query = (new Query('/ppp/secret/add'))
                ->equal('name', $request->mikrotik_name)
                ->equal('password', $request->mikrotik_password)
                ->equal('profile', $plan->rate_limit['label'])
                ->equal('disabled', ((int)$status === 1 ? 'yes' : 'no'))
                ->equal('service', 'pppoe');

            $response = $client->query($query)->read();

            // -------------------------
            // Mikrotik error
            // -------------------------
            if (isset($response['after']['message'])) {

                DB::rollBack();

                return response()->json([
                    'message' => ucfirst($response['after']['message']),
                    'error' => true
                ], 400);
            }

            // -------------------------
            // Mikrotik success
            // -------------------------
            if (isset($response['after']['ret'])) {

                $request->merge([
                    'mikrotik_id' => $response['after']['ret']
                ]);

                $service = Service::create($request->all());
                $this->normalizeInstallationBillTo($service, $request);

                if ($request->installation) {
                    $this->sendAccountCreateMessage($service);
                }

                if ($request->generate_invoice) {
                    $this->generateInvoice($service, $request);
                }

                DB::commit();

                return response()->json([
                    'message' => 'Service added',
                    'service' => $service,
                    'error' => false
                ], 201);
            }

            // -------------------------
            // Unknown Mikrotik response
            // -------------------------
            DB::rollBack();

            return response()->json([
                'message' => 'Internal server error',
                'error' => true
            ], 500);
        } catch (\Throwable $e) {

            DB::rollBack();

            return response()->json([
                'message' => $e->getMessage(),
                'error' => true
            ], 500);
        }
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, $id)
    {
        $messages = [
            'required' => 'The :attribute field is required.',
            'unique'    => 'The :attribute should be unique.',
            'regex' => 'Invalid characters in field mikrotik name (allowed only A-Z, a-z, 0-9 and dash).'
        ];

        $validator = Validator::make($request->all(), [
            'plan_id' => 'required',
            'price' => 'required|numeric|min:1',
            'mikrotik_name' => ['regex:/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/', 'required', 'unique:services,mikrotik_name,' . $id],
            'mikrotik_password' => 'required|min:4',
            'status' => 'required',
        ], $messages);

        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
        }

        $service = Service::find($id);
        if (!$service) {
            return response()->json([
                'message' => 'Service not found',
                'error' => true,
            ], 404);
        }

        $plan = Plan::find($request->plan_id);
        if (!$plan) {
            $customValidator = ValidationException::withMessages([
                'plan' => __('Plan not found in record!'),
            ]);

            return response()->json($customValidator->errors(), 422);
        }

        $router = Router::find($plan->router_id);
        if (!$router) {
            $customValidator = ValidationException::withMessages([
                'router' => __('Router not found in record!'),
            ]);

            return response()->json($customValidator->errors(), 422);
        }

        $oldStatus = (int) ($service->status['value'] ?? 0);
        $credentialsChanged = $service->mikrotik_name !== $request->mikrotik_name
            || $service->mikrotik_password !== $request->mikrotik_password
            || (int) $service->plan_id !== (int) $request->plan_id;

        try {
            $this->logChanges($request, $id);
            $this->syncOpenInvoiceOnPriceChange($service, $request);

            $service->fill($request->all());
            $service->save();

            $service = $service->fresh();
            $newStatus = (int) ($service->status['value'] ?? 0);

            if ((int) ($router->authorization['value'] ?? 0) === 3) {
                $this->applyRadiusServiceNetworkState($service, $router, $oldStatus, $newStatus, $credentialsChanged);
            } else {
                $this->applyMikrotikApiServiceUpdate($service, $router, $plan, $request, $oldStatus, $newStatus, $credentialsChanged);
            }

            return response()->json([
                'message' => 'Service saved',
                'service' => $service->fresh(),
                'error' => false,
            ], 200);
        } catch (\Throwable $e) {
            Log::warning('Service update failed', [
                'service_id' => $id,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'message' => $e->getMessage(),
                'error' => true,
            ], 200);
        }
    }

    private function syncOpenInvoiceOnPriceChange(Service $service, Request $request): void
    {
        $invoice = Invoice::where('services_id', $service->id)
            ->where('status->value', 1)
            ->latest()
            ->first();

        if (!$invoice || (float) $service->price === (float) $request->price) {
            return;
        }

        $paymentSum = Payment::where('invoice_id', $invoice->id)->sum('sum');
        $invoice->total = $request->price;

        if ($paymentSum >= $request->price) {
            $invoice->status = [
                'label' => 'Paid',
                'value' => 2,
            ];
            $request->merge([
                'status' => [
                    'label' => 'Active',
                    'value' => 2,
                ],
            ]);
        }

        $invoice->save();
    }

    private function applyRadiusServiceNetworkState(
        Service $service,
        Router $router,
        int $oldStatus,
        int $newStatus,
        bool $credentialsChanged
    ): void {
        if (mikrotik_api_bypass_active()) {
            $bypass = app(MikrotikEmergencyBypassService::class);
            $bypass->syncService($service);

            if ($newStatus !== $oldStatus) {
                match ($newStatus) {
                    2 => $bypass->pushServiceActive($service),
                    1 => $bypass->pushServiceDisabled($service),
                    3 => $bypass->pushServiceExpired($service),
                    default => null,
                };
            } elseif ($credentialsChanged && $newStatus === 2) {
                $bypass->pushServiceActive($service);
            }

            return;
        }

        if ($newStatus !== $oldStatus) {
            match ($newStatus) {
                2 => activate_secret($service),
                1 => disable_secret($service),
                3 => expire_secret($service),
                default => radius_disconnect_user($router, $service->mikrotik_name),
            };

            return;
        }

        if (!$credentialsChanged) {
            return;
        }

        if (in_array($newStatus, [1, 3], true)) {
            radius_disconnect_user($router, $service->mikrotik_name);
            mikrotik_kick_pppoe($router, $service->mikrotik_name);

            return;
        }

        radius_disconnect_user($router, $service->mikrotik_name);
    }

    private function applyMikrotikApiServiceUpdate(
        Service $service,
        Router $router,
        Plan $plan,
        Request $request,
        int $oldStatus,
        int $newStatus,
        bool $credentialsChanged
    ): void {
        $statusVal = $newStatus;
        $profile = $statusVal === 2 ? ($plan->rate_limit['label'] ?? 'default') : 'EXPIRED';
        $disabled = $statusVal === 0 ? 'yes' : 'no';

        $config = new Config([
            'host' => $router->host,
            'user' => $router->api_login,
            'pass' => $router->api_password,
            'port' => (int) $router->api_port,
        ]);

        $client = new Client($config);
        $secretId = $service->mikrotik_id;

        if (empty($secretId)) {
            $found = $client->query(
                (new Query('/ppp/secret/print'))->where('name', $service->mikrotik_name)
            )->read();
            $secretId = $found[0]['.id'] ?? null;
        }

        if (empty($secretId)) {
            throw new \RuntimeException('PPP secret not found on router.');
        }

        $response = $client->query(
            (new Query('/ppp/secret/set'))
                ->equal('.id', $secretId)
                ->equal('name', $request->mikrotik_name)
                ->equal('password', $request->mikrotik_password)
                ->equal('profile', $profile)
                ->equal('disabled', $disabled)
        )->read();

        if (isset($response['after']['message'])) {
            throw new \RuntimeException(ucfirst($response['after']['message']));
        }

        if (in_array($statusVal, [1, 3], true)) {
            mikrotik_kick_pppoe($router, $request->mikrotik_name);
        } elseif ($statusVal === 2 && ($oldStatus !== 2 || $credentialsChanged)) {
            mikrotik_kick_pppoe($router, $request->mikrotik_name);
        }
    }

    public function updateBillDate(Request $request, $id)
    {
        $messages = [
            'required' => 'The :attribute field is required.',
            'unique'    => 'The :attribute should be unique.',
            'regex' => 'Invalid characters in field mikrotik name (allowed only A-Z, a-z, 0-9 and dash).'
        ];

        $dueDateInput = $request->input('due_date', $request->input('bill_to'));

        $validator = Validator::make([
            'due_date' => $dueDateInput,
        ], [
            'due_date' => [
                'required',
                'date',
            ],
        ], $messages);

        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
        }

        $service = Service::find($id);
        if (!$service) {
            return response()->json([
                'message' => "Service not found!",
                'error' => true
            ], 200);
        }
        $unpaidInvoice = Invoice::where('services_id', $service->id)
            ->where('status->value', 1)
            ->whereNull('deleted_at')
            ->orderByDesc('due_date')
            ->first();
        $newDate = billing_day_end($dueDateInput);

        try {
            $oldBillTo = $service->bill_to;
            $oldInvoiceDue = $unpaidInvoice?->due_date;

            if ($unpaidInvoice) {
                $unpaidInvoice->due_date = $newDate;
                $unpaidInvoice->save();
            }

            $service->bill_to = $newDate;
            if ((int) ($service->status['value'] ?? 0) !== 2 && $newDate->isFuture()) {
                enable_secret($service);
                $service->status = [
                    'label' => 'Active',
                    'value' => 2,
                ];
            }
            $service->save();

            ServiceBillDateChange::create([
                'service_id'    => $service->id,
                'old_bill_date' => $oldInvoiceDue ?? $oldBillTo,
                'new_bill_date' => $newDate,
                'user_id'       => $request->user()->id,
                'remarks'       => $unpaidInvoice
                    ? 'Invoice due date and bill_to updated by admin'
                    : 'Bill to date updated by admin (no unpaid invoice)',
            ]);

            return response()->json([
                'message' => 'Due date and bill to date changed',
                'service' => $service->fresh(),
                'error' => false
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'error' => true
            ], 200);
        }
    }

    public function extendBillDate(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'days' => [
                'required',
                'integer',
                'min:1',
                'max:365',
            ],
        ]);

        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
        }

        $service = Service::find($id);
        if (!$service) {
            return response()->json([
                'message' => "Service not found!",
                'error' => true
            ], 200);
        }

        try {
            $unpaid_invoice = Invoice::where('services_id', $service->id)->where('status->value', 1)->first();
            $extraDays = (int) $request->days;
            if ($unpaid_invoice) {
                if ($unpaid_invoice->due_date->isPast()) {
                    $due_date = billing_day_end(now()->addDays($extraDays));
                    $bill_to = billing_day_end(now()->addMonth()->addDays($extraDays));
                } else {
                    $due_date = billing_day_end(Carbon::parse($unpaid_invoice->due_date)->addDays((int) $request->days));
                    $bill_to = billing_day_end(Carbon::parse($service->bill_to)->addDays((int) $request->days));
                }
                $unpaid_invoice->due_date = $due_date;
                $unpaid_invoice->save();
            } else {
                $bill_to = billing_day_end(Carbon::parse($service->bill_to)->addDays((int) $request->days));
            }
            if ($service->status['value'] != 2) {
                enable_secret($service);
                $service->status = [
                    'label' => 'Active',
                    'value' => 2
                ];
            }
            $service->bill_to = $bill_to;
            $service->save();
            return response()->json([
                'message' => 'Bill date extended!',
                'service' => $service,
                'error' => false
            ], 200);
        } catch (\Exception $e) {
            $response = $e->getMessage();
            return response()->json([
                'message' => $response,
                'error' => true
            ], 200);
        }
    }

    public function updateServices(Request $request, $id)
    {
        $messages = [
            'required' => 'The :attribute field is required.',
        ];

        $validator = Validator::make($request->all(), [
            'status' => 'required',
        ], $messages);

        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
        }

        if (!$request->user()->hasRole(['reseller'])) {
            return response()->json([
                'message' => 'Permission denied',
                'error' => true
            ], 200);
        }

        $service = Service::find($id);

        $plan = Plan::find($service->plan_id);
        if ($plan) {
            $router = Router::find($plan->router_id);
            if ($router) {
                try {
                    if ($router->authorization['value'] === 3) {
                        $this->logChanges($request, $id);
                        $service->fill($request->all())->save();
                        //if ($request->status['value'] === 1) {
                        $username = $service->mikrotik_name;
                        $nasIp = $router->nas_ip;
                        $secret = $router->radius_secret;
                        $packet = "User-Name = $username\nNAS-IP-Address = $nasIp";
                        //exec("echo \"$packet\" | radclient -x $nasIp:1700 disconnect $secret");
                        $command = "echo \"$packet\" | radclient -x $nasIp:1700 disconnect $secret 2>&1";

                        $output = [];
                        $returnVar = 0;

                        exec($command, $output, $returnVar);

                        Log::channel('radclient')->info('Radclient Disconnect Output', ['command' => $command, 'output' => $output, 'status' => $returnVar,]);
                        //}
                        return response()->json([
                            'message' => 'Service saved',
                            'service' => $service,
                            'error' => false
                        ], 200);
                    }
                    $config = new Config([
                        'host' => $router->host,
                        'user' => $router->api_login,
                        'pass' => $router->api_password,
                        'port' => (int)$router->api_port,
                    ]);
                    // Initiate client with config object
                    $client = new Client($config);
                    // Build resource query
                    $query =
                        (new Query('/ppp/secret/set'))
                        ->equal('.id', $service->mikrotik_id)
                        ->equal('disabled', $request->status['value'] === 2 ? 'no' : 'yes');

                    $response = $client->query($query)->read();

                    if ($request->status['value'] === 1 && $service->online) {
                        $query2 =
                            (new Query('/interface/pppoe-server/remove'))
                            ->equal('numbers', '<pppoe-' . $request->mikrotik_name . '>');
                        $response2 = $client->query($query2)->read();
                    }

                    if (isset($response['after']['message'])) {
                        return response()->json([
                            'message' => ucfirst($response['after']['message']),
                            'error' => true
                        ], 200);
                    } else if (isset($response2['after']['message'])) {
                        return response()->json([
                            'message' => ucfirst($response2['after']['message']),
                            'error' => true
                        ], 200);
                    } else {
                        $this->logChanges($request, $id);
                        $service->fill($request->all())->save();
                        return response()->json([
                            'message' => 'Service saved',
                            'service' => $service,
                            'error' => false
                        ], 200);
                    }
                } catch (\Exception $e) {
                    $response = $e->getMessage();
                    return response()->json([
                        'message' => $response,
                        'error' => true
                    ], 200);
                }
            } else {
                $customValidator = ValidationException::withMessages([
                    'router' => __('Router not found in record!'),
                ]);

                return response()->json($customValidator->errors(), 422);
            }
        } else {
            $customValidator = ValidationException::withMessages([
                'plan' => __('Plan not found in record!'),
            ]);

            return response()->json($customValidator->errors(), 422);
        }
    }

    private function logChanges($request, $id)
    {
        $serviceChange = Service::findOrFail($id);

        foreach ($request->all() as $field => $new) {
            $old = $serviceChange->$field;

            // Normalize datetime fields
            if (in_array($field, ['start_date', 'end_date', 'bill_to'])) {
                $old = $old ? Carbon::parse($old)->format('Y-m-d H:i:s') : null;
                $new = $new ? Carbon::parse($new)->format('Y-m-d H:i:s') : null;
            }

            if ($old != $new) {
                ServiceChangeLog::create([
                    'service_id' => $serviceChange->id,
                    'changed_by' => auth()->id(),
                    'field'      => $field,
                    'old_value'  => is_array($old) ? json_encode($old) : $old,
                    'new_value'  => is_array($new) ? json_encode($new) : $new,
                    'notes'      => 'Field updated manually',
                ]);
            }
        }
    }

    public function ajax($id)
    {
        $lastInvoiceDue = Invoice::query()
            ->select('services_id', DB::raw('MAX(due_date) as last_due_date'))
            ->whereNull('deleted_at')
            ->groupBy('services_id');

        $services = (new Service)->newQuery();
        $services->leftJoin('plans', 'services.plan_id', '=', 'plans.id');
        $services->leftJoinSub($lastInvoiceDue, 'last_invoice', function ($join) {
            $join->on('last_invoice.services_id', '=', 'services.id');
        });
        $services->select(
            'services.*',
            'plans.title',
            'plans.id AS plan_id',
            'services.bill_to as due_date',
            'last_invoice.last_due_date'
        );
        $services->where('customer_id', $id);
        if (request()->has('q')) {
            $services->where(function ($query) {
                $query->where('plans.title', 'Like', '%' . request()->input('q') . '%');
            });
        }
        $per_page = request('per_page', 10);
        $sort = request('sort', 'asc');
        $sortCol = request('sort_col', 'id');
        if ($sortCol === 'due_date') {
            $sortCol = 'services.bill_to';
        }
        $result = new ServiceCollection($services->orderBy($sortCol, $sort)->paginate($per_page));

        //return $result;
        return response()->json([
            'page' => $result->currentPage(),
            'per_page' => $result->perPage(),
            'total' => $result->total(),
            'total_pages' => ceil($result->total() / $result->perPage()),
            'data' => $result,
        ]);
    }

    public function ajaxServices(Request $request)
    {
        $customer = Customer::where("user_id", $request->user()->id)->first();
        $services = Service::leftJoin('plans', 'services.plan_id', '=', 'plans.id')->select('services.*', 'plans.title', 'plans.id AS plan_id')->whereNotNull('customer_id')->where('customer_id', $customer->id)->where('services.status->value', '!=', 0)->get();

        //return $result;
        return response()->json([
            'services' => $services,
        ]);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroyBkp($id)
    {
        $service = Service::find($id);
        if ($service->mikrotik_id) {
            $plan = Plan::find($service->plan_id);
            if ($plan) {
                $router = Router::find($plan->router_id);
                if ($router) {
                    try {
                        if ($router->authorization['value'] === 3) {
                            $username = $service->mikrotik_name;
                            $nasIp = $router->nas_ip;
                            $secret = $router->radius_secret;
                            $packet = "User-Name = $username\nNAS-IP-Address = $nasIp";
                            //exec("echo \"$packet\" | radclient -x $nasIp:1700 disconnect $secret");
                            $command = "echo \"$packet\" | radclient -x $nasIp:1700 disconnect $secret 2>&1";

                            $output = [];
                            $returnVar = 0;

                            exec($command, $output, $returnVar);

                            Log::channel('radclient')->info('Radclient Disconnect Output', ['command' => $command, 'output' => $output, 'status' => $returnVar,]);
                            $service->delete();
                            return response()->json([
                                'message' => 'Internet service deleted'
                            ], 200);
                        }
                        $config = new Config([
                            'host' => $router->host,
                            'user' => $router->api_login,
                            'pass' => $router->api_password,
                            'port' => (int)$router->api_port,
                        ]);
                        // Initiate client with config object
                        $client = new Client($config);
                        // Build resource query
                        $query2 =
                            (new Query('/interface/pppoe-server/remove'))
                            ->equal('numbers', '<pppoe-' . $service->mikrotik_name . '>');
                        $client->query($query2)->read();
                        $query =
                            (new Query('/ppp/secret/remove'))
                            ->equal('.id', $service->mikrotik_id);
                        $response = $client->query($query)->read();

                        if (isset($response['after']['message'])) {
                            return response()->json([
                                'message' => ucfirst($response['after']['message']),
                                'error' => true
                            ], 200);
                        } else {
                            $service->delete();
                            return response()->json([
                                'message' => 'Internet service deleted'
                            ], 200);
                        }
                    } catch (\Exception $e) {
                        $response = $e->getMessage();
                        return response()->json([
                            'message' => $response,
                            'error' => true
                        ], 200);
                    }
                } else {
                    return response()->json([
                        'message' => 'Router not found on record!',
                        'error' => true
                    ], 200);
                }
            }
        } else {
            $service->delete();
            return response()->json([
                'message' => 'Internet service deleted'
            ], 200);
        }
    }

    public function destroy($id)
    {
        DB::beginTransaction();

        try {

            $service = Service::find($id);

            if (!$service) {
                return response()->json([
                    'message' => 'Service not found',
                    'error' => true
                ], 404);
            }

            $invoice_exist = Invoice::where('services_id', $id)->where('status->value', 1)->exists();
            if ($invoice_exist) {
                return response()->json([
                    'message' => 'Cannot delete service with unpaid invoices',
                    'error' => true
                ], 400);
            }

            $plan = Plan::find($service->plan_id);

            if (!$plan) {
                return response()->json([
                    'message' => 'Plan not found',
                    'error' => true
                ], 404);
            }

            $router = Router::find($plan->router_id);

            if (!$router) {
                return response()->json([
                    'message' => 'Router not found on record!',
                    'error' => true
                ], 404);
            }

            /**
             * ---------------------------------
             * CASE 1: Radius / direct disconnect
             * ---------------------------------
             */
            if ((int) $router->authorization['value'] === 3) {

                $username = $service->mikrotik_name;
                $nasIp = $router->nas_ip;
                $secret = $router->radius_secret;

                $packet = escapeshellcmd("User-Name = $username\nNAS-IP-Address = $nasIp");

                $command = "echo \"$packet\" | radclient -x {$nasIp}:1700 disconnect {$secret} 2>&1";

                $output = [];
                $returnVar = 0;

                exec($command, $output, $returnVar);

                Log::channel('radclient')->info('Radclient Disconnect Output', [
                    'command' => $command,
                    'output' => $output,
                    'status' => $returnVar,
                ]);

                $service->delete();

                DB::commit();

                return response()->json([
                    'message' => 'Internet service deleted',
                    'error' => false
                ], 200);
            }

            /**
             * ---------------------------------
             * CASE 2: Mikrotik PPP removal
             * ---------------------------------
             */

            $config = new Config([
                'host' => $router->host,
                'user' => $router->api_login,
                'pass' => $router->api_password,
                'port' => (int) $router->api_port,
            ]);

            $client = new Client($config);

            // remove PPP interface (safe fallback)
            try {
                $client->query(
                    (new Query('/interface/pppoe-server/remove'))
                        ->equal('numbers', '<pppoe-' . $service->mikrotik_name . '>')
                )->read();
            } catch (\Exception $e) {
                Log::warning('PPPoE interface delete failed', [
                    'error' => $e->getMessage()
                ]);
            }

            // remove secret
            $response = $client->query(
                (new Query('/ppp/secret/remove'))
                    ->equal('.id', $service->mikrotik_id)
            )->read();

            if (isset($response['after']['message'])) {

                DB::rollBack();

                return response()->json([
                    'message' => ucfirst($response['after']['message']),
                    'error' => true
                ], 400);
            }

            $service->delete();

            DB::commit();

            return response()->json([
                'message' => 'Internet service deleted',
                'error' => false
            ], 200);
        } catch (\Throwable $e) {

            DB::rollBack();

            return response()->json([
                'message' => $e->getMessage(),
                'error' => true
            ], 500);
        }
    }

    public function recon()
    {
        $services = Service::whereNotNull('start_date')->whereNull('bill_to')->get();
        foreach ($services as $service) {
            if ($service->status['value'] === 2) {
                $date = Carbon::parse($service->start_date)->addMonth();
                $service->bill_to = $date;
                $service->save();
            } else if ($service->status['value'] === 1) {
                $date = Carbon::parse($service->start_date)->subMonth();
                $service->bill_to = $date;
                $service->save();
            }
        }
    }

    private function sendAccountCreateMessage($service)
    {
        $check = Service::where('customer_id', $service->customer_id)->count();
        $customer = Customer::find($service->customer_id);
        if (!$customer) return NULL;
        if ($check > 1) {
            $account = $customer->phone_number . '#' . $service->id;
        } else {
            $account = $customer->phone_number;
        }

        $contentVars = [
            'en' => [ //Optional wrap with locale
                'account' => $account
            ],
        ];

        $message = new AccountCreationMessage($contentVars, 'account_creation');
        $body = $message->renderMessage();
        $template = MessageTemplate::where('message_class', 'account_creation')->first();

        send_sms($customer->formatted_phone_no, $body, $customer->id, $contentVars, $template->id);

        return $account;
    }

    /**
     * New installation: keep bill_to at start until the install invoice is paid.
     * Payment flow (BillingCycleService) extends bill_to after money is received.
     */
    private function normalizeInstallationBillTo(Service $service, Request $request): void
    {
        if (!$request->generate_invoice) {
            return;
        }

        $installation = filter_var($request->installation, FILTER_VALIDATE_BOOLEAN);
        $installFee = (float) ($request->installation_fee ?? 0);
        if (!$installation && $installFee <= 0.009) {
            return;
        }

        $start = Carbon::parse($request->start_date ?? $service->start_date ?? now());
        $service->bill_to = $start->copy()->startOfDay();
        $service->save();
    }

    /**
     * After install invoice is created, bill_to must stay at start until payment extends it.
     */
    private function enforceInstallBillToAtStart(Service $service, Request $request, Invoice $invoice): void
    {
        $hasInstallLine = InvoiceDetail::where('invoice_id', $invoice->id)
            ->whereNull('deleted_at')
            ->where('service_type', 'installation')
            ->exists();
        if (!$hasInstallLine) {
            return;
        }

        $start = Carbon::parse($service->start_date ?? $request->start_date ?? now());
        $service->bill_to = $start->copy()->startOfDay();
        $service->save();
    }

    private function generateInvoice($service, $request)
    {
        $check = Service::where('customer_id', $service->customer_id)->count();
        $cust = Customer::find($service->customer_id);
        if (!$cust) return NULL;
        if ($check > 1) {
            $account = $cust->phone_number . '#' . $service->id;
        } else {
            $account = $cust->phone_number;
        }
        /*$customer = new Buyer([
            'name'          => $cust->name,
            'account'       => $account,
            'phone'         => $cust->phone_number,
            'due_date'      => Carbon::parse($request->due_date)->format('l, F jS, Y'),
            'custom_fields' => [
                'email' => 'test@example.com',
            ],
        ]);*/

        /*$seller = new Party([
            'name'          => 'Tonycomm Group Ltd',
            'phone'         => '0110345166',
            'paybill'       => '4129711',
            'custom_fields' => [
                'note'        => 'IDDQD',
                'business id' => '365#GG',
            ],
        ]);*/

        $isInstallInvoice = filter_var($request->installation, FILTER_VALIDATE_BOOLEAN)
            || (float) ($request->installation_fee ?? 0) > 0.009;
        $due_date = ($isInstallInvoice && $request->generate_invoice)
            ? Carbon::parse($service->start_date ?? $request->start_date ?? now())
            : Carbon::parse($service->bill_to ?: $request->due_date ?: $request->start_date);
        //$status = 'unpaid';
        $total = 0;
        //$items = [];
                $invoice = Invoice::create(['services_id' => $service->id, 'invoice_date' => Carbon::now(), 'due_date' => billing_day_end($due_date), 'total' => 0, 'status' => ['label' => 'Unpaid', 'value' => 1]]);

        if ($request->installation && $request->generate_invoice && $request->installation_fee) {
            //$items[] = InvoiceItem::make('Internet installation service')->pricePerUnit($request->installation_fee);
            $total = $request->installation_fee + $total;
            InvoiceDetail::create(['invoice_id' => $invoice->id, 'service_type' => 'installation', 'name' => 'Internet installation service', 'price_per_unit' => $request->installation_fee]);
        }
        if ($request->generate_invoice && $request->price) {
            //$items[] = InvoiceItem::make('Internet subscription service')->pricePerUnit($request->price);
            $total = $request->price + $total;
            InvoiceDetail::create(['invoice_id' => $invoice->id, 'service_type' => 'internet', 'name' => 'Internet subscription service', 'price_per_unit' => $request->price]);
        }

        $invoice->total = $total;

        if ($request->use_credit) {
            $customer_credit = $cust->credit;
            if ($cust->credit > 0 && $invoice->total > $cust->credit) {
                $cust->decreaseCredit($cust->credit, 'Invoice payment; Invoice ID: ' . $invoice->id);
                $payment = new Payment();
                $payment->customer_id = $cust->id;
                $payment->trans_id = NULL;
                $payment->payment_type = 'credit';
                $payment->date = Carbon::now();
                $payment->sum = $customer_credit;
                $payment->invoice_id = $invoice->id;
                $payment->save();
            } elseif ($cust->credit > 0 && $invoice->total == $cust->credit) {
                $cust->decreaseCredit($invoice->total, 'Invoice paid; Invoice ID: ' . $invoice->id);
                $payment = new Payment();
                $payment->customer_id = $cust->id;
                $payment->trans_id = NULL;
                $payment->payment_type = 'credit';
                $payment->date = Carbon::now();
                $payment->sum = $invoice->total;
                $payment->invoice_id = $invoice->id;
                $payment->save();
                $invoice->status = [
                    'label' => 'Paid',
                    'value' => 2
                ];
                //$status = 'paid';
            } elseif ($cust->credit > 0 && $invoice->total < $cust->credit) {
                $cust->decreaseCredit($invoice->total, 'Invoice paid; Invoice ID: ' . $invoice->id);
                $payment = new Payment();
                $payment->customer_id = $cust->id;
                $payment->trans_id = NULL;
                $payment->payment_type = 'credit';
                $payment->date = Carbon::now();
                $payment->sum = $invoice->total;
                $payment->invoice_id = $invoice->id;
                $payment->save();
                $invoice->status = [
                    'label' => 'Paid',
                    'value' => 2
                ];
                //$status = 'paid';
            }
        }
        $invoice->save();
        $this->enforceInstallBillToAtStart($service, $request, $invoice->fresh());
        //if (empty($items)) return NULL;

        /*if ($status === 'paid') return DailyInvoice::make()
            ->status(__('invoices::invoice.paid'))
            ->sequence($invoice->id)
            ->serialNumberFormat('{SEQUENCE}')
            ->seller($seller)
            ->buyer($customer)
            ->date(now())
            ->dateFormat('l, F jS, Y')
            ->payUntilDays(14)
            ->currencySymbol('KSh')
            ->currencyCode('KES')
            ->currencyFormat('{SYMBOL}{VALUE}')
            ->filename('Invoice-' . $invoice->id)
            ->addItems($items)
            ->logo(public_path('assets/images/logo.png'))
            ->save('public');

        return DailyInvoice::make()
            ->sequence($invoice->id)
            ->serialNumberFormat('{SEQUENCE}')
            ->seller($seller)
            ->buyer($customer)
            ->date(now())
            ->dateFormat('l, F jS, Y')
            ->payUntilDays(14)
            ->currencySymbol('KSh')
            ->currencyCode('KES')
            ->currencyFormat('{SYMBOL}{VALUE}')
            ->filename('Invoice-' . $invoice->id)
            ->addItems($items)
            ->logo(public_path('assets/images/logo.png'))
            ->save('public');*/
        return $invoice->id;
    }

    public function onlineSessions($id)
    {
        $ago = Carbon::now()->subMinutes(7);
        $customer = Customer::find($id);
        if (!$customer) return response()->json(['message' => 'Customer not found'], 404);
        $usernames = Service::where('customer_id', $id)->pluck('mikrotik_name');
        if ($usernames->isEmpty()) {
            return response()->json(['online_sessions' => []], 200);
        }

        // Get latest radacctid per username
        $latest = Radacct::selectRaw('MAX(radacctid) as radacctid')
            ->whereIn('username', $usernames)
            ->where('acctupdatetime', '>=', $ago)
            ->groupBy('username');

        $sessions = Radacct::whereIn('radacctid', $latest)
            ->whereNull('acctstoptime') // only active sessions
            ->get([
                'username',
                'acctinputoctets as download',
                'acctoutputoctets as upload',
                'acctstarttime as start_time',
                'framedipaddress as ip_address',
                'callingstationid as mac_address',
                'acctsessiontime as time_diff',
            ])
            ->map(function ($session) {
                $session->download = $this->formatBytes($session->download);
                $session->upload = $this->formatBytes($session->upload);
                return $session;
            });
        //$sessions = PppoeSession::select('pppoe_sessions.username', DB::raw('SUM(statistics.in_bytes) AS download'), DB::raw('SUM(statistics.out_bytes) AS upload'), 'pppoe_sessions.start_time', 'pppoe_sessions.ip_address', 'pppoe_sessions.mac_address', DB::raw('TIMEDIFF(NOW(), pppoe_sessions.start_time) as time_diff'))->join('services', 'pppoe_sessions.username', '=', 'services.mikrotik_name')->join('customers', 'services.customer_id', '=', 'customers.id')->leftJoin('statistics', 'pppoe_sessions.id', '=', 'statistics.session_id')->whereNull('end_time')->where('services.customer_id', $customer->id)->groupBy('pppoe_sessions.start_time', 'pppoe_sessions.username', 'pppoe_sessions.ip_address', 'pppoe_sessions.mac_address')->get();
        return response()->json([
            'online_sessions' => $sessions
        ], 200);
    }

    public function dailySessions($id)
    {
        $customer = Customer::find($id);
        if (!$customer) {
            return response()->json(['message' => 'Customer not found'], 404);
        }

        // Fixed date range: March 2026
        // $startDate = Carbon::create(2026, 3, 1)->startOfDay();
        // $endDate   = Carbon::create(2026, 3, 31)->endOfDay();

        // Get date range from request
        $startDate = Carbon::parse(request()->input('from'))->startOfDay();
        $endDate   = Carbon::parse(request()->input('to'))->endOfDay();

        // Get usernames
        $usernames = Service::where('customer_id', $customer->id)
            ->pluck('mikrotik_name');

        if ($usernames->isEmpty()) {
            return response()->json(['daily_sessions' => []], 200);
        }

        $rawStats = DB::table('data_usage_by_period')
            ->select(
                DB::raw("DATE(period_start) as date"),
                DB::raw("SUM(acctinputoctets) as upload"),
                DB::raw("SUM(acctoutputoctets) as download")
            )
            ->whereIn('username', $usernames)
            ->whereNotNull('period_end') // important
            ->whereBetween('period_start', [
                $startDate->toDateTimeString(),
                $endDate->toDateTimeString()
            ])
            ->groupBy(DB::raw("DATE(period_start)"))
            ->orderBy('date', 'ASC')
            ->get()
            ->keyBy('date');

        // Fill missing days (VERY IMPORTANT for charts)
        $period = CarbonPeriod::create($startDate, $endDate);

        $statistics = [];

        foreach ($period as $date) {
            $day = $date->format('Y-m-d');

            $statistics[] = [
                'date' => $day,
                'download' => isset($rawStats[$day]) ? (int)$rawStats[$day]->download : 0,
                'upload' => isset($rawStats[$day]) ? (int)$rawStats[$day]->upload : 0,
            ];
        }

        return response()->json([
            'daily_sessions' => $statistics
        ], 200);
    }

    public function totalSessions($id)
    {
        /*$customer = Customer::find($id);
        if (!$customer) return response()->json(['message' => 'Customer not found'], 404);
        $sessions = (new PppoeSession())->newQuery();
        $sessions->join('services', 'pppoe_sessions.username', '=', 'services.mikrotik_name');
        $sessions->join('customers', 'services.customer_id', '=', 'customers.id');
        $sessions->leftJoin('statistics', 'pppoe_sessions.id', '=', 'statistics.session_id');
        $startDate = Carbon::parse(request()->input('from'))->format('Y-m-d H:i:s');
        $endDate = Carbon::parse(request()->input('to'))->format('Y-m-d H:i:s');
        $per_page = request('per_page', 100);
        $sort = request('sort', 'desc');
        $sortCol = request('sort_col', 'pppoe_sessions.id');
        if (request()->has('q')) {
            $sessions->where(function ($query) {
                $query->where('username', 'Like', '%' . request()->input('q') . '%')
                    ->orWhere('ip_address', 'Like', '%' . request()->input('q') . '%');
            });
        }
        $sessions->where('customers.id', $customer->id);
        $sessions->whereNotNull('end_time');
        $sessions->whereBetween('end_time', [$startDate, $endDate]);
        $sessions->select('pppoe_sessions.id', 'pppoe_sessions.start_time', 'pppoe_sessions.end_time', DB::raw('SUM(in_bytes) AS download'), DB::raw('SUM(out_bytes) AS upload'), 'pppoe_sessions.ip_address', 'pppoe_sessions.mac_address', DB::raw('TIMEDIFF(pppoe_sessions.end_time, pppoe_sessions.start_time) as time_diff'));
        $sessions->groupBy('pppoe_sessions.id', 'pppoe_sessions.start_time', 'pppoe_sessions.end_time', 'pppoe_sessions.ip_address', 'pppoe_sessions.mac_address');
        $result = new PppoeSessionCollection($sessions->orderBy($sortCol, $sort)->paginate($per_page));
        return response()->json([
            'page' => $result->currentPage(),
            'per_page' => $result->perPage(),
            'total' => $result->total(),
            'total_pages' => ceil($result->total() / $result->perPage()),
            'data' => $result,
        ], 200);*/
        $customer = Customer::find($id);
        if (!$customer) {
            return response()->json(['message' => 'Customer not found'], 404);
        }

        // Base query
        $sessions = Radacct::query();

        // Join services to get customer_id
        $sessions->join('services', 'radacct.username', '=', 'services.mikrotik_name');
        $sessions->join('customers', 'services.customer_id', '=', 'customers.id');

        // Date range
        $startDate = Carbon::parse(request()->input('from'))->format('Y-m-d H:i:s');
        $endDate   = Carbon::parse(request()->input('to'))->format('Y-m-d H:i:s');

        $per_page = request('per_page', 100);
        $sort = request('sort', 'desc');
        $sortCol = request('sort_col', 'acctstarttime'); // default sort by start time

        // Search
        if (request()->has('q')) {
            $sessions->where(function ($query) {
                $query->where('radacct.username', 'like', '%' . request()->input('q') . '%')
                    ->orWhere('radacct.framedipaddress', 'like', '%' . request()->input('q') . '%');
            });
        }

        // Only this customer's sessions
        $sessions->where('customers.id', $customer->id);

        // Only finished sessions
        $sessions->whereNotNull('acctstoptime');

        // Apply date filter on acctstoptime
        $sessions->whereBetween('acctstoptime', [$startDate, $endDate]);

        // Select columns and aggregate usage
        $sessions->select(
            'radacct.radacctid as id',
            'radacct.username',
            'radacct.framedipaddress as ip_address',
            'radacct.callingstationid as mac_address',
            'radacct.acctstarttime as start_time',
            'radacct.acctstoptime as end_time',
            DB::raw('TIMESTAMPDIFF(SECOND, radacct.acctstarttime, radacct.acctstoptime) as time_diff'),
            DB::raw('radacct.acctinputoctets as upload'),
            DB::raw('radacct.acctoutputoctets as download')
        );

        // Pagination & sorting
        $result = $sessions->orderBy($sortCol, $sort)->paginate($per_page);

        return response()->json([
            'page' => $result->currentPage(),
            'per_page' => $result->perPage(),
            'total' => $result->total(),
            'total_pages' => ceil($result->total() / $result->perPage()),
            'data' => $result,
        ], 200);
    }

    public function onlineCustSessions(Request $request)
    {
        $customer = Customer::where('user_id', $request->user()->id)->first();
        if (!$customer) return response()->json(['message' => 'Customer not found'], 404);
        $sessions = PppoeSession::select('pppoe_sessions.username', DB::raw('SUM(statistics.in_bytes) AS download'), DB::raw('SUM(statistics.out_bytes) AS upload'), 'pppoe_sessions.start_time', 'pppoe_sessions.ip_address', 'pppoe_sessions.mac_address', DB::raw('TIMEDIFF(NOW(), pppoe_sessions.start_time) as time_diff'))->join('services', 'pppoe_sessions.username', '=', 'services.mikrotik_name')->join('customers', 'services.customer_id', '=', 'customers.id')->leftJoin('statistics', 'pppoe_sessions.id', '=', 'statistics.session_id')->whereNull('end_time')->where('services.customer_id', $customer->id)->groupBy('pppoe_sessions.start_time', 'pppoe_sessions.username', 'pppoe_sessions.ip_address', 'pppoe_sessions.mac_address')->get();
        return response()->json([
            'online_sessions' => $sessions
        ], 200);
    }

    public function dailyCustSessions(Request $request)
    {
        $customer = Customer::where('user_id', $request->user()->id)->first();
        if (!$customer) return response()->json(['message' => 'Customer not found'], 404);
        $startDate = Carbon::parse(request()->input('from'))->timestamp;
        $endDate = Carbon::parse(request()->input('to'))->timestamp;
        $statistics = Statistic::select(DB::raw("date_format(FROM_UNIXTIME(timestamp), '%Y-%m-%d') as date"), DB::raw('SUM(in_bytes) AS download'), DB::raw('SUM(out_bytes) AS upload'))->join('pppoe_sessions', 'statistics.session_id', '=', 'pppoe_sessions.id')->join('services', 'pppoe_sessions.username', '=', 'services.mikrotik_name')->join('customers', 'services.customer_id', '=', 'customers.id')->where('services.customer_id', $customer->id)->whereBetween('timestamp', [$startDate, $endDate])->groupBy('date')->get();
        return response()->json([
            'daily_sessions' => $statistics
        ], 200);
    }

    public function totalCustSessions(Request $request)
    {
        $customer = Customer::where('user_id', $request->user()->id)->first();
        if (!$customer) return response()->json(['message' => 'Customer not found'], 404);
        $sessions = (new PppoeSession())->newQuery();
        $sessions->join('services', 'pppoe_sessions.username', '=', 'services.mikrotik_name');
        $sessions->join('customers', 'services.customer_id', '=', 'customers.id');
        $sessions->leftJoin('statistics', 'pppoe_sessions.id', '=', 'statistics.session_id');
        $startDate = Carbon::parse(request()->input('from'))->format('Y-m-d H:i:s');
        $endDate = Carbon::parse(request()->input('to'))->format('Y-m-d H:i:s');
        $per_page = request('per_page', 100);
        $sort = request('sort', 'desc');
        $sortCol = request('sort_col', 'pppoe_sessions.id');
        if (request()->has('q')) {
            $sessions->where(function ($query) {
                $query->where('username', 'Like', '%' . request()->input('q') . '%')
                    ->orWhere('ip_address', 'Like', '%' . request()->input('q') . '%');
            });
        }
        $sessions->where('customers.id', $customer->id);
        $sessions->whereNotNull('end_time');
        $sessions->whereBetween('end_time', [$startDate, $endDate]);
        $sessions->select('pppoe_sessions.id', 'pppoe_sessions.start_time', 'pppoe_sessions.end_time', DB::raw('SUM(in_bytes) AS download'), DB::raw('SUM(out_bytes) AS upload'), 'pppoe_sessions.ip_address', 'pppoe_sessions.mac_address', DB::raw('TIMEDIFF(pppoe_sessions.end_time, pppoe_sessions.start_time) as time_diff'));
        $sessions->groupBy('pppoe_sessions.id', 'pppoe_sessions.start_time', 'pppoe_sessions.end_time', 'pppoe_sessions.ip_address', 'pppoe_sessions.mac_address');
        $result = new PppoeSessionCollection($sessions->orderBy($sortCol, $sort)->paginate($per_page));
        return response()->json([
            'page' => $result->currentPage(),
            'per_page' => $result->perPage(),
            'total' => $result->total(),
            'total_pages' => ceil($result->total() / $result->perPage()),
            'data' => $result,
        ], 200);
    }

    public function fetchServices($id)
    {
        $data = collect();
        $services = Service::select('services.*')->where('billing_type->value', 1)->where('customer_id', $id)->get();
        $options = collect();
        foreach ($services as $service) {
            $check = Invoice::where('services_id', $service->id)->where('invoices.status->value', 1)->first();
            if (!$check) {
                $options->push(["label" => $service->mikrotik_name, "value" => $service->id]);
                $data->push($service);
            }
        }
        return response()->json([
            'options' => $options,
            'services' => $data
        ]);
    }

    public function generateServiceInvoice(Request $request)
    {
        try {
            $check = Invoice::where('services_id', $request->service_id)->where('status->value', 1)->first();
            if ($check) {
                return response()->json([
                    'message' => "This service has an unpaid invoice! Deleted invoice to generate a new invoice.",
                    'error' => true
                ], 200);
            }
            $service = Service::find($request->service_id);
            if (!$service) {
                return response()->json([
                    'message' => "Service not found.",
                    'error' => true
                ], 200);
            }
            $cust = Customer::find($service->customer_id);
            $billing = app(\App\Services\BillingCycleService::class);
            $remainingIsPaid = $billing->remainingTimeIsPaid($service);
            $due_date = Carbon::parse($request->date);
            $invoice = Invoice::create(['services_id' => $request->service_id, 'invoice_date' => Carbon::now(), 'due_date' => billing_day_end($due_date), 'total' => $request->amount, 'status' => ['label' => 'Unpaid', 'value' => 1]]);
            $customer_credit = $cust->credit;
            if ($cust->credit > 0 && $invoice->total > $cust->credit) {
                $cust->decreaseCredit($cust->credit, 'Invoice payment; Invoice ID: ' . $invoice->id);
                $payment = new Payment();
                $payment->customer_id = $cust->id;
                $payment->trans_id = NULL;
                $payment->payment_type = 'credit';
                $payment->date = Carbon::now();
                $payment->sum = $customer_credit;
                $payment->invoice_id = $invoice->id;
                $payment->save();
            } elseif ($cust->credit > 0 && $invoice->total == $cust->credit) {
                $cust->decreaseCredit($invoice->total, 'Invoice paid; Invoice ID: ' . $invoice->id);
                $payment = new Payment();
                $payment->customer_id = $cust->id;
                $payment->trans_id = NULL;
                $payment->payment_type = 'credit';
                $payment->date = Carbon::now();
                $payment->sum = $invoice->total;
                $payment->invoice_id = $invoice->id;
                $payment->save();
                $invoice->status = [
                    'label' => 'Paid',
                    'value' => 2
                ];
                if ($service->status['value'] == 1) {
                    $response = enable_secret($service);
                    if ($response) {
                        $service->status = [
                            'label' => 'Active',
                            'value' => 2
                        ];
                    }
                }
            } elseif ($cust->credit > 0 && $invoice->total < $cust->credit) {
                $cust->decreaseCredit($invoice->total, 'Invoice paid; Invoice ID: ' . $invoice->id);
                $payment = new Payment();
                $payment->customer_id = $cust->id;
                $payment->trans_id = NULL;
                $payment->payment_type = 'credit';
                $payment->date = Carbon::now();
                $payment->sum = $invoice->total;
                $payment->invoice_id = $invoice->id;
                $payment->save();
                $invoice->status = [
                    'label' => 'Paid',
                    'value' => 2
                ];
                if ($service->status['value'] == 1) {
                    $response = enable_secret($service);
                    if ($response) {
                        $service->status = [
                            'label' => 'Active',
                            'value' => 2
                        ];
                    }
                }
            }
            $invoice->save();
            $service->billing_period = ['label' => 'Monthly', 'value' => 3];
            if ((int) ($invoice->status['value'] ?? 0) === 2) {
                $from = \App\Services\BillingCycleService::timeGrantStartsAt(
                    Carbon::now(),
                    $service->bill_to ? Carbon::parse($service->bill_to) : null,
                    (int) ($service->status['value'] ?? 0),
                    $remainingIsPaid
                );
                $billing->applyGrantToBillTo($service, 'month', $from);
                $billing->activateNow($service);
            } else {
                $service->save();
            }
            if ($invoice->total > $customer_credit && $request->send_sms) {
                $check = Service::where('customer_id', $service->customer_id)->count();
                $account = $check > 1
                    ? $cust->phone_number.'#'.$service->id
                    : $cust->phone_number;
                $type = 'Monthly internet subscription';

                $contentVars = [
                    'en' => [ //Optional wrap with locale
                        'type' => $type,
                        'due_date' => billing_day_end($due_date)->format('jS M Y \a\t h:i a'),
                        'due_amount' => 'Ksh' . ($invoice->total - $customer_credit),
                        'account' => $account
                    ],
                ];

                $message = new InvoiceGenerateMessage($contentVars, 'invoice_generate');
                $body = $message->renderMessage();
                $template = MessageTemplate::where('message_class', 'invoice_generate')->first();
                send_sms($cust->formatted_phone_no, $body, $cust->id, $contentVars, $template->id);
            }

            return response()->json([
                'message' => 'Invoice generated',
                'error' => false
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'error' => true
            ], 200);
        }
    }

    private function formatBytes($bytes, $precision = 2)
    {
        $units = ['bytes', 'KB', 'MB', 'GB', 'TB'];

        $bytes = max($bytes, 0);
        $power = $bytes > 0 ? floor(log($bytes, 1024)) : 0;

        return number_format($bytes / pow(1024, $power), $precision) . ' ' . $units[$power];
    }

    /**
     * Open customer ONU web UI via PPPoE remote address (10.10.x.x).
     * Public HTTPS via hub; VPN clients can use vpn_url directly.
     */
    public function onuWebAccess($id, OnuWebAccessService $onuWebAccess)
    {
        $service = Service::find($id);
        if (!$service) {
            return response()->json(['ok' => false, 'message' => 'Service not found'], 404);
        }

        $result = $onuWebAccess->provision($service);
        $status = ($result['ok'] ?? false) ? 200 : 422;

        return response()->json($result, $status);
    }
}
