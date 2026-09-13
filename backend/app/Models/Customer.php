<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use App\Models\User;
//use Illuminate\Database\Eloquent\SoftDeletes;
use Geow\Balance\Traits\HasBalance;
use Illuminate\Support\Facades\DB;
use Tymon\JWTAuth\Contracts\JWTSubject;
use Illuminate\Foundation\Auth\User as Authenticatable;

class Customer extends Authenticatable implements JWTSubject
{
    //use HasFactory, SoftDeletes, HasBalance;
    use HasFactory, HasBalance;

    protected $fillable = ['user_id', 'name', 'billing_type', 'category', 'phone_number', 'dob', 'address', 'city', 'synced_at', 'send_via'];

    protected $casts = [
        'billing_type' => 'json',
        'category' => 'json',
    ];

    protected $appends = ['email', 'services', 'formatted_phone_no', 'balance', 'balances'];

    public function services()
    {
        return $this->hasMany(Service::class);
    }

    public function getEmailAttribute()
    {
        $user = User::find($this->user_id);
        if ($user) return $user->email;
        return '';
    }

    public function getServicesAttribute()
    {
        if ($this->relationLoaded('services')) {
            return $this->getRelation('services');
        }

        $services = Service::where('customer_id', $this->id)->get();
        if ($services) return $services;
        return [];
    }

    /**
     * Get the formatted phone number for the user usable with
     * the sms api
     *
     * @return string
     */
    public function getFormattedPhoneNoAttribute()
    {
        return static::formatPhoneNumber($this->phone_number);
    }

    public function getBalanceAttribute()
    {
        return $this->credit;
    }

    public function getBalancesAttribute()
    {
        $balances = DB::table('balances')->where('balanceable_id', $this->id)->orderBy('created_at', 'DESC')->take(20)->get();
        return $balances;
    }

    /**
     * Static format of the formattedPhoneNumber method
     *
     * @param string $phoneNumber the phone number
     *
     * @return string
     */
    public static function formatPhoneNumber($phoneNumber)
    {

        $phoneNumber = str_replace(' ', '', $phoneNumber);
        $phoneNumber = str_replace('-', '', $phoneNumber);
        //if (Str::contains($phoneNumber, '+254')) {
        $phoneNumber = substr($phoneNumber, -9);
        /*}
        if (Str::startsWith($phoneNumber, '0')) {
            $phoneNumber = substr($phoneNumber, 1);
        }*/

        return '254' . $phoneNumber;
    }

    public function getJWTIdentifier()
    {
        return $this->getKey();
    }

    public function getJWTCustomClaims()
    {
        return [];
    }

    public function scopeActive($query)
    {
        return $query->whereNull('customers.deleted_at');
    }
}
