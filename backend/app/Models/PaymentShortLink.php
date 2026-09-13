<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PaymentShortLink extends Model
{
    protected $fillable = [
        'code',
        'invoice_id',
        'service_id',
        'expires_at',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
    ];
}
