<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Radacct extends Model
{
    use HasFactory;

    // Table name
    protected $table = 'radacct';

    // Primary key
    protected $primaryKey = 'radacctid';

    // Disable Laravel timestamps (FreeRADIUS manages them)
    public $timestamps = false;

    // Optional: define which columns are mass assignable
    protected $fillable = [
        'acctsessionid',
        'acctuniqueid',
        'username',
        'nasipaddress',
        'nasportid',
        'acctstarttime',
        'acctstoptime',
        'acctsessiontime',
        'acctinputoctets',
        'acctoutputoctets',
        'acctterminatecause',
        'framedipaddress',
    ];

    // Optional: cast datetime columns
    protected $casts = [
        'acctstarttime' => 'datetime',
        'acctstoptime' => 'datetime',
    ];

    /**
     * Interim updates are stored in MySQL local time; compare with NOW() not Laravel UTC.
     */
    public function scopeRecentlyUpdated($query, string $column = 'radacct.acctupdatetime', int $minutes = 7)
    {
        return $query->whereRaw("{$column} >= DATE_SUB(NOW(), INTERVAL ? MINUTE)", [$minutes]);
    }

    public function scopeLatestOnline($query, $usernames = null)
    {
        // Filter radacct to the recent open-session window first (uses online index),
        // then join services — avoids a multi-million-row temporary table.
        $sub = Radacct::query()
            ->recentlyUpdated('radacct.acctupdatetime')
            ->whereNull('radacct.acctstoptime')
            ->when($usernames, fn ($q) => $q->whereIn('radacct.username', $usernames))
            ->selectRaw('MAX(radacct.radacctid) as radacctid')
            ->groupBy('radacct.username');

        return $query->whereIn('radacct.radacctid', $sub)
            ->whereNull('radacct.acctstoptime')
            ->join('services', 'services.mikrotik_name', '=', 'radacct.username')
            ->where('services.status->value', 2);
    }
}
