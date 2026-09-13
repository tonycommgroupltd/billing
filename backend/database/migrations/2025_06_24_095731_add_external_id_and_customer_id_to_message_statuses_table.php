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
        Schema::table('message_statuses', function (Blueprint $table) {
            $table->string('external_id')->nullable()->after('id'); // or after any relevant column
            $table->unsignedBigInteger('customer_id')->nullable()->after('external_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('message_statuses', function (Blueprint $table) {
            $table->dropColumn(['external_id', 'customer_id']);
        });
    }
};
