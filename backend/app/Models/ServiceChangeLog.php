<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ServiceChangeLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'service_id',
        'changed_by',
        'field',
        'old_value',
        'new_value',
        'notes',
    ];

    public function service()
    {
        return $this->belongsTo(Service::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'changed_by');
    }
}
