<?php

namespace App\Console\Commands;

use App\Models\MessageDetail;
use App\Models\MessageTemplate;
use App\Models\WhatsappDetail;
use App\Models\WhatsappTemplate;
use App\Services\TwilioService;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Illuminate\Support\Facades\Http;

class SendUndeliveredToWhatsapp extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'app:send-undelivered-to-whatsapp';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Command description';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $twilio = app(TwilioService::class);
        try {
            $templates_id = MessageTemplate::pluck('id');
            $messages = MessageDetail::whereIn('template_id', $templates_id)->where('last_dlr_check', 0)->where(function ($query) {
                $query->whereNull('network_report->description')
                    ->orWhere('network_report->description', '!=', 'DeliveredToTerminal');
            })->where(function ($query) {
                $query->where('status', 'sent')
                    ->orWhere('status', 'failed');
            })->whereNotNull('components')->whereDate('created_at', Carbon::now()->format('Y-m-d'))->get();
            foreach ($messages as $message) {
                if ($message->status === 'failed' || ($message->status === 'sent' && (isset($message->network_report['description']) && $message->network_report['description'] === 'SenderName Blacklisted')) || ($message->status === 'sent' && (isset($message->network_report['description']) && $message->network_report['description'] === 'Failed')) || ($message->status === 'sent' && ($message->created_at < Carbon::now()->subMinutes(5)->toDateTimeString() && $message->network_report == NULL))) {
                    $template = MessageTemplate::find($message->template_id);
                    $components = $message->components;
                    $message->last_dlr_check = 1;
                    $message->save();
                    if ($template && $template->message_class === 'invoice_create') {

                        /*$response = Http::withToken('aKsCEP0YvdH3AIjxYvtzAE56OOH4gLFzbjUS7OXGj2Ycm9wf1RClOCGy8I4NjR8j')
                            ->post('https://whatsapp.tonycommgroupltd.com/api/06f776a0-e844-4cfc-b471-032403174480/contact/send-template-message', [
                                "phone_number" => format_w_phone($message->recipient),
                                "template_name" => "invoice_create",
                                "template_language" => "en",
                                "field_1" => $components['due_date'],
                                "field_2" => $components['due_amount'],
                                "field_3" => $components['account']
                            ]);

                        log_file('whatsapp_Delivery_Report_', $response);*/
                        $twilio->sendWhatsAppTemplateUsingService(
                            format_w_phone($message->recipient), // recipient
                            config('services.twilio.messaging_service_sid'),
                            'HX787d8e2c2b3a867a2090692045fc11ea', // template SID from Twilio Content
                            [$components['due_date'], $components['due_amount'], $components['account']] // variables
                        );
                    } else if ($template && $template->message_class === 'payment_reminder') {

                        /*$response = Http::withToken('aKsCEP0YvdH3AIjxYvtzAE56OOH4gLFzbjUS7OXGj2Ycm9wf1RClOCGy8I4NjR8j')
                            ->post('https://whatsapp.tonycommgroupltd.com/api/06f776a0-e844-4cfc-b471-032403174480/contact/send-template-message', [
                                "phone_number" => format_w_phone($message->recipient),
                                "template_name" => "payment_reminder",
                                "template_language" => "en",
                                "field_1" => $components['due_amount'],
                                "field_2" => $components['account']
                            ]);

                        log_file('whatsapp_Delivery_Report_', $response);*/
                        $twilio->sendWhatsAppTemplateUsingService(
                            format_w_phone($message->recipient), // recipient
                            config('services.twilio.messaging_service_sid'),
                            'HXd9427c6608701397238ed81525bcab03', // template SID from Twilio Content
                            [$components['due_amount'], $components['account']] // variables
                        );
                    } else if ($template && $template->message_class === 'account_creation') {

                        /*$response = Http::withToken('aKsCEP0YvdH3AIjxYvtzAE56OOH4gLFzbjUS7OXGj2Ycm9wf1RClOCGy8I4NjR8j')
                            ->post('https://whatsapp.tonycommgroupltd.com/api/06f776a0-e844-4cfc-b471-032403174480/contact/send-template-message', [
                                "phone_number" => format_w_phone($message->recipient),
                                "template_name" => "account_creation",
                                "template_language" => "en",
                                "field_1" => $components['account']
                            ]);

                        log_file('whatsapp_Delivery_Report_', $response);*/
                        $twilio->sendWhatsAppTemplateUsingService(
                            format_w_phone($message->recipient), // recipient
                            config('services.twilio.messaging_service_sid'),
                            'HXf8b12728ebf0d44ba57f0453b447e7d1', // template SID from Twilio Content
                            [$components['account']] // variables
                        );
                    } else if ($template && $template->message_class === 'reset_password') {

                        /*$response = Http::withToken('aKsCEP0YvdH3AIjxYvtzAE56OOH4gLFzbjUS7OXGj2Ycm9wf1RClOCGy8I4NjR8j')
                            ->post('https://whatsapp.tonycommgroupltd.com/api/06f776a0-e844-4cfc-b471-032403174480/contact/send-template-message', [
                                "phone_number" => format_w_phone($message->recipient),
                                "template_name" => "reset_password",
                                "template_language" => "en",
                                "field_1" => $components['password']
                            ]);

                        log_file('whatsapp_Delivery_Report_', $response);*/
                    } else if ($template && $template->message_class === 'welcome_message') {

                        /*$response = Http::withToken('aKsCEP0YvdH3AIjxYvtzAE56OOH4gLFzbjUS7OXGj2Ycm9wf1RClOCGy8I4NjR8j')
                            ->post('https://whatsapp.tonycommgroupltd.com/api/06f776a0-e844-4cfc-b471-032403174480/contact/send-template-message', [
                                "phone_number" => format_w_phone($message->recipient),
                                "template_name" => "welcome_message",
                                "template_language" => "en",
                                "field_1" => $components['customer_login'],
                                "field_2" => $components['customer_password']
                            ]);

                        log_file('whatsapp_Delivery_Report_', $response);*/
                    } else if ($template && $template->message_class === 'on_payment') {

                        /*$response = Http::withToken('aKsCEP0YvdH3AIjxYvtzAE56OOH4gLFzbjUS7OXGj2Ycm9wf1RClOCGy8I4NjR8j')
                            ->post('https://whatsapp.tonycommgroupltd.com/api/06f776a0-e844-4cfc-b471-032403174480/contact/send-template-message', [
                                "phone_number" => format_w_phone($message->recipient),
                                "template_name" => "on_payment",
                                "template_language" => "en"
                            ]);

                        log_file('whatsapp_Delivery_Report_', $response);*/
                        $twilio->sendWhatsAppTemplateUsingService(
                            format_w_phone($message->recipient), // recipient
                            config('services.twilio.messaging_service_sid'),
                            'HX05703592e49893b4d37c5d4aba170b60', // template SID from Twilio Content
                            [] // variables
                        );
                    } else if ($template && $template->message_class === 'network_upgrade') {

                        /*$response = Http::withToken('aKsCEP0YvdH3AIjxYvtzAE56OOH4gLFzbjUS7OXGj2Ycm9wf1RClOCGy8I4NjR8j')
                            ->post('https://whatsapp.tonycommgroupltd.com/api/06f776a0-e844-4cfc-b471-032403174480/contact/send-template-message', [
                                "phone_number" => format_w_phone($message->recipient),
                                "template_name" => "network_upgrade",
                                "template_language" => "en"
                            ]);

                        log_file('whatsapp_Delivery_Report_', $response);*/
                    } else if ($template && $template->message_class === 'invoice_generate') {

                        $twilio->sendWhatsAppTemplateUsingService(
                            format_w_phone($message->recipient), // recipient
                            config('services.twilio.messaging_service_sid'),
                            'HX9438805a6a213866085c005bd6503d3a', // template SID from Twilio Content
                            [$components['type'], $components['due_date'], $components['due_amount'], $components['account']] // variables
                        );
                    }else if ($template && $template->message_class === 'customer_updates') {

                        $twilio->sendWhatsAppTemplateUsingService(
                            format_w_phone($message->recipient), // recipient
                            config('services.twilio.messaging_service_sid'),
                            'HX141a870b6162618b7459ae6324de0e98', // template SID from Twilio Content
                            [] // variables
                        );
                    } 
                }
            }
        } catch (\Exception $e) {
            $response = $e->getMessage();
            Log::alert($response);
        }
    }
}
