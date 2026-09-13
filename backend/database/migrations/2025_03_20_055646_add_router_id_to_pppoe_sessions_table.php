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
        Schema::table('pppoe_sessions', function (Blueprint $table) {
            $table->unsignedBigInteger('router_id')->after('id');
            $table->foreign('router_id')->references('id')->on('routers')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('pppoe_sessions', function (Blueprint $table) {
            $table->dropColumn('router_id');
        });
    }
};
