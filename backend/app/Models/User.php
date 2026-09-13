<?php

namespace App\Models;

use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Tymon\JWTAuth\Contracts\JWTSubject;
use Spatie\Permission\Traits\HasRoles;
use Illuminate\Database\Eloquent\SoftDeletes;

class User extends Authenticatable implements JWTSubject
{
    use HasFactory, Notifiable, HasRoles, SoftDeletes;

    protected $guard_name = 'api';

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'name',
        'email',
        'phone',
        'password',
        'reset_token'
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var array<int, string>
     */
    protected $hidden = [
        'password',
        'remember_token',
        'roles'
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'email_verified_at' => 'datetime',
        'phone_verified_at' => 'datetime',
        'password_change_at' => 'datetime',
    ];

    // This will add `role_name` to your `User`, when converted to JSON/Array/etc
    protected $appends = ['role_name', 'role_display_name', 'all_roles', 'has_verified', 'reset_password'];

    /**
     * Get the identifier that will be stored in the subject claim of the JWT.
     *
     * @return mixed
     */
    public function getJWTIdentifier()
    {
        return $this->getKey();
    }
    /**
     * Return a key value array, containing any custom claims to be added to the JWT.
     *
     * @return array
     */
    public function getJWTCustomClaims()
    {
        return [];
    }

    public function getRoleNameAttribute()
    {
        $firstRole = $this->roles->first();
        if (isset($firstRole['name'])) return $firstRole['name'];
        return '';
    }

    public function getRoleDisplayNameAttribute()
    {
        $firstRole = $this->roles->first();
        if (isset($firstRole['display_name'])) return $firstRole['display_name'];
        return '';
    }

    public function getAllRolesAttribute()
    {
        return $this->roles->pluck('name');
    }

    public function getHasVerifiedAttribute()
    {
        return $this->hasVerifiedPhone();
    }

    public function getResetPasswordAttribute()
    {
        return $this->hasResetPassword();
    }

    public function hasResetPassword()
    {
        return !is_null($this->password_change_at);
    }

    public function hasVerifiedPhone()
    {
        return !is_null($this->phone_verified_at);
    }

    public function markPhoneAsVerified()
    {
        return $this->forceFill([
            'phone_verified_at' => $this->freshTimestamp(),
        ])->save();
    }

    public function markPasswordAsChanged()
    {
        return $this->forceFill([
            'password_change_at' => $this->freshTimestamp(),
            'reset_token' => NULL
        ])->save();
    }
}
