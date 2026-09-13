<?php

namespace App\Console\Commands;

use App\Messages\DisconnectionReminderMessage;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\MessageTemplate;
use App\Models\Service;
use Carbon\Carbon;
use Illuminate\Console\Command;

class SendDisconnectionSms extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'app:send-disconnection-sms';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Send SMS notifications reminder for disconnection of services';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $invoices = Invoice::where('status->value', 1)->where('disconnection_sms_sent', false)->whereDate('invoice_date', '!=', Carbon::today())->whereDate('due_date', Carbon::today())->get();
        foreach ($invoices as $invoice) {
            $invoice->disconnection_sms_sent = true;
            $invoice->save();
            $service = Service::find($invoice->services_id);
            if ($invoice->due > 0 && $service && $service->customer_id) {
                $customer = Customer::find($service->customer_id);
                $check = Service::where('customer_id', $service->customer_id)->count();
                if ($customer && $customer->phone_number) {
                    if ($check > 1) {
                        $account = $customer->phone_number . '#' . $invoice->services_id;
                    } else {
                        $account = $customer->phone_number;
                    }
                    $contentVars = [
                        'en' => [ //Optional wrap with locale
                            'due_amount' => $invoice->due,
                            'account' => $account
                        ],
                    ];
                    $message = new DisconnectionReminderMessage($contentVars, 'disconnection_reminder');
                    $body = $message->renderMessage();
                    $template = MessageTemplate::where('message_class', 'disconnection_reminder')->first();

                    send_sms($customer->formatted_phone_no, $body, $customer->id, $contentVars, $template->id);
                }
            }
        }
    }
}
