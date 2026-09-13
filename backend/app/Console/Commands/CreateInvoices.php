<?php

namespace App\Console\Commands;

use App\Models\Customer;
use App\Models\Service;
use App\Services\BillingCycleService;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

class CreateInvoices extends Command
{
    protected $signature = 'create:invoice';

    protected $description = 'Open the next invoice when bill_to is near. Does not extend bill_to. Wallet credit is applied as week / 2 weeks / month.';

    public function handle()
    {
        $billing = app(BillingCycleService::class);
        $startDay = Carbon::now()->startOfDay();
        $futureEndDay = Carbon::now()->addDays(3)->endOfDay();
        $services = Service::whereNotNull('bill_to')
            ->whereBetween('bill_to', [$startDay, $futureEndDay])
            ->where('status->value', 2)
            ->where('price', '>', 0)
            ->where('billing_type->value', '!=', 2)
            ->get();

        foreach ($services as $data) {
            $service = Service::find($data->id);
            $monthly = $billing->monthlyPrice($service);
            if ($monthly <= 0) {
                continue;
            }

            $customer = Customer::find($data->customer_id);
            $alreadyUnpaid = service_latest_unpaid_invoice($service->id);
            if ($alreadyUnpaid && (float) $alreadyUnpaid->total >= 50) {
                $alreadyUnpaid->due_date = billing_day_end($service->bill_to);
                if ($billing->invoiceHasExtraCharges($alreadyUnpaid, $monthly)) {
                    $alreadyUnpaid->total = $billing->invoiceChargeTotal($alreadyUnpaid);
                } elseif (!$billing->isPeriodInvoiceTotal($service, (float) $alreadyUnpaid->total)
                    || abs((float) $alreadyUnpaid->total - $monthly) < 0.01) {
                    $alreadyUnpaid->total = $monthly;
                }
                $alreadyUnpaid->save();
            } else {
                $billing->ensureMonthlyInvoice($service, $customer, false);
            }

            if ($customer) {
                $result = $billing->applyIncomingPayment($service->fresh(), 0, Carbon::now());
                $invoice = $result['invoice'] ?? service_latest_unpaid_invoice($service->id);
                if (($result['grant'] ?? 'none') === 'none'
                    && $invoice
                    && (int) ($invoice->status['value'] ?? 0) === 1) {
                    // Re-read flag from DB (in-memory model can be stale after create/update).
                    $alreadySent = (int) \Illuminate\Support\Facades\DB::table('invoices')
                        ->where('id', $invoice->id)
                        ->value('invoice_sms_sent');
                    if ($alreadySent === 0) {
                        $billing->sendInvoiceSms($customer, $service->fresh(), $invoice);
                    }
                }
            }
        }
    }
}
