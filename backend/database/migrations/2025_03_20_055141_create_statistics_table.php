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
        Schema::create('statistics', function (Blueprint $table) {
            $table->id();
            $table->bigInteger('session_id')->unsigned();
            $table->foreign('session_id')->references('id')->on('pppoe_sessions')->onDelete('cascade');
            $table->string('ipv4_address')->nullable();
            $table->bigInteger('in_bytes')->unsigned()->nullable();
            $table->bigInteger('out_bytes')->unsigned()->nullable();
            $table->datetime('timestamp')->nullable();
            $table->index(['session_id', 'timestamp']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('statistics');
    }
};
