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
        Schema::table('mpesa', function (Blueprint $table) {
            $table->float('TransAmount', 15, 2)->change();
            $table->float('OrgAccountBalance', 15, 2)->change();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('mpesa', function (Blueprint $table) {
            $table->float('TransAmount', 8, 2)->change();
            $table->float('OrgAccountBalance', 8, 2)->change();
        });
    }
};
