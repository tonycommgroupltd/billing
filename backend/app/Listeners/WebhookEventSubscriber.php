<?php

namespace App\Listeners;

use App\Events\MessagesReceived;
use App\Events\SubscriptionIntentReceived;
use App\Events\SuccessfullySubscribed;
use App\Events\UnprocessableWebhookPayload;
use App\Events\WebhookEntry;
use App\Events\WebhookReceived;
use App\Models\WhatsappDetail;
use Illuminate\Events\Dispatcher;

class WebhookEventSubscriber
{
    /**
     * Handle subscription intent
     */
    public function handleSubscriptionIntentReceived(SubscriptionIntentReceived $event): void
    {
        //$payload = $event->payload;
        log_file('subscription_Intent_Report_', $event);
    }

    /**
     * Handle subscription request successful
     */
    public function handleSuccessfullySubscribed(SuccessfullySubscribed $event): void
    {
        //$payload = $event->payload;
        log_file('subscription_Success_Report_', $event);
    }

    /**
     * Handle webhook received
     */
    public function handleWebhookReceived(WebhookReceived $event): void
    {
        //$payload = $event->payload;
        log_file('webhook_Received_Report_', $event);
    }

    /**
     * Handle webhook payload invalid
     */
    public function handleUnprocessableWebhookPayload(UnprocessableWebhookPayload $event): void
    {
        //$payload = $event->payload;
        log_file('webhook_InvalidPayload_Report_', $event);
    }

    /**
     * Handle webhook entry
     */
    public function handleWebhookEntry(WebhookEntry $event): void
    {
        //$payload = $event->payload;
        log_file('webhook_Entry_Report_', $event);
    }

    /**
     * Handle message entry
     */
    public function handleMessagesReceived(MessagesReceived $event): void
    {
        log_file('messages_Received_Report_', $event);
        $payload = $event;
        $whatsapp = new WhatsappDetail();
        $whatsapp->data = $payload->data;
        $array = json_decode($payload->contacts, true);
        if (isset($array[0]['id'])) {
            $customer = c2b_user($array[0]['id']);
            if ($customer) $whatsapp->customer_id = $customer->id;
        }
        $whatsapp->contacts = $payload->contacts;
        $whatsapp->messages = $payload->messages;
        $whatsapp->statuses = $payload->statuses;
        $whatsapp->status = 'sent';
        $whatsapp->account_id = $payload->accountId;
        $whatsapp->save();
    }

    /**
     * Register the listeners for the subscriber.
     */
    public function subscribe(Dispatcher $events): void
    {
        $events->listen(
            SubscriptionIntentReceived::class,
            [WebhookEventSubscriber::class, 'handleSubscriptionIntentReceived']
        );

        $events->listen(
            SuccessfullySubscribed::class,
            [WebhookEventSubscriber::class, 'handleSuccessfullySubscribed']
        );

        $events->listen(
            WebhookReceived::class,
            [WebhookEventSubscriber::class, 'handleWebhookReceived']
        );

        $events->listen(
            UnprocessableWebhookPayload::class,
            [WebhookEventSubscriber::class, 'handleUnprocessableWebhookPayload']
        );

        $events->listen(
            WebhookEntry::class,
            [WebhookEventSubscriber::class, 'handleWebhookEntry']
        );

        $events->listen(
            MessagesReceived::class,
            [WebhookEventSubscriber::class, 'handleMessagesReceived']
        );
    }
}
