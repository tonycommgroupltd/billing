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
        Schema::create('radius_accounting_logs', function (Blueprint $table) {
            $table->id();
            $table->string('username')->nullable();
            $table->string('session_id')->nullable();
            $table->string('status_type')->nullable();
            $table->string('nas_ip')->nullable();
            $table->string('framed_ip')->nullable();
            $table->json('payload')->nullable();   // full JSON sent by RADIUS
            $table->text('error_message')->nullable(); // error description if any
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('radius_accounting_logs');
    }
};
