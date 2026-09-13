<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class IctDailyReportRouter extends Model
{
    protected $fillable = [
        'report_id',
        'router_id',
        'router_title',
        'status',
        'notes',
        'checked_at',
        'checked_by',
    ];

    protected $casts = [
        'checked_at' => 'datetime',
    ];

    public function report(): BelongsTo
    {
        return $this->belongsTo(IctDailyReport::class, 'report_id');
    }

    public function router(): BelongsTo
    {
        return $this->belongsTo(Router::class, 'router_id');
    }

    public function checker(): BelongsTo
    {
        return $this->belongsTo(User::class, 'checked_by');
    }
}
