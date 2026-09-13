<?php

namespace App\Http\Controllers;

use App\Models\Mpesa;
use App\Models\MpesaTransaction;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class MpesaTransactionController extends Controller
{
    private $shortCode;
    private $consumerKey;
    private $consumerSecret;
    private $passKey;
    private $env; // "sandbox" or "live"

    public function __construct()
    {
        $this->shortCode = env('MPESA_SHORTCODE');
        $this->consumerKey = env('MPESA_CONSUMER_KEY');
        $this->consumerSecret = env('MPESA_CONSUMER_SECRET');
        $this->passKey = env('MPESA_PASSKEY');
        $this->env = env('MPESA_ENV', 'sandbox');
    }

    /**
     * Start a Safaricom Transaction Status Query for a receipt / TransID.
     * Also returns a local hit immediately if we already have the C2B row.
     */
    public function checkStatus(Request $request)
    {
        $request->validate([
            'trans_id' => 'required|string|max:32',
        ]);

        $transId = strtoupper(trim((string) $request->input('trans_id')));
        $transId = preg_replace('/\s+/', '', $transId);

        // Fast path: already in our paybill table — no need to ask Safaricom.
        $local = Mpesa::where('TransID', $transId)->first();
        if ($local) {
            $this->upsertLocalQuery($transId, [
                'status' => $this->mapLocalMpesaStatus($local->status),
                'amount' => $local->TransAmount,
                'phone' => $local->MSISDN,
                'account' => $local->BillRefNumber,
                'raw_response' => [
                    'source' => 'local_mpesa',
                    'mpesa_id' => $local->id,
                    'local_status' => $local->status,
                    'TransTime' => $local->TransTime,
                    'FirstName' => $local->FirstName,
                ],
            ]);

            return response()->json([
                'success' => true,
                'source' => 'local',
                'queued' => false,
                'ready' => true,
                'message' => 'Found in local M-Pesa records (paybill callback already received).',
                'trans_id' => $transId,
                'result' => $this->formatStoredResult($transId),
            ]);
        }

        $token = $this->generateAccessToken();
        if (!$token) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to get Safaricom access token. Check MPESA_* credentials.',
            ], 500);
        }

        $base = rtrim((string) config('app.url'), '/');
        // Prefer public API host used by Safaricom paybill callbacks.
        $apiBase = rtrim((string) env('MPESA_CALLBACK_BASE', $base . '/api/v1'), '/');
        if (!str_ends_with($apiBase, '/api/v1') && !str_contains($apiBase, '/api/')) {
            $apiBase = $base . '/api/v1';
        }

        $url = $this->env === 'live'
            ? 'https://api.safaricom.co.ke/mpesa/transactionstatus/v1/query'
            : 'https://sandbox.safaricom.co.ke/mpesa/transactionstatus/v1/query';

        $payload = [
            'Initiator' => env('MPESA_INITIATOR'),
            'SecurityCredential' => env('MPESA_SECURITY_CREDENTIAL'),
            'CommandID' => 'TransactionStatusQuery',
            'TransactionID' => $transId,
            'PartyA' => $this->shortCode,
            'IdentifierType' => '4',
            'ResultURL' => $apiBase . '/mpesa/status/callback',
            'QueueTimeOutURL' => $apiBase . '/mpesa/status/timeout',
            'Remarks' => 'Admin status check',
            'Occasion' => 'UIStatusCheck',
        ];

        $response = Http::withToken($token)->timeout(30)->post($url, $payload);
        $body = $response->json() ?: [];

        Log::channel('mpesa')->info('Transaction Status Query', [
            'trans_id' => $transId,
            'http' => $response->status(),
            'request' => array_merge($payload, ['SecurityCredential' => '***']),
            'response' => $body,
        ]);

        $accepted = (string) ($body['ResponseCode'] ?? '') === '0'
            || stripos((string) ($body['ResponseDescription'] ?? ''), 'Accept') !== false;

        if (!$accepted) {
            return response()->json([
                'success' => false,
                'message' => $body['errorMessage']
                    ?? $body['ResponseDescription']
                    ?? $body['errorMessage']
                    ?? 'Safaricom rejected the status query.',
                'safaricom' => $body,
                'trans_id' => $transId,
            ], 422);
        }

        $this->upsertLocalQuery($transId, [
            'status' => 'Pending',
            'amount' => null,
            'phone' => null,
            'account' => null,
            'raw_response' => [
                'source' => 'safaricom_queued',
                'query_response' => $body,
                'queried_at' => now()->toDateTimeString(),
            ],
        ]);

        return response()->json([
            'success' => true,
            'source' => 'safaricom',
            'queued' => true,
            'ready' => false,
            'message' => 'Status query sent to Safaricom. Waiting for callback…',
            'trans_id' => $transId,
            'conversation_id' => $body['ConversationID'] ?? null,
            'result' => $this->formatStoredResult($transId),
            'safaricom' => $body,
        ]);
    }

    /** Poll stored result after an async Safaricom query. */
    public function showStatus(string $transId)
    {
        $transId = strtoupper(trim(preg_replace('/\s+/', '', $transId)));
        $result = $this->formatStoredResult($transId);

        if (!$result) {
            // Still check paybill table in case confirmation arrived after the query started.
            $local = Mpesa::where('TransID', $transId)->first();
            if ($local) {
                $this->upsertLocalQuery($transId, [
                    'status' => $this->mapLocalMpesaStatus($local->status),
                    'amount' => $local->TransAmount,
                    'phone' => $local->MSISDN,
                    'account' => $local->BillRefNumber,
                    'raw_response' => [
                        'source' => 'local_mpesa',
                        'mpesa_id' => $local->id,
                        'local_status' => $local->status,
                        'TransTime' => $local->TransTime,
                        'FirstName' => $local->FirstName,
                    ],
                ]);
                $result = $this->formatStoredResult($transId);
            }
        }

        if (!$result) {
            return response()->json([
                'success' => false,
                'ready' => false,
                'message' => 'No status record yet for this TransID.',
                'trans_id' => $transId,
            ], 404);
        }

        $pending = strcasecmp((string) ($result['status'] ?? ''), 'Pending') === 0
            || strcasecmp((string) ($result['status'] ?? ''), 'Timeout') === 0;

        return response()->json([
            'success' => true,
            'ready' => !$pending,
            'trans_id' => $transId,
            'result' => $result,
        ]);
    }

    /**
     * Callback to receive transaction status asynchronously.
     */
    public function callback(Request $request)
    {
        Log::channel('mpesa')->info('Transaction Status Callback', $request->all());

        $data = $request->all();
        $result = $data['Result'] ?? $data;
        $params = $this->flattenResultParameters($result['ResultParameters']['ResultParameter'] ?? []);

        $receipt = strtoupper(trim((string) (
            $params['ReceiptNo']
            ?? $result['TransactionID']
            ?? $data['TransactionID']
            ?? ''
        )));

        if ($receipt === '') {
            return response()->json(['ResultCode' => 0, 'ResultDesc' => 'Ignored — no receipt']);
        }

        $status = (string) ($params['TransactionStatus'] ?? 'Unknown');
        if ((string) ($result['ResultCode'] ?? '0') !== '0' && $status === 'Unknown') {
            $status = 'Failed';
        }

        $this->upsertLocalQuery($receipt, [
            'status' => $status,
            'amount' => isset($params['Amount']) ? (float) $params['Amount'] : null,
            'phone' => $params['DebitPartyName'] ?? $params['InitiatedBy'] ?? null,
            'account' => $params['BillRefNumber'] ?? $params['CreditPartyName'] ?? null,
            'raw_response' => $data,
        ]);

        return response()->json(['ResultCode' => 0, 'ResultDesc' => 'Received Successfully']);
    }

    /**
     * Timeout callback
     */
    public function timeout(Request $request)
    {
        Log::channel('mpesa')->warning('Transaction Status Timeout', $request->all());

        $data = $request->all();
        $result = $data['Result'] ?? $data;
        $transId = strtoupper(trim((string) (
            $result['TransactionID']
            ?? $data['TransactionID']
            ?? ''
        )));

        if ($transId !== '') {
            $existing = MpesaTransaction::where('trans_id', $transId)->first();
            if ($existing && strcasecmp((string) $existing->status, 'Pending') === 0) {
                $existing->status = 'Timeout';
                $existing->raw_response = json_encode($data);
                $existing->save();
            }
        }

        return response()->json(['ResultCode' => 0, 'ResultDesc' => 'Timeout Received']);
    }

    private function generateAccessToken()
    {
        $url = $this->env === 'live'
            ? 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials'
            : 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';

        $credentials = base64_encode("{$this->consumerKey}:{$this->consumerSecret}");

        $response = Http::withHeaders([
            'Authorization' => "Basic {$credentials}",
        ])->timeout(20)->get($url);

        if ($response->successful()) {
            return $response->json()['access_token'] ?? null;
        }

        Log::error('MPESA Access Token Error', ['response' => $response->body()]);

        return null;
    }

    private function upsertLocalQuery(string $transId, array $fields): void
    {
        if (!Schema::hasTable('mpesa_transactions')) {
            return;
        }

        $payload = [
            'status' => $fields['status'] ?? null,
            'amount' => $fields['amount'] ?? null,
            'phone' => $fields['phone'] ?? null,
            'account' => $fields['account'] ?? null,
            'raw_response' => isset($fields['raw_response'])
                ? json_encode($fields['raw_response'])
                : null,
        ];

        MpesaTransaction::updateOrCreate(
            ['trans_id' => $transId],
            $payload
        );
    }

    private function formatStoredResult(string $transId): ?array
    {
        if (!Schema::hasTable('mpesa_transactions')) {
            return null;
        }

        $row = MpesaTransaction::where('trans_id', $transId)->first();
        if (!$row) {
            return null;
        }

        $raw = $row->raw_response;
        if (is_string($raw)) {
            $decoded = json_decode($raw, true);
            $raw = is_array($decoded) ? $decoded : ['raw' => $raw];
        }

        $localMpesa = Mpesa::where('TransID', $transId)->first();

        return [
            'trans_id' => $row->trans_id,
            'status' => $row->status,
            'amount' => $row->amount,
            'phone' => $row->phone,
            'account' => $row->account,
            'updated_at' => optional($row->updated_at)->toDateTimeString(),
            'in_local_mpesa' => (bool) $localMpesa,
            'local_mpesa_status' => $localMpesa?->status,
            'local_mpesa_time' => $localMpesa?->TransTime,
            'local_first_name' => $localMpesa?->FirstName,
            'raw' => $raw,
        ];
    }

    private function mapLocalMpesaStatus($status): string
    {
        return match ((int) $status) {
            0 => 'LocalPendingReconcile',
            1 => 'LocalUnmatched',
            2 => 'Completed',
            3 => 'LocalDuplicate',
            default => 'LocalRecord',
        };
    }

    /**
     * @param  mixed  $items
     * @return array<string, mixed>
     */
    private function flattenResultParameters($items): array
    {
        $out = [];
        if (!is_array($items)) {
            return $out;
        }

        // Single item comes as associative array, not list.
        if (isset($items['Key'])) {
            $items = [$items];
        }

        foreach ($items as $item) {
            if (!is_array($item) || !isset($item['Key'])) {
                continue;
            }
            $out[(string) $item['Key']] = $item['Value'] ?? null;
        }

        return $out;
    }
}
