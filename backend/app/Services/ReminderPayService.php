<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\Service;
use Carbon\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ReminderPayService
{
    public function __construct(
        private PaymentLinkService $links,
        private BillingCycleService $billing,
    ) {
    }

    public function loadByRef(string $ref): array
    {
        $decoded = $this->links->resolveRef($ref);
        if (!$decoded) {
            return ['error' => 'This payment link is invalid or has expired.', 'status' => 400];
        }

        $invoice = Invoice::find($decoded['i']);
        $service = Service::find($decoded['s']);
        if (!$invoice || !$service || (int) $invoice->services_id !== (int) $service->id) {
            return ['error' => 'Invoice or service not found.', 'status' => 404];
        }

        $customer = Customer::find($service->customer_id);
        if (!$customer) {
            return ['error' => 'Customer not found.', 'status' => 404];
        }

        $invStatus = $invoice->status['value'] ?? 0;
        $paid = (int) $invStatus === 2 || strtolower((string) ($invoice->status['label'] ?? '')) === 'paid';
        $dueAmountStr = $this->billing->reminderDueAmount($service, $customer, $invoice);
        preg_match('/Ksh([\d,]+)/i', $dueAmountStr, $m);
        $dueAmount = $m ? (float) str_replace(',', '', $m[1]) : max(0, (float) $invoice->total);

        $serviceCount = Service::where('customer_id', $customer->id)->whereNull('deleted_at')->count();
        $accountDigits = preg_replace('/\D/', '', (string) $customer->phone_number);
        $accountRef = $serviceCount > 1 ? $accountDigits.'#'.$service->id : $accountDigits;

        return [
            'ok' => true,
            'alreadyPaid' => $paid || $dueAmount <= 0,
            'customerName' => $customer->name,
            'planName' => $service->plan_title ?: 'Internet',
            'pppoeUsername' => $service->mikrotik_name,
            'invoiceDue' => $invoice->due_date ? Carbon::parse($invoice->due_date)->format('Y-m-d') : null,
            'billTo' => $service->bill_to ? Carbon::parse($service->bill_to)->format('Y-m-d') : null,
            'dueAmount' => $dueAmount,
            'invoiceTotal' => (float) $invoice->total,
            'paybill' => env('MPESA_SHORTCODE', '4129711'),
            'accountRef' => $accountRef,
            'defaultPhone' => $customer->phone_number,
        ];
    }

    public function loadByToken(string $token): array
    {
        return $this->loadByRef($token);
    }

    public function initiateStk(string $ref, string $phone): array
    {
        $ctx = $this->loadByRef($ref);
        if (!empty($ctx['error'])) {
            return ['success' => false, 'message' => $ctx['error'], 'status' => $ctx['status'] ?? 400];
        }
        if (!empty($ctx['alreadyPaid'])) {
            return ['success' => false, 'message' => 'This invoice is already paid.', 'status' => 400];
        }

        $amount = (int) ceil((float) ($ctx['dueAmount'] ?? 0));
        if ($amount < 1) {
            return ['success' => false, 'message' => 'Nothing to pay on this invoice.', 'status' => 400];
        }

        $msisdn = $this->normalizePhone($phone);
        if (!$msisdn) {
            return ['success' => false, 'message' => 'Invalid phone number.', 'status' => 400];
        }

        $shortcode = (string) env('MPESA_SHORTCODE', '');
        $passkey = (string) env('MPESA_PASSKEY', '');
        $key = (string) env('MPESA_CONSUMER_KEY', '');
        $secret = (string) env('MPESA_CONSUMER_SECRET', '');
        if ($shortcode === '' || $passkey === '' || $key === '' || $secret === '') {
            return ['success' => false, 'message' => 'M-Pesa is not configured on the server.', 'status' => 502];
        }

        $base = env('MPESA_ENV', 'live') === 'sandbox'
            ? 'https://sandbox.safaricom.co.ke'
            : 'https://api.safaricom.co.ke';

        $auth = base64_encode($key.':'.$secret);
        $tokenResp = Http::withHeaders(['Authorization' => 'Basic '.$auth])
            ->get($base.'/oauth/v1/generate?grant_type=client_credentials');
        if (!$tokenResp->successful()) {
            return ['success' => false, 'message' => 'Failed to get M-Pesa token.', 'status' => 502];
        }
        $access = $tokenResp->json('access_token');
        if (!$access) {
            return ['success' => false, 'message' => 'Failed to get M-Pesa token.', 'status' => 502];
        }

        $timestamp = now()->format('YmdHis');
        $password = base64_encode($shortcode.$passkey.$timestamp);
        $accountRef = substr((string) ($ctx['accountRef'] ?? 'TCOM'), 0, 12);

        $payload = [
            'BusinessShortCode' => $shortcode,
            'Password' => $password,
            'Timestamp' => $timestamp,
            'TransactionType' => 'CustomerPayBillOnline',
            'Amount' => $amount,
            'PartyA' => $msisdn,
            'PartyB' => $shortcode,
            'PhoneNumber' => $msisdn,
            'CallBackURL' => env('MPESA_CALLBACK_URL', url('/api/v1/mpesa/stk/callback')),
            'AccountReference' => $accountRef,
            'TransactionDesc' => 'TCOM Bill Payment',
        ];

        $stk = Http::withToken($access)->post($base.'/mpesa/stkpush/v1/processrequest', $payload);
        $body = $stk->json();
        if (($body['ResponseCode'] ?? '') !== '0') {
            Log::warning('Reminder STK failed', ['body' => $body]);
            return [
                'success' => false,
                'message' => $body['ResponseDescription'] ?? $body['errorMessage'] ?? 'STK push failed',
                'status' => 502,
            ];
        }

        return [
            'success' => true,
            'checkoutRequestId' => $body['CheckoutRequestID'] ?? '',
            'amount' => $amount,
            'accountRef' => $accountRef,
            'paybill' => $shortcode,
            'message' => 'Check your phone for the M-Pesa prompt.',
        ];
    }

    public function queryStatus(string $checkoutRequestId): array
    {
        $shortcode = (string) env('MPESA_SHORTCODE', '');
        $passkey = (string) env('MPESA_PASSKEY', '');
        $key = (string) env('MPESA_CONSUMER_KEY', '');
        $secret = (string) env('MPESA_CONSUMER_SECRET', '');
        $base = env('MPESA_ENV', 'live') === 'sandbox'
            ? 'https://sandbox.safaricom.co.ke'
            : 'https://api.safaricom.co.ke';

        $auth = base64_encode($key.':'.$secret);
        $tokenResp = Http::withHeaders(['Authorization' => 'Basic '.$auth])
            ->get($base.'/oauth/v1/generate?grant_type=client_credentials');
        if (!$tokenResp->successful()) {
            return ['status' => 'pending', 'resultDesc' => 'Waiting for payment confirmation'];
        }
        $access = $tokenResp->json('access_token');
        $timestamp = now()->format('YmdHis');
        $password = base64_encode($shortcode.$passkey.$timestamp);

        $resp = Http::withToken($access)->post($base.'/mpesa/stkpushquery/v1/query', [
            'BusinessShortCode' => $shortcode,
            'Password' => $password,
            'Timestamp' => $timestamp,
            'CheckoutRequestID' => $checkoutRequestId,
        ]);
        $data = $resp->json();
        $code = (int) ($data['ResultCode'] ?? -1);

        if ($code === 0) {
            return ['status' => 'completed', 'resultDesc' => $data['ResultDesc'] ?? 'Success'];
        }
        if ($code === 1032) {
            return ['status' => 'cancelled', 'resultDesc' => 'Transaction cancelled by user'];
        }
        if ($code === 1037) {
            return ['status' => 'timeout', 'resultDesc' => 'Transaction timed out'];
        }

        return ['status' => 'pending', 'resultDesc' => $data['ResultDesc'] ?? 'Waiting for payment confirmation'];
    }

    private function normalizePhone(string $phone): ?string
    {
        $p = preg_replace('/\s+/', '', $phone);
        if (str_starts_with($p, '+')) {
            $p = substr($p, 1);
        }
        if (str_starts_with($p, '0')) {
            $p = '254'.substr($p, 1);
        }
        if (!preg_match('/^254\d{9}$/', $p)) {
            return null;
        }

        return $p;
    }
}
