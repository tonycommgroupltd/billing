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
        Schema::table('mikrotik_api_logs', function (Blueprint $table) {
            // Remove old columns
            $table->dropColumn(['host', 'user']);

            // Add new foreign key columns
            $table->unsignedBigInteger('router_id')->nullable()->after('id');
            $table->unsignedBigInteger('customer_id')->nullable()->after('router_id');

            // Foreign key constraints
            $table->foreign('router_id')->references('id')->on('routers')->onDelete('set null');
            $table->foreign('customer_id')->references('id')->on('customers')->onDelete('set null');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('mikrotik_api_logs', function (Blueprint $table) {
            // Drop foreign keys and new columns
            $table->dropForeign(['router_id']);
            $table->dropForeign(['customer_id']);
            $table->dropColumn(['router_id', 'customer_id']);

            // Re-add original columns
            $table->string('host')->after('id');
            $table->string('user')->after('host');
        });
    }
};
