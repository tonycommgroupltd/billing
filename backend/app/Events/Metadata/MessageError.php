<?php

namespace App\Events\Metadata;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;
use App\Utils;

class MessageError
{
    public function __construct(
        public string $title,
        public string $code,
        public ?string $message,
        public ?array $data,
    ) {
        // 
    }

    /**
     * @return static[]
     */
    public static function fromPayload(array $payload): array
    {
        return collect($payload['errors'] ?? [])->map(fn () => new static(
            Utils::extract($payload, 'title'),
            Utils::extract($payload, 'code'),
            $payload['message'] ?? null,
            $payload['error_data'] ?? null,
        ))->all();
    }
}
