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
        Schema::create('service_change_logs', function (Blueprint $table) {
            $table->id();

            $table->unsignedBigInteger('service_id');      // service affected
            $table->unsignedBigInteger('changed_by');      // user/admin making change

            $table->string('field');                       // field changed e.g. status, plan, price
            $table->text('old_value')->nullable();         // previous value
            $table->text('new_value')->nullable();         // new value

            $table->text('notes')->nullable();             // optional description

            $table->timestamps();

            // foreign keys
            $table->foreign('service_id')->references('id')->on('services')->onDelete('cascade');
            $table->foreign('changed_by')->references('id')->on('users')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('service_change_logs');
    }
};
