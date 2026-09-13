<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Invoice;
use App\Models\Service;
use App\Models\Customer;
use App\Models\Mpesa;
use App\Http\Resources\InvoiceCollection;
use App\Models\Payment;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

class InvoiceController extends Controller
{
    /**
     * Create a new controller instance.
     *
     * @return void
     */
    public function __construct(Request $request)
    {
        $this->middleware('auth:api', ['except' => ['charge', 'createInvoices', 'check', 'downloadPdf']]);
    }

    /**
     * Display the specified resource.
     */
    public function show($id)
    {
        $user = auth()->user();
        $invoice = Invoice::find($id);
        if ($invoice && $invoice->services_id) {
            $service = Service::find($invoice->services_id);
            if ($service && $service->customer_id) {
                $invoice['customer_id'] = $service->customer_id;
                $customer = Customer::find($service->customer_id);
                if ($customer) {
                    if ($user->hasRole(['customer', 'reseller']) && $customer->user_id != $user->id) {
                        throw new AccessDeniedHttpException;
                    }
                    $invoice['customer_name'] = $customer->name;
                    $invoice['customer_phone'] = $customer->phone_number;
                }
            }
        }

        return response()->json([
            'invoice' => $invoice
        ], 200);
    }

    public function charge(Request $request)
    {
        /*$services = Service::where('start_date', '>=', '2024-03-20')->get();
        foreach ($services as $service) {
            $date = Carbon::parse($service->start_date)->addMonth();
            $inv_date = $date->subDays(10);
            if ($inv_date <= Carbon::now() && $service->bill_to == NULL) {
                Invoice::create(['services_id' => $service->id, 'invoice_date' => $inv_date, 'due_date' => Carbon::parse($service->start_date)->addMonth(), 'total' => $service->price, 'status' => ['label' => 'Unpaid', 'value' => 1]]);
                $service->bill_to = Carbon::parse($service->start_date)->addMonth();
            }
            $invoice = Invoice::where('due_date', '<=', Carbon::now())->whereMonth('due_date', date('m'))->whereYear('due_date', date('Y'))->where('services_id', $service->id)->first();
            if ($invoice && $invoice->status['value'] == 1 && $service->status['value'] == 2) {
                $service->status = ['label' => 'Disabled', 'value' => 1];
                $this->disableSecret($service->plan_id, $service->mikrotik_name);
            }
            $service->save();
        }*/
        $services = Service::where('start_date', '>=', '2024-03-20')->get();
        foreach ($services as $service) {
            $customer = Customer::find($service->customer_id);
            $mpesa = self::c2bUser($customer->phone_number);
            if ($mpesa && $mpesa->BillRefNumber) {
                echo $mpesa->BillRefNumber . ' - ' . $customer->created_at;
                echo '<br>';
            }
        }
    }

    private function c2bUser($phone)
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

        return Mpesa::whereIn('BillRefNumber', $phones)->first();
    }

    public function ajax(Request $request)
    {
        $invoice = (new Invoice)->newQuery();
        $invoice->leftJoin('services', 'invoices.services_id', '=', 'services.id');
        $invoice->leftJoin('customers', 'services.customer_id', '=', 'customers.id');
        $invoice->select('invoices.*', 'customers.name', 'customers.id as customer_id');
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
        if (request()->has('status') && request()->input('status')) {
            $invoice->where('invoices.status->value', request()->input('status'));
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

    /**
     * Remove the specified resource from storage.
     */
    public function destroy($id)
    {
        $invoice = Invoice::find($id);
        if ($invoice) {
            $service = Service::find($invoice->services_id);
            if (!$service) {
                return response()->json(['message' => 'Service not found'], 404);
            }
            $cust = Customer::find($service->customer_id);
            $paymentSum = Payment::where('invoice_id', $id)->sum('sum');
            $cust->increaseCredit($paymentSum, 'Payment recon; Deleted Invoice ID: ' . $invoice->id);
            Payment::where('invoice_id', $id)->update(['invoice_id' => NULL]);
            $invoice->delete();
            return response()->json([
                'message' => 'Invoice deleted'
            ], 200);
        } else {
            return response()->json(['message' => 'Invoice not found'], 404);
        }
    }

    public function createInvoices()
    {
        Artisan::call('create:invoice');

        return response()->json([
            'message' => 'Invoices created',
            'output' => Artisan::output(),
        ]);
    }

    public function recon()
    {
        $services = Service::where('status->value', 2)
            ->whereNotNull('bill_to')
            ->where('bill_to', '<=', Carbon::now())
            ->where('billing_type->value', '!=', 2)
            ->get();
        foreach ($services as $service) {
            expire_secret($service);
        }
    }

    public function check()
    {
        $customer = Customer::find(1);
        //$customer->increaseCredit(1000);
        echo $customer->credit;
    }

    public function ajaxInvoices($id)
    {
        $customer = Customer::where("user_id", $id)->first();
        $invoice = (new Invoice)->newQuery();
        $invoice->leftJoin('services', 'invoices.services_id', '=', 'services.id');
        $invoice->leftJoin('customers', 'services.customer_id', '=', 'customers.id');
        $invoice->select('invoices.*', 'customers.name', 'customers.id as customer_id');
        $invoice->whereNotNull('services.customer_id')->where('services.customer_id', $customer->id);
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
        if (request()->has('status') && request()->input('status')) {
            $invoice->where('invoices.status->value', request()->input('status'));
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

    public function downloadPdf($id)
    {
        $invoice = Invoice::find($id);
        return download_pdf($invoice);
    }
}
