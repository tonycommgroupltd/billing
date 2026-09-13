<?php

namespace App\Console\Commands;

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\MessageTemplate;
use App\Models\Service;
use App\Services\BillingCycleService;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class FixZeroInvoices extends Command
{
    protected $signature = 'billing:fix-zero-invoices {--dry-run} {--no-sms} {--phones=}';

    protected $description = 'Disable remaining Ksh 0 invoice accounts, clear credit, rewrite monthly invoices, SMS customers';

    public function handle()
    {
        $billing = app(BillingCycleService::class);
        $dry = (bool) $this->option('dry-run');
        $sms = !$this->option('no-sms') && !$dry;
        $phoneFilter = array_filter(array_map('trim', explode(',', (string) $this->option('phones'))));
        $skipPhones = ['0712848481', '0718742693'];
        $skipPppoe = ['jorammaina', 'morganmaina', 'morganmaina1', 'tonytesting'];

        if (!$dry) {
            $this->installSmsTemplates();
        }

        $rows = DB::select("
            SELECT s.id AS service_id, c.id AS customer_id, c.name, c.phone_number,
                   s.mikrotik_name, s.price, s.status, s.bill_to, s.billing_period,
                   i.id AS invoice_id, i.total, i.status AS invoice_status, i.due_date
            FROM services s
            JOIN customers c ON c.id = s.customer_id
            JOIN invoices i ON i.id = (
                SELECT i2.id FROM invoices i2
                WHERE i2.services_id = s.id AND i2.deleted_at IS NULL
                ORDER BY i2.id DESC LIMIT 1
            )
            WHERE s.deleted_at IS NULL
              AND s.price > 0
              AND i.total < 50
            ORDER BY c.phone_number
        ");

        $this->info('Found '.count($rows).' services whose latest invoice is under Ksh 50.');
        foreach ($rows as $row) {
            $phone = (string) $row->phone_number;
            $pppoe = (string) $row->mikrotik_name;
            if ($phoneFilter && !in_array($phone, $phoneFilter, true)) {
                continue;
            }
            if (in_array($phone, $skipPhones, true) || in_array(strtolower($pppoe), $skipPppoe, true)) {
                $this->line("SKIP test {$phone} {$pppoe}");
                continue;
            }

            $service = Service::find($row->service_id);
            $customer = Customer::find($row->customer_id);
            if (!$service || !$customer) {
                continue;
            }
            $monthly = $billing->monthlyPrice($service);
            $credit = (float) $customer->credit;
            $this->line(sprintf(
                '%s %s %s inv %s total %s credit %s monthly %s',
                $phone,
                $pppoe,
                $row->status,
                $row->invoice_id,
                $row->total,
                $credit,
                $monthly
            ));
            if ($dry || $monthly <= 0) {
                continue;
            }

            $service->billing_period = ['label' => 'Monthly', 'value' => 3];
            $service->bill_to = Carbon::now();
            $service->save();
            disable_secret($service);

            if ($credit > 0.009) {
                $customer->decreaseCredit($credit, 'Zero-invoice clawback '.Carbon::now()->toDateTimeString());
            }

            $invoice = Invoice::find($row->invoice_id);
            if ($invoice && (int) ($invoice->status['value'] ?? 0) === 1) {
                $invoice->total = $monthly;
                $invoice->due_date = billing_day_end(Carbon::now());
                $invoice->last_rdr_check = 0;
                $invoice->save();
            } else {
                $invoice = $billing->ensureMonthlyInvoice($service->fresh(), $customer->fresh(), false);
            }

            if ($sms && $invoice && $customer->formatted_phone_no) {
                $billing->sendInvoiceSms($customer->fresh(), $service->fresh(), $invoice->fresh());
                $this->info("  SMS sent to {$phone}");
            }
        }

        return 0;
    }

    private function installSmsTemplates(): void
    {
        $onPayment = 'Tonycomm: Ksh[[amount]] received. [[applied]] Internet until [[due_date]]. Credit Ksh[[credit]]. Monthly package Ksh[[monthly]]. Pay Ksh[[to_pay]] for a full month. Acc [[account]]';
        $tpl = MessageTemplate::where('message_class', 'on_payment')->first();
        if ($tpl) {
            $tpl->setTranslation('message', 'en', $onPayment);
            $tpl->save();
        }
    }
}
