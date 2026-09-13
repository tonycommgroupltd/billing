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
            $table->unsignedBigInteger('template_id')->nullable()->after('message_id');
            $table->foreign('template_id')->references('id')->on('message_templates')->onDelete('set null');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('message_details', function (Blueprint $table) {
            $table->dropColumn('template_id');
        });
    }
};
