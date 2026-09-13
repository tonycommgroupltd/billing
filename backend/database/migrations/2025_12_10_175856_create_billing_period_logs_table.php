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
        Schema::create('billing_period_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('service_id'); // Or customer_id if applicable
            $table->enum('old_period', ['weekly', 'bi-weekly', 'monthly']);
            $table->enum('new_period', ['weekly', 'bi-weekly', 'monthly']);
            $table->unsignedBigInteger('user_id')->nullable(); // Admin or user who made the change
            $table->string('remarks')->nullable();
            $table->timestamps();

            // Optional: Add foreign keys if you have services and users table
            $table->foreign('service_id')->references('id')->on('services')->onDelete('cascade');
            $table->foreign('user_id')->references('id')->on('users')->onDelete('set null');
        
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('billing_period_logs');
    }
};
