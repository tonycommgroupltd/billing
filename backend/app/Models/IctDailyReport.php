<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class IctDailyReport extends Model
{
    protected $fillable = [
        'report_date',
        'overall_status',
        'summary_status',
        'summary_notes',
        'radius_status',
        'radius_notes',
        'radius_checked_at',
        'radius_checked_by',
        'sms_status',
        'sms_notes',
        'sms_checked_at',
        'sms_checked_by',
        'system_status',
        'system_notes',
        'system_checked_at',
        'system_checked_by',
        'issues_followups',
        'created_by',
        'updated_by',
        'submitted_by',
        'submitted_at',
    ];

    protected $casts = [
        'report_date' => 'date',
        'radius_checked_at' => 'datetime',
        'sms_checked_at' => 'datetime',
        'system_checked_at' => 'datetime',
        'submitted_at' => 'datetime',
    ];

    public function routerChecks(): HasMany
    {
        return $this->hasMany(IctDailyReportRouter::class, 'report_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public function submitter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }
}
