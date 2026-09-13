<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('routers', function (Blueprint $table) {
            if (!Schema::hasColumn('routers', 'customer_interface')) {
                $table->string('customer_interface', 64)->nullable()->after('monitor_interface');
            }
        });

        Schema::table('router_bandwidth_samples', function (Blueprint $table) {
            if (!Schema::hasColumn('router_bandwidth_samples', 'customer_interface')) {
                $table->string('customer_interface', 64)->nullable()->after('interface');
            }
            if (!Schema::hasColumn('router_bandwidth_samples', 'customer_rx_bps')) {
                $table->unsignedBigInteger('customer_rx_bps')->nullable()->after('tx_bps');
            }
            if (!Schema::hasColumn('router_bandwidth_samples', 'customer_tx_bps')) {
                $table->unsignedBigInteger('customer_tx_bps')->nullable()->after('customer_rx_bps');
            }
        });
    }

    public function down(): void
    {
        Schema::table('router_bandwidth_samples', function (Blueprint $table) {
            foreach (['customer_interface', 'customer_rx_bps', 'customer_tx_bps'] as $col) {
                if (Schema::hasColumn('router_bandwidth_samples', $col)) {
                    $table->dropColumn($col);
                }
            }
        });

        Schema::table('routers', function (Blueprint $table) {
            if (Schema::hasColumn('routers', 'customer_interface')) {
                $table->dropColumn('customer_interface');
            }
        });
    }
};
