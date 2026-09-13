<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use App\Models\User;
use Carbon\Carbon;

class UserSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        //
        $users = [
            [
                'name' => 'Main Admin',
                'phone' => '0702508131',
                'email' => 'admin@hostkraft.cloud',
                'password' => 'YOUR_PASSWORD',
                'role' => 'super-administrator',
            ]
        ];

        foreach ($users as $user) {
            $created_user = User::create([
                'name' => $user['name'],
                'phone' => $user['phone'],
                'email' => $user['email'],
                'password' => Hash::make($user['password']),
                'password_change_at' => Carbon::now()
            ]);

            $created_user->assignRole($user['role']);
        }
    }
}
