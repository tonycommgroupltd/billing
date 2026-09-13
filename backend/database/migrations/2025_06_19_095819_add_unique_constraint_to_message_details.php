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
        Schema::table('message_details', function (Blueprint $table) {
            $table->string('message_hash')->nullable()->after('message');
            $table->unique(['recipient', 'message_hash']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('message_details', function (Blueprint $table) {
            $table->dropUnique(['recipient', 'message_hash']);
            $table->dropColumn('message_hash');
        });
    }
};
