<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Models\Payment;
use Illuminate\Database\Eloquent\SoftDeletes;

class Invoice extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $fillable = ['services_id', 'invoice_date', 'due_date', 'total', 'status', 'last_rdr_check', 'disconnection_sms_sent', 'invoice_sms_sent'];

    protected $casts = [
        'status' => 'array',
    ];

    protected $appends = ['due', 'payment_date', 'credit_available', 'due_after_credit'];

    public function getDueAttribute()
    {
        if ((int) ($this->status['value'] ?? 0) === 2) {
            return 0;
        }

        $payment_sum = Payment::where('invoice_id', $this->id)->sum('sum');

        return round(max(0, (float) $this->total - (float) $payment_sum), 2);
    }

    /** Wallet credit that could be applied when paying this invoice. */
    public function getCreditAvailableAttribute()
    {
        $service = Service::find($this->services_id);
        if (!$service) {
            return 0.0;
        }
        $customer = Customer::find($service->customer_id);

        return $customer ? max(0, round((float) $customer->credit, 2)) : 0.0;
    }

    /** Amount still needed after applying account credit. */
    public function getDueAfterCreditAttribute()
    {
        if ((int) ($this->status['value'] ?? 0) === 2) {
            return 0.0;
        }

        return round(max(0, (float) $this->due - (float) $this->credit_available), 2);
    }

    public function getPaymentDateAttribute()
    {
        $payment_sum = Payment::where('invoice_id', $this->id)->sum('sum');
        if ($payment_sum >= $this->total) {
            $payment = Payment::where('invoice_id', $this->id)->latest('date')->first();

            if ($payment) return $payment->date;
        }
        return '';
    }
}
