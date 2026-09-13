<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BillingPeriodLog extends Model
{
    use HasFactory;

    // Table name (optional if follows Laravel convention)
    protected $table = 'billing_period_logs';

    // Mass assignable fields
    protected $fillable = [
        'service_id',
        'old_period',
        'new_period',
        'user_id',
        'remarks',
    ];

    /**
     * The service this log belongs to
     */
    public function service()
    {
        return $this->belongsTo(Service::class);
    }

    /**
     * The user who made the change
     */
    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
