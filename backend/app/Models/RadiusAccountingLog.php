<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class RadiusAccountingLog extends Model
{
    use HasFactory;
    protected $fillable = [
        'username',
        'session_id',
        'status_type',
        'nas_ip',
        'framed_ip',
        'payload',
        'error_message',
    ];

    protected $casts = [
        'payload' => 'array',
    ];
}
