<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('services', function (Blueprint $table) {
            $table->string('onu_sn', 64)->nullable()->after('mikrotik_password');
            $table->unsignedSmallInteger('olt_board')->nullable()->after('onu_sn');
            $table->unsignedSmallInteger('olt_port')->nullable()->after('olt_board');
            $table->timestamp('onu_authorized_at')->nullable()->after('olt_port');
            $table->unsignedBigInteger('onu_authorized_by')->nullable()->after('onu_authorized_at');

            $table->index('onu_sn', 'services_onu_sn_index');
        });
    }

    public function down(): void
    {
        Schema::table('services', function (Blueprint $table) {
            $table->dropIndex('services_onu_sn_index');
            $table->dropColumn([
                'onu_sn',
                'olt_board',
                'olt_port',
                'onu_authorized_at',
                'onu_authorized_by',
            ]);
        });
    }
};
