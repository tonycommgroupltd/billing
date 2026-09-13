<?php

namespace App\Console\Commands;

use App\Messages\PaymentReminderMessage;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\MessageTemplate;
use App\Models\Service;
use App\Services\BillingCycleService;
use App\Services\PaymentLinkService;
use Carbon\Carbon;
use Illuminate\Console\Command;

class SendPaymentReminder extends Command
{
    protected $signature = 'app:send-payment-reminder';

    protected $description = 'Remind unpaid invoices using the full monthly price (credit reduces amount to pay)';

    public function handle()
    {
        $billing = app(BillingCycleService::class);
        $links = app(PaymentLinkService::class);
        $date = Carbon::now()->subDays(7);
        $startDay = $date->copy()->startOfDay();
        $endDay = $date->copy()->endOfDay();
        $invoices = Invoice::where('status->value', 1)
            ->where('last_rdr_check', 0)
            ->whereBetween('due_date', [$startDay, $endDay])
            ->get();

        foreach ($invoices as $invoice) {
            $invoice->last_rdr_check = 1;
            $invoice->save();
            $service = Service::find($invoice->services_id);
            if (!$service || !$service->customer_id) {
                continue;
            }
            $customer = Customer::find($service->customer_id);
            if (!$customer || !$customer->phone_number) {
                continue;
            }
            $check = Service::where('customer_id', $service->customer_id)->count();
            $account = $check > 1
                ? $customer->phone_number.'#'.$invoice->services_id
                : $customer->phone_number;
            $contentVars = [
                'en' => [
                    'due_amount' => $billing->reminderDueAmount($service, $customer, $invoice),
                    'account' => $account,
                    'pay_url' => $links->createForInvoice($invoice, $service),
                ],
            ];
            $message = new PaymentReminderMessage($contentVars, 'payment_reminder');
            $body = $message->renderMessage();
            $template = MessageTemplate::where('message_class', 'payment_reminder')->first();
            send_sms($customer->formatted_phone_no, $body, $customer->id, $contentVars, $template?->id);
        }
    }
}
