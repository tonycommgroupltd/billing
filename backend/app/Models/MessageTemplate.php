<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Spatie\Translatable\HasTranslations;

class MessageTemplate extends Model
{
    use SoftDeletes;
    use HasTranslations;

    public $translatable = [
        'message',
    ];

    protected $fillable = [
        'message_class',
        'name',
        'message',
        'design',
        'render_engine'
    ];
}
