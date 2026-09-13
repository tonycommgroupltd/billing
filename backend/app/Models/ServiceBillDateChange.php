<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ServiceBillDateChange extends Model
{
    protected $table = 'service_bill_date_changes';

    protected $fillable = [
        'service_id',
        'old_bill_date',
        'new_bill_date',
        'user_id',
        'remarks',
    ];

    // Automatically cast dates to Carbon
    protected $casts = [
        'old_bill_date' => 'date',
        'new_bill_date' => 'date',
    ];

    /**
     * The service whose bill date was changed
     */
    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class);
    }

    /**
     * The user who changed the bill date
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function billDateChanges()
    {
        return $this->hasMany(ServiceBillDateChange::class);
    }
}
