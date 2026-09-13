<?php

namespace App\Http\Controllers;

use App\Exceptions\CustomException;
use App\Messages\AccountCreationMessage;
use App\Models\MessageDetail;
use Illuminate\Http\Request;
use App\Messages\InvoiceCreateMessage;
use App\Messages\OnPaymentMessage;
use App\Messages\PaymentReminderMessage;
use App\Messages\WelcomeMessage;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\IpStat;
use App\Models\MessageTemplate;
use App\Models\Plan;
use App\Models\Router;
use App\Models\Service;
use App\Models\User;
use App\Models\WhatsappDetail;
use App\Models\WhatsappTemplate;
use Carbon\Carbon;
use Exception;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Number;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use LaravelDaily\Invoices\Invoice as DailyInvoice;
use LaravelDaily\Invoices\Classes\Buyer;
use LaravelDaily\Invoices\Classes\Party;
use LaravelDaily\Invoices\Classes\InvoiceItem;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use Spatie\Permission\Models\Role;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Hash;

class SmsController extends Controller
{
    /**
     * Create a new SmsController instance.
     *
     * @return void
     */
    public function __construct()
    {
        $this->middleware('auth:api', ['except' => ['sendSms', 'deliveryReports', 'sendWhatsappMessage', 'demoTest', 'ajaxWhatsapp']]);
    }

    public function resendSMS($id)
    {
        $message = MessageDetail::find($id);
        if ($message) {
            $response = send_sms($message->recipient, $message->message, $message->customer_id);
            return response()->json([
                'message' => $response
            ], 200);
        } else {
            return response()->json(['message' => 'Message not found'], 404);
        }
    }

    public function sendSms($to, $msg, $customer_id = 0)
    {
        $base_url = 'https://quicksms.advantasms.com/api/services/sendsms/';
        $success_word = 'Success';
        $sms = MessageDetail::create(['message' => $msg, 'recipient' => $to, 'notice' => '', 'customer_id' => $customer_id]);
        $curl_post_data = array(
            //Fill in the request parameters with valid values
            'partnerID' => config('sms.partnerID'),
            'apikey' => config('sms.apikey'),
            'shortcode' => config('sms.shortcode'),
            'message' => $msg,
            'mobile' => $to,
        );

        $post = json_encode($curl_post_data);

        $response = curl_get_data($base_url, $post);

        if (!$response) {
            if (strlen($to) != 12) {
                $status = 'Invalid or Unsupported phone number.';
            } else {
                $status = 'Connection to Gateway Failed.';
            }
            $sms->status = 'failed';
            $sms->cost = 0;
            $sms->dlr = 'failed';
            $sms->notice = $status;
            $sms->save();
        } else {
            if ((stripos(strtolower($response), strtolower($success_word)) !== false)) {
                $result = json_decode($response, true);
                $status = $result;
                $message_id = $result['responses'][0]['messageid'];
                $network_id = $result['responses'][0]['networkid'];
                $status = 'sent';
                $sms->message_id = $message_id;
                $sms->network_id = $network_id;
                $sms->status = 'sent';
                $sms->cost = 0;
                $sms->dlr = 'sent';
                $sms->save();
            } else {
                $status = $response;
                $sms->status = 'failed';
                $sms->cost = 0;
                $sms->dlr = 'failed';
                $sms->notice = $status;
                $sms->save();
            }
        }

        return $status;
    }

    public function deliveryReports(Request $request)
    {
        $data = $request->all();
        if ($data && $data['messageid']) {
            $sms = MessageDetail::where('message_id', $data['messageid'])->first();
            if ($sms) {
                $sms->network_report = $data;
                $sms->save();
            }
        }
    }

    public function sendWhatsappMessage()
    {
        try {
            $template_name = 'invoice_create';
            $template = WhatsappTemplate::where('name', $template_name)->where('whatsapp_business_account_id', config('whatsapp.whatsapp_business_account_id'))->first();
            $messages = MessageDetail::where(function ($query) {
                $query->whereNull('network_report->description')
                    ->orWhere('network_report->description', '!=', 'DeliveredToTerminal');
            })->where('status', 'sent')->whereNotNull('components')->whereDate('created_at', Carbon::today())->get();
            if ($template) {
                foreach ($messages as $message) {
                    $components = array(array(
                        "type" => "body",
                        "parameters" => array(array("type" => "text", "text" => $message->components['due_date']), array("type" => "text", "text" => $message->components['due_amount']), array("type" => "text", "text" => $message->components['account']))
                    ));
                    $to = $message->recipient;
                    $body = $template->body['text'];
                    $parameters = $components[0]['parameters'];
                    $body = generate_whatsapp_body($parameters, $body);
                    $response = send_whatsapp_message($to, $template_name, $template->language, '', '', $components);
                    $customer = c2b_user($to);
                    $data = $response->json();
                    if (isset($data['error'])) {
                        $whatsapp = new WhatsappDetail();
                        if ($customer) $whatsapp->customer_id = $customer->id;
                        $whatsapp->components = $components;
                        $whatsapp->message_description = $body;
                        $whatsapp->template_id = $template->id;
                        $whatsapp->status = 'failed';
                        $whatsapp->data = $data['error'];
                        $whatsapp->save();
                        print_r($data['error']);
                    } else {
                        $whatsapp = new WhatsappDetail();
                        if ($customer) $whatsapp->customer_id = $customer->id;
                        $whatsapp->components = $components;
                        $whatsapp->message_description = $body;
                        $whatsapp->template_id = $template->id;
                        $whatsapp->contacts = $data['contacts'];
                        $whatsapp->messages = $data['messages'];
                        $whatsapp->save();
                        print_r($data);
                    }
                }
                //echo Carbon::now();
            } else {
                echo 'Template not found';
                throw new NotFoundHttpException('Template not found.');
            }
        } catch (\Exception $e) {
            $response = $e->getMessage();
            Log::alert($response);
        }
    }

    public function demoTest()
    {
        /*$contentVars = [
            'en' => [ //Optional wrap with locale
                'due_date' => Carbon::now()->format('jS M Y \a\t h:i a'),
                'due_amount' => 'Ksh1000',
                'account' => '0702508131'
            ],
        ];

        $message = new InvoiceCreateMessage($contentVars, 'invoice_create');
        $body = $message->renderMessage();
        $template = MessageTemplate::where('message_class', 'invoice_create')->first();*/

        /*$contentVars = [
            'en' => [ //Optional wrap with locale
                'due_amount' => 'Ksh1000',
                'account' => '0702508131'
            ],
        ];

        $message = new PaymentReminderMessage($contentVars, 'payment_reminder');
        $body = $message->renderMessage();
        $template = MessageTemplate::where('message_class', 'payment_reminder')->first();

        send_sms('0702508131', $body, 1, $contentVars, $template->id);
        print_r($body);*/

        /*$template_name = 'payment_reminder';
        $template = WhatsappTemplate::where('name', $template_name)->where('whatsapp_business_account_id', config('whatsapp.whatsapp_business_account_id'))->first();
        $components = array(array(
            "type" => "body",
            "parameters" => array(array("type" => "text", "text" => 'Ksh1000'), array("type" => "text", "text" => '0702508131'))
        ));
        $to = '254702508131';
        $body = $template->body['text'];
        $parameters = $components[0]['parameters'];
        $body = generate_whatsapp_body($parameters, $body);
        send_whatsapp_message($to, $template_name, $template->language, '', '', $components);
        print_r($body);*/

        /*$date = Carbon::now()->subDays(7);
        $startDay = $date->copy()->startOfDay();
        $endDay = $date->copy()->endOfDay();
        $invoices = Invoice::where('status->value', 1)->where('last_rdr_check', 0)->whereBetween('due_date', [$startDay, $endDay])->get();
        foreach($invoices as $invoice){
            print_r($invoice);
            echo '<br>';
        }*/

        /*$contentVars = [
            'en' => [ //Optional wrap with locale
                'account' => '0702508131'
            ],
        ];

        $message = new AccountCreationMessage($contentVars, 'account_creation');
        $body = $message->renderMessage();
        $template = MessageTemplate::where('message_class', 'account_creation')->first();

        send_sms('0702508131', $body, 1, $contentVars, $template->id);
        print_r($body);*/

        /*$template_name = 'account_creation';
        $template = WhatsappTemplate::where('name', $template_name)->where('whatsapp_business_account_id', config('whatsapp.whatsapp_business_account_id'))->first();
        $components = array(array(
            "type" => "body",
            "parameters" => array(array("type" => "text", "text" => '0702508131'))
        ));
        $to = '254702508131';
        $body = $template->body['text'];
        $parameters = $components[0]['parameters'];
        $body = generate_whatsapp_body($parameters, $body);
        send_whatsapp_message($to, $template_name, $template->language, '', '', $components);
        print_r($body);*/

        /*$contentVars = [];

        $message = new OnPaymentMessage($contentVars, 'on_payment');
        $body = $message->renderMessage();
        $template = MessageTemplate::where('message_class', 'on_payment')->first();

        send_sms('0702508131', $body, 1, $contentVars, $template->id);
        print_r($body);*/

        /*$template_name = 'on_payment';
        $template = WhatsappTemplate::where('name', $template_name)->where('whatsapp_business_account_id', config('whatsapp.whatsapp_business_account_id'))->first();
        
        $to = '254702508131';
        $body = $template->body['text'];
        $parameters = [];
        $body = generate_whatsapp_body($parameters, $body);
        send_whatsapp_message($to, $template_name, $template->language, '', '');
        print_r($body);*/

        /*$templates_id = MessageTemplate::where('message_class', '!=', 'invoice_create')->pluck('id');
        $messages = MessageDetail::whereIn('template_id', $templates_id)->where('last_dlr_check', 0)->where(function ($query) {
            $query->whereNull('network_report->description')
                ->orWhere('network_report->description', '!=', 'DeliveredToTerminal');
        })->where('status', 'sent')->get();
        foreach ($messages as $message) {
            $template = MessageTemplate::find($message->template_id);
            print_r(generate_whatsapp_body_var($template->message_class, $message->components));
            echo '<br><br>';
        }*/
        //$customer = Customer::find(1);
        //echo $customer->withCurrency('EUR')->creditCurrency;
        //echo Number::currency(25, in: 'KES');
        //$customer->decreaseCredit(250, 'Service usage');
        /*$customer = new Buyer([
            'name'          => 'John Doe',
            'account'       => '0702508131',
            'due_date'      => Carbon::now()->format('l, F jS, Y'),
            'custom_fields' => [
                'email' => 'test@example.com',
            ],
        ]);

        $seller = new Party([
            'name'          => 'Tonycomm Group Ltd',
            'phone'         => '0110345166',
            'paybill'       => '4129711',
            'custom_fields' => [
                'note'        => 'IDDQD',
                'business id' => '365#GG',
            ],
        ]);

        $item = InvoiceItem::make('Service 1')->pricePerUnit(2);

        $invoice = DailyInvoice::make()
            ->status(__('invoices::invoice.paid'))
            ->sequence(669)
            ->serialNumberFormat('{SEQUENCE}')
            ->seller($seller)
            ->buyer($customer)
            ->date(now())
            ->dateFormat('l, F jS, Y')
            ->payUntilDays(14)
            ->currencySymbol('KSh')
            ->currencyCode('KES')
            ->currencyFormat('{SYMBOL}{VALUE}')
            ->filename('Invoice-444')
            ->addItem($item)
            ->logo(public_path('assets/images/logo.png'))
            ->save('public');

        return $invoice->stream();*/
        //$file = File::get(storage_path('app/public/Invoice-444.pdf'));
        //echo File::size(storage_path('app/public/Invoice-444.pdf'));
        //echo File::extension(storage_path('app/public/Invoice-444.pdf'));
        /*$date = "2024-07-27 04:03:00";

        echo $diff = now()->diffInDays(Carbon::parse($date));*/

        /*$accessToken = config('whatsapp.access_token');
        $response = Http::withHeaders([
            'Authorization' => 'Bearer ' . $accessToken,
        ])->get(config('whatsapp.api_uri') . '/1180994519712534');
        $data = $response->json();

        $media = Http::withHeaders([
            'Authorization' => 'Bearer ' . $accessToken,
            'Content-Type' => $data['mime_type'],
        ])->get($data['url']);
        echo base64_encode($media->body());*/
        //Role::create(['name' => 'reseller', 'display_name' => 'Reseller', 'guard_name' => 'api']);
        /*$routers = Router::whereNotNull('host')->whereNotNull('api_login')->whereNotNull('api_password')->whereNotNull('api_port')->get();
        foreach ($routers as $router) {
            $secrets = [];
            $response = check_online_customers($router);
            if ($response) {
                print_r($response);
            }
        }*/
        /*$stats = IpStat::whereNull('name')->where('created_at', '>=', Carbon::now()->subMinutes(6)->toDateTimeString())->get();
        foreach ($stats as $stat) {
            $data = IpStat::where('ipv4_address', $stat->ipv4_address)->whereNotNull('name')->latest()->first();
            if ($data) {
                $stat->name = $data->name;
                $stat->session_id = $data->session_id;
                $stat->caller_id = $data->caller_id;
                $stat->save();
            }
        }*/
        //$services = Service::where('price', '>', 0)->get();
        //echo count($services);
        /*$services = Service::whereNull('router_id')->get();
        foreach($services as $service){
            $plan = Plan::find($service->plan_id);
            $service->router_id = $plan->router_id;
        }*/
        /*$invoice = Invoice::find(17);
        return download_pdf($invoice);*/
        /*$contentVars = [
            'en' => [ //Optional wrap with locale
                'portal_url' => 'https://app.tonycommgroupltd.com/portal',
                'customer_login' => '0702508131',
                'customer_password' => '0702508131'
            ],
        ];

        $message = new WelcomeMessage($contentVars, 'welcome_message');
        $body = $message->renderMessage();
        $template = MessageTemplate::where('message_class', 'welcome_message')->first();

        send_sms('0702508131', $body, 1, $contentVars, $template->id);
        echo $body;*/
        /*$template_name = 'welcome_message';
        $template = WhatsappTemplate::where('name', $template_name)->where('whatsapp_business_account_id', config('whatsapp.whatsapp_business_account_id'))->first();
        $components = array(array(
            "type" => "body",
            "parameters" => array(array("type" => "text", "text" => '0702508131'), array("type" => "text", "text" => '#Matinje2024'))
        ));
        $to = '254702508131';
        $body = $template->body['text'];
        $parameters = $components[0]['parameters'];
        $body = generate_whatsapp_body($parameters, $body);
        send_whatsapp_message($to, $template_name, $template->language, '', '', $components);
        echo $body;*/
        /*$customer = Customer::find(12);
        if (!$customer) return response()->json(['message' => 'Customer not found'], 404);
        $stats_session = IpStat::where('customer_id', 12)->where('created_at', '>=', Carbon::now()->subMinutes(5)->toDateTimeString())->whereNotNull('session_id')->groupBy('session_id')->pluck('session_id');
        $sessions = IpStat::select('session_id', 'name', 'ipv4_address', DB::raw('SUM(in_bytes) AS sum_in_bytes'), DB::raw('SUM(out_bytes) AS sum_out_bytes'), DB::raw('min(created_at) as start_at'))->whereIn('session_id', $stats_session)->groupBy('session_id', 'name', 'ipv4_address')->get();
        return response()->json([
            'sessions' => $sessions
        ], 200);*/
        /*$stats = IpStat::select(DB::raw('DATE(created_at) as created_at'), DB::raw('SUM(in_bytes) AS sum_in_bytes'), DB::raw('SUM(out_bytes) AS sum_out_bytes'))->where('customer_id', 12)->groupBy(DB::raw('DATE(created_at)'))->get();
        print_r($stats);*/
        //return (string) Str::uuid();
        $response = Http::withToken('aKsCEP0YvdH3AIjxYvtzAE56OOH4gLFzbjUS7OXGj2Ycm9wf1RClOCGy8I4NjR8j')
            ->post('https://whatsapp.tonycommgroupltd.com/api/06f776a0-e844-4cfc-b471-032403174480/contact/send-template-message', [
                "phone_number" => "254702508131",
                "template_name" => "invoice_create",
                "template_language" => "en",
                "field_1" => "16/08/2020 23:00",
                "field_2" => "KSH5000",
                "field_3" => "0702508131"
            ]);

        return $response;
    }

    public function ajaxWhatsapp()
    {
        //$whatsapp_details = WhatsappDetail::where('statuses', DB::raw("json_array()"))->get();
        /*$whatsapp_details = WhatsappDetail::when($positions , function($query) use ($positions) {
            $query->where(function ($query) use ($positions) {
                foreach($positions as $position) {
                    $query->orWhereJsonContains('positions', ['name' => $position]);
                }
            });
        })->get();*/
        /*$whatsapp_details = WhatsappDetail::where(function ($query) {
            $query->whereJsonContains('messages', ['from' => '254702508131']);
        })->get();*/
        /*$whatsapp_details = WhatsappDetail::where('data->metadata->phone_number_id', config('whatsapp.from_phone_number_id'))->where(function ($query) {
            $query->where('statuses', DB::raw("json_array()"))
                ->orWhere('statuses', NULL);
        })->get();
        $whatsapp_details = WhatsappDetail::whereNull('data->metadata->phone_number_id')->where(function ($query) {
            $query->where('statuses', DB::raw("json_array()"))
                ->orWhere('statuses', NULL);
        })->get();*/
        $whatsapp_details = WhatsappDetail::get();
        foreach ($whatsapp_details as $whatsapp) {
            if (isset($whatsapp->statuses[0]['wamId']) && isset($whatsapp->statuses[0]['status'])) {
                $data = WhatsappDetail::whereJsonContains('messages', ['wamId' => $whatsapp->statuses[0]['wamId']])->orWhereJsonContains('messages', ['id' => $whatsapp->statuses[0]['wamId']])->first();
                print_r($data);
                echo '<br>';
            }
        }
    }

    public function sendWelcomeMessage(Request $request)
    {
        $messages = [
            'required' => 'The :attribute field is required.',
        ];

        $validator = Validator::make($request->all(), [
            'message_type' => 'required',
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

            return response()->json(['status' => 'Message sent']);
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
                return response()->json(['status' => 'Message sent']);
            } else {
                $customValidator = ValidationException::withMessages([
                    'message' => 'An error has occurred sending whatsapp message',
                ]);
                return response()->json($customValidator->errors(), 422);
            }
        }
    }

    public function queueBulkSMS(Request $request)
    {
        $request->validate([
            'count' => 'required|integer|min:1',
            'smslist' => 'required|array|min:1',
            'smslist.*.message' => 'required|string|max:1000',
            'smslist.*.mobile' => 'required|string|max:20',
            'smslist.*.customer_id' => 'nullable|integer',
        ]);

        $queued = 0;
        $skipped = 0;
        foreach ($request->smslist as $sms) {
            $mobile = $this->normalizeMobile($sms['mobile'] ?? '');
            if (!$mobile) {
                $skipped++;
                continue;
            }
            $message = (string) ($sms['message'] ?? '');
            $hash = md5($message);
            $exists = MessageDetail::where('recipient', $mobile)
                ->where('message_hash', $hash)
                ->whereIn('status', ['pending', 'sent', 'queued'])
                ->exists();
            if ($exists) {
                $skipped++;
                continue;
            }
            MessageDetail::create([
                'message' => $message,
                'message_hash' => $hash,
                'recipient' => $mobile,
                'notice' => '',
                'customer_id' => (int) ($sms['customer_id'] ?? 0),
                'status' => 'pending',
                'components' => [],
            ]);
            $queued++;
        }

        return response()->json([
            'status' => 'queued',
            'queued_count' => $queued,
            'skipped_count' => $skipped,
        ]);
    }

    /**
     * Send one SMS immediately (manual compose).
     */
    public function sendSingle(Request $request)
    {
        $data = $request->validate([
            'message' => 'required|string|min:1|max:1000',
            'phone' => 'nullable|string|max:20',
            'customer_id' => 'nullable|integer|exists:customers,id',
        ]);

        if (empty($data['phone']) && empty($data['customer_id'])) {
            return response()->json(['message' => 'Provide a phone number or select a customer.'], 422);
        }

        $customerId = (int) ($data['customer_id'] ?? 0);
        $phone = $data['phone'] ?? null;

        if ($customerId) {
            $customer = Customer::find($customerId);
            if (!$customer) {
                return response()->json(['message' => 'Customer not found'], 404);
            }
            if (!$phone) {
                $phone = $customer->phone_number;
            }
            $customerId = $customer->id;
        }

        $mobile = $this->normalizeMobile($phone);
        if (!$mobile) {
            return response()->json(['message' => 'Invalid or unsupported phone number.'], 422);
        }

        $status = send_sms($mobile, $data['message'], $customerId ?: null);
        $ok = is_string($status) && strtolower($status) === 'sent';

        return response()->json([
            'status' => $status,
            'recipient' => $mobile,
            'ok' => $ok,
            'message' => $ok ? 'SMS sent' : ('SMS not sent: ' . (is_string($status) ? $status : 'unknown error')),
        ], $ok ? 200 : 422);
    }

    /**
     * Queue SMS to a filtered customer group (drained by sms:send-bulk).
     */
    public function sendGroup(Request $request)
    {
        $data = $request->validate([
            'message' => 'required|string|min:1|max:1000',
            'billing_type' => 'nullable|integer|in:1,2',
            'category' => 'nullable|integer|in:1,2,3',
            'send_via' => 'nullable|string|in:sms,whatsapp,all',
            'service_status' => 'nullable|integer|in:0,1,2,3',
            'preview_only' => 'nullable|boolean',
        ]);

        $message = $data['message'];
        $hash = md5($message);
        $query = $this->groupAudienceQuery($data);
        $customers = $query->select('id', 'name', 'phone_number', 'send_via')->get();

        if (!empty($data['preview_only'])) {
            $valid = 0;
            foreach ($customers as $customer) {
                if ($this->normalizeMobile($customer->phone_number)) {
                    $valid++;
                }
            }
            return response()->json([
                'preview' => true,
                'matched' => $customers->count(),
                'valid_recipients' => $valid,
            ]);
        }

        $queued = 0;
        $skipped = 0;
        $invalid = 0;

        foreach ($customers as $customer) {
            $mobile = $this->normalizeMobile($customer->phone_number);
            if (!$mobile) {
                $invalid++;
                continue;
            }

            $exists = MessageDetail::where('recipient', $mobile)
                ->where('message_hash', $hash)
                ->exists();
            if ($exists) {
                $skipped++;
                continue;
            }

            MessageDetail::create([
                'message' => $message,
                'message_hash' => $hash,
                'recipient' => $mobile,
                'notice' => '',
                'customer_id' => $customer->id,
                'status' => 'pending',
                'components' => [],
            ]);
            $queued++;
        }

        return response()->json([
            'status' => 'queued',
            'matched' => $customers->count(),
            'queued_count' => $queued,
            'skipped_count' => $skipped,
            'invalid_count' => $invalid,
            'note' => 'Queued messages are sent by the sms:send-bulk scheduler (every minute).',
        ]);
    }

    /**
     * Queue bulk SMS from pasted phone numbers and/or customer IDs.
     */
    public function sendBulk(Request $request)
    {
        $data = $request->validate([
            'message' => 'required|string|min:1|max:1000',
            'phones' => 'nullable|string',
            'customer_ids' => 'nullable|array',
            'customer_ids.*' => 'integer|exists:customers,id',
            'all_sms_customers' => 'nullable|boolean',
        ]);

        $message = $data['message'];
        $hash = md5($message);
        $targets = []; // mobile => customer_id

        if (!empty($data['all_sms_customers'])) {
            Customer::select('id', 'phone_number')
                ->where('send_via', 'sms')
                ->orderBy('id')
                ->chunkById(500, function ($chunk) use (&$targets) {
                    foreach ($chunk as $customer) {
                        $mobile = $this->normalizeMobile($customer->phone_number);
                        if ($mobile) {
                            $targets[$mobile] = $customer->id;
                        }
                    }
                });
        }

        if (!empty($data['customer_ids'])) {
            $customers = Customer::select('id', 'phone_number')
                ->whereIn('id', $data['customer_ids'])
                ->get();
            foreach ($customers as $customer) {
                $mobile = $this->normalizeMobile($customer->phone_number);
                if ($mobile) {
                    $targets[$mobile] = $customer->id;
                }
            }
        }

        if (!empty($data['phones'])) {
            $raw = preg_split('/[\s,;]+/', $data['phones']) ?: [];
            foreach ($raw as $piece) {
                $mobile = $this->normalizeMobile($piece);
                if ($mobile && !isset($targets[$mobile])) {
                    $targets[$mobile] = 0;
                }
            }
        }

        if (empty($targets)) {
            return response()->json(['message' => 'No valid recipients found.'], 422);
        }

        $queued = 0;
        $skipped = 0;
        foreach ($targets as $mobile => $customerId) {
            $exists = MessageDetail::where('recipient', $mobile)
                ->where('message_hash', $hash)
                ->exists();
            if ($exists) {
                $skipped++;
                continue;
            }
            MessageDetail::create([
                'message' => $message,
                'message_hash' => $hash,
                'recipient' => $mobile,
                'notice' => '',
                'customer_id' => (int) $customerId,
                'status' => 'pending',
                'components' => [],
            ]);
            $queued++;
        }

        return response()->json([
            'status' => 'queued',
            'recipients' => count($targets),
            'queued_count' => $queued,
            'skipped_count' => $skipped,
            'note' => 'Queued messages are sent by the sms:send-bulk scheduler (every minute).',
        ]);
    }

    /**
     * Aggregate SMS outbox / delivery report.
     */
    public function report(Request $request)
    {
        $days = (int) $request->input('days', 30);
        if ($days < 1 || $days > 365) {
            $days = 30;
        }
        $since = Carbon::now()->subDays($days)->startOfDay();

        $byStatus = MessageDetail::query()
            ->select('status', DB::raw('COUNT(*) as total'))
            ->where('created_at', '>=', $since)
            ->groupBy('status')
            ->pluck('total', 'status');

        $daily = MessageDetail::query()
            ->select(DB::raw('DATE(created_at) as day'), DB::raw('COUNT(*) as total'))
            ->where('created_at', '>=', $since)
            ->groupBy('day')
            ->orderBy('day')
            ->get();

        $pending = (int) MessageDetail::where('status', 'pending')->count();
        $failedRecent = MessageDetail::query()
            ->leftJoin('customers', 'message_details.customer_id', '=', 'customers.id')
            ->select('message_details.id', 'message_details.recipient', 'message_details.status', 'message_details.notice', 'message_details.created_at', 'customers.name')
            ->where('message_details.status', 'failed')
            ->where('message_details.created_at', '>=', $since)
            ->orderByDesc('message_details.id')
            ->limit(25)
            ->get();

        $sent = (int) ($byStatus['sent'] ?? 0);
        $failed = (int) ($byStatus['failed'] ?? 0);
        $total = (int) array_sum($byStatus->all());
        $balance = $this->fetchSmsBalance();

        return response()->json([
            'days' => $days,
            'since' => $since->toDateString(),
            'balance' => $balance,
            'totals' => [
                'all' => $total,
                'sent' => $sent,
                'failed' => $failed,
                'pending' => $pending,
                'by_status' => $byStatus,
            ],
            'success_rate' => ($sent + $failed) > 0
                ? round(($sent / ($sent + $failed)) * 100, 1)
                : null,
            'daily' => $daily,
            'failed_recent' => $failedRecent,
        ]);
    }

    /**
     * Live Advanta SMS credit balance.
     */
    private function fetchSmsBalance(): array
    {
        $apiKey = config('sms.apikey') ?: config('services.advanta.api_key');
        $partnerId = config('sms.partnerID') ?: config('services.advanta.partner_id');

        if (!$apiKey || !$partnerId) {
            return [
                'ok' => false,
                'credit' => null,
                'error' => 'SMS API credentials are not configured',
                'provider' => 'AdvantaSMS',
            ];
        }

        try {
            $response = Http::timeout(12)->asJson()->post(
                'https://quicksms.advantasms.com/api/services/getbalance/',
                [
                    'apikey' => $apiKey,
                    'partnerID' => $partnerId,
                ]
            );

            $json = $response->json() ?: [];
            $code = (int) ($json['response-code'] ?? $json['response_code'] ?? $response->status());
            $credit = $json['credit'] ?? $json['balance'] ?? null;

            if ($response->successful() && $code === 200 && $credit !== null) {
                return [
                    'ok' => true,
                    'credit' => is_numeric($credit) ? (float) $credit : $credit,
                    'partner_id' => $json['partner-id'] ?? $json['partner_id'] ?? $partnerId,
                    'provider' => 'AdvantaSMS',
                    'raw' => $json,
                ];
            }

            return [
                'ok' => false,
                'credit' => is_numeric($credit) ? (float) $credit : $credit,
                'error' => $json['response-description']
                    ?? $json['message']
                    ?? ('Balance request failed (code ' . $code . ')'),
                'provider' => 'AdvantaSMS',
                'raw' => $json,
            ];
        } catch (\Throwable $e) {
            return [
                'ok' => false,
                'credit' => null,
                'error' => $e->getMessage(),
                'provider' => 'AdvantaSMS',
            ];
        }
    }

    private function groupAudienceQuery(array $data)
    {
        $query = Customer::query()->active();

        $sendVia = $data['send_via'] ?? 'sms';
        if ($sendVia !== 'all') {
            $query->where('send_via', $sendVia);
        }

        if (!empty($data['billing_type'])) {
            $billingType = (int) $data['billing_type'];
            $query->where(function ($q) use ($billingType) {
                $q->where('billing_type->value', $billingType)
                    ->orWhereHas('services', function ($sq) use ($billingType) {
                        $sq->where('billing_type->value', $billingType);
                    });
            });
        }

        if (!empty($data['category'])) {
            $query->where('category->value', (int) $data['category']);
        }

        if (isset($data['service_status']) && $data['service_status'] !== null && $data['service_status'] !== '') {
            $status = (int) $data['service_status'];
            $query->whereHas('services', function ($sq) use ($status) {
                $sq->where('status->value', $status);
            });
        }

        return $query;
    }

    private function normalizeMobile($mobile): ?string
    {
        $mobile = preg_replace('/\D/', '', (string) $mobile);
        if ($mobile === '') {
            return null;
        }

        if (preg_match('/^(07|01)\d{8}$/', $mobile)) {
            return '254' . substr($mobile, 1);
        }
        if (preg_match('/^254\d{9}$/', $mobile)) {
            return $mobile;
        }
        if (preg_match('/^\d{9}$/', $mobile) && in_array($mobile[0], ['7', '1'], true)) {
            return '254' . $mobile;
        }

        return null;
    }
}
