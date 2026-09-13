<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Plan extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = ['router_id', 'title', 'price', 'weekly_price', 'bi_weekly_price', 'rate_limit'];

    protected $casts = [
        'rate_limit' => 'array',
    ];

    protected $appends = ['router_name'];

    public function getRouterNameAttribute()
    {
        $router = Router::find($this->router_id);
        if(isset($router['title'])) return $router['title'];
        return '';
    }
}
