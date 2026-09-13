<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Campaign extends Model
{
    use HasFactory;

    protected $fillable = [
        'customer_id',
        'sent',
        'paid',
    ];

    protected $casts = [
        'sent' => 'boolean',
        'paid' => 'boolean',
    ];

    // Relationship
    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }
}
