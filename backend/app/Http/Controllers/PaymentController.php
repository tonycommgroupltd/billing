<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Payment;
use App\Models\Invoice;
use App\Models\Service;
use App\Http\Resources\PaymentCollection;
use App\Models\Customer;
use App\Models\ManualPayment;
use App\Models\Mpesa;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use App\Models\Plan;
use App\Models\Router;
use App\Services\BillingCycleService;
use Illuminate\Support\Facades\Artisan;
use RouterOS\Client;
use RouterOS\Config;
use RouterOS\Query;
use Illuminate\Support\Facades\Validator;
use Throwable;

class PaymentController extends Controller
{
    /**
     * Create a new controller instance.
     *
     * @return void
     */
    public function __construct(Request $request)
    {
        $this->middleware('auth:api', ['except' => ['recon']]);
    }

    public function add(Request $request)
    {
        $cust = Customer::find($request->customer_id);
        $invoice = Invoice::find($request->invoice_id);
        if ($request->use_credit && $cust->credit <= 0) {
            return response()->json([
                'message' => "Customer has no credit!.",
                "error" => true
            ]);
        } elseif ($request->use_credit && $invoice && $cust->credit > 0) {
            $service = Service::find($invoice->services_id);
            if (!$service) {
                return response()->json(['message' => 'Service not found!.', 'error' => true]);
            }
            $billing = app(BillingCycleService::class);
            $result = $billing->applyWalletToInvoice($invoice, $cust, Carbon::now());
            if (empty($result['ok'])) {
                return response()->json([
                    'message' => $result['message'] ?? 'Credit could not be applied to this invoice.',
                    'error' => true,
                ]);
            }
            $settled = $result['invoice'] ?? $invoice->fresh();
            $used = (float) ($result['used'] ?? 0);
            if ($used > 0.009) {
                Payment::create([
                    'customer_id' => $cust->id,
                    'trans_id' => null,
                    'payment_type' => 'credit',
                    'date' => Carbon::now()->format('Y-m-d'),
                    'sum' => $used,
                    'invoice_id' => $settled->id,
                ]);
            }

            return response()->json([
                'message' => 'Payment has been added successfully!',
            ]);
        } elseif ($invoice) {
            $validator = Validator::make($request->all(), [
                'trans_id' => 'required|string|min:6|unique:payments',
            ]);
            if ($validator->fails()) {
                return response()->json($validator->errors(), 422);
            }

            $service = Service::find($invoice->services_id);
            $result = [];
            if ($service) {
                $billing = app(BillingCycleService::class);
                $result = $billing->applyIncomingPayment($service, (float) $request->sum, $request->payment_date);
                $result['trans_id'] = $request->trans_id;
                if ($cust) {
                    $billing->sendPaymentSms($cust, $service->fresh(), $result);
                }
            }
            $payment = new Payment();
            $payment->customer_id = $request->customer_id;
            $payment->trans_id = $request->trans_id;
            $payment->payment_type = $request->payment_type;
            $payment->date = Carbon::parse($request->payment_date)->format('Y-m-d');
            $payment->sum = $request->sum;
            $settledInvoiceId = ($result['invoice']->id ?? null) ?: $request->invoice_id;
            $payment->invoice_id = $settledInvoiceId;
            $payment->save();
            ManualPayment::create([
                'customer_id' => $request->customer_id,
                'invoice_id' => $settledInvoiceId,
                'payment_method' => $request->payment_type,
                'amount' => $request->sum,
                'reference' => $request->trans_id,
                'payment_date' => $request->payment_date ? Carbon::parse($request->payment_date)->format('Y-m-d') : now(),
                'recorded_by' => $request->user()->id,
            ]);
            return response()->json([
                'message' => "Payment has been added successfully!"
            ]);
        } else {
            return response()->json([
                'message' => "Invoice not found!.",
                "error" => true
            ]);
        }
    }

    public function ajax(Request $request)
    {

        $payment = (new Payment)->newQuery();
        $payment->leftJoin('customers', 'payments.customer_id', '=', 'customers.id');
        //$payment->join('users', 'customers.user_id', '=', 'users.id');
        $payment->select('payments.*', 'customers.name');
        if (request()->has('q')) {
            $payment->where(function ($query) {
                $query->where('payment_type', 'Like', '%' . request()->input('q') . '%')
                    ->orWhere('customers.name', 'Like', '%' . request()->input('q') . '%');
            });
        }
        if (request()->has('start') && request()->has('end')) {
            $startDate = Carbon::parse(request()->input('start'))->format('Y-m-d H:i:s');
            $endDate = Carbon::parse(request()->input('end'))->format('Y-m-d H:i:s');
            $payment->whereBetween('date', [$startDate, $endDate]);
        }
        $per_page = request('per_page', 10);
        $sort = request('sort', 'asc');
        $sortCol = request('sort_col', 'id');
        $result = new PaymentCollection($payment->orderBy($sortCol, $sort)->paginate($per_page));

        //return $result;
        return response()->json([
            'page' => $result->currentPage(),
            'per_page' => $result->perPage(),
            'total' => $result->total(),
            'total_pages' => ceil($result->total() / $result->perPage()),
            'data' => $result,
        ]);
    }

    public function ajaxPayments($id)
    {
        $customer = Customer::where("user_id", $id)->first();
        $payment = (new Payment)->newQuery();
        $payment->leftJoin('customers', 'payments.customer_id', '=', 'customers.id');
        $payment->whereNotNull('payments.customer_id')->where('payments.customer_id', $customer->id);
        //$payment->join('users', 'customers.user_id', '=', 'users.id');
        $payment->select('payments.*', 'customers.name');
        if (request()->has('q')) {
            $payment->where(function ($query) {
                $query->where('payment_type', 'Like', '%' . request()->input('q') . '%')
                    ->orWhere('customers.name', 'Like', '%' . request()->input('q') . '%');
            });
        }
        if (request()->has('start') && request()->has('end')) {
            $startDate = Carbon::parse(request()->input('start'))->format('Y-m-d H:i:s');
            $endDate = Carbon::parse(request()->input('end'))->format('Y-m-d H:i:s');
            $payment->whereBetween('date', [$startDate, $endDate]);
        }
        $per_page = request('per_page', 10);
        $sort = request('sort', 'asc');
        $sortCol = request('sort_col', 'id');
        $result = new PaymentCollection($payment->orderBy($sortCol, $sort)->paginate($per_page));

        //return $result;
        return response()->json([
            'page' => $result->currentPage(),
            'per_page' => $result->perPage(),
            'total' => $result->total(),
            'total_pages' => ceil($result->total() / $result->perPage()),
            'data' => $result,
        ]);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy($id)
    {
        $payment = Payment::find($id);
        $payment->delete();
        return response()->json([
            'message' => 'Payment deleted'
        ], 200);
    }

    public function recon()
    {
        Artisan::call('reconcile:mpesa');

        return response()->json(['message' => 'M-Pesa reconciled']);
    }

    private function update_inv_status($invoice, $request)
    {
        $invoice->status = [
            'label' => 'Paid',
            'value' => 2
        ];
        $invoice->save();
        $service = Service::find($invoice->services_id);
        if ($service && ($service->status['value'] == 1 || $service->status['value'] == 3)) {
            /*$service->status = [
                    'label' => 'Active',
                    'value' => 2
                ];*/
            if (Carbon::parse($request->payment_date) > Carbon::parse($invoice->due_date)) {
                $service->bill_to = billing_day_end(Carbon::parse($request->payment_date)->addMonth());
            }
            //$service->save();
            //enable_secret($service);
            try {
                $response = enable_secret($service);
                if ($response) {
                    $service->status = [
                        'label' => 'Active',
                        'value' => 2
                    ];
                }
            } catch (Throwable $exception) {
                Log::warning('Invoice paid but service activation could not be completed.', [
                    'invoice_id' => $invoice->id,
                    'service_id' => $service->id,
                    'error' => $exception->getMessage(),
                ]);
            }
            $service->save();
        }
    }
}
