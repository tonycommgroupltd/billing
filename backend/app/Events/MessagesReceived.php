<?php

namespace App\Events;

use App\Events\Metadata\Contact;
use App\Events\Metadata\Error;
use App\Events\Metadata\Message;
use App\Events\Metadata\MessageContext;
use App\Events\Metadata\MessageError;
use App\Events\Metadata\Status;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use App\Utils;

class MessagesReceived extends WebhookEntry
{
    public string $phoneNumberId;
    public string $displayPhoneNumber;

    /**
     * @var Collection<Contact>
     */
    public Collection $contacts;

    /**
     * @var Collection<Message>
     */
    public Collection $messages;

    /**
     * @var Collection<Status>
     */
    public Collection $statuses;

    protected function afterBuild()
    {
        $this->phoneNumberId = Utils::extract($this->data, 'metadata.phone_number_id');
        $this->displayPhoneNumber = Utils::extract($this->data, 'metadata.display_phone_number');
        // TODO: extract errors object and statuses object if they are present

        $this->buildContacts();
        $this->buildMessages();
        $this->buildStatuses();
    }

    protected function buildStatuses()
    {
        $this->statuses = collect(Utils::extract($this->data, 'statuses', false))->map(fn ($status) => new Status(
            Utils::extract($status, 'id'),
            Utils::extract($status, 'status'),
            Carbon::createFromTimestamp(Utils::extract($status, 'timestamp')),
            Utils::extract($status, 'recipient_id'),
            Utils::extract($status, 'conversation.id', false),
            Utils::extract($status, 'conversation.origin.type', false),
            ($expiration = Utils::extract($status, 'conversation.expiration_timestamp', false)) !== null ?
                Carbon::createFromTimestamp($expiration) : null,
            Utils::extract($status, 'pricing.billable', false),
            Utils::extract($status, 'pricing.pricing_model', false),
            Utils::extract($status, 'pricing.category', false),
            collect(Utils::extract($status, 'errors', false))->map(fn ($error) => new Error(
                Utils::extract($error, 'code'),
                Utils::extract($error, 'title'),
                Utils::extract($error, 'message', false) ?: null,
                Utils::extract($error, 'error_data.details', false) ?: null,
                $error,
            ))->all(),
        ));
    }

    protected function buildContacts()
    {
        $this->contacts = collect(Utils::extract($this->data, 'contacts', false))->map(fn ($contact) => new Contact(
            Utils::extract($contact, 'wa_id'),
            Utils::extract($contact, 'profile.name')
        ));
    }

    protected function buildMessages()
    {
        $this->messages = collect(Utils::extract($this->data, 'messages', false))->map(fn ($message) => new Message(
            Utils::extract($message, 'id'),
            Utils::extract($message, 'from'),
            Carbon::createFromTimestamp(Utils::extract($message, 'timestamp')),
            $type = Utils::extract($message, 'type'),
            MessageContext::fromPayload($message),
            Utils::extract($message, $type),
            MessageError::fromPayload($message),
        ));
    }
}
