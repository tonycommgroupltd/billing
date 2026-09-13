<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('pppoe_sessions', function (Blueprint $table) {
            $table->id();
            $table->string('username', 255);
            $table->string('ip_address', 15);
            $table->string('mac_address', 17)->nullable();
            $table->datetime('start_time');
            $table->datetime('end_time')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('pppoe_sessions');
    }
};
