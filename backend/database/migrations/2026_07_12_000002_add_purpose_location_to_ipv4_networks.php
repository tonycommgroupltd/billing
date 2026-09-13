<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ipv4_networks', function (Blueprint $table) {
            $table->string('purpose', 255)->nullable()->after('gateway');
            $table->string('location', 255)->nullable()->after('purpose');
            $table->json('ip_assignments')->nullable()->after('reserved_ips');
        });
    }

    public function down(): void
    {
        Schema::table('ipv4_networks', function (Blueprint $table) {
            $table->dropColumn(['purpose', 'location', 'ip_assignments']);
        });
    }
};
