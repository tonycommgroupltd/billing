<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PppoeBandwidthSample extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'service_id',
        'router_id',
        'username',
        'interface',
        'download_bps',
        'upload_bps',
        'sampled_at',
    ];

    protected $casts = [
        'download_bps' => 'integer',
        'upload_bps' => 'integer',
        'sampled_at' => 'datetime',
    ];

    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class);
    }

    public function router(): BelongsTo
    {
        return $this->belongsTo(Router::class);
    }
}
