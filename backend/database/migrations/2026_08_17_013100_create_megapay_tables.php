<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('megapay_settings', function (Blueprint $table) {
            $table->id();
            $table->string('key_name', 64)->unique();
            $table->text('key_value')->nullable();
            $table->timestamps();
        });

        Schema::create('megapay_transactions', function (Blueprint $table) {
            $table->id();
            $table->string('phone', 20);
            $table->unsignedInteger('amount');
            $table->string('fee_type', 32)->default('other');
            $table->string('reference', 32)->nullable();
            $table->string('ticket_id', 64)->nullable();
            $table->string('party_b', 32)->nullable();
            $table->string('checkout_request_id', 64)->nullable()->unique();
            $table->string('merchant_request_id', 64)->nullable();
            $table->string('status', 24)->default('pending');
            $table->string('receipt', 32)->nullable();
            $table->string('result_code', 16)->nullable();
            $table->string('result_desc', 255)->nullable();
            $table->longText('raw_callback')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();

            $table->index(['status', 'created_at']);
            $table->index('fee_type');
            $table->index('ticket_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('megapay_transactions');
        Schema::dropIfExists('megapay_settings');
    }
};
