<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ipv4_networks', function (Blueprint $table) {
            $table->string('pool_name', 64)->nullable()->after('location');
        });
    }

    public function down(): void
    {
        Schema::table('ipv4_networks', function (Blueprint $table) {
            $table->dropColumn('pool_name');
        });
    }
};
