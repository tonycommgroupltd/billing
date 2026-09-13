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
        Schema::create('mikrotik_api_logs', function (Blueprint $table) {
            $table->id();
            $table->string('host');
            $table->string('user');
            $table->string('action')->nullable(); // what the script was trying to do
            $table->text('error')->nullable();
            $table->timestamp('attempted_at')->nullable();
            $table->timestamp('next_retry_at')->nullable();
            $table->tinyInteger('retry_count')->default(0);
            $table->enum('status', ['success', 'failed', 'retrying'])->default('retrying');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('mikrotik_api_logs');
    }
};
