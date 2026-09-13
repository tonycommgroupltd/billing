<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Mpesa;
use App\Models\Payment;
use App\Models\Service;
use App\Services\NotificationService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;

class MpesaController extends Controller
{
    /**
     * Holds the request data.
     *
     * @var object
     */
    protected $request;

    /**
     * Holds the response data.
     *
     * @var object
     */
    protected $response;

    /**
     * Holds data to be manipulated.
     *
     * @var object
     */
    protected $data;

    /**
     * Holds the current date data
     *
     * @var object
     */
    protected $now;

    /**
     * Create a new controller instance.
     *
     * @return void
     */
    public function __construct(Request $request)
    {
        $this->middleware('auth:api', ['except' => ['validation', 'confirmation']]);
        $this->request = $request;
        $this->now = \Carbon\Carbon::now();
        $mpesa = new \Safaricom\Mpesa\Mpesa();
        $this->response = $this->strtoobj($mpesa->getDataFromCallback());
    }

    /**
     * Safaricom C2B validation — reject unknown account refs before money is taken.
     * Must be registered as the Validation URL on Paybill 4129711.
     */
    public function validation()
    {
        $payload = $this->request->all();
        if (empty($payload) && is_object($this->response)) {
            $payload = (array) $this->response;
        }

        $billRef = trim((string) ($payload['BillRefNumber'] ?? ($this->response->BillRefNumber ?? '')));
        $msisdn = trim((string) ($payload['MSISDN'] ?? ($this->response->MSISDN ?? '')));
        $amount = (float) ($payload['TransAmount'] ?? ($this->response->TransAmount ?? 0));

        Log::channel('mpesa')->info('MPESA VALIDATION', [
            'ip' => $this->request->ip(),
            'BillRefNumber' => $billRef,
            'MSISDN' => $msisdn,
            'TransAmount' => $amount,
            'payload' => $payload,
        ]);

        if ($this->isValidPaybillAccount($billRef)) {
            return response()->json([
                'ResultCode' => 0,
                'ResultDesc' => 'Accepted',
            ]);
        }

        $this->notifyInvalidPaybillAccount($msisdn, $billRef, $amount);

        Log::channel('mpesa')->warning('MPESA VALIDATION REJECTED', [
            'BillRefNumber' => $billRef,
            'MSISDN' => $msisdn,
            'TransAmount' => $amount,
        ]);

        return response()->json([
            'ResultCode' => 'C2B00012',
            'ResultDesc' => 'Invalid Account Number',
        ]);
    }

    public function confirmation()
    {
        Log::channel('mpesa')->info('MPESA CONFIRMATION RECEIVED', [
            'ip' => $this->request->ip(),
            'payload' => $this->request->all(),
        ]);
        $exists = Mpesa::where('TransID', $this->response->TransID)->first();
        if ($exists) {
            return response()->json(["C2BPaymentConfirmationResult" => "Success"]);
        } else {
            $create = new Mpesa;
            $create->TransactionType = $this->response->TransactionType;
            $create->TransID = $this->response->TransID;
            $create->TransTime = $this->response->TransTime;
            $create->TransAmount = (float)$this->response->TransAmount;
            $create->BusinessShortCode = $this->response->BusinessShortCode;
            $create->BillRefNumber = $this->response->BillRefNumber;
            $create->InvoiceNumber = $this->response->InvoiceNumber;
            $create->OrgAccountBalance = (float)$this->response->OrgAccountBalance;
            $create->ThirdPartyTransID = $this->response->ThirdPartyTransID;
            $create->MSISDN = $this->response->MSISDN;
            $create->FirstName = $this->response->FirstName;
            $create->save();

            $amount = number_format((float) $this->response->TransAmount, 2);
            $name = trim((string) ($this->response->FirstName ?? 'Customer'));
            $billRef = trim((string) ($this->response->BillRefNumber ?? ''));
            $transId = trim((string) ($this->response->TransID ?? ''));

            try {
                NotificationService::notifyRoles(
                    ['super-administrator', 'administrator', 'financial-manager'],
                    'mpesa',
                    'M-Pesa payment received',
                    "KES {$amount} from {$name}" . ($billRef ? " (Ref: {$billRef})" : '') . ($transId ? " — {$transId}" : ''),
                    'wallet',
                    '/admin/finance/mpesa'
                );
            } catch (\Throwable $e) {
                Log::warning('MPESA notification failed: ' . $e->getMessage());
            }

            return response()->json(["C2BPaymentConfirmationResult" => "Success"]);
        }
    }

    public function ajax(Request $request)
    {
        $mpesa = (new Mpesa)->newQuery();
        if (request()->filled('q')) {
            $search = trim(request()->input('q'));
            $digits = preg_replace('/\D+/', '', $search);
            $phoneVariants = collect([$search, $digits])->filter();

            if (strlen($digits) === 10 && str_starts_with($digits, '0')) {
                $phoneVariants->push('254' . substr($digits, 1));
            } elseif (strlen($digits) === 12 && str_starts_with($digits, '254')) {
                $phoneVariants->push('0' . substr($digits, 3));
            } elseif (strlen($digits) === 9) {
                $phoneVariants->push('0' . $digits, '254' . $digits);
            }

            $phoneVariants = $phoneVariants->unique()->values();

            $mpesa->where(function ($query) use ($search, $phoneVariants) {
                $query->where('TransID', 'Like', '%' . $search . '%')
                    ->orWhere('FirstName', 'Like', '%' . $search . '%')
                    ->orWhere('MiddleName', 'Like', '%' . $search . '%')
                    ->orWhere('LastName', 'Like', '%' . $search . '%');

                foreach ($phoneVariants as $variant) {
                    $query->orWhere('BillRefNumber', 'Like', '%' . $variant . '%')
                        ->orWhere('MSISDN', 'Like', '%' . $variant . '%');
                }
            });
        }
        if (request()->has('start') && request()->has('end')) {
            $startDate = Carbon::parse(request()->input('start'))->format('Y-m-d H:i:s');
            $endDate = Carbon::parse(request()->input('end'))->format('Y-m-d H:i:s');
            $mpesa->whereBetween('TransTime', [$startDate, $endDate]);
        }
        $per_page = request('per_page', 10);
        $sort = request('sort', 'asc');
        $sortCol = request('sort_col', 'id');
        $paginator = $mpesa->orderBy($sortCol, $sort)->paginate($per_page);

        $transIds = collect($paginator->items())->pluck('TransID')->filter()->unique()->values()->all();
        $phonesByTrans = [];
        if (!empty($transIds)) {
            $phonesByTrans = Payment::query()
                ->whereIn('trans_id', $transIds)
                ->whereNotNull('customer_id')
                ->join('customers', 'customers.id', '=', 'payments.customer_id')
                ->whereNull('customers.deleted_at')
                ->orderByDesc('payments.id')
                ->get(['payments.trans_id', 'customers.phone_number'])
                ->groupBy('trans_id')
                ->map(fn ($rows) => (string) ($rows->first()->phone_number ?? ''))
                ->filter()
                ->all();
        }

        $data = collect($paginator->items())->map(function ($row) use ($phonesByTrans) {
            $item = $row->toArray();
            $item['sender_phone'] = $this->resolveSenderPhone($row, $phonesByTrans);

            return $item;
        })->values();

        return response()->json([
            'page' => $paginator->currentPage(),
            'per_page' => $paginator->perPage(),
            'total' => $paginator->total(),
            'total_pages' => $paginator->lastPage(),
            'data' => $data,
        ]);
    }

    /**
     * Safaricom now hashes MSISDN. Prefer clear MSISDN, else matched payment customer phone.
     */
    private function resolveSenderPhone($row, array $phonesByTrans): string
    {
        $msisdn = trim((string) ($row->MSISDN ?? ''));
        $digits = preg_replace('/\D+/', '', $msisdn);
        if (strlen($digits) >= 9 && strlen($digits) <= 15) {
            return format_phone($digits);
        }

        $transId = (string) ($row->TransID ?? '');
        if ($transId !== '' && !empty($phonesByTrans[$transId])) {
            return (string) $phonesByTrans[$transId];
        }

        // Best-effort: account is often the payer's own phone
        $ref = preg_replace('/\s+/', '', (string) ($row->BillRefNumber ?? ''));
        $phonePart = explode('#', $ref)[0] ?? '';
        $refDigits = preg_replace('/\D+/', '', $phonePart);
        if (strlen($refDigits) >= 9 && strlen($refDigits) <= 12) {
            $customer = c2b_user($phonePart);
            if ($customer && !empty($customer->phone_number)) {
                return (string) $customer->phone_number;
            }
        }

        return '';
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy($id)
    {
        $mpesa = Mpesa::find($id);
        $mpesa->delete();
        return response()->json([
            'message' => 'Mpesa deleted'
        ], 200);
    }

    /**
     * True when BillRefNumber maps to a known customer or service#id.
     */
    private function isValidPaybillAccount(string $billRef): bool
    {
        $ref = preg_replace('/\s+/', '', $billRef);
        if ($ref === '') {
            return false;
        }

        // phone#serviceId (optional legacy W/B suffix on the id)
        if (str_contains($ref, '#')) {
            $parts = explode('#', $ref, 2);
            $phonePart = $parts[0] ?? '';
            $svcRaw = $parts[1] ?? '';
            $svcId = (int) preg_replace('/\D+/', '', $svcRaw);
            if ($svcId <= 0) {
                return false;
            }
            $service = Service::find($svcId);
            if (!$service) {
                return false;
            }
            if ($phonePart !== '') {
                $customer = c2b_user($phonePart);
                if ($customer && (int) $service->customer_id === (int) $customer->id) {
                    return true;
                }
                // Phone typed wrong but service id is real — still accept onto that line
                if (!$customer) {
                    return true;
                }

                return false;
            }

            return true;
        }

        // Plain account must be an existing customer phone
        return (bool) c2b_user($ref);
    }

    private function notifyInvalidPaybillAccount(string $msisdn, string $typed, float $amount): void
    {
        try {
            $digits = preg_replace('/\D+/', '', $msisdn);
            // Skip hashed / non-phone MSISDN values
            if (strlen($digits) < 9 || strlen($digits) > 15) {
                return;
            }
            $to = format_w_phone($digits);
            $typedTxt = trim($typed) !== '' ? trim($typed) : 'blank';
            $amt = number_format($amount, 0);
            $msg = "Tonycomm: Payment of Ksh{$amt} failed. Account {$typedTxt} is not in our system. Try again on Paybill 4129711 using your phone number as the account (e.g. 07XXXXXXXX). For help call 0110345166.";
            send_sms($to, $msg, 0);
        } catch (\Throwable $e) {
            Log::warning('MPESA invalid-account SMS failed: '.$e->getMessage());
        }
    }

    private function strtoobj($str)
    {
        return (object)json_decode($str, true);
    }
}
