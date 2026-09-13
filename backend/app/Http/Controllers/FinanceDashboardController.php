<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Payment;
use App\Models\Invoice;
use Illuminate\Support\Carbon;

class FinanceDashboardController extends Controller
{
    /**
     * Create a new controller instance.
     *
     * @return void
     */
    public function __construct(Request $request)
    {
        $this->middleware('auth:api');
    }

    public function allstats()
    {
        $fromDate = new Carbon('first day of last month');
        $fromDate->startOfMonth();
        $tillDate = new Carbon('last day of last month');
        $tillDate->endOfMonth();
        $fromDate2 = new Carbon('first day of this month');
        $fromDate2->startOfMonth();
        $tillDate2 = new Carbon('last day of this month');
        $tillDate2->endOfMonth();
        /*$fromDate = Carbon::now()->subMonth()->startOfMonth()->toDateString();
        $tillDate = Carbon::now()->subMonth()->endOfMonth()->toDateString();
        $fromDate2 = Carbon::now()->startOfMonth()->toDateString();
        $tillDate2 = Carbon::now()->endOfMonth()->toDateString();*/
        $this_month_payments = Payment::whereBetween('date', [$fromDate2, $tillDate2])->count();
        $last_month_payments = Payment::whereBetween('date', [$fromDate, $tillDate])->count();
        $sum_this_month_payments = Payment::whereBetween('date', [$fromDate2, $tillDate2])->sum('sum');
        $sum_last_month_payments = Payment::whereBetween('date', [$fromDate, $tillDate])->sum('sum');
        $this_month_unpaid_invoices = Invoice::where('status->value', 1)->whereBetween('invoice_date', [$fromDate2, $tillDate2])->count();
        $this_month_paid_invoices = Invoice::where('status->value', 2)->whereBetween('invoice_date', [$fromDate2, $tillDate2])->count();
        $last_month_unpaid_invoices = Invoice::where('status->value', 1)->whereBetween('invoice_date', [$fromDate, $tillDate])->count();
        $last_month_paid_invoices = Invoice::where('status->value', 2)->whereBetween('invoice_date', [$fromDate, $tillDate])->count();
        $sum_this_month_unpaid_invoices = Invoice::where('status->value', 1)->whereBetween('invoice_date', [$fromDate2, $tillDate2])->sum('total');
        $sum_this_month_paid_invoices = Invoice::where('status->value', 2)->whereBetween('invoice_date', [$fromDate2, $tillDate2])->sum('total');
        $sum_last_month_unpaid_invoices = Invoice::where('status->value', 1)->whereBetween('invoice_date', [$fromDate, $tillDate])->sum('total');
        $sum_last_month_paid_invoices = Invoice::where('status->value', 2)->whereBetween('invoice_date', [$fromDate, $tillDate])->sum('total');

        return response()->json([
            'this_month_payments' => $this_month_payments,
            'last_month_payments' => $last_month_payments,
            'sum_this_month_payments' => number_format($sum_this_month_payments, 2),
            'sum_last_month_payments' => number_format($sum_last_month_payments, 2),
            'this_month_unpaid_invoices' => $this_month_unpaid_invoices,
            'this_month_paid_invoices' => $this_month_paid_invoices,
            'last_month_unpaid_invoices' => $last_month_unpaid_invoices,
            'last_month_paid_invoices' => $last_month_paid_invoices,
            'sum_this_month_unpaid_invoices' => number_format($sum_this_month_unpaid_invoices, 2),
            'sum_this_month_paid_invoices' => number_format($sum_this_month_paid_invoices, 2),
            'sum_last_month_unpaid_invoices' => number_format($sum_last_month_unpaid_invoices, 2),
            'sum_last_month_paid_invoices' => number_format($sum_last_month_paid_invoices, 2)
        ]);
    }
}
