<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Ipv4Network extends Model
{
    protected $fillable = [
        'router_id',
        'title',
        'cidr',
        'gateway',
        'purpose',
        'location',
        'pool_name',
        'type',
        'api_host',
        'reserved_ips',
        'ip_assignments',
        'scan_mode',
        'enabled',
        'notes',
    ];

    protected $casts = [
        'reserved_ips' => 'array',
        'ip_assignments' => 'array',
        'enabled' => 'boolean',
    ];

    public function router(): BelongsTo
    {
        return $this->belongsTo(Router::class);
    }
}
