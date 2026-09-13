<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Spatie\Translatable\HasTranslations;

class MessageDetail extends Model
{
    use HasFactory;
    use SoftDeletes;
    use HasTranslations;

    protected $fillable = ['message_id', 'template_id', 'components', 'message', 'recipient', 'status', 'cost', 'dlr', 'notice', 'last_dlr_check', 'customer_id', 'duration', 'network_report', 'message_hash'];

    protected $casts = [
        'network_report' => 'array',
        'components' => 'json'
    ];

    public $translatable = [
        'components',
    ];

    public function getNoticeAttribute($value)
    {
        if ($value) return json_decode($value);
        return [];
    }
}
