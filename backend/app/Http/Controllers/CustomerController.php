<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Customer;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use App\Http\Resources\CustomerCollection;
use App\Http\Resources\InvoiceCollection;
use App\Http\Resources\PlanCollection;
use App\Http\Resources\ServiceCollection;
use App\Messages\WelcomeMessage;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\Plan;
use App\Models\Radacct;
use App\Models\Router;
use App\Models\Service;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use RouterOS\Client;
use RouterOS\Config;
use RouterOS\Query;

class CustomerController extends Controller
{
    /**
     * Create a new CustomerController instance.
     *
     * @return void
     */
    public function __construct()
    {
        $this->middleware('auth:api', ['except' => ['checkOnline']]);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {

        $messages = [
            'required' => 'The :attribute field is required.',
            'unique'    => 'The :attribute should be unique.',
            'regex' => 'Invalid characters in field phone number.'
        ];

        $validator = Validator::make($request->all(), [
            'name' => 'required|string',
            'email' => 'nullable|email|unique:users',
            'password' => $request->password != null ? 'string|min:6' : '',
            'phone_number' => 'nullable|regex:/^\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})$/|unique:customers|unique:users,phone',
        ], $messages);

        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
        }


        if ($request->email || $request->phone_number) {
            if ($request->password) {
                $password = Hash::make($request->password);
            } else {
                $password = Hash::make(Str::random(12));
            }
            $user = User::create(['name' => $request->name, 'email' => $request->email, 'password' => $password, 'phone' => $request->phone_number]);
            if ($request->category['value'] === 3) {
                $user->assignRole('reseller');
            } else {
                $user->assignRole('customer');
            }
            $customer = Customer::create(['user_id' => $user->id, 'name' => $request->name, 'billing_type' => $request->billing_type, 'category' => $request->category, 'phone_number' => $request->phone_number, 'dob' => $request->dob, 'address' => $request->address, 'city' => $request->city]);
        } else {
            $customer = Customer::create(['name' => $request->name, 'billing_type' => $request->billing_type, 'category' => $request->category, 'phone_number' => $request->phone_number, 'dob' => $request->dob, 'address' => $request->address, 'city' => $request->city]);
        }

        return response()->json([
            'message' => 'Customer added',
            'customer' => $customer
        ], 201);
    }

    /**
     * Display the specified resource.
     */
    public function show($id)
    {
        $customer = Customer::find($id);

        return response()->json([
            'customer' => $customer
        ], 200);
    }

    /** Live PPPoE download/upload rates from the customer's NAS (MikroTik). */
    public function pppoeBandwidthLive(Request $request, $id, \App\Services\PppoeBandwidthService $service)
    {
        $serviceId = $request->filled('service_id') ? (int) $request->input('service_id') : null;
        $result = $service->liveForCustomer((int) $id, $serviceId);

        if (isset($result['error'])) {
            return response()->json([
                'success' => false,
                'message' => $result['error'],
                'online' => $result['online'] ?? false,
                'service_id' => $result['service_id'] ?? null,
                'username' => $result['username'] ?? null,
                'router' => $result['router'] ?? null,
            ], $result['status'] ?? 422);
        }

        return response()->json($result);
    }

    /** Short retained history (default 24h) for the customer PPPoE chart. */
    public function pppoeBandwidthHistory(Request $request, $id, \App\Services\PppoeBandwidthService $service)
    {
        $serviceId = $request->filled('service_id') ? (int) $request->input('service_id') : null;
        $range = (string) $request->input('range', '24h');
        $result = $service->historyForCustomer((int) $id, $serviceId, $range);

        if (isset($result['error'])) {
            return response()->json([
                'success' => false,
                'message' => $result['error'],
            ], $result['status'] ?? 422);
        }

        return response()->json($result);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, $id)
    {
        $messages = [
            'required' => 'The :attribute field is required.',
            'unique'    => 'The :attribute should be unique.',
            'regex' => 'Invalid characters in field phone number.'
        ];

        $customer = Customer::find($id);
        $user = User::find($customer->user_id);

        if ($user) {
            $validator = Validator::make($request->all(), [
                'name' => 'required|string',
                'email' => ['nullable', 'email', 'unique:users,email,' . $user->id],
                'phone_number' => ['required', 'regex:/^\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})$/', 'unique:customers,phone_number,' . $customer->id, 'unique:users,phone,' . $user->id]
            ], $messages);
        } else {
            $validator = Validator::make($request->all(), [
                'name' => 'required|string',
                'email' => 'nullable|email|unique:users',
                'phone_number' => 'required|regex:/^\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})$/|unique:customers,phone_number,' . $customer->id
            ], $messages);
        }

        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
        }

        if (($request->email || $request->phone_number) && !$user) {
            $password = Hash::make(Str::random(6));
            $user = User::create(['name' => $request->name, 'email' => $request->email, 'password' => $password, 'phone' => $request->phone_number]);
            if ($request->category['value'] === 3) {
                $user->assignRole('reseller');
            } else {
                $user->assignRole('customer');
            }
            $request['user_id'] = $user->id;
        } else if ($user) {
            $user->name = $request->name;
            $user->email = $request->email;
            $user->phone = $request->phone_number;
            $user->save();
            if ($request->category['value'] === 3) {
                $user->syncRoles(['reseller']);
            } else {
                $user->syncRoles(['customer']);
            }
        }

        /*$model = Model::findOrFail($id);
        $model->update($validated);

        return response()->json([
            'message' => 'Model updated successfully',
            'data' => $model
        ]);*/

        $customer->fill($request->all())->save();
        return response()->json([
            'message' => 'Customer saved',
            'customer' => $customer
        ], 200);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy($id)
    {
        $customer = Customer::find($id);
        if ($customer) {
            $customer->delete();
            $user = User::find($customer->user_id);
            if ($user) $user->delete();
            return response()->json([
                'message' => 'Customer deleted'
            ], 200);
        } else {
            return response()->json(['message' => 'Customer not found'], 404);
        }
    }

    public function ajax()
    {
        $customers = (new Customer)->newQuery();
        //$customers->leftJoin('services', 'customers.id', '=', 'services.customer_id');
        //$customers->select('customers.*', 'services.online');
        //$lastWeek = date('Y-m-d', strtotime("-7 day", date('Y-m-d')));
        if (request()->has('q')) {
            $customers->where(function ($query) {
                $query->where('name', 'Like', '%' . request()->input('q') . '%')
                    ->orWhere('phone_number', 'Like', '%' . request()->input('q') . '%');
            });
        }
        if (request()->has('status') && request()->input('status') === 'new') {
            $customers->whereDate('customers.created_at', '>', now()->subDays(7))->get();
        }
        /*if (request()->has('status') && request()->input('status') === 'online') {
            $customers->where('services.online', 1)->get();
        }*/
        $per_page = request('per_page', 10);
        $sort = request('sort', 'asc');
        $sortCol = request('sort_col', 'id');
        $paginator = $customers->orderBy($sortCol, $sort)->paginate($per_page);
        // Phone / authorize lookups pass light=1 — skip full RADIUS online map (can exceed 30s).
        if (!request()->boolean('light')) {
            $this->attachRadiusToCustomers($paginator);
        }
        $result = new CustomerCollection($paginator);

        //return $result;
        return response()->json([
            'page' => $result->currentPage(),
            'per_page' => $result->perPage(),
            'total' => $result->total(),
            'total_pages' => ceil($result->total() / $result->perPage()),
            'data' => $result,
        ]);
    }

    public function ajaxOnline_bkp()
    {
        $ago = Carbon::now()->subMinutes(7);
        $sub = Radacct::join('services', 'services.mikrotik_name', '=', 'radacct.username')
            ->where('services.status->value', 2)
            ->selectRaw('MAX(radacct.radacctid) as radacctid')
            //->when($usernames, fn($q) => $q->whereIn('radacct.username', $usernames))
            ->where('radacct.acctupdatetime', '>=', $ago)
            ->groupBy('radacct.username');

        $sessions = (new Radacct())->newQuery();

        $sessions->join('services', 'services.mikrotik_name', '=', 'radacct.username');
        $sessions->join('customers', 'services.customer_id', '=', 'customers.id');

        $sessions->select(
            'customers.id',
            'customers.name',
            'radacct.username',
            DB::raw('SUM(radacct.acctinputoctets) AS upload'),
            DB::raw('SUM(radacct.acctoutputoctets) AS download'),
            DB::raw('radacct.framedipaddress AS ip_address'),
            DB::raw('radacct.callingstationid AS mac_address'),
            DB::raw('radacct.acctsessiontime as time_diff')
        );

        // Only include latest active sessions per user
        $sessions->whereIn('radacct.radacctid', $sub)
            ->whereNull('radacct.acctstoptime');  // still online

        // Optional search filter
        if (request()->has('q')) {
            $sessions->where(function ($query) {
                $query->where('customers.name', 'Like', '%' . request()->input('q') . '%')
                    ->orWhere('customers.phone_number', 'Like', '%' . request()->input('q') . '%')
                    ->orWhere('services.mikrotik_name', 'Like', '%' . request()->input('q') . '%');
            });
        }

        // Pagination and sorting
        $per_page = request('per_page', 100);
        $sort = request('sort', 'asc');
        $sortCol = request('sort_col', 'id');

        // Correct groupBy table aliases
        $result = $sessions->groupBy(
            'radacct.username',
            'radacct.framedipaddress',
            'radacct.callingstationid',
            'radacct.acctstarttime'
        )
            ->orderBy($sortCol, $sort)
            ->paginate($per_page);

        // Format download/upload
        $result->getCollection()->transform(function ($session) {
            $session->download = $this->formatBytes($session->download);
            $session->upload = $this->formatBytes($session->upload);
            return $session;
        });

        // Return JSON
        return response()->json([
            'page' => $result->currentPage(),
            'per_page' => $result->perPage(),
            'total' => $result->total(),
            'total_pages' => ceil($result->total() / $result->perPage()),
            'data' => $result,
        ]);
    }

    public function ajaxOnline()
    {
        // Narrow radacct first (recent open sessions), then join billing tables.
        // The old join+MAX(radacctid) over the full 2M+ table was ~4–5s per page load.
        $sub = Radacct::query()
            ->recentlyUpdated('radacct.acctupdatetime')
            ->whereNull('radacct.acctstoptime')
            ->selectRaw('MAX(radacct.radacctid) as radacctid')
            ->groupBy('radacct.username');

        $sessions = Radacct::query()
            ->join('services', 'services.mikrotik_name', '=', 'radacct.username')
            ->join('customers', 'services.customer_id', '=', 'customers.id')
            ->where('services.status->value', 2)
            ->whereIn('radacct.radacctid', $sub)
            ->whereNull('radacct.acctstoptime')
            ->select(
                'customers.id',
                'customers.name',
                'radacct.username',
                'radacct.acctinputoctets AS upload',
                'radacct.acctoutputoctets AS download',
                'radacct.framedipaddress AS ip_address',
                'radacct.callingstationid AS mac_address',
                'radacct.acctsessiontime AS time_diff'
            );

        // Search (skip empty q — request()->has('q') is true for q=)
        if (request()->filled('q')) {
            $sessions->where(function ($query) {
                $query->where('customers.name', 'like', '%' . request('q') . '%')
                    ->orWhere('customers.phone_number', 'like', '%' . request('q') . '%')
                    ->orWhere('services.mikrotik_name', 'like', '%' . request('q') . '%')
                    ->orWhere('radacct.framedipaddress', 'like', '%' . request('q') . '%');
            });
        }

        $per_page = request('per_page', 100);
        $sort = strtolower(request('sort', 'asc')) === 'desc' ? 'desc' : 'asc';
        $sortCol = $this->onlineSortColumn(request('sort_col', 'id'));

        $result = $sessions
            ->orderBy($sortCol, $sort)
            ->paginate($per_page);

        // Format bytes
        $result->getCollection()->transform(function ($session) {
            $session->download = $this->formatBytes($session->download);
            $session->upload = $this->formatBytes($session->upload);
            return $session;
        });

        return response()->json([
            'page' => $result->currentPage(),
            'per_page' => $result->perPage(),
            'total' => $result->total(),
            'total_pages' => ceil($result->total() / $result->perPage()),
            'data' => $result,
        ]);
    }

    public function ajaxInvoices($id)
    {

        $invoice = (new Invoice)->newQuery();
        $invoice->leftJoin('services', 'invoices.services_id', '=', 'services.id');
        $invoice->leftJoin('customers', 'services.customer_id', '=', 'customers.id');
        $invoice->select('invoices.*', 'customers.name', 'customers.id as customer_id');
        $invoice->where('services.customer_id', $id);
        if (request()->has('q')) {
            $invoice->where(function ($query) {
                $query->where('customers.name', 'Like', '%' . request()->input('q') . '%');
                //->orWhere('customers.name', 'Like', '%' . request()->input('q') . '%');
            });
        }
        if (request()->has('start') && request()->has('end')) {
            $startDate = Carbon::parse(request()->input('start'))->format('Y-m-d H:i:s');
            $endDate = Carbon::parse(request()->input('end'))->format('Y-m-d H:i:s');
            $invoice->whereBetween('invoice_date', [$startDate, $endDate]);
        }
        $per_page = request('per_page', 10);
        $sort = request('sort', 'asc');
        $sortCol = request('sort_col', 'id');
        $result = new InvoiceCollection($invoice->orderBy($sortCol, $sort)->paginate($per_page));

        //return $result;
        return response()->json([
            'page' => $result->currentPage(),
            'per_page' => $result->perPage(),
            'total' => $result->total(),
            'total_pages' => ceil($result->total() / $result->perPage()),
            'data' => $result,
        ]);
    }

    public function ajaxServices(Request $request, $id)
    {
        $data = (object)json_decode($request->params, true);
        $services = (new Service)->newQuery();
        // Sorting
        if ($request->sortColumn && $request->sortDirection) {
            $services->orderBy($data->sortColumn, $data->sortDirection);
        }
        $services->leftJoin('plans', 'services.plan_id', '=', 'plans.id');
        $services->select('services.*', 'plans.title', 'plans.id AS plan_id', 'services.bill_to as due_date');
        $services->where('customer_id', $id);
        if ($data->search) {
            $services->where(function ($query) use ($data) {
                $query->where('plans.title', 'Like', '%' . $data->search . '%')
                    ->orWhere('services.mikrotik_name', 'like', '%' . $data->search . '%');
            });
        }
        $result = new ServiceCollection($services->paginate($data->per_page ?? 10));

        //return $result;
        return response()->json([
            'page' => $result->currentPage(),
            'per_page' => $result->perPage(),
            'total' => $result->total(),
            'total_pages' => ceil($result->total() / $result->perPage()),
            'data' => $result,
        ]);
    }

    public function checkOnline()
    {

        $routers = Router::whereNotNull('host')->whereNotNull('api_login')->whereNotNull('api_password')->whereNotNull('api_port')->get();
        foreach ($routers as $router) {
            $secrets = [];
            $response = check_online_customers($router);
            if ($response) {
                foreach ($response as $data) {
                    $secrets[] = $data['name'];
                    Service::join('plans', 'services.plan_id', '=', 'plans.id')->where('plans.router_id', $router->id)->where('mikrotik_name', $data['name'])->update(['online' => 1, 'mikrotik_ipv4' => $data['address'], 'log' => ['uptime' => $data['uptime'], 'caller-id' => $data['caller-id']]]);
                }
                Service::join('plans', 'services.plan_id', '=', 'plans.id')->where('plans.router_id', $router->id)->whereNotIn('mikrotik_name', $secrets)->update(['online' => 0]);
            }
        }
    }

    public function addCredit(Request $request, $id)
    {

        $messages = [
            'required' => 'The :attribute field is required.',
        ];

        $validator = Validator::make($request->all(), [
            'credit_type' => 'required',
            'amount' => 'required|numeric|min:1',
            'reason' => 'required|string'
        ], $messages);

        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
        }

        $customer = Customer::find($id);
        if ($customer) {
            $message = '';
            $actor = auth()->user();
            $actorTag = $actor
                ? sprintf(' [by %s #%d]', $actor->name ?: ($actor->email ?: 'user'), $actor->id)
                : ' [by unknown]';
            $reason = rtrim((string) $request->reason) . $actorTag;

            if ($request->credit_type['value'] === 'add') {
                $customer->increaseCredit($request->amount, $reason);
                $message = 'Credits added!';
            } else if ($request->credit_type['value'] === 'reduce') {
                $customer->decreaseCredit($request->amount, $reason);
                $message = 'Credits deducted!';
            } else {
                return response()->json(['message' => 'Request unkwown!'], 404);
            }
            return response()->json([
                'message' => $message
            ], 200);
        } else {
            return response()->json(['message' => 'Customer not found'], 404);
        }
    }

    public function resetCustomerPassword(Request $request)
    {
        $messages = [
            'required' => 'The :attribute field is required.',
        ];

        $validator = Validator::make($request->all(), [
            'password' => 'required|min:6',
        ], $messages);

        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
        }

        $customer = Customer::find($request->customer_id);
        $user = User::find($customer->user_id);

        if (!$user) {
            $customValidator = ValidationException::withMessages([
                'user' => 'Customer account has not yet been created',
            ]);
            return response()->json($customValidator->errors(), 422);
        } else if ($user && !$user->phone) {
            $customValidator = ValidationException::withMessages([
                'phone' => 'Phone number is empty',
            ]);
            return response()->json($customValidator->errors(), 422);
        }

        $user->markPasswordAsChanged();
        $user->forceFill([
            'password' => Hash::make($request->password),
        ])->save();

        return response()->json(['status' => 'Password saved']);
    }

    public function resetPassword(Request $request, $id)
    {
        $messages = [
            'required' => 'The :attribute field is required.',
        ];

        $validator = Validator::make($request->all(), [
            'password' => 'required|min:6',
        ], $messages);

        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
        }

        $customer = Customer::find($id);
        $user = User::find($customer->user_id);

        if (!$user) {
            $customValidator = ValidationException::withMessages([
                'user' => 'Customer account has not yet been created',
            ]);
            return response()->json($customValidator->errors(), 422);
        } else if ($user && !$user->phone) {
            $customValidator = ValidationException::withMessages([
                'phone' => 'Phone number is empty',
            ]);
            return response()->json($customValidator->errors(), 422);
        }

        $user->markPasswordAsChanged();
        $user->forceFill([
            'password' => Hash::make($request->password),
        ])->save();

        return response()->json(['status' => 'Password saved']);
    }

    public function sendWelcomeMessage(Request $request, $id)
    {
        try {
            $messages = [
                'required' => 'The :attribute field is required.',
            ];

            $validator = Validator::make($request->all(), [
                'message_type' => 'required',
            ], $messages);

            if ($validator->fails()) {
                return response()->json($validator->errors(), 422);
            }

            $customer = Customer::find($id);
            $user = User::find($customer->user_id);

            if (!$user) {
                return response()->json([
                    "result" => false,
                    "message" => 'Customer account has not yet been created'
                ]);
            } else if ($user && !$user->phone) {
                return response()->json([
                    "result" => false,
                    "message" => 'Phone number is empty'
                ]);
            }

            $password = Str::random(6);
            $token = (string) Str::uuid();
            $user->forceFill([
                'password' => Hash::make($password),
                'reset_token' => $token,
                'password_change_at' => NULL,
            ])->save();

            if ($request->message_type['value'] === 'sms') {
                $contentVars = [
                    'en' => [ //Optional wrap with locale
                        'portal_url' => 'https://app.tonycommgroupltd.com/portal',
                        'customer_login' => $user->phone,
                        'customer_password' => $password
                    ],
                ];

                $message = new WelcomeMessage($contentVars, 'welcome_message');
                $body = $message->renderMessage();

                send_sms(format_phone($user->phone), $body, $customer->id);
                return response()->json([
                    "result" => true,
                    "message" => 'Message sent'
                ]);
            } else if ($request->message_type['value'] === 'whatsapp') {
                $response = Http::withToken('aKsCEP0YvdH3AIjxYvtzAE56OOH4gLFzbjUS7OXGj2Ycm9wf1RClOCGy8I4NjR8j')
                    ->post('https://whatsapp.tonycommgroupltd.com/api/06f776a0-e844-4cfc-b471-032403174480/contact/send-template-message', [
                        "phone_number" => format_w_phone($user->phone),
                        "template_name" => "welcome_message",
                        "template_language" => "en",
                        "field_1" => $user->phone,
                        "field_2" => $password
                    ]);
                log_file('whatsapp_Delivery_Report_', $response);
                $data = $response->json();
                if (isset($data['result']) && $data['result'] == 'success') {
                    return response()->json([
                        "result" => true,
                        "message" => 'Message sent'
                    ]);
                } else {
                    return response()->json([
                        "result" => false,
                        "message" => 'An error has occurred sending whatsapp message'
                    ]);
                }
            }
        } catch (\Exception $e) {
            return response()->json([
                "result" => false,
                "message" => [
                    $e->getMessage()
                ]
            ]);
        }
    }

    public function ajaxPlans(Request $request, $id)
    {
        $has_more = false;
        $plans = (new Plan())->newQuery();
        $per_page = request('per_page', 10);
        if (request()->has('q')) {
            $plans->where(function ($query) {
                $query->where('title', 'Like', '%' . request()->input('q') . '%');
            });
        }
        $results = new PlanCollection($plans->orderBy('title', 'ASC')->paginate($per_page));

        if (request('page') < $results->lastPage()) {
            $has_more = true;
        }

        return response()->json([
            'options' => $results,
            'has_more' => $has_more
        ]);
    }

    public function createService(Request $request, $id)
    {
        $plan = Plan::find($request->plan['id']);
        if ($plan) {
            $messages = [
                'required' => 'The :attribute field is required.',
                'unique'    => 'The :attribute should be unique.',
                'regex' => 'Invalid characters in field mikrotik name (allowed only A-Z, a-z, 0-9 and dash).'
            ];

            $validator = Validator::make($request->all(), [
                'plan' => 'required',
                'price' => 'required|numeric|min:1',
                'start_date' => 'required',
                'mikrotik_name' => [
                    'required',
                    'regex:/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/',
                    'unique:services'
                ],
                'mikrotik_password' => 'required|min:4',
                'billing_type' => 'required',
                'billing_period' => 'required',
                'status' => 'required',
            ], $messages);

            if ($validator->fails()) {
                return response()->json($validator->errors(), 422);
            }

            $request['router_id'] = $plan->router_id;
            $request['customer_id'] = $id;
            $request['plan_id'] = $plan->id;

            if ($request->status['value'] === 0) {
                $service = Service::create($request->all());
                if ($request->installation) $this->sendAccountCreateMessage($service);
                if ($request->generate_invoice) $this->generateInvoice($service, $request);
                return response()->json([
                    'message' => 'Service added',
                    'service' => $service,
                    'result' => true
                ], 201);
            }

            $router = Router::find($plan->router_id);
            if ($router) {

                try {
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
                            'result' => false
                        ], 200);
                    } elseif (isset($response['after']['ret'])) {
                        $request['mikrotik_id'] = $response['after']['ret'];
                        $service = Service::create($request->all());
                        if ($request->installation) $this->sendAccountCreateMessage($service);
                        if ($request->generate_invoice) $this->generateInvoice($service, $request);
                        return response()->json([
                            'message' => 'Service added',
                            'service' => $service,
                            'result' => true
                        ], 201);
                    } else {
                        return response()->json([
                            'message' => 'Internal server error',
                            'result' => false
                        ], 200);
                    }
                } catch (\Exception $e) {
                    $response = $e->getMessage();
                    return response()->json([
                        'message' => $response,
                        'result' => false
                    ], 200);
                }
            } else {
                return response()->json([
                    'message' => __('Router not found in record!'),
                    'result' => false
                ], 200);
            }
        } else {
            return response()->json([
                'message' => __('Plan not found in record!'),
                'result' => false
            ], 200);
        }
    }

    public function allRouterPlans(Request $request, $id)
    {
        $plan = [];
        $service = Service::find($request->service_id);
        if ($service) {
            $plan = Plan::find($service->plan_id);
        }
        $has_more = false;
        $plans = (new Plan)->newQuery();
        if ($plan) {
            $plans->where('router_id', $plan->router_id);
        }
        $per_page = request('per_page', 10);
        if (request()->has('q')) {
            $plans->where(function ($query) {
                $query->where('title', 'Like', '%' . request()->input('q') . '%');
            });
        }
        $results = new PlanCollection($plans->orderBy('title', 'ASC')->paginate($per_page));

        if (request('page') < $results->lastPage()) {
            $has_more = true;
        }

        return response()->json([
            'options' => $results,
            'has_more' => $has_more
        ]);
    }

    public function editService(Request $request, $id)
    {
        $messages = [
            'required' => 'The :attribute field is required.',
            'unique'    => 'The :attribute should be unique.',
            'regex' => 'Invalid characters in field mikrotik name (allowed only A-Z, a-z, 0-9 and dash).'
        ];

        $validator = Validator::make($request->all(), [
            'plan' => 'required',
            'price' => 'required|numeric|min:1',
            'mikrotik_name' => ['regex:/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/', 'required', 'unique:services,mikrotik_name,' . $id],
            'mikrotik_password' => 'required|min:4',
            'status' => 'required',
        ], $messages);

        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
        }

        $service = Service::find($id);

        $plan = Plan::find($request->plan_id);
        if ($plan) {
            $request['plan_id'] = $plan->id;
            $router = Router::find($plan->router_id);
            if ($router) {
                try {
                    if ($request->status['value'] == 1 || $request->status['value'] == 2) {
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
                            ->equal('name', $request->mikrotik_name)
                            ->equal('password', $request->mikrotik_password)
                            ->equal('profile', $plan->rate_limit['label'])
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
                                'result' => false
                            ], 200);
                        } else if (isset($response2['after']['message'])) {
                            return response()->json([
                                'message' => ucfirst($response2['after']['message']),
                                'result' => false
                            ], 200);
                        }
                    }
                    $service->fill($request->all())->save();
                    return response()->json([
                        'message' => 'Service saved',
                        'service' => $service,
                        'result' => true
                    ], 200);
                } catch (\Exception $e) {
                    $response = $e->getMessage();
                    return response()->json([
                        'message' => $response,
                        'result' => false
                    ], 200);
                }
            } else {
                return response()->json([
                    'message' => __('Router not found in record!'),
                    'result' => false
                ], 200);
            }
        } else {
            $customValidator = ValidationException::withMessages([
                'plan' => __('Plan not found in record!'),
            ]);

            return response()->json($customValidator->errors(), 422);
        }
    }

    public function ajaxByBillingType()
    {
        $billingType = (int) request('billing_type', 1);
        if (!in_array($billingType, [1, 2], true)) {
            return response()->json(['message' => 'Invalid billing_type'], 422);
        }

        $filter = request('filter', 'all');
        $allowedFilters = ['all', 'active', 'online', 'online_credit', 'expired', 'disabled'];
        if (!in_array($filter, $allowedFilters, true)) {
            $filter = 'all';
        }

        $paymentDateSort = request('payment_date_sort', '');
        if (!in_array($paymentDateSort, ['', 'newest', 'oldest'], true)) {
            $paymentDateSort = '';
        }

        $baseQuery = Customer::active()->where(function ($query) use ($billingType) {
            $this->applyBillingTypeScope($query, $billingType);
        });

        $onlineUsernames = $this->onlineServiceUsernames();

        $stats = [
            'total' => (clone $baseQuery)->count(),
            'active' => (clone $baseQuery)->whereHas('services', function ($query) use ($billingType) {
                $query->where('status->value', 2);
                $this->applyServiceBillingTypeScope($query, $billingType);
            })->count(),
            'online' => (clone $baseQuery)->where(function ($query) use ($billingType, $onlineUsernames) {
                $this->applyOnlineBillingFilter($query, $billingType, $onlineUsernames);
            })->count(),
            'online_credit' => (clone $baseQuery)->where(function ($query) use ($billingType, $onlineUsernames) {
                $this->applyOnlineCreditBillingFilter($query, $billingType, $onlineUsernames);
            })->count(),
            'expired' => (clone $baseQuery)->whereHas('services', function ($query) use ($billingType) {
                $query->where('status->value', 3);
                $this->applyServiceBillingTypeScope($query, $billingType);
            })->count(),
            'disabled' => (clone $baseQuery)->whereHas('services', function ($query) use ($billingType) {
                $query->where('status->value', 1);
                $this->applyServiceBillingTypeScope($query, $billingType);
            })->count(),
        ];

        $customers = clone $baseQuery;

        if (request()->filled('q')) {
            $search = request('q');
            $customers->where(function ($query) use ($search) {
                $query->where('name', 'like', '%' . $search . '%')
                    ->orWhere('phone_number', 'like', '%' . $search . '%');
            });
        }

        if ($filter === 'active') {
            $customers->whereHas('services', function ($query) use ($billingType) {
                $query->where('status->value', 2);
                $this->applyServiceBillingTypeScope($query, $billingType);
            });
        } elseif ($filter === 'online') {
            $this->applyOnlineBillingFilter($customers, $billingType, $onlineUsernames);
        } elseif ($filter === 'online_credit') {
            $this->applyOnlineCreditBillingFilter($customers, $billingType, $onlineUsernames);
        } elseif ($filter === 'expired') {
            $customers->whereHas('services', function ($query) use ($billingType) {
                $query->where('status->value', 3);
                $this->applyServiceBillingTypeScope($query, $billingType);
            });
        } elseif ($filter === 'disabled') {
            $customers->whereHas('services', function ($query) use ($billingType) {
                $query->where('status->value', 1);
                $this->applyServiceBillingTypeScope($query, $billingType);
            });
        }

        $per_page = request('per_page', 10);
        $sort = request('sort', 'asc');
        $sortCol = request('sort_col', 'id');

        if ($paymentDateSort !== '') {
            $direction = $paymentDateSort === 'newest' ? 'desc' : 'asc';
            $nullOrder = $paymentDateSort === 'newest' ? 'ASC' : 'DESC';
            $latestPaymentSub = Payment::query()
                ->select('customer_id', DB::raw('MAX(id) as last_payment_id'))
                ->groupBy('customer_id');

            $customers->leftJoinSub($latestPaymentSub, 'lp', function ($join) {
                $join->on('lp.customer_id', '=', 'customers.id');
            })
                ->leftJoin('payments as lp_row', 'lp_row.id', '=', 'lp.last_payment_id')
                ->select('customers.*')
                ->orderByRaw('lp_row.date IS NULL ' . $nullOrder)
                ->orderBy('lp_row.date', $direction)
                ->orderBy('customers.id', 'asc');
        } else {
            $customers->orderBy($sortCol, $sort);
        }

        $paginator = $customers->paginate($per_page);
        $rows = collect($paginator->items())->map(function ($customer) {
            return $customer->toArray();
        })->all();
        $rows = $this->attachLastPayments($rows);

        return response()->json([
            'stats' => $stats,
            'filter' => $filter,
            'payment_date_sort' => $paymentDateSort,
            'billing_type' => $billingType,
            'page' => $paginator->currentPage(),
            'per_page' => $paginator->perPage(),
            'total' => $paginator->total(),
            'total_pages' => ceil($paginator->total() / max(1, $paginator->perPage())),
            'data' => $rows,
        ]);
    }

    /**
     * Attach latest payment (date/amount/type/reason) for payment-vs-service tracking.
     * M-Pesa reason = trans_id; credit reason = balances grant/use note.
     */
    private function attachLastPayments(array $rows): array
    {
        $ids = collect($rows)->pluck('id')->filter()->unique()->values()->all();
        if (!$ids) {
            return $rows;
        }

        $latestIds = Payment::query()
            ->select(DB::raw('MAX(id) as id'))
            ->whereIn('customer_id', $ids)
            ->groupBy('customer_id')
            ->pluck('id');

        $payments = Payment::query()
            ->whereIn('id', $latestIds)
            ->get()
            ->keyBy('customer_id');

        $balances = DB::table('balances')
            ->whereIn('balanceable_id', $ids)
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get()
            ->groupBy('balanceable_id');

        foreach ($rows as &$row) {
            $customerId = $row['id'] ?? null;
            $payment = $customerId ? ($payments[$customerId] ?? null) : null;
            if (!$payment) {
                $row['last_payment'] = null;
                continue;
            }

            $type = strtolower((string) $payment->payment_type);
            $reason = null;
            $grantedBy = null;
            if ($type === 'mpesa') {
                $reason = $payment->trans_id ?: null;
            } elseif ($type === 'credit') {
                $customerBalances = $balances->get($customerId, collect());
                $invoiceId = $payment->invoice_id;
                $decrease = $customerBalances->first(function ($b) use ($invoiceId, $payment) {
                    if ((int) $b->amount >= 0) {
                        return false;
                    }
                    if ($invoiceId && str_contains((string) $b->reason, 'Invoice ID: ' . $invoiceId)) {
                        return true;
                    }
                    return abs((int) $b->amount) === (int) round((float) $payment->sum);
                });
                // Prefer the credit-grant reason (why they got free/credit internet).
                $grant = $customerBalances->first(function ($b) use ($decrease) {
                    if ((int) $b->amount <= 0) {
                        return false;
                    }
                    if (!$decrease) {
                        return true;
                    }
                    return $b->created_at <= $decrease->created_at;
                });
                $rawReason = (string) ($grant->reason ?? $decrease->reason ?? ('Invoice #' . ($invoiceId ?: 'n/a')));
                if (preg_match('/\s*\[by\s+(.+?)(?:\s+#(\d+))?\]\s*$/i', $rawReason, $matches)) {
                    $grantedBy = trim($matches[1]);
                    $reason = trim(preg_replace('/\s*\[by\s+.+?\]\s*$/i', '', $rawReason));
                } else {
                    $reason = $rawReason !== '' ? $rawReason : null;
                }
            } else {
                $reason = $payment->trans_id ?: null;
            }

            $row['last_payment'] = [
                'date' => $payment->date,
                'sum' => (float) $payment->sum,
                'payment_type' => $payment->payment_type,
                'payment_type_label' => ucfirst((string) $payment->payment_type),
                'trans_id' => $payment->trans_id,
                'invoice_id' => $payment->invoice_id,
                'reason' => $reason,
                'granted_by' => $grantedBy,
            ];
        }
        unset($row);

        return $rows;
    }

    /**
     * Match customers by service billing type (primary) or customer billing_type (legacy).
     */
    private function applyBillingTypeScope($query, int $billingType): void
    {
        if ($billingType === 2) {
            $query->where(function ($q) {
                $q->where('billing_type->value', 2)
                    ->orWhereHas('services', function ($sq) {
                        $sq->where('billing_type->value', 2);
                    });
            });
            return;
        }

        // Recurring: at least one non-prepaid service, or legacy customer record without services.
        $query->where(function ($q) {
            $q->whereHas('services', function ($sq) {
                $this->applyServiceBillingTypeScope($sq, 1);
            })->orWhere(function ($legacy) {
                $legacy->where(function ($c) {
                    $c->where('billing_type->value', 1)->orWhereNull('billing_type');
                })->doesntHave('services');
            });
        });
    }

    private function applyOnlineBillingFilter($query, int $billingType, array $onlineUsernames): void
    {
        $query->whereHas('services', function ($serviceQuery) use ($billingType, $onlineUsernames) {
            $serviceQuery->where('status->value', 2)
                ->whereIn('mikrotik_name', $onlineUsernames);
            $this->applyServiceBillingTypeScope($serviceQuery, $billingType);
        });
    }

    /**
     * Online now and latest payment was made with wallet credit.
     */
    private function applyOnlineCreditBillingFilter($query, int $billingType, array $onlineUsernames): void
    {
        $this->applyOnlineBillingFilter($query, $billingType, $onlineUsernames);

        $latestPaymentSub = Payment::query()
            ->select('customer_id', DB::raw('MAX(id) as last_payment_id'))
            ->groupBy('customer_id');

        $query->whereIn('customers.id', function ($sub) use ($latestPaymentSub) {
            $sub->select('p.customer_id')
                ->from('payments as p')
                ->joinSub($latestPaymentSub, 'latest_pay', function ($join) {
                    $join->on('latest_pay.customer_id', '=', 'p.customer_id')
                        ->on('latest_pay.last_payment_id', '=', 'p.id');
                })
                ->where('p.payment_type', 'credit');
        });
    }

    private function applyServiceBillingTypeScope($query, int $billingType): void
    {
        if ($billingType === 2) {
            $query->where('billing_type->value', 2);
            return;
        }

        $query->where(function ($q) {
            $q->where('billing_type->value', 1)->orWhereNull('billing_type');
        });
    }

    private function onlineSortColumn(?string $col)
    {
        $map = [
            'id' => 'customers.id',
            'customers.id' => 'customers.id',
            'name' => 'customers.name',
            'customers.name' => 'customers.name',
            'username' => 'radacct.username',
            'ip_address' => 'radacct.framedipaddress',
            'mac_address' => 'radacct.callingstationid',
        ];

        return $map[$col] ?? 'customers.id';
    }

    private function onlineServiceUsernames(): array
    {
        return array_keys($this->radiusSessionMap());
    }

    /**
     * Latest open RADIUS session per PPPoE username (last 7 minutes).
     *
     * @return array<string, object>
     */
    private function radiusSessionMap(): array
    {
        static $cache = null;
        if ($cache !== null) {
            return $cache;
        }

        $sub = Radacct::query()
            ->recentlyUpdated('radacct.acctupdatetime')
            ->whereNull('radacct.acctstoptime')
            ->selectRaw('MAX(radacct.radacctid) as radacctid')
            ->groupBy('radacct.username');

        $rows = Radacct::query()
            ->join('services', 'services.mikrotik_name', '=', 'radacct.username')
            ->where('services.status->value', 2)
            ->whereIn('radacct.radacctid', $sub)
            ->whereNull('radacct.acctstoptime')
            ->select(
                'radacct.username',
                'radacct.framedipaddress',
                'radacct.callingstationid',
                'radacct.acctsessiontime'
            )
            ->get();

        $cache = [];
        foreach ($rows as $row) {
            $cache[$row->username] = $row;
        }

        return $cache;
    }

    private function attachRadiusToCustomers($paginator): void
    {
        try {
            $radiusMap = $this->radiusSessionMap();
        } catch (\Throwable $e) {
            return;
        }

        $customerIds = $paginator->getCollection()->pluck('id')->filter()->values();
        $servicesByCustomer = Service::whereIn('customer_id', $customerIds)
            ->get()
            ->groupBy('customer_id');

        $paginator->getCollection()->transform(function ($customer) use ($radiusMap, $servicesByCustomer) {
            $services = $servicesByCustomer->get($customer->id, collect());
            foreach ($services as $service) {
                $username = $service->mikrotik_name;
                $active = (int) ($service->status['value'] ?? 0) === 2;
                $session = ($active && $username && isset($radiusMap[$username])) ? $radiusMap[$username] : null;
                $service->setAttribute('online', $session ? 1 : 0);
                $service->setAttribute(
                    'mikrotik_ipv4',
                    ($session && !empty($session->framedipaddress)) ? $session->framedipaddress : null
                );
            }
            $customer->setRelation('services', $services->values());
            return $customer;
        });
    }

    private function enrichCustomerServicesWithRadius(array $customerRow, array $radiusMap): array
    {
        if (empty($customerRow['services']) || !is_array($customerRow['services'])) {
            return $customerRow;
        }

        foreach ($customerRow['services'] as &$svc) {
            $username = $svc['mikrotik_name'] ?? null;
            $session = ($username && isset($radiusMap[$username])) ? $radiusMap[$username] : null;
            $svc['online'] = $session ? 1 : 0;
            if ($session && !empty($session->framedipaddress)) {
                $svc['mikrotik_ipv4'] = $session->framedipaddress;
            }
        }
        unset($svc);

        return $customerRow;
    }

    private function formatBytes($bytes, $precision = 2)
    {
        $units = ['bytes', 'KB', 'MB', 'GB', 'TB'];

        $bytes = max($bytes, 0);
        $power = $bytes > 0 ? floor(log($bytes, 1024)) : 0;

        return number_format($bytes / pow(1024, $power), $precision) . ' ' . $units[$power];
    }
}
