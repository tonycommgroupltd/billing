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
        Schema::create('radius_accounting', function (Blueprint $table) {
            $table->id();
            $table->string('username')->index();
            $table->string('session_id')->index();
            $table->string('nas_ip')->nullable();
            $table->string('framed_ip')->nullable();
            $table->string('acct_status_type'); // Start, Stop, Interim-Update
            $table->unsignedBigInteger('input_octets')->default(0);
            $table->unsignedBigInteger('output_octets')->default(0);
            $table->integer('session_time')->default(0);
            $table->timestamp('start_time')->nullable();
            $table->timestamp('stop_time')->nullable();
            $table->string('terminate_cause')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('radius_accounting');
    }
};
