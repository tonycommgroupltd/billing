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
        Schema::create('ip_stats', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('router_id')->nullable();
            $table->foreign('router_id')->references('id')->on('routers')->onDelete('set null');
            $table->string('ipv4_address')->nullable();
            $table->string('name')->nullable();
            $table->text('in_bytes')->nullable();
            $table->text('out_bytes')->nullable();
            $table->string('in_pkts', 1000)->nullable();
            $table->string('out_pkts', 1000)->nullable();
            $table->string('date_from', 255)->nullable();
            $table->string('date_to', 255)->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('ip_stats');
    }
};
