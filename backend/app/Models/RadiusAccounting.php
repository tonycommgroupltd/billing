<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class RadiusAccounting extends Model
{
    use HasFactory;
    protected $table = 'radius_accounting';
    protected $fillable = [
        'username',
        'session_id',
        'nas_ip',
        'framed_ip',
        'acct_status_type',
        'input_octets',
        'output_octets',
        'session_time',
        'start_time',
        'stop_time',
        'terminate_cause'
    ];
}
