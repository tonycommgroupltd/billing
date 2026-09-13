<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MegapayTransaction extends Model
{
    protected $table = 'megapay_transactions';

    protected $fillable = [
        'phone',
        'amount',
        'fee_type',
        'reference',
        'ticket_id',
        'ticket_number',
        'ticket_subject',
        'ticket_created_by',
        'party_b',
        'checkout_request_id',
        'merchant_request_id',
        'status',
        'payment_method',
        'receipt',
        'result_code',
        'result_desc',
        'raw_callback',
        'created_by',
    ];

    protected $casts = [
        'amount' => 'integer',
    ];
}
