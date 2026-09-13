<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RouterBandwidthSample extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'router_id',
        'interface',
        'customer_interface',
        'rx_bps',
        'tx_bps',
        'customer_rx_bps',
        'customer_tx_bps',
        'sampled_at',
    ];

    protected $casts = [
        'rx_bps' => 'integer',
        'tx_bps' => 'integer',
        'customer_rx_bps' => 'integer',
        'customer_tx_bps' => 'integer',
        'sampled_at' => 'datetime',
    ];

    public function router(): BelongsTo
    {
        return $this->belongsTo(Router::class);
    }
}
