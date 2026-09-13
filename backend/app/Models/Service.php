<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;

class Service extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'mikrotik_id',
        'customer_id',
        'router_id',
        'plan_id',
        'price',
        'start_date',
        'end_date',
        'billing_type',
        'billing_period',
        'bill_to',
        'mikrotik_name',
        'mikrotik_password',
        'status',
        'synced_at',
        'onu_sn',
        'olt_board',
        'olt_port',
        'onu_authorized_at',
        'onu_authorized_by'
    ];

    protected $casts = [
        'status' => 'array',
        'billing_type' => 'json',
        'billing_period' => 'json',
    ];

    protected $appends = ['plan_title', 'formatted_price', 'online', 'mikrotik_ipv4', 'due_date'];

    public function setMikrotikIdAttribute($value)
    {
        if (empty($value)) { // will check for empty string, null values, see php.net about it
            $this->attributes['mikrotik_id'] = NULL;
        } else {
            $this->attributes['mikrotik_id'] = $value;
        }
    }

    public function setStartDateAttribute($value)
    {
        $this->attributes['start_date'] =  Carbon::parse($value);
    }

    public function setEndDateAttribute($value)
    {
        if (empty($value)) { // will check for empty string, null values, see php.net about it
            $this->attributes['end_date'] = NULL;
        } else {
            $this->attributes['end_date'] =  Carbon::parse($value);
        }
    }

    public function setBillToAttribute($value)
    {
        if (empty($value)) { // will check for empty string, null values, see php.net about it
            $this->attributes['bill_to'] = NULL;
        } else {
            $this->attributes['bill_to'] =  Carbon::parse($value);
        }
    }

    /**
     * Due date column = cut date (service expiry). Always bill_to, not the unpaid invoice.
     */
    public function getDueDateAttribute($value)
    {
        return $this->attributes['bill_to'] ?? $value;
    }

    public function getPlanTitleAttribute()
    {
        $plan = Plan::find($this->plan_id);
        if (isset($plan['title'])) return $plan['title'];
        return '';
    }

    public function getFormattedPriceAttribute()
    {
        return $this->attributes['price'];
    }

    /*public function getOnlineAttribute()
    {
        $ago = Carbon::now()->subMinutes(7);

        // Subquery: latest active session per username
        $sub = Radacct::join('services', 'services.mikrotik_name', '=', 'radacct.username')
            ->where('services.status->value', 2)
            ->where('radacct.acctupdatetime', '>=', $ago)
            ->where('radacct.username', $this->mikrotik_name)
            ->selectRaw('MAX(radacct.radacctid) as radacctid')
            ->groupBy('radacct.username');

        $online = Radacct::query()
            ->whereIn('radacct.radacctid', $sub)
            ->whereNull('radacct.acctstoptime') // still online
            ->first();
        //$online = PppoeSession::whereNull('end_time')->where('username', $this->mikrotik_name)->first();
        if ($online) {
            return 1;
        }
        return 0;
    }*/

    public function getOnlineAttribute()
    {
        if (array_key_exists('online', $this->attributes)) {
            return (int) $this->attributes['online'];
        }

        if ((int) ($this->status['value'] ?? 0) !== 2 || empty($this->mikrotik_name)) {
            return 0;
        }

        return Radacct::where('username', $this->mikrotik_name)
            ->whereNull('acctstoptime')
            ->recentlyUpdated('acctupdatetime')
            ->exists() ? 1 : 0;
    }

    /*public function getMikrotikIpv4Attribute()
    {
        $online = PppoeSession::whereNull('end_time')->where('username', $this->mikrotik_name)->first();
        if ($online) {
            return $online->ip_address;
        }
        return NULL;
    }*/

    public function getMikrotikIpv4Attribute()
    {
        if (array_key_exists('mikrotik_ipv4', $this->attributes)) {
            return $this->attributes['mikrotik_ipv4'];
        }

        if (empty($this->mikrotik_name)) {
            return null;
        }

        return Radacct::where('username', $this->mikrotik_name)
            ->whereNull('acctstoptime')
            ->recentlyUpdated('acctupdatetime')
            ->latest('radacctid')
            ->value('framedipaddress');
    }

    public function invoices()
    {
        return $this->hasMany(Invoice::class, 'services_id');
    }
}
