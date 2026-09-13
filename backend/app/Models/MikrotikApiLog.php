<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MikrotikApiLog extends Model
{
    use HasFactory;

    protected $fillable = ['router_id', 'customer_id', 'service_id', 'action', 'error', 'attempted_at', 'next_retry_at', 'retry_count', 'status'];

    public function router()
    {
        return $this->belongsTo(Router::class);
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function service()
    {
        return $this->belongsTo(Service::class);
    }
}
