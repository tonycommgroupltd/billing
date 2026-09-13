<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Payment extends Model
{
    use HasFactory;

    protected $fillable = ['customer_id', 'trans_id', 'payment_type', 'date', 'sum', 'invoice_id'];

    protected $appends = ['payment_type_label'];

    public function getPaymentTypeLabelAttribute()
    {
        return ucfirst($this->payment_type);
    }
}
