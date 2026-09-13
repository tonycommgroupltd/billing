<?php

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\MessageDetail;
use App\Models\Payment;
use App\Models\Plan;
use App\Models\Router;
use App\Models\Service;
use Illuminate\Support\Carbon;
use RouterOS\Client;
use RouterOS\Config;
use RouterOS\Query;
use Illuminate\Support\Facades\Http;
use App\Exceptions\CustomException;
use App\Models\BillingPeriodLog;
use App\Models\InvoiceDetail;
use App\Models\MikrotikApiLog;
use Illuminate\Support\Facades\Log;
use LaravelDaily\Invoices\Invoice as DailyInvoice;
use LaravelDaily\Invoices\Classes\Buyer;
use LaravelDaily\Invoices\Classes\Party;
use LaravelDaily\Invoices\Classes\InvoiceItem;

if (!function_exists('billing_day_end')) {
    /**
     * Paid-through end of a calendar day for cut jobs.
     * 23:55 (not 23:59/00:00) so reconcile:invoice at ~23:56 can expire same night.
     */
    function billing_day_end($date = null): Carbon
    {
        $dt = $date ? Carbon::parse($date) : Carbon::now();

        return $dt->copy()->setTime(23, 55, 0);
    }
}

if (!function_exists('tonycomm_weekly_price')) {
    /**
     * Existing live packages: 1500 → 395/765, 2000 → 515/1015, 2400 → 615/1215, …
     * weekly = monthly/4 + 15 (1500 uses +20 → 395); bi-weekly = monthly/2 + 15.
     */
    function tonycomm_weekly_price(float $monthly): float
    {
        if ($monthly <= 0) {
            return 0.0;
        }
        if (abs($monthly - 1500) < 0.01) {
            return 395.0;
        }

        return round($monthly / 4, 2) + 15;
    }
}

if (!function_exists('tonycomm_biweekly_price')) {
    function tonycomm_biweekly_price(float $monthly): float
    {
        if ($monthly <= 0) {
            return 0.0;
        }
        if (abs($monthly - 1500) < 0.01) {
            return 765.0;
        }

        return round($monthly / 2, 2) + 15;
    }
}

if (!function_exists('mikrotik_api_bypass_active')) {
    function mikrotik_api_bypass_active(): bool
    {
        try {
            return app(\App\Services\MikrotikEmergencyBypassService::class)->isApiBypassActive();
        } catch (\Throwable $e) {
            return false;
        }
    }
}

/**
 * RADIUS Disconnect-Request so the CPE re-auths.
 * Expired/Disabled must re-auth to receive Mikrotik-Group=EXPIRED → 90.x captive pool.
 */
if (!function_exists('radius_disconnect_user')) {
    function radius_disconnect_user($router, string $username): void
    {
        $nasIp = $router->nas_ip;
        $secret = $router->radius_secret;
        if (!$nasIp || !$secret || $username === '') {
            return;
        }
        $packet = "User-Name = $username\nNAS-IP-Address = $nasIp";
        $command = "echo \"$packet\" | radclient -x $nasIp:1700 disconnect $secret 2>&1";
        $output = [];
        $returnVar = 0;
        exec($command, $output, $returnVar);
        Log::channel('radclient')->info('Radclient Disconnect Output', [
            'command' => $command,
            'output' => $output,
            'status' => $returnVar,
        ]);
    }
}

/**
 * Hard kick active PPPoE session via RouterOS API (backup when CoA fails).
 */
if (!function_exists('mikrotik_kick_pppoe')) {
    function mikrotik_kick_pppoe($router, string $username): void
    {
        if ($username === '') {
            return;
        }
        try {
            $config = new Config([
                'host' => $router->host,
                'user' => $router->api_login,
                'pass' => $router->api_password,
                'port' => (int) $router->api_port,
                'timeout' => 8,
            ]);
            $client = new Client($config);
            // Prefer /ppp/active remove by name
            $active = $client->query(
                (new Query('/ppp/active/print'))->where('name', $username)
            )->read();
            foreach ($active as $row) {
                if (!empty($row['.id'])) {
                    $client->query(
                        (new Query('/ppp/active/remove'))->equal('.id', $row['.id'])
                    )->read();
                }
            }
            // Also try legacy interface remove
            try {
                $client->query(
                    (new Query('/interface/pppoe-server/remove'))
                        ->equal('numbers', '<pppoe-' . $username . '>')
                )->read();
            } catch (\Throwable $e) {
                // Session may already be gone
            }
        } catch (\Throwable $e) {
            Log::warning('mikrotik_kick_pppoe failed', [
                'username' => $username,
                'host' => $router->host ?? null,
                'error' => $e->getMessage(),
            ]);
        }
    }
}

if (!function_exists('curl_get_data')) {
    function curl_get_data($url, $curl_post_data)
    {
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_HEADER, 0);
        curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type:application/json'));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $curl_post_data);
        curl_setopt($ch, CURLOPT_URL, $url);
        $data = curl_exec($ch);
        curl_close($ch);
        return $data;
    }
}

if (!function_exists('send_sms')) {
    function send_sms($to, $msg, $customer_id = NULL, $components = [], $template_id = NULL)
    {
        $base_url = 'https://quicksms.advantasms.com/api/services/sendsms/';
        $success_word = 'Success';
        $sms = MessageDetail::create(['message' => $msg, 'recipient' => $to, 'notice' => '', 'customer_id' => $customer_id ?? 0, 'components' => $components, 'template_id' => $template_id]);
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
}

if (!function_exists('send_whatsapp_message')) {
    function send_whatsapp_message(string $to, string $templateName, string $languageCode, string $accessToken = '', string $fromPhoneNumberId = '', array $components = [], string $messages = '')
    {
        if (empty($fromPhoneNumberId)) $fromPhoneNumberId = config('whatsapp.from_phone_number_id');
        if (empty($accessToken)) $accessToken = config('whatsapp.access_token');

        if (empty($accessToken)) {
            throw new CustomException('Access token not found.');
        }

        if (empty($fromPhoneNumberId)) {
            throw new CustomException('From Phone Number Id not found.');
        }

        $response = Http::withHeaders([
            'Authorization' => 'Bearer ' . $accessToken,
        ])->post(config('whatsapp.api_uri') . $fromPhoneNumberId . '/messages', createBody($to, $templateName, $languageCode, $components, $messages));

        //return $response->status();
        return $response;
    }
}

if (!function_exists('formateParametersData')) {
    function formateParametersData($messages)
    {
        if (empty($messages)) {
            return [];
        }

        $messages =  explode(config('whatsapp.separator'), $messages);
        $parameters = [];
        foreach ($messages as $message) {
            array_push(
                $parameters,
                [
                    'type' => 'text',
                    'text' => $message
                ]
            );
        }
        return $parameters;
    }
}

if (!function_exists('createBody')) {
    function createBody($to, $templateName, $languageCode, $components = [], $messages = '')
    {
        $body = [
            'messaging_product' => 'whatsapp',
            'to' => $to,
            'type' => 'template',
            'template' => [
                'name' =>  $templateName,
                'language' => [
                    'code' => $languageCode,
                ],
                "components" => [],
            ],
        ];

        if (!empty($components)) {
            $body['template']['components'] = $components;
        } else {
            array_push(
                $body['template']['components'],
                [
                    'type' => 'body',
                    'parameters' =>  formateParametersData($messages)
                ]
            );
        }

        return $body;
    }
}

if (!function_exists('getPhoneNumbers')) {
    function getPhoneNumbers(string $WhatsAppBusinessAccountId = '', string $accessToken = '')
    {
        if (empty($WhatsAppBusinessAccountId)) $WhatsAppBusinessAccountId = config('whatsapp.whatsapp_business_account_id');
        if (empty($accessToken)) $accessToken = config('whatsapp.access_token');

        if (empty($accessToken)) {
            //throw new CustomException('Access token not found.');
        }

        if (empty($WhatsAppBusinessAccountId)) {
            //throw new CustomException('WhatsApp Business Account Id not found.');
        }

        $response = Http::get(config('whatsapp.api_uri') . $WhatsAppBusinessAccountId . '/phone_numbers?access_token=' . $accessToken);
        $error = !empty(json_decode($response->getBody())->error) ? json_decode($response->getBody())->error : '';

        if (!empty($error)) {
            throw new InvalidArgumentException($error->message);
        }

        return $response->json();
    }
}

if (!function_exists('c2b_user')) {
    function c2b_user($phone)
    {
        $phones = array();
        array_push($phones, $phone);
        $str_phone = str_replace(' ', '', $phone);
        array_push($phones, $str_phone);
        $format_phone = substr($str_phone, -9);
        array_push($phones, $format_phone);
        $code_prefix = '254' . $format_phone;
        array_push($phones, $code_prefix);
        $plus_prefix = '+254' . $format_phone;
        array_push($phones, $plus_prefix);
        $zero_prefix = str_replace('+254', '0', $plus_prefix);
        array_push($phones, $zero_prefix);

        return Customer::where(function ($query) use ($phones) {
            foreach ($phones as $phone) {
                $query->orWhereRaw("FIND_IN_SET(?, REPLACE(phone_number, '/', ','))", [$phone]);
            }
        })->first();
    }
}

if (!function_exists('format_phone')) {
    function format_phone($phone)
    {
        $phone = str_replace(' ', '', $phone);
        $phone = str_replace('-', '', $phone);
        $phone = substr($phone, -9);

        return '0' . $phone;
    }
}

if (!function_exists('format_w_phone')) {
    function format_w_phone($phone)
    {
        $phone = str_replace(' ', '', $phone);
        $phone = str_replace('-', '', $phone);
        $phone = substr($phone, -9);

        return '+254' . $phone;
    }
}

if (!function_exists('enable_secret')) {
    function enable_secret($service)
    {
        if (in_array((int) ($service->status['value'] ?? 0), [1, 3], true)) {
            return activate_secret($service);
        }
        $id = $service->plan_id;
        $name = $service->mikrotik_name;
        $plan = Plan::find($id);
        if ($plan) {
            $router = Router::find($plan->router_id);
            if ($router && $name) {
                if ($router->authorization['value'] === 3) {
                    if (mikrotik_api_bypass_active()) {
                        $service->status = ['label' => 'Active', 'value' => 2];
                        $service->save();
                        return app(\App\Services\MikrotikEmergencyBypassService::class)->pushServiceActive($service) ?: null;
                    }
                    $username = $service->mikrotik_name;
                    $nasIp = $router->nas_ip;
                    $secret = $router->radius_secret;
                    $packet = "User-Name = $username\nNAS-IP-Address = $nasIp";
                    $service->status = ['label' => 'Active', 'value' => 2];
                    $service->save();
                    //exec("echo \"$packet\" | radclient -x $nasIp:1700 disconnect $secret");
                    $command = "echo \"$packet\" | radclient -x $nasIp:1700 disconnect $secret 2>&1";

                    $output = [];
                    $returnVar = 0;

                    exec($command, $output, $returnVar);

                    Log::channel('radclient')->info('Radclient Disconnect Output', [ 'command' => $command, 'output' => $output, 'status' => $returnVar, ]);
                    return true;
                }
                $config = new Config([
                    'host' => $router->host,
                    'user' => $router->api_login,
                    'pass' => $router->api_password,
                    'port' => (int)$router->api_port,
                ]);
                try {
                    $client = new Client($config);
                    $query =
                        (new Query('/ppp/secret/enable'))
                        ->equal('numbers', $name);
                    $client->query($query)->read();
                    return true;
                } catch (\Exception $e) {
                    log_file('enable_Secret_Report_', array_merge($service->toArray(), ['error_message' => $e->getMessage()]));
                    MikrotikApiLog::create([
                        'router_id' => $service->router_id,
                        'customer_id' => $service->customer_id,
                        'service_id' => $service->id,
                        'action' => 'connect',
                        'status' => 'retrying',
                        'attempted_at' => now(),
                    ]);
                    return NULL;
                }
            } else {
                return NULL;
            }
        } else {
            return NULL;
        }
    }
}

if (!function_exists('disable_secret')) {
    function disable_secret($service)
    {

        $plan = Plan::find($service->plan_id);
        if ($plan) {
            $router = Router::find($plan->router_id);
            if ($router && $service->mikrotik_name) {
                if ($router->authorization['value'] === 3) {
                    if (mikrotik_api_bypass_active()) {
                        $service->status = ['label' => 'Disabled', 'value' => 1];
                        $service->save();
                        log_file('disabled_Secret_Report_', $service->toArray());
                        return app(\App\Services\MikrotikEmergencyBypassService::class)->pushServiceDisabled($service) ?: null;
                    }
                    // Keep secret usable: RADIUS will return Mikrotik-Group=EXPIRED → 90.x captive
                    $service->status = ['label' => 'Disabled', 'value' => 1];
                    $service->save();
                    radius_disconnect_user($router, $service->mikrotik_name);
                    mikrotik_kick_pppoe($router, $service->mikrotik_name);
                    log_file('disabled_Secret_Report_', $service->toArray());
                    return true;
                }
                $config = new Config([
                    'host' => $router->host,
                    'user' => $router->api_login,
                    'pass' => $router->api_password,
                    'port' => (int)$router->api_port,
                ]);
                try {
                    $client = new Client($config);
                    // Do NOT disable the PPP secret — that blocks captive portal.
                    // Put them on EXPIRED profile (90.x) and kick the session.
                    if (!empty($service->mikrotik_id)) {
                        $client->query(
                            (new Query('/ppp/secret/set'))
                                ->equal('.id', $service->mikrotik_id)
                                ->equal('name', $service->mikrotik_name)
                                ->equal('profile', 'EXPIRED')
                                ->equal('disabled', 'no')
                        )->read();
                    } else {
                        $found = $client->query(
                            (new Query('/ppp/secret/print'))->where('name', $service->mikrotik_name)
                        )->read();
                        if (!empty($found[0]['.id'])) {
                            $client->query(
                                (new Query('/ppp/secret/set'))
                                    ->equal('.id', $found[0]['.id'])
                                    ->equal('profile', 'EXPIRED')
                                    ->equal('disabled', 'no')
                            )->read();
                        }
                    }
                    mikrotik_kick_pppoe($router, $service->mikrotik_name);
                    $service->status = ['label' => 'Disabled', 'value' => 1];
                    $service->save();
                    log_file('disabled_Secret_Report_', $service->toArray());
                    return true;
                } catch (\Exception $e) {
                    return NULL;
                }
            } else {
                return NULL;
            }
        } else {
            return NULL;
        }
    }
}

if (!function_exists('expire_secret')) {
    function expire_secret($service)
    {
        $plan = Plan::find($service->plan_id);
        if ($plan) {
            $router = Router::find($plan->router_id);
            if ($router && $service->mikrotik_name) {
                if ($router->authorization['value'] === 3) {
                    if (mikrotik_api_bypass_active()) {
                        $service->status = ['label' => 'Expired', 'value' => 3];
                        $service->save();
                        log_file('expire_Secret_Report_', $service->toArray());
                        return app(\App\Services\MikrotikEmergencyBypassService::class)->pushServiceExpired($service) ?: null;
                    }
                    // Recurring / manual expire → EXPIRED group on re-auth → 90.x captive
                    $service->status = ['label' => 'Expired', 'value' => 3];
                    $service->save();
                    radius_disconnect_user($router, $service->mikrotik_name);
                    mikrotik_kick_pppoe($router, $service->mikrotik_name);
                    log_file('expire_Secret_Report_', $service->toArray());
                    return true;
                }
                $config = new Config([
                    'host' => $router->host,
                    'user' => $router->api_login,
                    'pass' => $router->api_password,
                    'port' => (int)$router->api_port,
                ]);
                try {
                    $client = new Client($config);
                    $query =
                        (new Query('/ppp/secret/set'))
                        ->equal('.id', $service->mikrotik_id)
                        ->equal('name', $service->mikrotik_name)
                        ->equal('profile', 'EXPIRED');
                    $client->query($query)->read();
                    $query2 =
                        (new Query('/interface/pppoe-server/remove'))
                        ->equal('numbers', '<pppoe-' . $service->mikrotik_name . '>');
                    $client->query($query2)->read();
                    $service->status = ['label' => 'Expired', 'value' => 3];
                    $service->save();
                    log_file('expire_Secret_Report_', $service->toArray());
                    return true;
                } catch (\Exception $e) {
                    return NULL;
                }
            } else {
                return NULL;
            }
        } else {
            return NULL;
        }
    }
}

if (!function_exists('activate_secret')) {
    function activate_secret($service)
    {
        $plan = Plan::find($service->plan_id);
        if ($plan) {
            $router = Router::find($plan->router_id);
            if ($router && $service->mikrotik_name) {
                if ($router->authorization['value'] === 3) {
                    if (mikrotik_api_bypass_active()) {
                        $service->status = ['label' => 'Active', 'value' => 2];
                        $service->save();
                        return app(\App\Services\MikrotikEmergencyBypassService::class)->pushServiceActive($service) ?: null;
                    }
                    $username = $service->mikrotik_name;
                    $nasIp = $router->nas_ip;
                    $secret = $router->radius_secret;
                    $packet = "User-Name = $username\nNAS-IP-Address = $nasIp";
                    $service->status = ['label' => 'Active', 'value' => 2];
                    $service->save();
                    //exec("echo \"$packet\" | radclient -x $nasIp:1700 disconnect $secret");
                    $command = "echo \"$packet\" | radclient -x $nasIp:1700 disconnect $secret 2>&1";

                    $output = [];
                    $returnVar = 0;

                    exec($command, $output, $returnVar);

                    Log::channel('radclient')->info('Radclient Disconnect Output', [ 'command' => $command, 'output' => $output, 'status' => $returnVar, ]);
                    return true;
                }
                $config = new Config([
                    'host' => $router->host,
                    'user' => $router->api_login,
                    'pass' => $router->api_password,
                    'port' => (int)$router->api_port,
                ]);
                try {
                    $client = new Client($config);
                    $query =
                        (new Query('/ppp/secret/set'))
                        ->equal('.id', $service->mikrotik_id)
                        ->equal('name', $service->mikrotik_name)
                        ->equal('profile', $plan->rate_limit['label']);
                    $client->query($query)->read();
                    $query2 =
                        (new Query('/interface/pppoe-server/remove'))
                        ->equal('numbers', '<pppoe-' . $service->mikrotik_name . '>');
                    $client->query($query2)->read();
                    $service->status = ['label' => 'Active', 'value' => 2];
                    $service->save();
                    log_file('active_Secret_Report_', $service->toArray());
                    return true;
                } catch (\Exception $e) {
                    MikrotikApiLog::create([
                        'router_id' => $service->router_id,
                        'customer_id' => $service->customer_id,
                        'service_id' => $service->id,
                        'action' => 'connect',
                        'status' => 'retrying',
                        'attempted_at' => now(),
                    ]);
                    return NULL;
                }
            } else {
                return NULL;
            }
        } else {
            return NULL;
        }
    }
}

if (!function_exists('check_service')) {
    function check_service($ref)
    {
        if (str_contains($ref, '#')) {
            return true;
        } else {
            return false;
        }
    }
}

if (!function_exists('service_for_paybill_ref')) {
    /**
     * phone#serviceId must belong to that phone. A mistyped id must not
     * credit someone else's line. If the id is wrong, use this customer's
     * only active service.
     */
    function service_for_paybill_ref(string $billRef, ?Customer $payer = null): ?Service
    {
        $ref = preg_replace('/\s+/', '', $billRef);
        $parts = explode('#', $ref, 2);
        $phonePart = $parts[0] ?? '';
        $svcId = isset($parts[1]) ? (int) preg_replace('/\D+/', '', (string) $parts[1]) : 0;
        if (!$payer && $phonePart !== '') {
            $payer = c2b_user($phonePart);
        }
        $service = $svcId > 0 ? Service::find($svcId) : null;
        if ($service && $payer && (int) $service->customer_id === (int) $payer->id) {
            return $service;
        }
        if ($service && !$payer) {
            return $service;
        }
        if (!$payer) {
            return null;
        }
        $own = Service::where('customer_id', $payer->id)->whereNull('deleted_at');
        $active = (clone $own)->where('status->value', 2)->get();
        if ($active->count() === 1) {
            return $active->first();
        }
        $all = $own->get();
        if ($all->count() === 1) {
            return $all->first();
        }

        return null;
    }
}

if (!function_exists('mpesa_payment_type_from_refs')) {
    function mpesa_payment_type_from_refs(array $refs = []): int
    {
        if (!empty($refs) && isset($refs[1])) {
            if (stripos($refs[1], 'W') !== false) {
                return 1;
            }
            if (stripos($refs[1], 'B') !== false) {
                return 2;
            }
        }

        return 3;
    }
}

if (!function_exists('service_latest_unpaid_invoice')) {
    function service_latest_unpaid_invoice($serviceId): ?Invoice
    {
        return Invoice::where('services_id', $serviceId)
            ->whereNull('deleted_at')
            ->where('status->value', 1)
            ->orderByDesc('id')
            ->first();
    }
}

if (!function_exists('service_has_unpaid_invoice')) {
    function service_has_unpaid_invoice($serviceId): bool
    {
        return Invoice::where('services_id', $serviceId)
            ->whereNull('deleted_at')
            ->where('status->value', 1)
            ->exists();
    }
}

if (!function_exists('invoice_paid_sum')) {
    function invoice_paid_sum($invoiceId): float
    {
        return (float) Payment::where('invoice_id', $invoiceId)->sum('sum');
    }
}

if (!function_exists('sync_billing_period_from_total')) {
    function sync_billing_period_from_total($service, Plan $plan, float $total): void
    {
        $old = strtolower($service->billing_period['label'] ?? 'monthly');
        if ((int) ($service->billing_period['value'] ?? 3) !== 3) {
            log_change_billing_period($service, $old, 'monthly');
            $service->billing_period = ['label' => 'Monthly', 'value' => 3];
        }
    }
}

if (!function_exists('extend_service_bill_to')) {
    function extend_service_bill_to($service, Carbon $fromDate, bool $late = false): void
    {
        $service->bill_to = billing_day_end($fromDate->copy()->addMonth());
    }
}

if (!function_exists('activate_paid_service')) {
    function activate_paid_service($service, $paymentDate = null, ?Invoice $invoice = null): bool
    {
        return app(\App\Services\BillingCycleService::class)->activateNow($service);
    }
}

if (!function_exists('resolve_invoice_payment_total')) {
    function resolve_invoice_payment_total($service, Plan $plan, float $paymentSum, float $incomingAmount, int $type, Invoice $invoice): float
    {
        $monthly = app(\App\Services\BillingCycleService::class)->monthlyPrice($service);
        $invoiceTotal = (float) $invoice->total;
        if ($invoiceTotal >= 50) {
            return $invoiceTotal;
        }

        return $monthly > 0 ? $monthly : (float) $service->price;
    }
}

if (!function_exists('finalize_paid_invoice')) {
    function finalize_paid_invoice($service, Invoice $invoice, $customer, float $paymentSum, float $incomingAmount, $paymentDate = null): bool
    {
        app(\App\Services\BillingCycleService::class)
            ->applyIncomingPayment($service, $incomingAmount, $paymentDate ?? Carbon::now());

        return true;
    }
}

if (!function_exists('reconcile_service_payment_state')) {
    function reconcile_service_payment_state($serviceId): array
    {
        $result = ['activated' => false, 'invoice_paid' => false, 'service_id' => $serviceId];

        $service = Service::find($serviceId);
        if (!$service) {
            return $result;
        }

        $unpaid = service_latest_unpaid_invoice($serviceId);
        if ($unpaid) {
            $customer = Customer::find($service->customer_id);
            $billing = app(\App\Services\BillingCycleService::class);
            if ($customer && $billing->coverInvoiceWithCredit($service, $unpaid, $customer)) {
                $result['invoice_paid'] = true;
                $result['activated'] = in_array((int) ($service->fresh()->status['value'] ?? 0), [2], true);
            }
            return $result;
        }

        if (in_array((int) ($service->status['value'] ?? 0), [1, 3], true)) {
            $stillValid = $service->bill_to && Carbon::parse($service->bill_to)->gt(Carbon::now());
            if ($stillValid) {
                $result['activated'] = activate_paid_service($service);
            }
        }

        return $result;
    }
}

if (!function_exists('reconcile_stuck_payment_states')) {
    function reconcile_stuck_payment_states(int $limit = 200): array
    {
        $stats = ['invoices_closed' => 0, 'services_activated' => 0, 'mpesa_retried' => 0];

        $underpaidInvoices = Invoice::query()
            ->join('services', 'services.id', '=', 'invoices.services_id')
            ->whereNull('invoices.deleted_at')
            ->where('invoices.status->value', 1)
            ->select('invoices.services_id')
            ->distinct()
            ->limit($limit)
            ->pluck('services_id');

        foreach ($underpaidInvoices as $serviceId) {
            $outcome = reconcile_service_payment_state($serviceId);
            if ($outcome['invoice_paid']) {
                $stats['invoices_closed']++;
            }
            if ($outcome['activated']) {
                $stats['services_activated']++;
            }
        }

        $disabledWithPaid = Service::query()
            ->whereIn('status->value', [1, 3])
            ->whereNotIn('id', Invoice::query()
                ->select('services_id')
                ->whereNull('deleted_at')
                ->where('status->value', 1))
            ->limit($limit)
            ->pluck('id');

        foreach ($disabledWithPaid as $serviceId) {
            $outcome = reconcile_service_payment_state($serviceId);
            if ($outcome['activated']) {
                $stats['services_activated']++;
            }
        }

        $stuckMpesa = Mpesa::where('status', 1)
            ->where('TransTime', '>=', Carbon::now()->subDays(14))
            ->orderByDesc('id')
            ->limit(50)
            ->get();

        foreach ($stuckMpesa as $value) {
            if (Payment::where('trans_id', $value->TransID)->exists()) {
                continue;
            }

            $ref = preg_replace('/\s+/', '', (string) $value->BillRefNumber);
            $phonePart = explode('#', $ref)[0] ?? $ref;
            $customer = c2b_user($phonePart) ?: c2b_user($value->BillRefNumber);
            $service = null;
            $refs = [];

            if (check_service($value->BillRefNumber)) {
                $refs = explode('#', $ref);
                $service = service_for_paybill_ref($ref, $customer);
            } elseif ($customer) {
                if (Service::where('customer_id', $customer->id)->count() > 1) {
                    continue;
                }
                $service = Service::where('customer_id', $customer->id)->first();
            }

            if ($service) {
                $invoiceId = update_payment($service, $value, $refs);
                if ($invoiceId) {
                    Payment::create([
                        'customer_id' => $service->customer_id,
                        'trans_id' => $value->TransID,
                        'payment_type' => 'mpesa',
                        'date' => $value->TransTime,
                        'sum' => $value->TransAmount,
                        'invoice_id' => $invoiceId,
                    ]);
                    Mpesa::where('id', $value->id)->update(['status' => 2]);
                    reconcile_service_payment_state($service->id);
                    $stats['mpesa_retried']++;
                }
            }
        }

        return $stats;
    }
}

if (!function_exists('update_payment')) {
    function update_payment($service, $mpesa, $refs = [])
    {
        $billing = app(\App\Services\BillingCycleService::class);
        $result = $billing->applyIncomingPayment(
            $service,
            (float) $mpesa->TransAmount,
            $mpesa->TransTime ?? Carbon::now()
        );
        $invoice = $result['invoice'] ?? null;
        if (!$invoice && ($result['grant'] ?? 'none') === 'none') {
            $invoice = $billing->ensureMonthlyInvoice($service);
        }

        return $invoice ? $invoice->id : null;
    }
}

if (!function_exists('update_status')) {
    function update_status($service, $mpesa, $invoice, $type = 3)
    {
        app(\App\Services\BillingCycleService::class)
            ->applyIncomingPayment($service, (float) $mpesa->TransAmount, $mpesa->TransTime ?? Carbon::now());
    }
}

if (!function_exists('log_change_billing_period')) {
    function log_change_billing_period($service, $old, $new)
    {
        BillingPeriodLog::create([
            'service_id' => $service->id,
            'old_period' => $old, // e.g., 'weekly'
            'new_period' => $new,
            'user_id' => auth()->id(),
            'remarks' => 'Updated billing period',
        ]);
    }
}

if (!function_exists('log_file')) {
    function log_file($filename, $data)
    {
        $log = fopen(storage_path() . '/logs/' . $filename . Carbon::now()->toDateString() . '.json', "a");
        fwrite($log, json_encode($data) . "\n");
        fclose($log);
    }
}

if (!function_exists('check_online_customers')) {
    function check_online_customers($router)
    {
        if ($router) {
            $config = new Config([
                'host' => $router->host,
                'user' => $router->api_login,
                'pass' => $router->api_password,
                'port' => (int)$router->api_port,
            ]);
            try {
                $client = new Client($config);
                $query =
                    (new Query('/ppp/active/print'));
                $response = $client->query($query)->read();
                return $response;
            } catch (\Exception $e) {
                return NULL;
            }
        }
    }
}

if (!function_exists('generate_whatsapp_body')) {
    function generate_whatsapp_body($parameters, $body)
    {
        $l = 0;
        for ($x = 0; $x < count($parameters); $x++) {
            $l = $x + 1;
            $var = $parameters[$x]['text'];
            $searchWord = sprintf('{{%s}}', $l);
            $body = str_ireplace($searchWord, $var, $body, $count);
        }
        return $body;
    }
}

if (!function_exists('generate_whatsapp_body_var')) {
    function generate_whatsapp_body_var($template, $components)
    {
        if ($template === 'invoice_create') {
            $components = array(array(
                "type" => "body",
                "parameters" => array(array("type" => "text", "text" => $components['due_date']), array("type" => "text", "text" => $components['due_amount']), array("type" => "text", "text" => $components['account']))
            ));
            return $components;
        } else if ($template === 'payment_reminder') {
            $components = array(array(
                "type" => "body",
                "parameters" => array(array("type" => "text", "text" => $components['due_amount']), array("type" => "text", "text" => $components['account']))
            ));
            return $components;
        } else if ($template === 'account_creation') {
            $components = array(array(
                "type" => "body",
                "parameters" => array(array("type" => "text", "text" => $components['account']))
            ));
            return $components;
        } else if ($template === 'reset_password') {
            $components = array(array(
                "type" => "body",
                "parameters" => array(array("type" => "text", "text" => $components['password']))
            ));
            return $components;
        } else if ($template === 'welcome_message') {
            $components = array(array(
                "type" => "body",
                "parameters" => array(array("type" => "text", "text" => $components['customer_login']), array("type" => "text", "text" => $components['customer_password']))
            ));
            return $components;
        } else {
            return [];
        }
    }
}

if (!function_exists('download_pdf')) {
    function download_pdf($invoice)
    {
        $service = Service::find($invoice->services_id);
        $customer = Customer::find($service->customer_id);
        $check = Service::where('customer_id', $service->customer_id)->count();
        if ($check > 1) {
            $account = $customer->phone_number . '#' . $service->id;
        } else {
            $account = $customer->phone_number;
        }
        $customer = new Buyer([
            'name'          => $customer->name,
            'account'       => $account,
            'due_date'      => Carbon::parse($invoice->due_date)->format('l, F jS, Y'),
        ]);

        $seller = new Party([
            'name'          => 'Tonycomm Group Ltd',
            'phone'         => '0110345166',
            'paybill'       => '4129711',
        ]);

        $item = InvoiceItem::make('Internet subscription service')->pricePerUnit($invoice->total);

        if ($invoice->due <= 0) {
            $invoice = DailyInvoice::make()
                ->status(__('invoices::invoice.paid'))
                ->sequence($invoice->id)
                ->serialNumberFormat('{SEQUENCE}')
                ->seller($seller)
                ->buyer($customer)
                ->date(Carbon::parse($invoice->invoice_date))
                ->dateFormat('l, F jS, Y')
                ->payUntilDays(14)
                ->currencySymbol('KSh')
                ->currencyCode('KES')
                ->currencyFormat('{SYMBOL}{VALUE}')
                ->filename('Invoice-' . $invoice->id)
                ->addItem($item)
                ->logo(public_path('assets/images/logo.png'));

            return $invoice->stream();
        } else {
            $invoice = DailyInvoice::make()
                ->sequence($invoice->id)
                ->serialNumberFormat('{SEQUENCE}')
                ->seller($seller)
                ->buyer($customer)
                ->date(Carbon::parse($invoice->invoice_date))
                ->dateFormat('l, F jS, Y')
                ->payUntilDays(14)
                ->currencySymbol('KSh')
                ->currencyCode('KES')
                ->currencyFormat('{SYMBOL}{VALUE}')
                ->filename('Invoice-' . $invoice->id)
                ->addItem($item)
                ->logo(public_path('assets/images/logo.png'));

            return $invoice->stream();
        }
    }
}

function textClass($status, $last_message)
{
    if ($last_message == 'is running') {
        return ($status == 'success') ? 'text-success' : 'text-danger';
    }

    return ($status == 'failed') ? 'text-danger' : '';
}

function onlyEnabled($collection)
{
    return $collection->filter(function ($item) {
        return $item->enabled == 1;
    });
}

function minValue($checks)
{
    return min(array_column($checks->toArray(), 'last_ran_at'));
}

function numberTextClass($type, $status, $text)
{
    $configs = [
        'diskspace' => 'server-monitor.diskspace_percentage_threshold',
        'cpu' => 'server-monitor.cpu_usage_threshold',
        'memory' => 'server-monitor.memory_usage_threshold'
    ];

    preg_match('/(\d+)/', $text, $pieces);

    if (!empty($pieces)) {
        $number = (float) $pieces[0];
        $config = config($configs[$type]);
        return ($number >= $config['fail']) ? 'text-danger' : (($number >= $config['warning']) ? 'text-warning' : '');
    }

    return textClass($status, $text);
}
