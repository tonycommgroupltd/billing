<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('routers', function (Blueprint $table) {
            if (!Schema::hasColumn('routers', 'monitor_interface')) {
                $table->string('monitor_interface', 64)->nullable()->after('api_port');
            }
        });

        Schema::create('router_bandwidth_samples', function (Blueprint $table) {
            $table->id();
            $table->foreignId('router_id')->constrained('routers')->cascadeOnDelete();
            $table->string('interface', 64);
            $table->unsignedBigInteger('rx_bps')->default(0); // download (internet in)
            $table->unsignedBigInteger('tx_bps')->default(0); // upload (internet out)
            $table->timestamp('sampled_at')->useCurrent();
            $table->index(['router_id', 'sampled_at']);
            $table->index('sampled_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('router_bandwidth_samples');
        Schema::table('routers', function (Blueprint $table) {
            if (Schema::hasColumn('routers', 'monitor_interface')) {
                $table->dropColumn('monitor_interface');
            }
        });
    }
};
