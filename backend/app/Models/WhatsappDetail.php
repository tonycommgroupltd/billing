<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;

class WhatsappDetail extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $fillable = ['customer_id', 'data', 'contacts', 'messages', 'message_description', 'statuses', 'status'];

    protected $casts = [
        'components' => 'json',
        'data' => 'json',
        'contacts' => 'json',
        'messages' => 'json',
        'statuses' => 'json',
    ];

    protected $appends = ['from', 'message_id', 'delivered_on', 'sent_at', 'read_at', 'reply_id'];

    public function getStatusAttribute($value)
    {
        $messages = json_decode($this->attributes['messages'], true);
        if (isset($messages[0]['wamId'])) {
            $data = WhatsappDetail::whereJsonContains('statuses', ['wamId' => $messages[0]['wamId']])->latest('id')->pluck('statuses')->first();
            if ($data) return $data[0]['status'];
        } else if (isset($messages[0]['id'])) {
            $data = WhatsappDetail::whereJsonContains('statuses', ['wamId' => $messages[0]['id']])->latest('id')->pluck('statuses')->first();
            if ($data) return $data[0]['status'];
        }

        return $value;
    }

    public function getMessageDescriptionAttribute($value)
    {
        $messages = json_decode($this->attributes['messages'], true);
        if (isset($messages[0]['data']['body'])) {
            return ["body" => $messages[0]['data']['body']];
        } else if (isset($messages[0]['data']['emoji'])) {
            $path = storage_path('json') . "/emoji.json";
            if (File::exists($path)) {
                $emojis = json_decode(File::get($path), true);
                $key = $messages[0]['data']['emoji'];
                if (array_key_exists($key, $emojis)) {
                    $emoji_name = $emojis[$key];
                    return ["emoji" => $emoji_name];
                }
                return $messages[0]['data']['emoji'];
            }
        } else if (isset($messages[0]['type']) && $messages[0]['type'] === 'image') {
            $data = [];
            if (isset($messages[0]['data']['caption'])) {
                $data['caption'] = $messages[0]['data']['caption'];
            }
            if (isset($messages[0]['data']['id'])) {
                $accessToken = config('whatsapp.access_token');
                $response = Http::withHeaders([
                    'Authorization' => 'Bearer ' . $accessToken,
                ])->get(config('whatsapp.api_uri') . '/' . $messages[0]['data']['id']);
                $media = $response->json();

                $img = Http::withHeaders([
                    'Authorization' => 'Bearer ' . $accessToken,
                    'Content-Type' => $media['mime_type'],
                ])->get($media['url']);
                $data['image'] = 'data:' . $media['mime_type'] . ';base64,' . base64_encode($img->body());
            }
            return $data;
        } else if (isset($messages[0]['type']) && $messages[0]['type'] === 'video') {
            $data = [];
            if (isset($messages[0]['data']['caption'])) {
                $data['caption'] = $messages[0]['data']['caption'];
            }
            if (isset($messages[0]['data']['id'])) {
                $accessToken = config('whatsapp.access_token');
                $response = Http::withHeaders([
                    'Authorization' => 'Bearer ' . $accessToken,
                ])->get(config('whatsapp.api_uri') . '/' . $messages[0]['data']['id']);
                $media = $response->json();

                $img = Http::withHeaders([
                    'Authorization' => 'Bearer ' . $accessToken,
                    'Content-Type' => $media['mime_type'],
                ])->get($media['url']);
                $data['video'] = 'data:' . $media['mime_type'] . ';base64,' . base64_encode($img->body());
            }
            return $data;
        }
        return $value;
    }

    public function getReplyIdAttribute()
    {
        $messages = json_decode($this->attributes['messages'], true);
        if (isset($messages[0]['data']['message_id'])) {
            $whatsapp = WhatsappDetail::whereJsonContains('messages', ['id' => $messages[0]['data']['message_id']])->whereNull('data->metadata->phone_number_id')->where(function ($query) {
                $query->where('statuses', DB::raw("json_array()"))
                    ->orWhere('statuses', NULL);
            })->first();
            if ($whatsapp) return $whatsapp->id;
        }
        return NULL;
    }

    public function getFromAttribute()
    {
        $messages = json_decode($this->attributes['messages'], true);
        if (isset($messages[0]['from'])) {
            return $messages[0]['from'];
        }
        return NULL;
    }

    public function getMessageIdAttribute()
    {
        $messages = json_decode($this->attributes['messages'], true);
        if (isset($messages[0]['wamId'])) {
            return $messages[0]['wamId'];
        } else if (isset($messages[0]['id'])) {
            return $messages[0]['id'];
        }

        return NULL;
    }

    public function getDeliveredOnAttribute()
    {
        $messages = json_decode($this->attributes['messages'], true);
        if (isset($messages[0]['wamId'])) {
            $data = WhatsappDetail::whereJsonContains('statuses', ['wamId' => $messages[0]['wamId']])->whereJsonContains('statuses', ['status' => 'delivered'])->latest()->pluck('statuses')->first();
            if ($data) return Carbon::parse($data[0]['timestamp']);
        } else if (isset($messages[0]['id'])) {
            $data = WhatsappDetail::whereJsonContains('statuses', ['wamId' => $messages[0]['id']])->whereJsonContains('statuses', ['status' => 'delivered'])->latest()->pluck('statuses')->first();
            if ($data) return Carbon::parse($data[0]['timestamp']);
        }

        return NULL;
    }

    public function getSentAtAttribute()
    {
        $messages = json_decode($this->attributes['messages'], true);
        if (isset($messages[0]['wamId'])) {
            $data = WhatsappDetail::whereJsonContains('statuses', ['wamId' => $messages[0]['wamId']])->whereJsonContains('statuses', ['status' => 'sent'])->latest()->pluck('statuses')->first();
            if ($data) return Carbon::parse($data[0]['timestamp']);
        } else if (isset($messages[0]['id'])) {
            $data = WhatsappDetail::whereJsonContains('statuses', ['wamId' => $messages[0]['id']])->whereJsonContains('statuses', ['status' => 'sent'])->latest()->pluck('statuses')->first();
            if ($data) return Carbon::parse($data[0]['timestamp']);
        }

        return NULL;
    }

    public function getReadAtAttribute()
    {
        $messages = json_decode($this->attributes['messages'], true);
        if (isset($messages[0]['wamId'])) {
            $data = WhatsappDetail::whereJsonContains('statuses', ['wamId' => $messages[0]['wamId']])->whereJsonContains('statuses', ['status' => 'read'])->latest()->pluck('statuses')->first();
            if ($data) return Carbon::parse($data[0]['timestamp']);
        } else if (isset($messages[0]['id'])) {
            $data = WhatsappDetail::whereJsonContains('statuses', ['wamId' => $messages[0]['id']])->whereJsonContains('statuses', ['status' => 'read'])->latest()->pluck('statuses')->first();
            if ($data) return Carbon::parse($data[0]['timestamp']);
        }

        return NULL;
    }

    /*public function getDeletedAtAttribute()
    {
        $messages = json_decode($this->attributes['messages'], true);
        if (isset($messages[0]['wamId'])) {
            $data = WhatsappDetail::whereJsonContains('statuses', ['wamId' => $messages[0]['wamId']])->whereJsonContains('statuses', ['status' => 'deleted'])->latest()->pluck('statuses')->first();
            if ($data) return Carbon::parse($data[0]['timestamp']);
        } else if (isset($messages[0]['id'])) {
            $data = WhatsappDetail::whereJsonContains('statuses', ['wamId' => $messages[0]['id']])->whereJsonContains('statuses', ['status' => 'deleted'])->latest()->pluck('statuses')->first();
            if ($data) return Carbon::parse($data[0]['timestamp']);
        }

        return NULL;
    }*/
}
