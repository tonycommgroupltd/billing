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
        Schema::create('message_details', function (Blueprint $table) {
            $table->id();
            $table->integer('message_id')->unique()->nullable();
            $table->text('message');
            $table->string('recipient', length: 110);
            $table->string('status', length: 50)->default('queued');
            $table->decimal('cost', total: 8, places: 2)->default(0.000000);
            $table->string('dlr', length: 100)->default('pending');
            $table->text('notice');
            $table->integer('last_dlr_check')->default(0);
            $table->integer('customer_id')->default(0);
            $table->integer('duration')->default(0);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('message_details');
    }
};
