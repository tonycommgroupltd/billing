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
        Schema::create('whatsapp_details', function (Blueprint $table) {
            $table->id();
            $table->integer('customer_id')->nullable();
            $table->json('data')->nullable();
            $table->json('contacts')->nullable();
            $table->json('messages')->nullable();
            $table->json('statuses')->nullable();
            $table->string('status', length: 50)->default('queued');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('whatsapp_details');
    }
};
