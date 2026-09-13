<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\SoftDeletes;

class Router extends Model
{
    use HasFactory, SoftDeletes;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'title', 'nas_type', 'model', 'physical_address', 'host', 'nas_ip', 'radius_secret', 'api', 'api_login', 'api_password', 'api_port', 'monitor_interface', 'customer_interface', 'authorization', 'accounting'
    ];

    protected $casts = [
        'nas_type' => 'array',
        'accounting' => 'array',
        'authorization' => 'array',
    ];
}
