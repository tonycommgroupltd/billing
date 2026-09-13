<?php

namespace App\Console\Commands;

use App\Models\Service;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

class ReconcileInvoices extends Command
{
    protected $signature = 'reconcile:invoice';

    protected $description = 'Expire internet when paid time (bill_to) has passed, and when an unpaid install invoice is overdue.';

    public function handle()
    {
        $cutIds = [];

        $byBillTo = Service::where('status->value', 2)
            ->whereNotNull('bill_to')
            ->where('bill_to', '<=', Carbon::now())
            ->where('billing_type->value', '!=', 2)
            ->pluck('id');

        foreach ($byBillTo as $id) {
            $cutIds[$id] = true;
        }

        // New installs: cut if first install invoice is still unpaid past due — even when
        // bill_to was wrongly set to start+1 month from the portal.
        $byUnpaidInstall = Service::query()
            ->where('status->value', 2)
            ->where('billing_type->value', '!=', 2)
            ->whereHas('invoices', function ($q) {
                $q->whereNull('deleted_at')
                    ->where('status->value', 1)
                    ->where('due_date', '<=', Carbon::now())
                    ->whereExists(function ($sub) {
                        $sub->selectRaw('1')
                            ->from('invoice_details')
                            ->whereColumn('invoice_details.invoice_id', 'invoices.id')
                            ->whereNull('invoice_details.deleted_at')
                            ->where('invoice_details.service_type', 'installation');
                    });
            })
            ->pluck('id');

        foreach ($byUnpaidInstall as $id) {
            $cutIds[$id] = true;
        }

        foreach (array_keys($cutIds) as $serviceId) {
            $service = Service::find($serviceId);
            if ($service) {
                expire_secret($service);
            }
        }
    }
}
