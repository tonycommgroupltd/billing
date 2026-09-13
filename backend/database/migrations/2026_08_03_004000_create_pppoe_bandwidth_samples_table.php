<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Light per-PPPoE rate samples for the customer-view live chart.
 * Retention is short (24–26h) via artisan prune — will not bloat billing DB.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pppoe_bandwidth_samples', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('service_id')->index();
            $table->unsignedBigInteger('router_id')->nullable()->index();
            $table->string('username', 64)->index();
            $table->string('interface', 96)->nullable();
            // Customer download = MikroTik PPPoE iface TX; upload = iface RX
            $table->unsignedBigInteger('download_bps')->default(0);
            $table->unsignedBigInteger('upload_bps')->default(0);
            $table->timestamp('sampled_at')->useCurrent();

            $table->index(['service_id', 'sampled_at']);
            $table->index('sampled_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pppoe_bandwidth_samples');
    }
};
