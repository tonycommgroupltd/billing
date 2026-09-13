<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class WebhookEntry
{
    use Dispatchable, SerializesModels;

    /**
     * Create a new event instance.
     */
    public function __construct(
        public string $accountId,
        public string $type,
        public array $data = [],
    ) {
        $this->afterBuild();
    }

    public static function build(string $accountId, string $type, array $data): static
    {
        return match ($type) {
            'messages' => new MessagesReceived($accountId, $type, $data),
            default => new self($accountId, $type, $data),
        };
    }

    protected function afterBuild()
    {
        // 
    }
}
