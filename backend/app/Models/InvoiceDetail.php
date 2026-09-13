<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Model;

class InvoiceDetail extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $fillable = ['invoice_id', 'service_type', 'name', 'description', 'price_per_unit', 'quantity', 'discount', 'discount_type', 'units'];

    protected $casts = [
        'discount_type' => 'array',
    ];
}
