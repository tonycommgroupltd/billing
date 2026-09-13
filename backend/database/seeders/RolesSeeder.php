<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Role;
use Spatie\Permission\Models\Permission;

class RolesSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $role_super_admin = Role::create(['name' => 'super-administrator', 'display_name' => 'Super administrator', 'guard_name' => 'api']);
        $role_admin = Role::create(['name' => 'administrator', 'display_name' => 'Administrator', 'guard_name' => 'api']);
        $role_cust_creator = Role::create(['name' => 'customer-creator', 'display_name' => 'Customer creator', 'guard_name' => 'api']);
        $role_engineer = Role::create(['name' => 'engineer', 'display_name' => 'Engineer', 'guard_name' => 'api']);
        $role_fin_manager = Role::create(['name' => 'financial-manager', 'display_name' => 'Financial manager', 'guard_name' => 'api']);
        $role_manager = Role::create(['name' => 'manager', 'display_name' => 'Manager', 'guard_name' => 'api']);
        $role_technician = Role::create(['name' => 'technician', 'display_name' => 'Technician', 'guard_name' => 'api']);
        $role_customer = Role::create(['name' => 'customer', 'display_name' => 'Customer', 'guard_name' => 'api']);
        $role_reseller = Role::create(['name' => 'reseller', 'display_name' => 'Reseller', 'guard_name' => 'api']);
        $role_customer_care = Role::create(['name' => 'customer-care', 'display_name' => 'Customer care', 'guard_name' => 'api']);
        $role_ict = Role::create(['name' => 'ict', 'display_name' => 'ICT', 'guard_name' => 'api']);

        $permission_add = Permission::create(['name' => 'add customers']);
        $permission_list = Permission::create(['name' => 'list customers']);
        $permission_edit = Permission::create(['name' => 'edit customers']);
        $permission_delete = Permission::create(['name' => 'delete customers']);

        $permissions_super_admin = [$permission_add, $permission_list, $permission_edit, $permission_delete];

        $role_super_admin->syncPermissions($permissions_super_admin);
        $role_ict->syncPermissions($permissions_super_admin);
    }
}
