<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Speed online-customer / dashboard RADIUS queries on large radacct tables.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('radacct', function (Blueprint $table) {
            // Supports: acctstoptime IS NULL AND acctupdatetime >= ...
            $table->index(['acctstoptime', 'acctupdatetime'], 'radacct_online_window_idx');
        });
    }

    public function down(): void
    {
        Schema::table('radacct', function (Blueprint $table) {
            $table->dropIndex('radacct_online_window_idx');
        });
    }
};
