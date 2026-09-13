<?php

namespace App\Http\Controllers;

use App\Models\MegapayTransaction;
use App\Services\MegaPayService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class MegaPayController extends Controller
{
    public function __construct(private MegaPayService $megaPay)
    {
    }

    public function settings()
    {
        return response()->json([
            'success' => true,
            'data' => $this->megaPay->getSettings(),
        ]);
    }

    public function updateSettings(Request $request)
    {
        $request->validate([
            'party_b_number' => 'nullable|string|max:32',
            'party_b_type' => 'nullable|in:till,paybill',
        ]);

        $data = $this->megaPay->updateSettings($request->only(['party_b_number', 'party_b_type']));

        return response()->json([
            'success' => true,
            'message' => 'MegaPay settings saved',
            'data' => $data,
        ]);
    }

    public function stk(Request $request)
    {
        $request->validate([
            'phone' => 'required|string|max:20',
            'amount' => 'required|numeric|min:1',
            'fee_type' => 'nullable|string|in:relocation,router_change,extension,installation,other',
            'reference' => 'nullable|string|max:32',
            'ticket_id' => 'nullable|string|max:64',
            'ticket_number' => 'nullable|string|max:64',
            'ticket_subject' => 'nullable|string|max:255',
            'ticket_created_by' => 'nullable|string|max:128',
        ]);

        $feeType = strtolower((string) $request->input('fee_type', 'other'));
        if ($feeType === 'relocation' && (float) $request->input('amount') < MegaPayService::RELOCATION_MIN_AMOUNT) {
            return response()->json([
                'success' => false,
                'message' => 'Relocation fee must be at least KSh ' . MegaPayService::RELOCATION_MIN_AMOUNT . '.',
            ], 422);
        }

        $userId = Auth::guard('api')->id() ?: Auth::id();
        $result = $this->megaPay->initiateStk($request->only([
            'phone',
            'amount',
            'fee_type',
            'reference',
            'ticket_id',
            'ticket_number',
            'ticket_subject',
            'ticket_created_by',
        ]), $userId ? (int) $userId : null);

        if (!($result['success'] ?? false)) {
            return response()->json($result, 422);
        }

        return response()->json($result);
    }

    public function manual(Request $request)
    {
        $request->validate([
            'receipt' => 'required|string|max:32',
            'phone' => 'nullable|string|max:20',
            'amount' => 'nullable|numeric|min:1',
            'fee_type' => 'nullable|string|in:relocation,router_change,extension,installation,other',
            'ticket_id' => 'nullable|string|max:64',
            'ticket_number' => 'nullable|string|max:64',
            'ticket_subject' => 'nullable|string|max:255',
            'ticket_created_by' => 'nullable|string|max:128',
        ]);

        $userId = Auth::guard('api')->id() ?: Auth::id();
        $result = $this->megaPay->recordManualPayment($request->only([
            'receipt',
            'phone',
            'amount',
            'fee_type',
            'ticket_id',
            'ticket_number',
            'ticket_subject',
            'ticket_created_by',
        ]), $userId ? (int) $userId : null);

        if (!($result['success'] ?? false)) {
            return response()->json($result, 422);
        }

        return response()->json($result);
    }

    public function relocationStats()
    {
        return response()->json([
            'success' => true,
            'data' => $this->megaPay->relocationStats(),
        ]);
    }

    public function tillStats(Request $request)
    {
        $feeType = $request->query('fee_type');
        return response()->json([
            'success' => true,
            'data' => $this->megaPay->tillStats($feeType),
        ]);
    }

    public function transactions(Request $request)
    {
        $q = MegapayTransaction::query()->orderByDesc('id');

        if ($request->filled('status')) {
            $q->where('status', $request->input('status'));
        }
        if ($request->filled('fee_type')) {
            $q->where('fee_type', $request->input('fee_type'));
        }
        if ($request->filled('search')) {
            $s = trim((string) $request->input('search'));
            $q->where(function ($inner) use ($s) {
                $inner->where('phone', 'like', "%{$s}%")
                    ->orWhere('receipt', 'like', "%{$s}%")
                    ->orWhere('reference', 'like', "%{$s}%")
                    ->orWhere('ticket_id', 'like', "%{$s}%")
                    ->orWhere('ticket_number', 'like', "%{$s}%")
                    ->orWhere('checkout_request_id', 'like', "%{$s}%");
            });
        }

        $perPage = min(200, max(10, (int) $request->input('per_page', 25)));
        $page = $q->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => $page->items(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ],
        ]);
    }

    public function showTransaction(string $checkoutId)
    {
        $result = $this->megaPay->queryStkStatus($checkoutId);
        $txn = $result['transaction'] ?? MegapayTransaction::where('checkout_request_id', $checkoutId)->first();

        if (!$txn) {
            return response()->json([
                'success' => false,
                'message' => 'Transaction not found',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'source' => $result['source'] ?? 'local',
            'data' => $txn,
            'safaricom' => $result['safaricom'] ?? null,
        ]);
    }

    public function callback(Request $request)
    {
        $payload = $request->all();
        $ack = $this->megaPay->handleCallback($payload);

        return response()->json($ack);
    }
}
