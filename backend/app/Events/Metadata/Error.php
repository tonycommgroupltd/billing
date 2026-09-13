<?php

namespace App\Events\Metadata;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class Error
{
    public function __construct(
        public int $code,
        public string $title,
        public ?string $message = null,
        public ?string $details = null,
        public array $data = [],
    ) {
        //
    }
}
