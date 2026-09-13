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
        Schema::create('service_bill_date_changes', function (Blueprint $table) {
            $table->id();

            // Which service was updated
            $table->unsignedBigInteger('service_id');

            // Old and new bill dates
            $table->date('old_bill_date')->nullable();
            $table->date('new_bill_date');

            // User who made the change
            $table->unsignedBigInteger('user_id')->nullable();

            // Optional reason/notes
            $table->string('remarks')->nullable();
            
            $table->timestamps();

            // Foreign keys (optional but recommended)
            $table->foreign('service_id')->references('id')->on('services')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('service_bill_date_changes');
    }
};
