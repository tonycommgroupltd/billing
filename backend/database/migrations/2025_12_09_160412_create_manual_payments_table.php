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
        Schema::create('manual_payments', function (Blueprint $table) {
            $table->id();

            $table->unsignedBigInteger('customer_id');
            $table->unsignedBigInteger('invoice_id')->nullable();

            $table->string('payment_method')->default('manual');  // e.g. "cash", "bank", "mpesa"
            $table->decimal('amount', 10, 2);

            $table->string('reference')->nullable();   // bank slip number, mpesa code, etc.
            $table->date('payment_date')->nullable();
            
            $table->text('notes')->nullable();

            // uploaded receipt file path (optional)
            $table->string('receipt_path')->nullable();

            $table->unsignedBigInteger('recorded_by'); // admin/staff ID who recorded it

            $table->timestamps();

            // Foreign keys (optional)
            $table->foreign('customer_id')->references('id')->on('customers')->onDelete('cascade');
            $table->foreign('invoice_id')->references('id')->on('invoices')->onDelete('set null');
            $table->foreign('recorded_by')->references('id')->on('users');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('manual_payments');
    }
};
