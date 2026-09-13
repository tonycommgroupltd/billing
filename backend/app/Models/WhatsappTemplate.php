<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class WhatsappTemplate extends Model
{
    use HasFactory;

    protected $fillable = [
        'whatsapp_template_id', 'whatsapp_business_account_id', 'name', 'description', 'category', 'language', 'header', 'body', 'footer', 'buttons', 'status'
    ];

    protected $casts = [
        'body' => 'json',
        'buttons' => 'json',
    ];
}
