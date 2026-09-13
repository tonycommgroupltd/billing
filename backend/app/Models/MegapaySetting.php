<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MegapaySetting extends Model
{
    protected $table = 'megapay_settings';

    protected $fillable = [
        'key_name',
        'key_value',
    ];
}
