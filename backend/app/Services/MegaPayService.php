<?php

namespace App\Services;

use App\Models\MegapaySetting;
use App\Models\MegapayTransaction;
use App\Models\Mpesa;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class MegaPayService
{
    public const RELOCATION_MIN_AMOUNT = 500;

    public const TILL_FEE_TYPES = ['relocation', 'router_change', 'extension'];

    public const ALL_FEE_TYPES = ['relocation', 'router_change', 'extension', 'installation', 'other'];

    public function normalizeFeeType(?string $feeType, string $default = 'other'): string
    {
        $feeType = strtolower(trim((string) $feeType));
        if (!in_array($feeType, self::ALL_FEE_TYPES, true)) {
            return $default;
        }
        return $feeType;
    }
    public function getSettings(): array
    {
        return [
            'party_b_number' => $this->setting('party_b_number', ''),
            'party_b_type' => $this->setting('party_b_type', 'till'),
        ];
    }

    public function updateSettings(array $data): array
    {
        if (array_key_exists('party_b_number', $data)) {
            $this->setSetting('party_b_number', trim((string) $data['party_b_number']));
        }
        if (array_key_exists('party_b_type', $data)) {
            $type = strtolower(trim((string) $data['party_b_type']));
            if (!in_array($type, ['till', 'paybill'], true)) {
                $type = 'till';
            }
            $this->setSetting('party_b_type', $type);
        }

        return $this->getSettings();
    }

    public function initiateStk(array $input, ?int $userId = null): array
    {
        $settings = $this->getSettings();
        $partyB = trim((string) ($settings['party_b_number'] ?? ''));
        if ($partyB === '') {
            return ['success' => false, 'message' => 'PartyB till/paybill is not configured. Set it in MegaPay settings.'];
        }

        $shortcode = (string) env('MPESA_SHORTCODE', '');
        $passkey = (string) env('MPESA_PASSKEY', '');
        if ($shortcode === '' || $passkey === '') {
            return ['success' => false, 'message' => 'MPESA_SHORTCODE / MPESA_PASSKEY not configured on server.'];
        }

        $phone = $this->normalizePhone((string) ($input['phone'] ?? ''));
        if ($phone === null) {
            return ['success' => false, 'message' => 'Invalid phone number. Use 07… or 2547…'];
        }

        $amount = (int) ceil((float) ($input['amount'] ?? 0));
        if ($amount < 1) {
            return ['success' => false, 'message' => 'Amount must be at least 1.'];
        }

        $feeType = $this->normalizeFeeType($input['fee_type'] ?? 'other', 'other');

        if ($feeType === 'relocation' && $amount < self::RELOCATION_MIN_AMOUNT) {
            return [
                'success' => false,
                'message' => 'Relocation fee must be at least KSh ' . self::RELOCATION_MIN_AMOUNT . '.',
            ];
        }

        $reference = trim((string) ($input['reference'] ?? ''));
        if ($reference === '') {
            $prefix = match ($feeType) {
                'relocation' => 'RELOC',
                'router_change' => 'RTR',
                'extension' => 'EXT',
                'installation' => 'INST',
                default => 'FEE',
            };
            $reference = $prefix . substr((string) time(), -6);
        }
        $reference = substr(preg_replace('/\s+/', '', $reference) ?: 'FEE', 0, 12);

        $ticketId = isset($input['ticket_id']) && $input['ticket_id'] !== ''
            ? substr(trim((string) $input['ticket_id']), 0, 64)
            : null;

        $ticketNumber = $this->optionalString($input['ticket_number'] ?? null, 64);
        $ticketSubject = $this->optionalString($input['ticket_subject'] ?? null, 255);
        $ticketCreatedBy = $this->optionalString($input['ticket_created_by'] ?? null, 128);

        $token = $this->accessToken();
        if (!$token) {
            return ['success' => false, 'message' => 'Failed to get Safaricom access token. Check MPESA_* credentials.'];
        }

        $timestamp = $this->timestamp();
        $password = base64_encode($shortcode . $passkey . $timestamp);
        $txnType = ($settings['party_b_type'] ?? 'till') === 'paybill'
            ? 'CustomerPayBillOnline'
            : 'CustomerBuyGoodsOnline';

        $callbackUrl = $this->callbackUrl();
        $desc = match ($feeType) {
            'relocation' => 'Relocation fee',
            'router_change' => 'Router change',
            'extension' => 'Extension fee',
            'installation' => 'Install fee',
            default => 'Tonycomm fee',
        };

        $payload = [
            'BusinessShortCode' => $shortcode,
            'Password' => $password,
            'Timestamp' => $timestamp,
            'TransactionType' => $txnType,
            'Amount' => $amount,
            'PartyA' => $phone,
            'PartyB' => $partyB,
            'PhoneNumber' => $phone,
            'CallBackURL' => $callbackUrl,
            'AccountReference' => $reference,
            'TransactionDesc' => substr($desc, 0, 13),
        ];

        $url = $this->darajaBase() . '/mpesa/stkpush/v1/processrequest';
        $response = Http::withToken($token)->timeout(30)->post($url, $payload);
        $body = $response->json() ?: [];

        Log::info('MegaPay STK request', [
            'phone' => $phone,
            'amount' => $amount,
            'party_b' => $partyB,
            'type' => $txnType,
            'fee_type' => $feeType,
            'http' => $response->status(),
            'response' => $body,
        ]);

        $code = (string) ($body['ResponseCode'] ?? '');
        if (!$response->successful() || ($code !== '0' && $code !== '00')) {
            return [
                'success' => false,
                'message' => $body['errorMessage']
                    ?? $body['ResponseDescription']
                    ?? $body['CustomerMessage']
                    ?? 'STK push failed',
                'safaricom' => $body,
            ];
        }

        $txn = MegapayTransaction::create([
            'phone' => $phone,
            'amount' => $amount,
            'fee_type' => $feeType,
            'reference' => $reference,
            'ticket_id' => $ticketId,
            'ticket_number' => $ticketNumber,
            'ticket_subject' => $ticketSubject,
            'ticket_created_by' => $ticketCreatedBy,
            'party_b' => $partyB,
            'checkout_request_id' => $body['CheckoutRequestID'] ?? null,
            'merchant_request_id' => $body['MerchantRequestID'] ?? null,
            'status' => 'pending',
            'payment_method' => 'stk',
            'created_by' => $userId,
        ]);

        return [
            'success' => true,
            'message' => $body['CustomerMessage'] ?? 'STK push sent',
            'transaction' => $txn,
            'CheckoutRequestID' => $body['CheckoutRequestID'] ?? null,
            'MerchantRequestID' => $body['MerchantRequestID'] ?? null,
        ];
    }

    public function handleCallback(array $payload): array
    {
        $stk = $payload['Body']['stkCallback'] ?? $payload['stkCallback'] ?? null;
        if (!is_array($stk)) {
            return ['ResultCode' => 0, 'ResultDesc' => 'Accepted'];
        }

        $checkoutId = (string) ($stk['CheckoutRequestID'] ?? '');
        $resultCode = (string) ($stk['ResultCode'] ?? '');
        $resultDesc = (string) ($stk['ResultDesc'] ?? '');

        $meta = [];
        $items = $stk['CallbackMetadata']['Item'] ?? [];
        if (is_array($items)) {
            foreach ($items as $item) {
                if (!is_array($item) || !isset($item['Name'])) {
                    continue;
                }
                $meta[$item['Name']] = $item['Value'] ?? null;
            }
        }

        $txn = null;
        if ($checkoutId !== '') {
            $txn = MegapayTransaction::where('checkout_request_id', $checkoutId)->first();
        }

        if (!$txn) {
            Log::warning('MegaPay callback with unknown CheckoutRequestID', [
                'checkout' => $checkoutId,
                'result' => $resultCode,
            ]);
            return ['ResultCode' => 0, 'ResultDesc' => 'Accepted'];
        }

        $status = 'failed';
        if ($resultCode === '0' || $resultCode === '00') {
            $status = 'paid';
        } elseif (stripos($resultDesc, 'cancel') !== false || $resultCode === '1032') {
            $status = 'cancelled';
        }

        $phoneFromMeta = isset($meta['PhoneNumber']) ? (string) $meta['PhoneNumber'] : null;
        if ($phoneFromMeta) {
            $normalized = $this->normalizePhone($phoneFromMeta);
            if ($normalized) {
                $txn->phone = $normalized;
            }
        }

        $txn->status = $status;
        $txn->result_code = $resultCode;
        $txn->result_desc = substr($resultDesc, 0, 255);
        $txn->receipt = isset($meta['MpesaReceiptNumber']) ? (string) $meta['MpesaReceiptNumber'] : $txn->receipt;
        if (isset($meta['Amount'])) {
            $txn->amount = (int) ceil((float) $meta['Amount']);
        }
        if ($status === 'paid' && empty($txn->payment_method)) {
            $txn->payment_method = 'stk';
        }
        $txn->raw_callback = json_encode($payload);
        $txn->save();

        Log::info('MegaPay callback stored', [
            'id' => $txn->id,
            'checkout' => $checkoutId,
            'status' => $status,
            'receipt' => $txn->receipt,
        ]);

        return ['ResultCode' => 0, 'ResultDesc' => 'Accepted'];
    }

    public function queryStkStatus(string $checkoutRequestId): array
    {
        $txn = MegapayTransaction::where('checkout_request_id', $checkoutRequestId)->first();
        if ($txn && in_array($txn->status, ['paid', 'failed', 'cancelled'], true)) {
            return [
                'success' => true,
                'source' => 'local',
                'transaction' => $txn,
            ];
        }

        $shortcode = (string) env('MPESA_SHORTCODE', '');
        $passkey = (string) env('MPESA_PASSKEY', '');
        $token = $this->accessToken();
        if (!$token || $shortcode === '' || $passkey === '') {
            return [
                'success' => true,
                'source' => 'local',
                'transaction' => $txn,
                'message' => 'Waiting for callback (could not query Daraja).',
            ];
        }

        $timestamp = $this->timestamp();
        $password = base64_encode($shortcode . $passkey . $timestamp);
        $url = $this->darajaBase() . '/mpesa/stkpushquery/v1/query';
        $response = Http::withToken($token)->timeout(30)->post($url, [
            'BusinessShortCode' => $shortcode,
            'Password' => $password,
            'Timestamp' => $timestamp,
            'CheckoutRequestID' => $checkoutRequestId,
        ]);
        $body = $response->json() ?: [];

        $resultCode = (string) ($body['ResultCode'] ?? '');
        if ($txn && ($resultCode === '0' || $resultCode === '00')) {
            // Final success usually arrives via callback; keep pending until callback confirms receipt.
            if ($txn->status === 'pending' && empty($txn->receipt)) {
                // leave pending — callback has receipt
            }
        } elseif ($txn && $resultCode !== '' && $resultCode !== '0') {
            $desc = (string) ($body['ResultDesc'] ?? '');
            if (stripos($desc, 'cancel') !== false || $resultCode === '1032') {
                $txn->status = 'cancelled';
            } elseif (!in_array($resultCode, ['4999', '1037'], true)) {
                // 4999 = still processing
                $txn->status = 'failed';
            }
            $txn->result_code = $resultCode;
            $txn->result_desc = substr($desc, 0, 255);
            $txn->save();
        }

        return [
            'success' => true,
            'source' => 'daraja',
            'transaction' => $txn?->fresh(),
            'safaricom' => $body,
        ];
    }

    public function recordManualPayment(array $input, ?int $userId = null): array
    {
        $receipt = strtoupper(preg_replace('/\s+/', '', (string) ($input['receipt'] ?? '')) ?: '');
        if ($receipt === '' || strlen($receipt) < 6) {
            return ['success' => false, 'message' => 'Enter a valid M-Pesa transaction ID from the SMS.'];
        }

        $existing = MegapayTransaction::where('receipt', $receipt)->first();
        if ($existing) {
            return [
                'success' => false,
                'message' => 'This transaction ID is already linked to a MegaPay payment.',
                'transaction' => $existing,
            ];
        }

        $ticketId = isset($input['ticket_id']) && $input['ticket_id'] !== ''
            ? substr(trim((string) $input['ticket_id']), 0, 64)
            : null;

        $feeType = $this->normalizeFeeType($input['fee_type'] ?? 'relocation', 'relocation');

        $mpesaRow = null;
        if (Schema::hasTable('mpesa')) {
            $mpesaRow = Mpesa::where('TransID', $receipt)->first();
        }

        $amount = isset($input['amount']) && $input['amount'] !== '' && $input['amount'] !== null
            ? (int) ceil((float) $input['amount'])
            : null;
        $phoneRaw = trim((string) ($input['phone'] ?? ''));

        if ($mpesaRow) {
            if ($amount === null || $amount < 1) {
                $amount = (int) ceil((float) ($mpesaRow->TransAmount ?? 0));
            }
            if ($phoneRaw === '' && !empty($mpesaRow->MSISDN)) {
                $phoneRaw = (string) $mpesaRow->MSISDN;
            }
            $source = 'mpesa_table';
        } else {
            $source = 'sms_manual';
            if ($amount === null || $amount < 1) {
                return ['success' => false, 'message' => 'Amount is required when the receipt is not yet in M-Pesa records.'];
            }
            if ($phoneRaw === '') {
                return ['success' => false, 'message' => 'Phone is required when the receipt is not yet in M-Pesa records.'];
            }
        }

        if ($feeType === 'relocation' && $amount < self::RELOCATION_MIN_AMOUNT) {
            return [
                'success' => false,
                'message' => 'Relocation fee must be at least KSh ' . self::RELOCATION_MIN_AMOUNT . '.',
            ];
        }

        $phone = $this->normalizePhone($phoneRaw);
        if ($phone === null) {
            // C2B may store hashed MSISDN — allow raw digits if normalize fails but mpesa row exists
            if ($mpesaRow && $phoneRaw !== '') {
                $phone = substr(preg_replace('/\D+/', '', $phoneRaw) ?: $phoneRaw, 0, 20);
            } else {
                return ['success' => false, 'message' => 'Invalid phone number. Use 07… or 2547…'];
            }
        }

        $settings = $this->getSettings();
        $partyB = trim((string) ($settings['party_b_number'] ?? ''));

        $txn = MegapayTransaction::create([
            'phone' => $phone,
            'amount' => $amount,
            'fee_type' => $feeType,
            'reference' => substr('MAN' . substr($receipt, -8), 0, 12),
            'ticket_id' => $ticketId,
            'ticket_number' => $this->optionalString($input['ticket_number'] ?? null, 64),
            'ticket_subject' => $this->optionalString($input['ticket_subject'] ?? null, 255),
            'ticket_created_by' => $this->optionalString($input['ticket_created_by'] ?? null, 128),
            'party_b' => $partyB !== '' ? $partyB : null,
            'status' => 'paid',
            'payment_method' => 'manual',
            'receipt' => $receipt,
            'result_code' => '0',
            'result_desc' => $source === 'mpesa_table'
                ? 'Manual link from mpesa table'
                : 'Manual entry from M-Pesa SMS',
            'raw_callback' => json_encode([
                'source' => $source,
                'mpesa_id' => $mpesaRow->id ?? null,
                'entered_at' => now()->toDateTimeString(),
            ]),
            'created_by' => $userId,
        ]);

        return [
            'success' => true,
            'message' => 'Till payment recorded',
            'source' => $source,
            'transaction' => $txn,
        ];
    }

    public function relocationStats(): array
    {
        return $this->tillStats('relocation');
    }

    /**
     * Till Payments dashboard stats.
     * KopoKopo webhook settlement will feed the same totals later.
     *
     * @param string|null $feeType null = all till fee types
     */
    public function tillStats(?string $feeType = null): array
    {
        $types = self::TILL_FEE_TYPES;
        if ($feeType !== null && $feeType !== '' && $feeType !== 'all') {
            $normalized = $this->normalizeFeeType($feeType, 'relocation');
            $types = in_array($normalized, self::TILL_FEE_TYPES, true) ? [$normalized] : self::TILL_FEE_TYPES;
        }

        $todayStart = now('Africa/Nairobi')->startOfDay()->utc();
        $monthStart = now('Africa/Nairobi')->startOfMonth()->utc();

        $base = MegapayTransaction::query()->whereIn('fee_type', $types);
        $paidToday = (clone $base)->where('status', 'paid')->where('updated_at', '>=', $todayStart);
        $paidMonth = (clone $base)->where('status', 'paid')->where('updated_at', '>=', $monthStart);

        $byType = [];
        foreach (self::TILL_FEE_TYPES as $type) {
            $tq = MegapayTransaction::query()->where('fee_type', $type);
            $byType[$type] = [
                'pending_stk' => (clone $tq)->where('status', 'pending')->where('payment_method', 'stk')->count(),
                'paid_today_count' => (clone $tq)->where('status', 'paid')->where('updated_at', '>=', $todayStart)->count(),
                'paid_today_amount' => (int) (clone $tq)->where('status', 'paid')->where('updated_at', '>=', $todayStart)->sum('amount'),
                'paid_month_count' => (clone $tq)->where('status', 'paid')->where('updated_at', '>=', $monthStart)->count(),
                'paid_month_amount' => (int) (clone $tq)->where('status', 'paid')->where('updated_at', '>=', $monthStart)->sum('amount'),
                'paid_total_count' => (clone $tq)->where('status', 'paid')->count(),
                'paid_total_amount' => (int) (clone $tq)->where('status', 'paid')->sum('amount'),
            ];
        }

        $recent = MegapayTransaction::query()
            ->whereIn('fee_type', $types)
            ->where('status', 'paid')
            ->orderByDesc('updated_at')
            ->limit(20)
            ->get();

        return [
            'pending_stk' => (clone $base)->where('status', 'pending')->where('payment_method', 'stk')->count(),
            'paid_today_count' => (clone $paidToday)->count(),
            'paid_today_amount' => (int) (clone $paidToday)->sum('amount'),
            'paid_month_count' => (clone $paidMonth)->count(),
            'paid_month_amount' => (int) (clone $paidMonth)->sum('amount'),
            'paid_total_count' => (clone $base)->where('status', 'paid')->count(),
            'paid_total_amount' => (int) (clone $base)->where('status', 'paid')->sum('amount'),
            'by_type' => $byType,
            'recent_paid' => $recent,
            'min_amount_relocation' => self::RELOCATION_MIN_AMOUNT,
            'settlement_source' => 'megapay_stk',
            // Placeholder for future KopoKopo webhook totals
            'kopokopo' => [
                'enabled' => false,
                'message' => 'KopoKopo webhook integration coming later',
            ],
        ];
    }

    private function optionalString($value, int $max): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        return substr(trim((string) $value), 0, $max);
    }

    private function setting(string $key, string $default = ''): string
    {
        if (!Schema::hasTable('megapay_settings')) {
            return $default;
        }
        $row = MegapaySetting::where('key_name', $key)->first();
        if (!$row || $row->key_value === null) {
            return $default;
        }
        return (string) $row->key_value;
    }

    private function setSetting(string $key, string $value): void
    {
        MegapaySetting::updateOrCreate(
            ['key_name' => $key],
            ['key_value' => $value]
        );
    }

    private function accessToken(): ?string
    {
        $env = env('MPESA_ENV', 'sandbox');
        $url = $env === 'live'
            ? 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials'
            : 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';

        $key = (string) env('MPESA_CONSUMER_KEY', '');
        $secret = (string) env('MPESA_CONSUMER_SECRET', '');
        if ($key === '' || $secret === '') {
            return null;
        }

        $credentials = base64_encode("{$key}:{$secret}");
        $response = Http::withHeaders([
            'Authorization' => "Basic {$credentials}",
        ])->timeout(20)->get($url);

        if ($response->successful()) {
            return $response->json()['access_token'] ?? null;
        }

        Log::error('MegaPay access token error', ['body' => $response->body()]);
        return null;
    }

    private function darajaBase(): string
    {
        return env('MPESA_ENV', 'sandbox') === 'live'
            ? 'https://api.safaricom.co.ke'
            : 'https://sandbox.safaricom.co.ke';
    }

    private function timestamp(): string
    {
        return now('Africa/Nairobi')->format('YmdHis');
    }

    private function callbackUrl(): string
    {
        $base = rtrim((string) config('app.url'), '/');
        $apiBase = rtrim((string) env('MPESA_CALLBACK_BASE', $base . '/api/v1'), '/');
        if (!str_ends_with($apiBase, '/api/v1') && !str_contains($apiBase, '/api/')) {
            $apiBase = $base . '/api/v1';
        }
        return $apiBase . '/megapay/callback';
    }

    private function normalizePhone(string $phone): ?string
    {
        $digits = preg_replace('/\D+/', '', $phone) ?: '';
        if ($digits === '') {
            return null;
        }
        if (str_starts_with($digits, '0') && strlen($digits) === 10) {
            $digits = '254' . substr($digits, 1);
        } elseif (str_starts_with($digits, '7') && strlen($digits) === 9) {
            $digits = '254' . $digits;
        } elseif (str_starts_with($digits, '254') && strlen($digits) === 12) {
            // ok
        } else {
            return null;
        }
        if (!preg_match('/^2547\d{8}$/', $digits)) {
            return null;
        }
        return $digits;
    }
}
