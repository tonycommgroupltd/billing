<?php

namespace App\Events\Metadata;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Carbon;

class Status
{
    /**
     * @param  Error[] $errors
     */
    public function __construct(
        public string $wamId,
        public string $status,
        public Carbon $timestamp,
        public string $recipientId,
        public ?string $conversationId = null,
        public ?string $conversationType = null,
        public ?Carbon $conversationExpiration = null,
        public ?bool $billable = null,
        public ?string $pricingModel = null,
        public ?string $pricingCategory = null,
        public array $errors = [],
    ) {
        // 
    }
}
