<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ipv4_networks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('router_id')->nullable()->constrained('routers')->nullOnDelete();
            $table->string('title');
            $table->string('cidr', 64);
            $table->string('gateway', 45)->nullable();
            $table->string('type', 32)->default('wan_block'); // wan_block | customer_public | private
            $table->string('api_host', 45)->nullable(); // override MikroTik API host (e.g. 102.0.25.70 -> same box as .249)
            $table->json('reserved_ips')->nullable();
            $table->string('scan_mode', 16)->default('enumerate'); // enumerate | aggregate
            $table->boolean('enabled')->default(true);
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ipv4_networks');
    }
};
