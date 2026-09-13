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
        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('customer_id')->nullable();
            $table->string('trans_id')->nullable();
            $table->string('payment_type')->nullable();
            $table->date('date')->nullable();
            $table->float('sum', 8, 2);
            $table->string('invoice_no')->nullable();
            $table->timestamps();
            $table->foreign("customer_id")->references("id")->on("customers")->onDelete("set null");
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('payments');
    }
};
